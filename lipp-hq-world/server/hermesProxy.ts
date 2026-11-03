import type { IncomingMessage, ServerResponse } from "node:http";
import {
  classifyFailure,
  clearConnection,
  discoverLocalDashboard,
  isLoopbackAddress,
  loadSavedConnection,
  normalizeDashboardUrl,
  probeConnection,
  readServedToken,
  saveConnection,
  sessionHeaders,
  tokenFromLink,
  tokenPreview,
  type SavedConnection,
} from "./hermesConnection";

/**
 * Proxy de leitura same-origin para o Hermes.
 *
 * O navegador nunca lê credencial do Hermes: o proxy guarda a chave do
 * serviço de API (`HERMES_API_KEY`) e o session token do dashboard — o que foi
 * salvo pela aba Integrações (link + token, como no Hermes Desktop) ou, sem
 * conexão salva, `HERMES_DASHBOARD_TOKEN`. Ele só faz GET nos endpoints
 * documentados em docs/HERMES.md — nenhuma escrita chega ao Hermes por aqui.
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
    return {
      source: "saved",
      apiUrl: "",
      dashboardUrl: saved.url,
      apiKey: "",
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

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "O proxy do Hermes é somente leitura." });
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

async function readBody(request: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("corpo grande demais");
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

  saveConnection({ url, token, savedAt: Date.now(), tokenSource: "typed" });
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
  saveConnection({ url: discovery.url, token, savedAt: Date.now(), tokenSource: "served" });
  sendJson(response, 200, { ok: true, discovery, status: statusPayload(readHermesConfig()) });
}
