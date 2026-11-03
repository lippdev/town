import type { IncomingMessage, ServerResponse } from "node:http";
import {
  API_ENABLE_HINT,
  DEFAULT_API_URL,
  apiProfilePrefix,
  classifyFailure,
  clearConnection,
  discoverLocalDashboard,
  isLoopbackAddress,
  loadSavedConnection,
  normalizeDashboardUrl,
  probeApi,
  probeConnection,
  readServedToken,
  saveConnection,
  sessionHeaders,
  tokenFromLink,
  tokenPreview,
  type SavedConnection,
} from "./hermesConnection";

/**
 * Proxy same-origin para o Hermes.
 *
 * O navegador nunca lê credencial do Hermes: o proxy guarda a chave do
 * serviço de API (`API_SERVER_KEY`) e o session token do dashboard — o que foi
 * salvo pela aba Integrações (link + token, como no Hermes Desktop) ou, sem
 * conexão salva, as variáveis de ambiente.
 *
 * Leitura é só GET nos endpoints documentados em docs/HERMES.md. A única
 * escrita que chega ao Hermes é a mensagem que você manda a um bot pelo chat
 * (`POST /api/sessions/{id}/chat` no API server), sempre por ação explícita
 * na página e com a mesma trava de origem da conexão.
 */

export interface HermesProxyConfig {
  /** "saved": link + token salvos pela UI; "env": variáveis de ambiente. */
  source: "saved" | "env";
  apiUrl: string;
  dashboardUrl: string;
  apiKey: string;
  dashboardToken: string;
  timeoutMs: number;
}

interface EndpointResult<T> {
  reachable: boolean;
  status: number;
  data?: T;
  error?: string;
  /** Tempo até a resposta (ou até a falha), para o diagnóstico na UI. */
  ms: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

export function readHermesConfig(
  env: NodeJS.ProcessEnv = process.env,
  saved: SavedConnection | null = loadSavedConnection(),
): HermesProxyConfig {
  const timeout = Number(env.HERMES_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS;
  if (saved) {
    // conexão do Desktop: um link só, o dashboard. A saúde vem do /api/status
    // dele, não do API server em :8642, que fica de fora nesse modo.
    // a API (envio de mensagens) é opcional e tem credencial própria
    return {
      source: "saved",
      apiUrl: saved.api?.url ?? "",
      dashboardUrl: saved.url,
      apiKey: saved.api?.key ?? "",
      dashboardToken: saved.token,
      timeoutMs,
    };
  }
  return {
    source: "env",
    apiUrl: (env.HERMES_API_URL ?? "http://127.0.0.1:8642").replace(/\/+$/, ""),
    dashboardUrl: (env.HERMES_DASHBOARD_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, ""),
    apiKey: env.HERMES_API_KEY ?? "",
    dashboardToken: env.HERMES_DASHBOARD_TOKEN ?? "",
    timeoutMs,
  };
}

async function getJson<T>(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<EndpointResult<T>> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        reachable: true,
        status: response.status,
        error: describeHttpError(response.status, detail),
        ms: Date.now() - startedAt,
      };
    }
    return { reachable: true, status: response.status, data: (await response.json()) as T, ms: Date.now() - startedAt };
  } catch (error) {
    return {
      reachable: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - startedAt,
    };
  }
}

function describeHttpError(status: number, detail: string): string {
  if (status === 401 || status === 403) {
    return `dashboard recusou o session token (HTTP ${status}): conecte de novo na aba Integrações`;
  }
  const trimmed = detail.trim().slice(0, 160);
  return trimmed ? `HTTP ${status}: ${trimmed}` : `HTTP ${status}`;
}

/**
 * Snapshot consolidado: saúde + perfis + sessões + rotinas, cada bloco com seu
 * próprio estado. Um serviço fora não derruba os outros — a UI mostra o que é
 * real e diz o que faltou.
 */
