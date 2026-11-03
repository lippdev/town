import type { BotSnapshot, SessionSnapshot } from "@/integrations/hq/types";

/**
 * Rótulos das origens de sessão. O Hermes grava `source` como valor cru
 * (`cli`, `cron`, `telegram`…); a UI traduz só o que muda de sentido em
 * português e mostra o resto como veio — nada de inventar plataforma.
 */
const SOURCE_LABELS: Record<string, string> = {
  cli: "terminal",
  cron: "rotina",
  subagent: "subagente",
  gateway: "gateway",
  web: "web",
};

export function sourceLabel(source: string | undefined): string {
  if (!source) return "sem origem";
  return SOURCE_LABELS[source.toLowerCase()] ?? source.toLowerCase();
}

export interface FleetSession {
  botId: string;
  botName: string;
  botColor: string;
  session: SessionSnapshot;
}

/**
 * Sessões da frota inteira, da mais recente para a mais antiga.
 *
 * A ordenação usa `lastActiveAt` real; sessão sem data vai para o fim em vez de
 * fingir recência. O limite existe porque a lista é um resumo, não um log.
 */
export function fleetSessions(
  bots: BotSnapshot[],
  colors: Record<string, string> = {},
  limit = 24,
): FleetSession[] {
  const rows: FleetSession[] = [];
  for (const bot of bots) {
    for (const session of bot.sessions ?? []) {
      rows.push({ botId: bot.id, botName: bot.name, botColor: colors[bot.id] ?? "#2563eb", session });
    }
  }
  rows.sort((a, b) => (b.session.lastActiveAt ?? 0) - (a.session.lastActiveAt ?? 0));
  return rows.slice(0, limit);
}

/** Total de sessões ativas na frota, pela janela que o Hermes define. */
export function activeSessionTotal(bots: BotSnapshot[]): number {
  return bots.reduce((total, bot) => total + bot.activeSessions, 0);
}
