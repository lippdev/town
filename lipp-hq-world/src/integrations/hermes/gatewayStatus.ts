import { useEffect, useState } from "react";

/**
 * configuração do gateway como o proxy a reporta (nunca com o valor de uma
 * credencial, só se ela está definida).
 *
 * Busca uma vez por sessão de página e compartilha o resultado: a aba de
 * diagnóstico e qualquer link para o dashboard usam o mesmo dado, sem uma
 * requisição por componente nem um "—" piscando quando a aba abre.
 */
export interface GatewayStatus {
  configured?: boolean;
  /** "saved": link + token salvos na aba Integrações; "env": variáveis do servidor. */
  source?: "saved" | "env";
  apiUrl?: string;
  dashboardUrl?: string;
  hasApiKey?: boolean;
  hasDashboardToken?: boolean;
  /** Últimos caracteres do token (`...abc123`), nunca o valor. */
  tokenPreview?: string | null;
}

let cached: GatewayStatus | null = null;
let started = false;
const listeners = new Set<(value: GatewayStatus | null) => void>();

function publish(value: GatewayStatus | null): void {
  cached = value;
  for (const listener of listeners) listener(value);
}

/** Dispara a leitura o quanto antes (o app já chama no boot da conexão). */
export function primeGatewayStatus(): void {
  if (started) return;
  started = true;
  fetch("/api/hq/status")
    .then((response) => (response.ok ? (response.json() as Promise<GatewayStatus>) : null))
    .then((payload) => publish(payload ?? null))
    .catch(() => publish(null));
}

/** Relê a configuração depois de conectar ou desconectar. */
export function refreshGatewayStatus(): Promise<void> {
  started = true;
  return fetch("/api/hq/status")
    .then((response) => (response.ok ? (response.json() as Promise<GatewayStatus>) : null))
    .then((payload) => publish(payload ?? null))
    .catch(() => publish(null));
}

export interface ConnectResult {
  ok: boolean;
  error?: string;
  version?: string;
  profileCount?: number;
}

/**
 * Manda link + token ao proxy deste app (nunca direto ao Hermes). O proxy
 * testa o par e só salva se o dashboard aceitar; o token não volta.
 */
export async function connectHermes(url: string, token: string): Promise<ConnectResult> {
  try {
    const response = await fetch("/api/hq/connection", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, token }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      probe?: { version?: string; profileCount?: number };
      status?: GatewayStatus;
    };
    if (payload.status) publish(payload.status);
    if (!response.ok || !payload.ok) {
      return { ok: false, error: payload.error ?? `HTTP ${response.status}` };
    }
    return { ok: true, version: payload.probe?.version, profileCount: payload.probe?.profileCount };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function disconnectHermes(): Promise<ConnectResult> {
  try {
    const response = await fetch("/api/hq/connection", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; status?: GatewayStatus };
    if (payload.status) publish(payload.status);
    return response.ok ? { ok: true } : { ok: false, error: payload.error ?? `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function useGatewayStatus(): GatewayStatus | null {
  const [value, setValue] = useState<GatewayStatus | null>(cached);

  useEffect(() => {
    listeners.add(setValue);
    primeGatewayStatus();
    if (cached) setValue(cached);
    return () => {
      listeners.delete(setValue);
    };
  }, []);

  return value;
}
