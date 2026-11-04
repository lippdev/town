import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * Conexão com o dashboard do Hermes no mesmo formato do Hermes Desktop
 * (modo "token" de gateway remoto, `apps/desktop/electron/connection-config.ts`):
 *
 * - um link do dashboard (`http://homelab.lan:9119`), aceito sem esquema;
 * - o session token do dashboard, enviado no header `X-Hermes-Session-Token`;
 * - `/api/status` é público e diz se o gateway usa OAuth (`auth_required`).
 *
 * O token é salvo só no servidor, em `~/.lipp-hq/connection.json` (0600, fora
 * do repositório, como o Claw3D guarda as configurações do Studio em
 * `~/.openclaw/claw3d/`). O
 * navegador manda o token uma vez e nunca o lê de volta: recebe só a prévia
 * `...abc123`, igual ao Desktop.
 */

export const SESSION_HEADER_NAME = "x-hermes-session-token";

export interface SavedConnection {
  url: string;
  token: string;
  savedAt: number;
  /**
   * "served": token lido do HTML do dashboard local, que muda a cada partida
   * dele; o proxy relê quando o dashboard recusar. "typed": colado pelo
   * usuário, nunca trocado sozinho.
   */
  tokenSource?: "typed" | "served";
}

export type AuthMode = "token" | "oauth";

/**
 * Normaliza o link como o Desktop faz: sem esquema vira `http://`, só http e
 * https passam, barra final sai. Query e hash não fazem parte da base.
 */
export function normalizeDashboardUrl(rawUrl: string): string {
  let value = String(rawUrl ?? "").trim();
  if (!value) throw new Error("Informe o link do dashboard do Hermes.");

  // "100.64.0.1:9119" e "homelab.lan:9119" são colados assim o tempo todo
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `http://${value}`;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error(`Link do dashboard inválido: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`O link precisa ser http:// ou https://, veio ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("O link não pode carregar usuário e senha; use o session token.");
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.protocol}//${parsed.host}${path}`;
}

/**
 * Token embutido no link, quando o usuário cola o endereço que o próprio
 * Hermes gera (`?token=` no download externo do Desktop, `#token=` em links
 * de pareamento). Campo de token preenchido sempre vence.
 */