export async function fetchHermesSnapshot(config: HermesProxyConfig) {
  const apiHeaders: Record<string, string> = config.apiKey
    ? { authorization: `Bearer ${config.apiKey}` }
    : {};
  // mesmo header do Hermes Desktop; o dashboard ainda aceita Bearer, mas o
  // header dedicado não colide com proxies que já usam Authorization
  const dashboardHeaders = sessionHeaders(config.dashboardToken);
  // conexão salva: saúde e versão pelo /api/status público do dashboard
  const healthUrl = config.source === "saved" ? `${config.dashboardUrl}/api/status` : `${config.apiUrl}/health`;
  const healthPath = config.source === "saved" ? "/api/status" : "/health";

  const [health, profiles, sessions, jobs] = await Promise.all([
    getJson<{ status?: string; version?: string; platform?: string }>(
      healthUrl,
      config.source === "saved" ? {} : apiHeaders,
      config.timeoutMs,
    ),
    getJson<{ profiles?: unknown[] }>(`${config.dashboardUrl}/api/profiles`, dashboardHeaders, config.timeoutMs),
    getJson<{ sessions?: unknown[] }>(
      `${config.dashboardUrl}/api/profiles/sessions?limit=200&order=recent`,
      dashboardHeaders,
      config.timeoutMs,
    ),
    getJson<{ jobs?: unknown[] }>(`${config.dashboardUrl}/api/cron/jobs`, dashboardHeaders, config.timeoutMs),
  ]);

  const dashboardErrors = [profiles, sessions, jobs].map((result) => result.error).filter(Boolean);

  return {
    fetchedAt: Date.now(),
    configured: true,
    health: {
      api: health.reachable && !health.error ? "online" : "offline",
      dashboard: dashboardErrors.length === 0 ? "online" : profiles.reachable ? "degraded" : "offline",
      version: health.data?.version,
      detail: dashboardErrors[0] ?? health.error,
    },
    profiles: profiles.data?.profiles ?? [],
    sessions: sessions.data?.sessions ?? [],
    jobs: jobs.data?.jobs ?? [],
    blocks: {
      api: block(health, healthPath),
      profiles: block(profiles),
      sessions: block(sessions),
      jobs: block(jobs),
    },
  };
}

/** Estado de um endpoint para o diagnóstico, com causa provável e ação. */
function block(result: EndpointResult<unknown>, path?: string) {
  const cause = result.error ? classifyFailure(result.error) : null;
  return {
    ok: !result.error,
    status: result.status,
    error: result.error,
    ms: result.ms,
    ...(path ? { path } : {}),
    ...(cause ? { cause: cause.label, action: cause.action } : {}),
  };
}

/**
 * Relê o token servido pela página do dashboard local, que sorteia token novo
 * a cada partida. Só vale para conexão "served": token colado à mão nunca é
 * trocado sozinho. True quando há token novo salvo.
 */
async function refreshServedToken(config: HermesProxyConfig): Promise<boolean> {
  const saved = config.source === "saved" ? loadSavedConnection() : null;
  if (!saved || saved.tokenSource !== "served") return false;
  const fresh = await readServedToken(saved.url, config.timeoutMs);
  if (!fresh || fresh === saved.token) return false;
  saveConnection({ ...saved, token: fresh, savedAt: Date.now() });
  return true;
}

const rejected = (status: number) => status === 401 || status === 403;

/**
 * Snapshot com renovação do token servido: um 401 dispara a releitura do
 * token e uma nova tentativa — o usuário não precisa reconectar.
 */
async function snapshotWithServedRefresh() {
  const config = readHermesConfig();
  const snapshot = await fetchHermesSnapshot(config);
  const refused = [snapshot.blocks.profiles.status, snapshot.blocks.sessions.status].some(rejected);
  if (!refused || !(await refreshServedToken(config))) return snapshot;
  return fetchHermesSnapshot(readHermesConfig());
}

/** Uma leitura do dashboard com a mesma renovação do token servido. */
async function dashboardRead<T>(pathAndQuery: string): Promise<EndpointResult<T>> {
  const read = (config: HermesProxyConfig) =>
    getJson<T>(`${config.dashboardUrl}${pathAndQuery}`, sessionHeaders(config.dashboardToken), config.timeoutMs);
  const config = readHermesConfig();
  const first = await read(config);
  if (!rejected(first.status) || !(await refreshServedToken(config))) return first;
  return read(readHermesConfig());
}

