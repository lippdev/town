import type { FleetSnapshot } from "@/integrations/hq/types";
import type { AgentAnimationState } from "@/types/hq";

/**
 * Estado de cena por bot, derivado só do que a frota reporta. `offline` nunca
 * é usado aqui: um bot que não aparece simplesmente não está na cena — a fonte
 * é a lista, não um palpite.
 */
export function botStatesFromFleet(fleet: FleetSnapshot): Array<{ agentId: string; state: AgentAnimationState }> {
  return fleet.bots.map((bot) => ({ agentId: bot.id, state: bot.state }));
}
