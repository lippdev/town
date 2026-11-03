import type { FleetSnapshot } from "@/integrations/hq/types";

/**
 * Regras puras de resiliência da leitura do gateway.
 *
 * O app observa um serviço que pode cair, reiniciar ou ficar lento. Em vez de
 * piscar para "offline" a cada poll perdido, mantemos a última leitura boa e
 * dizemos que ela está atrasada — e recuamos o intervalo em falhas seguidas.
 */

export const MIN_BACKOFF_MS = 4_000;
export const MAX_BACKOFF_MS = 30_000;

/** Intervalo até o próximo poll: base no sucesso, dobro por falha, teto fixo. */
export function nextDelayMs(consecutiveFailures: number, baseMs: number): number {
  if (consecutiveFailures <= 0) return baseMs;
  const doubled = baseMs * 2 ** Math.min(consecutiveFailures, 4);
  return Math.min(Math.max(doubled, MIN_BACKOFF_MS), MAX_BACKOFF_MS);
}

/**
 * Frota a exibir quando o poll falha: mantém a última boa, marcada como
 * atrasada, com o motivo. Sem leitura anterior, devolve uma frota vazia e
 * offline — nunca inventa bots.
 */
export function snapshotOnFailure(
  lastGood: FleetSnapshot | null,
  errorMessage: string,
  now: number,
): FleetSnapshot {
  if (!lastGood) {
    return {
      source: "hermes",
      fetchedAt: now,
      health: { api: "offline", dashboard: "offline", detail: errorMessage },
      bots: [],
      errorDetail: errorMessage,
    };
  }

  return {
    ...lastGood,
    // health continua dizendo o que era; `stale` é o sinal de que é leitura antiga
    stale: true,
    errorDetail: errorMessage,
  };
}

/** Idade do dado em segundos, para a UI dizer "há N s" com honestidade. */
export function staleSeconds(snapshot: FleetSnapshot | null, now: number): number {
  if (!snapshot) return 0;
  return Math.max(0, Math.round((now - snapshot.fetchedAt) / 1000));
}
