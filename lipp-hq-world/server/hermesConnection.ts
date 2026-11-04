import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Conexão com o dashboard do Hermes no mesmo formato do Hermes Desktop
 * (modo "token" de gateway remoto, `apps/desktop/electron/connection-config.ts`):
 *
 * - um link do dashboard (`http://homelab.lan:9119`), aceito sem esquema;
 * - o session token do dashboard, enviado no header `X-Hermes-Session-Token`;
 * - `/api/status` é público e diz se o gateway usa OAuth (`auth_required`).
 *
 * O token é salvo só no servidor, num arquivo local com permissão 0600. O
 * navegador manda o token uma vez e nunca o lê de volta: recebe só a prévia
 * `...abc123`, igual ao Desktop.
 */

export const SESSION_HEADER_NAME = "x-hermes-session-token";

export interface SavedConnection {
  url: string;
  token: string;
  savedAt: number;
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

export function connectionFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.HQ_CONNECTION_FILE ?? ".hq-connection.json");
}

export function loadSavedConnection(file: string = connectionFilePath()): SavedConnection | null {
  try {
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<SavedConnection>;
    if (typeof parsed.url !== "string" || typeof parsed.token !== "string" || !parsed.url) return null;
    return { url: parsed.url, token: parsed.token, savedAt: Number(parsed.savedAt) || 0 };
  } catch {
    // arquivo corrompido não derruba o proxy: vale como "sem conexão salva"
    return null;
  }
}

export function saveConnection(connection: SavedConnection, file: string = connectionFilePath()): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(connection, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  // writeFileSync só aplica o mode ao criar; um arquivo antigo pode ter outro
  chmodSync(file, 0o600);
}

export function clearConnection(file: string = connectionFilePath()): void {
  rmSync(file, { force: true });
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
