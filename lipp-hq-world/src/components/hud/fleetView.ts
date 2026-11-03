import type { BotSnapshot, FleetSnapshot, GatewayState } from "@/integrations/hq/types";

/** Rótulos e formatações da visão de frota. Puras, para testar e reusar. */

export const GATEWAY_LABEL: Record<GatewayState, string> = {
  online: "conectado",
  degraded: "parcial",
  offline: "offline",
};

export function relativeTime(at: number | undefined, now = Date.now()): string {
  if (!at) return "sem sinal";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return "agora";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} d`;
}

/** Idade do dado em texto curto: "5 s", "2 min", "1 h". Nunca "agora atrás". */
export function ageLabel(at: number | undefined, now = Date.now()): string {
  if (!at) return "desconhecida";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 90) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

export function stateLabel(state: BotSnapshot["state"]): string {
  switch (state) {
    case "working":
      return "trabalhando";
    case "waiting":
      return "aguardando";
    case "idle":
      return "ocioso";
    case "offline":
      return "offline";
    case "blocked":
      return "bloqueado";
    case "meeting":
      return "em reunião";
    case "walking":
      return "em trânsito";
    default:
      return state;
  }
}

export function fleetCounts(fleet: FleetSnapshot | null) {
  const bots = fleet?.bots ?? [];
  return {
    total: bots.length,
    working: bots.filter((bot) => bot.state === "working").length,
    waiting: bots.filter((bot) => bot.state === "waiting").length,
    idle: bots.filter((bot) => bot.state === "idle").length,
    sessions: bots.reduce((sum, bot) => sum + bot.sessionCount, 0),
    routines: bots.reduce((sum, bot) => sum + bot.routineCount, 0),
  };
}

/** Selo da fonte: frescor real do dado, nunca "ao vivo" quando é leitura antiga. */
export function freshnessBadge(fleet: FleetSnapshot | null, now = Date.now()): { tone: "live" | "stale" | "down"; label: string } | null {
  if (!fleet) return null;
  if (fleet.stale) {
    const seconds = Math.max(0, Math.round((now - fleet.fetchedAt) / 1000));
    return {
      tone: "stale",
      label: seconds < 60 ? `atrasado ${seconds}s` : `atrasado ${Math.round(seconds / 60)}min`,
    };
  }
  if (fleet.health.dashboard === "offline" && fleet.health.api === "offline") return { tone: "down", label: "sem sinal" };
  return null;
}

/** Aviso honesto quando a frota não pode ser lida por completo. */
export function gatewayNotice(fleet: FleetSnapshot | null): string | null {
  if (!fleet) return "Lendo o gateway Hermes…";
  const { health } = fleet;
  if (health.api === "offline" && health.dashboard === "offline") {
    return health.detail
      ? `Hermes fora do ar — ${health.detail}`
      : "Hermes fora do ar: nenhum serviço respondeu em HERMES_API_URL / HERMES_DASHBOARD_URL.";
  }
  if (health.dashboard === "offline") {
    return health.detail
      ? `Frota indisponível (dashboard) — ${health.detail}`
      : "Dashboard do Hermes fora do ar: a frota não pode ser nomeada.";
  }
  if (health.dashboard === "degraded") {
    return health.detail ? `Frota parcial — ${health.detail}` : "Frota parcial: parte das leituras falhou.";
  }
  return null;
}