export function tokenFromLink(rawUrl: string): string | undefined {
  const value = String(rawUrl ?? "").trim();
  if (!value) return undefined;
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`);
    const fromQuery = parsed.searchParams.get("token");
    if (fromQuery) return fromQuery;
    const fromHash = new URLSearchParams(parsed.hash.replace(/^#/, "")).get("token");
    return fromHash || undefined;
  } catch {
    return undefined;
  }
}

/** Prévia do token como o Desktop mostra: nunca o valor inteiro. */
export function tokenPreview(token: string | undefined): string | null {
  const raw = String(token ?? "").trim();
  if (!raw) return null;
  return raw.length <= 8 ? "definido" : `...${raw.slice(-6)}`;
}

/** `auth_required: true` em `/api/status` → gate OAuth; senão, token. */
export function authModeFromStatus(body: unknown): AuthMode {
  return body && typeof body === "object" && (body as { auth_required?: unknown }).auth_required === true
    ? "oauth"
    : "token";
}

export function sessionHeaders(token: string | undefined): Record<string, string> {
  return token ? { [SESSION_HEADER_NAME]: token } : {};
}

/**
 * Fora do repositório por padrão: um zip, uma cópia ou um `git add -f` do
 * projeto não leva o token junto. `HQ_CONNECTION_FILE` troca o caminho.
 */
export function connectionFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.HQ_CONNECTION_FILE ? resolve(env.HQ_CONNECTION_FILE) : join(homedir(), ".lipp-hq", "connection.json");
}

/** Onde a primeira versão salvava (diretório do app); lido só para migrar. */
export function legacyConnectionFilePath(): string {
  return resolve(".hq-connection.json");
}

/** Sem caminho explícito nem `HQ_CONNECTION_FILE`, o arquivo antigo também conta. */
function usesDefaultPath(file: string | undefined): boolean {
  return file === undefined && !process.env.HQ_CONNECTION_FILE;
}

export function loadSavedConnection(file?: string): SavedConnection | null {
  const current = readConnectionFile(file ?? connectionFilePath());
  if (current || !usesDefaultPath(file)) return current;
  return readConnectionFile(legacyConnectionFilePath());
}

function readConnectionFile(file: string): SavedConnection | null {
  try {
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<SavedConnection>;
    if (typeof parsed.url !== "string" || typeof parsed.token !== "string" || !parsed.url) return null;
    return {
      url: parsed.url,
      token: parsed.token,
      savedAt: Number(parsed.savedAt) || 0,
      tokenSource: parsed.tokenSource === "served" ? "served" : "typed",
    };
  } catch {
    // arquivo corrompido não derruba o proxy: vale como "sem conexão salva"
    return null;
  }
}

export function saveConnection(connection: SavedConnection, file?: string): void {
  const target = file ?? connectionFilePath();
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  writeFileSync(target, `${JSON.stringify(connection, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  // writeFileSync só aplica o mode ao criar; um arquivo antigo pode ter outro
  chmodSync(target, 0o600);
  // migração: salvo no lugar novo, a cópia antiga dentro do app sai
  if (usesDefaultPath(file)) rmSync(legacyConnectionFilePath(), { force: true });
}

export function clearConnection(file?: string): void {
  rmSync(file ?? connectionFilePath(), { force: true });
  if (usesDefaultPath(file)) rmSync(legacyConnectionFilePath(), { force: true });
}

export interface ProbeResult {
  ok: boolean;
  url: string;
  authMode?: AuthMode;
  version?: string;
  gatewayRunning?: boolean;
  profileCount?: number;
  error?: string;
}

async function getJson(url: string, headers: Record<string, string>, timeoutMs: number) {
  const response = await fetch(url, {
    headers: { accept: "application/json", ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text().catch(() => "");
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  return { status: response.status, ok: response.ok, body, text };
}

function reason(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") return "o dashboard não respondeu a tempo";
  const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
  if (cause?.code === "ECONNREFUSED") return "conexão recusada: o dashboard está de pé nesse endereço?";
  if (cause?.code === "ENOTFOUND") return "host não encontrado";
  return error instanceof Error ? error.message : String(error);
}

/**
 * Testa o par link + token antes de salvar, na ordem do Desktop:
 * 1. `/api/status` (público): o dashboard existe? usa OAuth?
 * 2. `/api/profiles` com o token: o token vale? (status é público, então
 *    sozinho não prova nada sobre o token)
 */
export async function probeConnection(url: string, token: string, timeoutMs = 5000): Promise<ProbeResult> {
  let status: Awaited<ReturnType<typeof getJson>>;
  try {
    status = await getJson(`${url}/api/status`, {}, timeoutMs);
  } catch (error) {
    return { ok: false, url, error: reason(error) };
  }
  if (!status.ok) {
    return { ok: false, url, error: `/api/status respondeu HTTP ${status.status}: isso é o dashboard do Hermes?` };
  }

  const body = (status.body ?? {}) as { version?: unknown; gateway_running?: unknown };
  const authMode = authModeFromStatus(status.body);
  const base = {
    url,
    authMode,
    version: typeof body.version === "string" ? body.version : undefined,
    gatewayRunning: typeof body.gateway_running === "boolean" ? body.gateway_running : undefined,
  };
  if (authMode === "oauth") {
    return {
      ...base,
      ok: false,
      error: "este dashboard exige login OAuth; o Lipp HQ conecta só por session token",
    };
  }

  let profiles: Awaited<ReturnType<typeof getJson>>;
  try {
    profiles = await getJson(`${url}/api/profiles`, sessionHeaders(token), timeoutMs);
  } catch (error) {
    return { ...base, ok: false, error: reason(error) };
  }
  if (profiles.status === 401 || profiles.status === 403) {
    return { ...base, ok: false, error: `o dashboard recusou o session token (HTTP ${profiles.status})` };
  }
  if (!profiles.ok) {
    return { ...base, ok: false, error: `/api/profiles respondeu HTTP ${profiles.status}` };
  }
  const list = (profiles.body as { profiles?: unknown[] } | undefined)?.profiles;
  return { ...base, ok: true, profileCount: Array.isArray(list) ? list.length : 0 };
}

/** Porta padrão do `hermes dashboard` (`hermes_cli/main_dashboard.py`). */
export const DEFAULT_LOCAL_DASHBOARD_URL = "http://127.0.0.1:9119";
export const LOCAL_START_COMMAND = "hermes dashboard --no-open";

export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host === "::1" || /^127\./.test(host);
  } catch {
    return false;
  }
}

/**
 * Token que o dashboard local injeta na própria página
 * (`window.__HERMES_SESSION_TOKEN__`, `web_server_dashboard.py`). É assim que
 * o Hermes Desktop descobre o token do backend local
 * (`apps/desktop/electron/dashboard-token.ts`). Com gate de auth, o Hermes
 * omite o token e isto devolve null.
 */
export function extractServedToken(html: string): string | null {
  const match = /window\.__HERMES_SESSION_TOKEN__\s*=\s*("(?:\\.|[^"\\])*")/.exec(String(html ?? ""));
  if (!match) return null;
  try {
    const token = JSON.parse(match[1]) as unknown;
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  }
}

/** Lê o token servido; só em loopback, nunca de um host remoto. */
export async function readServedToken(url: string, timeoutMs = 3000): Promise<string | null> {
  if (!isLoopbackUrl(url)) return null;
  try {
    const response = await fetch(`${url}/`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    return extractServedToken(await response.text());
  } catch {
    return null;
  }
}

/** Onde procurar o Hermes local: o endereço do ambiente (se for loopback) e a 9119. */
export function localCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const candidates: string[] = [];
  const fromEnv = env.HERMES_DASHBOARD_URL ? env.HERMES_DASHBOARD_URL.replace(/\/+$/, "") : "";
  if (fromEnv && isLoopbackUrl(fromEnv)) candidates.push(fromEnv);
  if (!candidates.includes(DEFAULT_LOCAL_DASHBOARD_URL)) candidates.push(DEFAULT_LOCAL_DASHBOARD_URL);
  return candidates;
}

export interface LocalDiscovery {
  found: boolean;
  url?: string;
  version?: string;
  authMode?: AuthMode;
  /** True quando o dashboard publicou o token na página (dá para conectar sem colar). */
  tokenServed: boolean;
  /** Só no servidor: a rota pública nunca devolve este campo. */
  token?: string;
  profileCount?: number;
  error?: string;
  /** O que fazer quando nada foi achado. */
  hint?: string;
  tried: string[];
}

/**
 * Detecção do Hermes local, à moda do Claw3D (`readOpenclawGatewayDefaults`
 * preenche URL e token a partir da instalação local) com o mecanismo do
 * Desktop (token servido pela página do dashboard em loopback).
 */
export async function discoverLocalDashboard(
  candidates: string[] = localCandidates(),
  timeoutMs = 3000,
): Promise<LocalDiscovery> {
  let lastError: string | undefined;
  for (const url of candidates) {
    if (!isLoopbackUrl(url)) continue;
    let status: Awaited<ReturnType<typeof getJson>>;
    try {
      status = await getJson(`${url}/api/status`, {}, timeoutMs);
    } catch (error) {
      lastError = reason(error);
      continue;
    }
    if (!status.ok) {
      lastError = `${url}/api/status respondeu HTTP ${status.status}`;
      continue;
    }
    const authMode = authModeFromStatus(status.body);
    const version = (status.body as { version?: unknown } | undefined)?.version;
    const base = { found: true, url, authMode, version: typeof version === "string" ? version : undefined, tried: candidates };
    if (authMode === "oauth") {
      return { ...base, tokenServed: false, error: "este dashboard exige login OAuth" };
    }
    const token = await readServedToken(url, timeoutMs);
    if (!token) {
      return { ...base, tokenServed: false, error: "o dashboard não publica o token na página: cole o session token" };
    }
    const probe = await probeConnection(url, token, timeoutMs);
    if (!probe.ok) return { ...base, tokenServed: true, error: probe.error };
    return { ...base, tokenServed: true, token, profileCount: probe.profileCount };
  }
  return {
    found: false,
    tokenServed: false,
    tried: candidates,
    error: lastError,
    hint: LOCAL_START_COMMAND,
  };
}

export interface FailureClass {
  code: "AUTH" | "LISTENER" | "TIMEOUT" | "OAUTH" | "NOT_HERMES" | "HOST";
  label: string;
  action: string;
}

/**
 * Causa provável + o que fazer, como o `classifyGatewayFailure` do claw3doctor.
 * Recebe o texto de erro que o proxy já produz; devolve null se não reconhecer.
 */
export function classifyFailure(message: string | undefined): FailureClass | null {
  const text = String(message ?? "").toLowerCase();
  if (!text) return null;
  if (text.includes("oauth")) {
    return { code: "OAUTH", label: "Login OAuth", action: "Use um dashboard sem gate OAuth ou com session token fixo." };
  }
  if (text.includes("401") || text.includes("403") || text.includes("recusou o session token")) {
    return {
      code: "AUTH",
      label: "Token recusado",
      action: "O dashboard reiniciou ou o token mudou. Conecte de novo ou fixe HERMES_DASHBOARD_SESSION_TOKEN.",
    };
  }
  if (text.includes("recusada") || text.includes("econnrefused") || text.includes("fetch failed")) {
    return { code: "LISTENER", label: "Nada escutando", action: `Suba o dashboard: ${LOCAL_START_COMMAND}` };
  }
  if (text.includes("tempo") || text.includes("timed out") || text.includes("timeout")) {
    return { code: "TIMEOUT", label: "Sem resposta a tempo", action: "Confira se o host está acessível (rede, Tailscale, firewall)." };
  }
  if (text.includes("host não encontrado") || text.includes("enotfound")) {
    return { code: "HOST", label: "Host desconhecido", action: "Confira o nome do host no link." };
  }
  if (text.includes("isso é o dashboard")) {
    return { code: "NOT_HERMES", label: "Não é o dashboard", action: "O link aponta para outro serviço; o dashboard sobe na 9119." };
  }
  return null;
}

/**
 * Endereço do cliente é desta máquina? O proxy carrega o token do Hermes, então
 * só atende loopback — como o `network-policy.js` do Claw3D, que recusa expor o
 * Studio na rede sem token de acesso. Cobre IPv4, IPv6 e IPv4 mapeado em IPv6.
 */
export function isLoopbackAddress(address: string | undefined): boolean {
  const value = String(address ?? "").trim().toLowerCase();
  if (!value) return false;
  if (value === "::1" || value === "0:0:0:0:0:0:0:1") return true;
  const ipv4 = value.startsWith("::ffff:") ? value.slice("::ffff:".length) : value;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipv4);
}
