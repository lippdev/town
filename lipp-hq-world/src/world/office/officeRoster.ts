import { AGENTS, AGENTS_BY_ID } from "@/agents/agents";
import { PALETTES, PULSE_BASE_SPEC } from "@/character-studio/model/presets";
import type { CharacterSpec } from "@/character-studio/model/schema";
import type { BotSnapshot, FleetSnapshot } from "@/integrations/hq/types";
import type { AgentAnimationState } from "@/types/hq";
import { sceneAgentsFromFleet } from "@/world/characters/sceneAgents";
import { OFFICE_SEATS, OFFICE_SEATS_BY_ID, type OfficeSeat } from "./officeLayout";

/** Um bot no escritório, seja da frota real, seja da demonstração. */
export interface OfficeBot {
  id: string;
  name: string;
  role: string;
  responsibility: string;
  color: string;
  /** Veio do Hermes. Na demonstração é falso e não há estado nenhum. */
  live: boolean;
  state?: AgentAnimationState;
  activeSessions?: number;
  spec: CharacterSpec;
}

/**
 * Sete pessoas a partir do mesmo modelo do estúdio: a camisa é a cor do bot, o resto
 * varia pouco. O Pulse é o modelo aprovado, sem nenhuma alteração.
 */
const KNOWN_SPECS: Record<string, CharacterSpec> = {
  pulse: PULSE_BASE_SPEC,
  argos: {
    colors: { skin: "#a4704f", hair: "#17120f", shirt: "#2563eb", pants: "#2f4256", belt: "#2b211a", face: "#17120f" },
    proportions: { heightM: 1.84, width: 1.02, head: 0.97 },
    accessories: { glasses: false },
  },
  forge: {
    colors: { skin: "#e8bfa0", hair: "#6b4426", shirt: "#f97316", pants: "#33363d", belt: "#40332a", face: "#3b281d" },
    proportions: { heightM: 1.78, width: 1.08, head: 1 },
    accessories: { glasses: false },
  },
  echo: {
    colors: { skin: "#f1d0b5", hair: "#8e4a24", shirt: "#a855f7", pants: "#4b4238", belt: "#5a3d28", face: "#3b281d" },
    proportions: { heightM: 1.68, width: 0.97, head: 1.04 },
    accessories: { glasses: false },
  },
  scout: {
    colors: { skin: "#8d5a3c", hair: "#17120f", shirt: "#22c55e", pants: "#4b4238", belt: "#2b211a", face: "#17120f" },
    proportions: { heightM: 1.8, width: 0.95, head: 0.98 },
    accessories: { glasses: true },
  },
  atlas: {
    colors: { skin: "#c58d6c", hair: "#c49a5b", shirt: "#f59e0b", pants: "#2f4256", belt: "#5a3d28", face: "#3b281d" },
    proportions: { heightM: 1.72, width: 1.04, head: 1.02 },
    accessories: { glasses: false },
  },
  ink: {
    colors: { skin: "#5f3b28", hair: "#17120f", shirt: "#ec4899", pants: "#1d1f23", belt: "#2b211a", face: "#17120f" },
    proportions: { heightM: 1.7, width: 0.96, head: 1.03 },
    accessories: { glasses: true },
  },
};

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = (result * 31 + value.charCodeAt(index)) % 100000;
  return result;
}

function pick<T>(list: readonly T[] | undefined, value: number, fallback: T): T {
  return list && list.length > 0 ? list[value % list.length]! : fallback;
}

