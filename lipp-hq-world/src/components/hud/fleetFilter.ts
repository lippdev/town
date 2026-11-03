import type { BotSnapshot } from "@/integrations/hq/types";

/**
 * Busca, filtro e ordenação da frota. Tudo puro para poder testar: a UI só
 * desenha o resultado.
 */

export type StateFilter = "todos" | "trabalhando" | "aguardando" | "ociosos" | "briefing";

export const STATE_FILTERS: Array<{ id: StateFilter; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "trabalhando", label: "Trabalhando" },
  { id: "aguardando", label: "Aguardando" },
  { id: "ociosos", label: "Ociosos" },
  { id: "briefing", label: "Em briefing" },
];

function matchesFilter(bot: BotSnapshot, filter: StateFilter): boolean {
  switch (filter) {
    case "trabalhando":
      return bot.state === "working";
    case "aguardando":
      return bot.state === "waiting";
    case "ociosos":
      return bot.state === "idle";
    case "briefing":
      return Boolean(bot.briefing) || bot.state === "meeting";
    default:
      return true;
  }
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Busca por nome, título, descrição, modelo ou id — sem acento e sem caixa. */
export function matchesQuery(bot: BotSnapshot, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  return [bot.name, bot.title, bot.description, bot.model, bot.provider, bot.id]
    .filter((value): value is string => Boolean(value))
    .some((value) => normalize(value).includes(needle));
}

/**
 * Ordena por relevância para quem olha a frota: briefing e trabalho primeiro,
 * depois quem espera, depois ociosos; dentro do grupo, atividade mais recente.
 */
const STATE_ORDER: Record<string, number> = {
  meeting: 0,
  working: 1,
  waiting: 2,
  blocked: 2,
  idle: 3,
  offline: 4,
};

export function visibleBots(bots: BotSnapshot[], query: string, filter: StateFilter): BotSnapshot[] {
  return bots
    .filter((bot) => matchesFilter(bot, filter) && matchesQuery(bot, query))
    .sort((a, b) => {
      const byState = (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9);
      if (byState !== 0) return byState;
      return (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0);
    });
}

/** Movimento de seleção no teclado, com volta ao início/fim. */
export function nextIndex(current: number, delta: number, total: number): number {
  if (total <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : total - 1;
  return (current + delta + total) % total;
}