const HQ_PREFIX = "/api/hq";

export function isHermesProxyPath(url: string | undefined): boolean {
  return Boolean(url && url.startsWith(HQ_PREFIX));
}

/** Handler compartilhado por dev e preview do Vite. */
export async function hermesProxyMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
): Promise<void> {
  const url = request.url ?? "";
  if (!isHermesProxyPath(url)) {
    next();
    return;
  }

  // o proxy lê o Hermes com o token salvo: quem fala com ele precisa estar
  // nesta máquina, mesmo que o Vite tenha sido aberto com --host 0.0.0.0
  if (!isLoopbackAddress(request.socket?.remoteAddress)) {
    sendJson(response, 403, {
      error: "O proxy do Hermes só atende esta máquina (loopback). Abra o Lipp HQ localmente ou por túnel SSH.",
    });
    return;
  }

  const path = url.split("?")[0];

  // a única escrita aceita é a da própria conexão, salva neste servidor; o
  // Hermes continua recebendo só GET
  if (path === CONNECTION_PATH && (request.method === "POST" || request.method === "DELETE")) {
    await handleConnectionWrite(request, response);
    return;
  }
  if (path === LOCAL_PATH && request.method === "POST") {
    await handleLocalConnect(request, response);
    return;
  }
  if (path === API_CONNECTION_PATH && (request.method === "POST" || request.method === "DELETE")) {
    await handleApiConnectionWrite(request, response);
    return;
  }
  const chatRoute = path.match(CHAT_ROUTE);
  if (chatRoute && request.method === "POST") {
    await handleSessionChat(request, chatRoute[1], url, response);
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Fora o chat e a conexão, o proxy do Hermes só lê." });
    return;
  }

  try {
    if (path === `${HQ_PREFIX}/hermes/snapshot`) {
      const snapshot = await snapshotWithServedRefresh();
      response.statusCode = 200;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      response.end(JSON.stringify(snapshot));
      return;
    }

    const messagesRoute = path.match(MESSAGES_ROUTE);
    if (messagesRoute) {
      await handleSessionMessages(messagesRoute[1], url, response);
      return;
    }

    if (path === `${HQ_PREFIX}/status`) {
      sendJson(response, 200, statusPayload(readHermesConfig()));
      return;
    }

    if (path === LOCAL_PATH) {
      // detecção sem efeito colateral: o token servido fica no servidor
      const { token: _token, ...discovery } = await discoverLocalDashboard();
      void _token;
      sendJson(response, 200, discovery);
      return;
    }

    response.statusCode = 404;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: `Rota de proxy desconhecida: ${path}` }));
  } catch (error) {
    response.statusCode = 502;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(
      JSON.stringify({ error: error instanceof Error ? error.message : "Falha ao falar com o Hermes." }),
    );
  }
}

const CONNECTION_PATH = `${HQ_PREFIX}/connection`;
const MESSAGES_ROUTE = /^\/api\/hq\/hermes\/sessions\/([^/]+)\/messages$/;
/** Ids como o Hermes gera (`20260103_…`, `sess_…`): nada que mude o caminho. */
const SESSION_ID = /^[\w.:-]{1,160}$/;
const PROFILE_NAME = /^[\w.-]{1,64}$/;
/** Quantas mensagens o chat lê de uma vez: a página mais recente. */
const MESSAGE_PAGE = 200;

interface HermesMessageRow {
  id?: number | string;
  role?: string;
  content?: unknown;
  display_content?: unknown;
  display_kind?: string;
  timestamp?: number | string;
  tool_name?: string;
  tool_calls?: Array<{ function?: { name?: string } }>;
}

/**
 * Mensagens de uma sessão, lidas do dashboard com o perfil do bot.
 *
 * Só campos de exibição saem daqui: argumentos de ferramenta e imagens
 * inline (pedidas como `[image]`) ficam no Hermes.
 */