/** Aparência do bot: conhecida vem da tabela; a de bot novo sai do id, sempre igual. */
export function specForBot(id: string, color: string): CharacterSpec {
  const known = KNOWN_SPECS[id];
  if (known) return known;
  const seed = hash(id);
  return {
    colors: {
      ...PULSE_BASE_SPEC.colors,
      skin: pick(PALETTES.skin, seed, PULSE_BASE_SPEC.colors.skin),
      hair: pick(PALETTES.hair, seed >> 2, PULSE_BASE_SPEC.colors.hair),
      pants: pick(PALETTES.pants, seed >> 3, PULSE_BASE_SPEC.colors.pants),
      face: "#17120f",
      shirt: color,
    },
    proportions: { heightM: (170 + (seed % 15)) / 100, width: (96 + (seed % 9)) / 100, head: 1 },
    accessories: { glasses: seed % 5 === 0 },
  };
}

/** Os sete de referência, sem estado: a demonstração não finge atividade. */
export function demoBots(): OfficeBot[] {
  return AGENTS.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    responsibility: agent.responsibility,
    color: agent.color,
    live: false,
    spec: specForBot(agent.id, agent.color),
  }));
}

/** A frota real, com nomes, ids e estados como o Hermes os reporta. */
export function fleetBots(fleet: FleetSnapshot | null): OfficeBot[] {
  const bots = new Map<string, BotSnapshot>((fleet?.bots ?? []).map((bot) => [bot.id, bot]));
  return sceneAgentsFromFleet(fleet)
    .filter((agent, index, list) => list.findIndex((other) => other.id === agent.id) === index)
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      responsibility: agent.responsibility,
      color: agent.color,
      live: true,
      state: bots.get(agent.id)?.state ?? "offline",
      activeSessions: agent.activeSessions ?? 0,
      spec: specForBot(agent.id, agent.color),
    }));
}

export interface Seating {
  /** Bot → posto. */
  seats: Record<string, string>;
  /** Bots que passaram da capacidade: sem corpo na cena, mas listados e clicáveis. */
  unseated: string[];
}

/**
 * Distribui os bots pelos postos, sem nunca pôr dois na mesma cadeira.
 *
 * - quem já sentou continua onde está (`previous`), para a resposta de um poll não
 *   trocar ninguém de lugar;
 * - bot conhecido vai para o posto do próprio departamento, mesmo que outro tenha
 *   sentado lá enquanto ele estava fora;
 * - os demais pegam o primeiro posto livre, em ordem de id: a ordem de chegada ou de
 *   atividade não muda o resultado.
 */
export function assignSeats(
  botIds: readonly string[],
  seats: readonly OfficeSeat[] = OFFICE_SEATS,
  previous: Readonly<Record<string, string>> = {},
): Seating {
  const ids = [...new Set(botIds)].sort();
  const known = new Set(seats.map((entry) => entry.id));
  const taken = new Map<string, string>();
  const result: Record<string, string> = {};
  const sit = (botId: string, seatId: string) => {
    result[botId] = seatId;
    taken.set(seatId, botId);
  };

  const homeSeat = (botId: string) => {
    const home = AGENTS_BY_ID[botId];
    return home ? seats.find((entry) => entry.roomId === home.roomId && entry.kind === "posto") : undefined;
  };

  for (const id of ids) {
    const home = homeSeat(id);
    if (home) sit(id, home.id);
  }
  for (const id of ids) {
    if (result[id]) continue;
    const before = previous[id];
    if (before && known.has(before) && !taken.has(before)) sit(id, before);
  }
  const unseated: string[] = [];
  for (const id of ids) {
    if (result[id]) continue;
    const free = seats.find((entry) => !taken.has(entry.id));
    if (free) sit(id, free.id);
    else unseated.push(id);
  }
  return { seats: result, unseated };
}

export function seatOf(seating: Seating, botId: string): OfficeSeat | null {
  const id = seating.seats[botId];
  return id ? (OFFICE_SEATS_BY_ID[id] ?? null) : null;
}

export function botsInRoom(seating: Seating, roomId: string): string[] {
  return Object.entries(seating.seats)
    .filter(([, seatId]) => OFFICE_SEATS_BY_ID[seatId]?.roomId === roomId)
    .map(([botId]) => botId)
    .sort();
}
