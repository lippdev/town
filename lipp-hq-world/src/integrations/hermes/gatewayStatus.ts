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
  apiUrl?: string;
  dashboardUrl?: string;
  hasApiKey?: boolean;
  hasDashboardToken?: boolean;
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