async function handleSessionMessages(rawId: string, url: string, response: ServerResponse): Promise<void> {
  const sessionId = decodeURIComponent(rawId);
  const profile = new URLSearchParams(url.split("?")[1] ?? "").get("profile") ?? "default";
  if (!SESSION_ID.test(sessionId) || !PROFILE_NAME.test(profile)) {
    sendJson(response, 400, { error: "Sessão ou perfil inválido." });
    return;
  }
  const query = new URLSearchParams({ profile, limit: String(MESSAGE_PAGE), inline_images: "false" });
  const result = await dashboardRead<{ session_id?: string; messages?: HermesMessageRow[] }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages?${query}`,
  );
  if (result.error) {
    const cause = classifyFailure(result.error);
    const status = result.status === 404 ? 404 : 502;
    sendJson(response, status, {
      error: result.status === 404 ? "O Hermes não achou essa sessão neste perfil." : result.error,
      ...(cause ? { cause: cause.label, action: cause.action } : {}),
    });
    return;
  }
  const messages = (result.data?.messages ?? []).map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    display_content: row.display_content,
    display_kind: row.display_kind,
    timestamp: row.timestamp,
    tool_name: row.tool_name,
    tool_calls: row.tool_calls?.map((call) => ({ name: call.function?.name })),
  }));
  sendJson(response, 200, {
    sessionId: result.data?.session_id ?? sessionId,
    profile,
    fetchedAt: Date.now(),
    messages,
  });
}
const MAX_BODY_BYTES = 8 * 1024;

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(payload));
}

/** Configuração ativa como a UI pode ver: nunca o valor de uma credencial. */
export function statusPayload(config: HermesProxyConfig) {
  return {
    configured: Boolean(config.apiUrl || config.dashboardUrl),
    source: config.source,
    apiUrl: config.apiUrl || undefined,
    dashboardUrl: config.dashboardUrl,
    hasApiKey: Boolean(config.apiKey),
    apiKeyPreview: tokenPreview(config.apiKey),
    /** Envio de mensagens habilitado: API server com chave configurada. */
    canSend: Boolean(config.apiUrl && config.apiKey),
    hasDashboardToken: Boolean(config.dashboardToken),
    tokenPreview: tokenPreview(config.dashboardToken),
    tokenSource: config.source === "saved" ? (loadSavedConnection()?.tokenSource ?? "typed") : undefined,
  };
}

/**
 * Só a página do próprio app grava a conexão. `Origin` e `Sec-Fetch-Site`
 * barram outro site aberto no navegador; exigir JSON força o preflight de
 * CORS, que este servidor não responde.
 */
export function isSameOriginWrite(headers: IncomingMessage["headers"]): boolean {
  const contentType = String(headers["content-type"] ?? "");
  const fetchSite = headers["sec-fetch-site"];
  if (fetchSite && fetchSite !== "same-origin") return false;
  const origin = headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== headers.host) return false;
    } catch {
      return false;
    }
  }
  return contentType.startsWith("application/json");
}

async function readBody(request: IncomingMessage, limit = MAX_BODY_BYTES): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error("corpo grande demais");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handleConnectionWrite(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!isSameOriginWrite(request.headers)) {
    sendJson(response, 403, { error: "Conexão só pode ser alterada pela página do Lipp HQ." });
    return;
  }

  if (request.method === "DELETE") {
    clearConnection();
    sendJson(response, 200, { ok: true, status: statusPayload(readHermesConfig()) });
    return;
  }

  let input: { url?: unknown; token?: unknown };
  try {
    input = JSON.parse(await readBody(request)) as typeof input;
  } catch {
    sendJson(response, 400, { ok: false, error: "Corpo inválido: envie { url, token } em JSON." });
    return;
  }

  const rawUrl = typeof input.url === "string" ? input.url : "";
  let url: string;
  try {
    url = normalizeDashboardUrl(rawUrl);
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    return;
  }

  // campo vazio reaproveita o token já salvo para o mesmo link, como o Desktop
  // faz com "token salvo"; um token colado no próprio link também vale
  const typed = typeof input.token === "string" ? input.token.trim() : "";
  const previous = loadSavedConnection();
  const token = typed || tokenFromLink(rawUrl) || (previous?.url === url ? previous.token : "");

  const probe = await probeConnection(url, token, readHermesConfig().timeoutMs);
  if (!probe.ok) {
    const cause = classifyFailure(probe.error);
    sendJson(response, 422, { ok: false, error: probe.error, action: cause?.action, probe });
    return;
  }

  saveConnection({ url, token, savedAt: Date.now(), tokenSource: "typed", ...keptApi(previous) });
  sendJson(response, 200, { ok: true, probe, status: statusPayload(readHermesConfig()) });
}

const LOCAL_PATH = `${HQ_PREFIX}/connection/local`;

/** "Usar Hermes local": detecta, lê o token servido e salva, num clique. */
async function handleLocalConnect(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!isSameOriginWrite(request.headers)) {
    sendJson(response, 403, { error: "Conexão só pode ser alterada pela página do Lipp HQ." });
    return;
  }
  const { token, ...discovery } = await discoverLocalDashboard();
  if (!discovery.found || !discovery.url || !token || discovery.error) {
    const cause = classifyFailure(discovery.error);
    sendJson(response, 422, {
      ok: false,
      error: discovery.error ?? "nenhum Hermes local encontrado",
      action: discovery.hint ? `Suba o dashboard: ${discovery.hint}` : cause?.action,
      discovery,
    });
    return;
  }
  saveConnection({
    url: discovery.url,
    token,
    savedAt: Date.now(),
    tokenSource: "served",
    ...keptApi(loadSavedConnection()),
  });
  sendJson(response, 200, { ok: true, discovery, status: statusPayload(readHermesConfig()) });
}

const API_CONNECTION_PATH = `${HQ_PREFIX}/connection/api`;
const CHAT_ROUTE = /^\/api\/hq\/hermes\/sessions\/([^/]+)\/chat$/;
/** Tamanho máximo de uma mensagem digitada no chat. */
export const MAX_CHAT_CHARS = 8000;
/** Um turno do agente é síncrono e pode levar minutos (ferramentas, buscas). */
const CHAT_TIMEOUT_MS = 5 * 60 * 1000;

/** A API já salva continua valendo quando o dashboard é reconectado. */
function keptApi(previous: SavedConnection | null): Pick<SavedConnection, "api"> {
  return previous?.api ? { api: previous.api } : {};
}

/** Salva (ou remove) URL + chave do API server, testando antes. */
async function handleApiConnectionWrite(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!isSameOriginWrite(request.headers)) {
    sendJson(response, 403, { error: "Conexão só pode ser alterada pela página do Lipp HQ." });
    return;
  }
  const saved = loadSavedConnection();
  if (!saved) {
    sendJson(response, 409, { ok: false, error: "Conecte o dashboard antes de habilitar o envio." });
    return;
  }
  if (request.method === "DELETE") {
    const { api: _api, ...rest } = saved;
    void _api;
    saveConnection(rest);
    sendJson(response, 200, { ok: true, status: statusPayload(readHermesConfig()) });
    return;
  }

  let input: { url?: unknown; key?: unknown };
  try {
    input = JSON.parse(await readBody(request)) as typeof input;
  } catch {
    sendJson(response, 400, { ok: false, error: "Corpo inválido: envie { url, key } em JSON." });
    return;
  }
  let url: string;
  try {
    url = normalizeDashboardUrl(typeof input.url === "string" && input.url.trim() ? input.url : DEFAULT_API_URL);
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    return;
  }
  // campo vazio reaproveita a chave já salva para a mesma URL
  const typed = typeof input.key === "string" ? input.key.trim() : "";
  const key = typed || (saved.api?.url === url ? saved.api.key : "");
  const probe = await probeApi(url, key, readHermesConfig().timeoutMs);
  if (!probe.ok) {
    sendJson(response, 422, { ok: false, error: probe.error, action: probe.action, probe });
    return;
  }
  saveConnection({ ...saved, api: { url, key } });
  sendJson(response, 200, { ok: true, probe, status: statusPayload(readHermesConfig()) });
}

/** Erro do API server em português, com o que fazer. */
function describeChatFailure(status: number, detail: string, profile: string): { error: string; action?: string } {
  if (status === 401 || status === 403) {
    return { error: `a API recusou a chave (HTTP ${status})`, action: "Salve a API_SERVER_KEY de novo na aba Integrações." };
  }
  if (status === 404 && /profile/i.test(detail)) {
    return {
      error: `a API conectada não serve o perfil "${profile}"`,
      action: "Sem multiplexação, cada perfil sobe a própria API: use a porta (API_SERVER_PORT) do .env desse perfil.",
    };
  }
  if (status === 404) return { error: "o Hermes não achou essa sessão" };
  if (status === 429 || status === 503) {
    return { error: "o bot está ocupado com outros turnos", action: "Tente de novo em instantes." };
  }
  const trimmed = detail.trim().slice(0, 200);
  return { error: trimmed ? `HTTP ${status}: ${trimmed}` : `HTTP ${status}` };
}

/**
 * Manda uma mensagem a um bot numa sessão existente e espera a resposta.
 *
 * É o mesmo caminho do `hermes peer dm`: `POST /api/sessions/{id}/chat` no
 * API server, com o prefixo do perfil. O Hermes grava a mensagem no começo do
 * turno, então a conversa aberta já a mostra na próxima releitura, antes da
 * resposta chegar.
 */
async function handleSessionChat(
  request: IncomingMessage,
  rawId: string,
  url: string,
  response: ServerResponse,
): Promise<void> {
  if (!isSameOriginWrite(request.headers)) {
    sendJson(response, 403, { error: "Mensagens só podem ser enviadas pela página do Lipp HQ." });
    return;
  }
  const sessionId = decodeURIComponent(rawId);
  const profile = new URLSearchParams(url.split("?")[1] ?? "").get("profile") ?? "default";
  if (!SESSION_ID.test(sessionId) || !PROFILE_NAME.test(profile)) {
    sendJson(response, 400, { error: "Sessão ou perfil inválido." });
    return;
  }
  const config = readHermesConfig();
  if (!config.apiUrl || !config.apiKey) {
    sendJson(response, 409, {
      error: "Envio desligado: falta a API do Hermes.",
      action: `Na aba Integrações, informe a URL e a API_SERVER_KEY da API. ${API_ENABLE_HINT}`,
    });
    return;
  }

  let message: string;
  try {
    const input = JSON.parse(await readBody(request, MAX_CHAT_CHARS * 4 + 256)) as { message?: unknown };
    message = typeof input.message === "string" ? input.message.trim() : "";
  } catch {
    sendJson(response, 400, { error: "Corpo inválido: envie { message } em JSON." });
    return;
  }
  if (!message) {
    sendJson(response, 400, { error: "Mensagem vazia." });
    return;
  }
  if (message.length > MAX_CHAT_CHARS) {
    sendJson(response, 413, { error: `Mensagem longa demais (máximo ${MAX_CHAT_CHARS} caracteres).` });
    return;
  }

  const target = `${config.apiUrl}${apiProfilePrefix(profile)}/api/sessions/${encodeURIComponent(sessionId)}/chat`;
  const startedAt = Date.now();
  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
    const text = await upstream.text().catch(() => "");
    if (!upstream.ok) {
      sendJson(response, upstream.status === 404 ? 404 : 502, describeChatFailure(upstream.status, text, profile));
      return;
    }
    let body: { status?: string; message?: { content?: unknown } } = {};
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      // resposta sem JSON: o turno rodou, a conversa relida mostra o resultado
    }
    sendJson(response, 200, {
      ok: true,
      status: body.status,
      reply: typeof body.message?.content === "string" ? body.message.content : null,
      ms: Date.now() - startedAt,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    sendJson(response, 504, {
      error: timedOut ? "o bot não respondeu em 5 min" : `a API do Hermes não respondeu (${error instanceof Error ? error.message : String(error)})`,
      action: timedOut ? "A resposta pode chegar depois: a conversa continua sendo relida." : API_ENABLE_HINT,
    });
  }
}
