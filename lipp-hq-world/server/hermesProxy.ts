import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Proxy de leitura same-origin para o Hermes.
 *
 * O navegador nunca vê credencial do Hermes: o proxy guarda a chave do
 * serviço de API (`HERMES_API_KEY`) e, quando existir, o token do dashboard
 * (`HERMES_DASHBOARD_TOKEN`). Ele só faz GET nos endpoints documentados em
 * docs/HERMES.md — nenhuma escrita chega ao Hermes por aqui.
 */

export interface HermesProxyConfig {
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
}

const DEFAULT_TIMEOUT_MS = 5000;

export function readHermesConfig(env: NodeJS.ProcessEnv = process.env): HermesProxyConfig {
  const timeout = Number(env.HERMES_TIMEOUT_MS);
  return {
    apiUrl: (env.HERMES_API_URL ?? "http://127.0.0.1:8642").replace(/\/+$/, ""),
    dashboardUrl: (env.HERMES_DASHBOARD_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, ""),
    apiKey: env.HERMES_API_KEY ?? "",
    dashboardToken: env.HERMES_DASHBOARD_TOKEN ?? "",
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

async function getJson<T>(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<EndpointResult<T>> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { reachable: true, status: response.status, error: describeHttpError(response.status, detail) };
    }
    return { reachable: true, status: response.status, data: (await response.json()) as T };
  } catch (error) {
    return { reachable: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

function describeHttpError(status: number, detail: string): string {
  if (status === 401 || status === 403) {
    return `dashboard exigiu autenticação (HTTP ${status}): defina HERMES_DASHBOARD_TOKEN`;
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
  const dashboardHeaders: Record<string, string> = config.dashboardToken
    ? { authorization: `Bearer ${config.dashboardToken}` }
    : {};

  const [health, profiles, sessions, jobs] = await Promise.all([
    getJson<{ status?: string; version?: string; platform?: string }>(
      `${config.apiUrl}/health`,
      apiHeaders,
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
      api: { ok: !health.error, status: health.status, error: health.error },
      profiles: { ok: !profiles.error, status: profiles.status, error: profiles.error },
      sessions: { ok: !sessions.error, status: sessions.status, error: sessions.error },
      jobs: { ok: !jobs.error, status: jobs.status, error: jobs.error },
    },
  };
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

  if (request.method !== "GET") {
    response.statusCode = 405;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "O proxy do Hermes é somente leitura." }));
    return;
  }

  const path = url.split("?")[0];
  try {
    if (path === `${HQ_PREFIX}/hermes/snapshot`) {
      const snapshot = await fetchHermesSnapshot(readHermesConfig());
      response.statusCode = 200;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      response.end(JSON.stringify(snapshot));
      return;
    }

    if (path === `${HQ_PREFIX}/status`) {
      const config = readHermesConfig();
      response.statusCode = 200;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({
          configured: Boolean(config.apiUrl || config.dashboardUrl),
          apiUrl: config.apiUrl,
          dashboardUrl: config.dashboardUrl,
          hasApiKey: Boolean(config.apiKey),
          hasDashboardToken: Boolean(config.dashboardToken),
        }),
      );
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
