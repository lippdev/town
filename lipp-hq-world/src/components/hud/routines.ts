import type { BotSnapshot, RoutineSnapshot } from "@/integrations/hq/types";

/**
 * Leitura das rotinas do Hermes para a UI.
 *
 * O Hermes grava `last_status` cru (`ok`, `error`, `delivery_failed`,
 * `cancelled`, `delivery_queued`). Aqui só traduzimos e classificamos o que é
 * problema — nunca inventamos um estado que a fonte não reportou.
 */

export type RoutineHealth = "ok" | "failed" | "delivery" | "cancelled" | "running" | "unknown";

export function routineHealth(routine: RoutineSnapshot): RoutineHealth {
  switch (routine.lastStatus) {
    case "ok":
      return "ok";
    case "error":
    case "failed":
      return "failed";
    case "delivery_failed":
      return "delivery";
    case "cancelled":
      return "cancelled";
    case "delivery_queued":
    case "queued":
    case "running":
      return "running";
    default:
      return "unknown";
  }
}

export function routineHealthLabel(health: RoutineHealth): string {
  switch (health) {
    case "ok":
      return "ok";
    case "failed":
      return "falhou";
    case "delivery":
      return "entrega falhou";
    case "cancelled":
      return "cancelada";
    case "running":
      return "executando";
    default:
      return "sem execução";
  }
}

/** Rótulo cru do Hermes quando não temos tradução: melhor feio que inventado. */
export function routineStatusText(routine: RoutineSnapshot): string {
  const health = routineHealth(routine);
  if (health !== "unknown") return routineHealthLabel(health);
  return routine.lastStatus ?? "sem execução";
}

export interface BotRoutines {
  botId: string;
  botName: string;
  botColor: string;
  routines: RoutineSnapshot[];
}

/**
 * Rotinas da frota agrupadas por bot, com quem está com problema primeiro:
 * falha (error) antes de entrega falha antes de ok, e dentro do grupo a próxima
 * execução mais próxima vem antes.
 */
export function routinesByBot(bots: BotSnapshot[], colors: Record<string, string> = {}): BotRoutines[] {
  const severity: Record<RoutineHealth, number> = {
    failed: 0,
    delivery: 1,
    cancelled: 2,
    running: 3,
    unknown: 4,
    ok: 5,
  };

  return bots
    .filter((bot) => (bot.routines ?? []).length > 0)
    .map((bot) => ({
      botId: bot.id,
      botName: bot.name,
      botColor: colors[bot.id] ?? "#2563eb",
      routines: [...(bot.routines ?? [])].sort((a, b) => {
        const byHealth = severity[routineHealth(a)] - severity[routineHealth(b)];
        if (byHealth !== 0) return byHealth;
        return (a.nextAt ?? Number.MAX_SAFE_INTEGER) - (b.nextAt ?? Number.MAX_SAFE_INTEGER);
      }),
    }))
    .sort((a, b) => {
      const failedA = a.routines.filter((routine) => routineHealth(routine) === "failed").length;
      const failedB = b.routines.filter((routine) => routineHealth(routine) === "failed").length;
      if (failedA !== failedB) return failedB - failedA;
      return a.botName.localeCompare(b.botName);
    });
}

/** Resumo honesto: total, quantas falharam e quantas estão pausadas. */
export function routineTotals(bots: BotSnapshot[]): { total: number; failed: number; paused: number } {
  let total = 0;
  let failed = 0;
  let paused = 0;
  for (const bot of bots) {
    for (const routine of bot.routines ?? []) {
      total += 1;
      if (routineHealth(routine) === "failed" || routineHealth(routine) === "delivery") failed += 1;
      if (routine.paused || routine.enabled === false) paused += 1;
    }
  }
  return { total, failed, paused };
}
