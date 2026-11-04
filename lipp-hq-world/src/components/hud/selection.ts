import type { BotSnapshot, FleetSnapshot } from "@/integrations/hq/types";
import type { RoomDefinition } from "@/types/hq";
import { ROOMS_BY_ID } from "@/world/rooms/rooms";
import { sceneAgentsFromFleet } from "@/world/characters/sceneAgents";

export type DrawerSubject = { kind: "bot"; bot: BotSnapshot } | { kind: "room"; room: RoomDefinition } | null;

/**
 * O que a gaveta mostra para a seleção atual.
 *
 * Bot escolhido vence. Sala escolhida mostra o bot que ocupa o posto dela na
 * cena — a mesma regra de `sceneAgentsFromFleet`, então bots novos (fora do
 * cadastro Lipp) também abrem pela sala. Sala vazia mostra a própria sala.
 */
export function drawerSubject(
  fleet: FleetSnapshot | null,
  selectedBotId: string | null,
  selectedRoomId: string | null,
): DrawerSubject {
  const bots = fleet?.bots ?? [];
  if (selectedBotId) {
    const bot = bots.find((candidate) => candidate.id === selectedBotId);
    if (bot) return { kind: "bot", bot };
  }
  if (!selectedRoomId) return null;

  const occupant = sceneAgentsFromFleet(fleet).find((agent) => agent.roomId === selectedRoomId);
  const bot = occupant ? bots.find((candidate) => candidate.id === occupant.id) : undefined;
  if (bot) return { kind: "bot", bot };

  const room = ROOMS_BY_ID[selectedRoomId];
  return room ? { kind: "room", room } : null;
}

/** Sala onde o bot trabalha na cena, para a câmera focar ao escolhê-lo. */
export function botRoomId(fleet: FleetSnapshot | null, botId: string): string | null {
  const agent = sceneAgentsFromFleet(fleet).find((candidate) => candidate.id === botId);
  return agent && agent.roomId !== "hall" ? agent.roomId : null;
}
