import type { AgentAnimationState, AgentDefinition, RoomDefinition } from "@/types/hq";
import { AGENTS_BY_ID } from "@/agents/agents";
import { CHARACTER_PRESETS } from "@/world/characters/appearance";
import { ROOMS } from "@/world/rooms/rooms";
import type { FleetSnapshot } from "@/integrations/hq/types";

/**
 * Quem está na cena: os bots que o Hermes reporta, encaixados nos postos de
 * trabalho. Sem frota lida, a cena fica vazia.
 */
export interface SceneAgent extends AgentDefinition {
  /** Estado vindo da frota ao vivo. */
  liveState?: AgentAnimationState;
  /** True quando o bot veio do Hermes (frota real). */
  live: boolean;
  /** Quantas sessões abertas o bot tem agora (0 quando desconhecido). */
  activeSessions?: number;
  /** Personagem da biblioteca atribuído automaticamente, estável por bot. */
  presetId?: string;
}

const DEPARTMENT_ROOMS: RoomDefinition[] = ROOMS.filter((room) => room.kind === "department");

/** Cores de identidade para bots sem cor própria, na ordem dos postos. */
const BOT_COLORS = [
  "#2563eb",
  "#f97316",
  "#3b82f6",
  "#a855f7",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
] as const;

const BOT_ACCENTS = [
  "#93c5fd",
  "#fdba74",
  "#22d3ee",
  "#d8b4fe",
  "#86efac",
  "#fcd34d",
  "#f9a8d4",
] as const;

/** Slots de trabalho por sala: cada sala de departamento tem 1 posto. */
export const DESK_SLOTS = DEPARTMENT_ROOMS.length;

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100000;
  }
  return hash;
}

/**
 * Uma aparência de biblioteca por bot, estável entre polls: o mesmo bot veste
 * sempre o mesmo personagem, sem precisar de configuração.
 */
function presetIdFor(botId: string): string {
  return CHARACTER_PRESETS[hashString(botId) % CHARACTER_PRESETS.length].id;
}

/**
 * Converte a frota do Hermes em agentes da cena.
 *
 * Regras: um bot que corresponde a um agente Lipp conhecido herda identidade,
 * sala e cor dele (o bot é a mesma pessoa). Bots novos recebem posto livre,
 * cor da paleta e a sala do posto. Bots além dos postos disponíveis vão para o
 * hall, marcados como excedentes — a UI diz quantos ficaram de fora do quadro.
 */
export function sceneAgentsFromFleet(fleet: FleetSnapshot | null): SceneAgent[] {
  if (!fleet || fleet.bots.length === 0) return [];

  const usedRooms = new Set<string>();
  const agents: SceneAgent[] = [];

  const ordered = [...fleet.bots].sort((a, b) => {
    const aKnown = AGENTS_BY_ID[a.id] ? 0 : 1;
    const bKnown = AGENTS_BY_ID[b.id] ? 0 : 1;
    if (aKnown !== bKnown) return aKnown - bKnown;
    return (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0);
  });

  ordered.forEach((bot, index) => {
    const known = AGENTS_BY_ID[bot.id];
    const room = known
      ? ROOMS.find((candidate) => candidate.id === known.roomId)
      : DEPARTMENT_ROOMS.find((candidate) => !usedRooms.has(candidate.id));

    if (room) usedRooms.add(room.id);
    const palette = index % BOT_COLORS.length;
    const presetId = presetIdFor(bot.id);

    agents.push({
      id: bot.id,
      name: bot.name || bot.id,
      role: bot.title ?? (known?.role ?? "Bot do Hermes"),
      responsibility: bot.description ?? (known?.responsibility ?? ""),
      roomId: room?.id ?? known?.roomId ?? "hall",
      color: known?.color ?? BOT_COLORS[palette],
      accent: known?.accent ?? BOT_ACCENTS[palette],
      hairColor: known?.hairColor,
      live: true,
      liveState: bot.state,
      activeSessions: bot.activeSessions,
      presetId,
    });
  });

  return agents;
}

/** Quantos bots da frota não couberam nos postos e ficaram sem cena. */
export function overflowCount(agents: SceneAgent[]): number {
  return agents.filter((agent) => agent.roomId === "hall").length;
}
