import type { HumanPreset } from "@/avatar/human/preset";
import { FACING, OFFICE_ROOMS_BY_ID, OFFICE_SEATS, type OfficeSeat } from "./officeLayout";

/**
 * Gente no escritório, separada dos bots de propósito: pessoa não vem do Hermes, não tem
 * sessão nem estado, e só existe na demonstração. Este arquivo não importa three.
 */

export type HumanPhase = "standing" | "toChair" | "sitting" | "seated" | "rising" | "toSpot";
export type HumanGoal = "standing" | "seated";

export const HUMAN_PHASE_LABEL: Record<HumanPhase, string> = {
  standing: "Em pé",
  toChair: "Indo até a cadeira",
  sitting: "Sentando",
  seated: "Sentada",
  rising: "Levantando",
  toSpot: "Voltando",
};

/**
 * O arquivo tem cerca de 2,05 m até o alto da cabeça, e a cabeça é metade disso: no tamanho
 * do arquivo ela cobre quem está atrás. Esta escala deixa a pessoa com 1,48 m.
 */
export const HUMAN_SCALE = 0.72;
/** O assento é alto para estas pernas: a pessoa senta nele com os pés soltos, como criança. */
export const HUMAN_SEAT_LIFT = 0.14;

export interface Point {
  x: number;
  z: number;
}

/**
 * Lugares no hall, em coordenadas locais da sala. Afastados na diagonal da câmera (x − z):
 * é o que os separa na tela, e nenhuma cabeça cobre a outra.
 */
const SPOTS: readonly Point[] = [
  { x: 1.1, z: 0.9 },
  { x: 0.3, z: 0.95 },
  { x: 1.9, z: 0.95 },
  { x: -0.6, z: 0.8 },
  { x: 2.7, z: 0.9 },
  { x: 1.0, z: 2.0 },
];

export const HUMAN_CAPACITY = SPOTS.length;

export interface OfficeHuman {
  id: string;
  name: string;
  preset: HumanPreset;
  spot: Point;
  /** Cadeira livre da bancada do hall; nula se os bots ocuparam todas. */
  chair: OfficeSeat | null;
  /** Só muda o instante da piscada, para não piscarem todos juntos. */
  phase: number;
}

export interface HumanPlacement {
  placed: OfficeHuman[];
  /** Salvas, mas além da capacidade: aparecem na lista, sem corpo na cena. */
  waiting: HumanPreset[];
}

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = (result * 31 + value.charCodeAt(index)) % 100000;
  return result;
}

/** Mesma ordem de salvamento, mesmos lugares: nada muda de posição ao recarregar. */
export function placeHumans(presets: readonly HumanPreset[], occupiedSeats: Iterable<string> = []): HumanPlacement {
  const hall = OFFICE_ROOMS_BY_ID.hall!.center;
  const taken = new Set(occupiedSeats);
  // Primeiro as cadeiras viradas para a câmera: nas outras, só se vê a nuca.
  const free = OFFICE_SEATS.filter((seat) => seat.roomId === "hall" && !taken.has(seat.id));
  const chairs = [...free.filter((seat) => seat.yaw === FACING.south), ...free.filter((seat) => seat.yaw !== FACING.south)];
  const placed = presets.slice(0, HUMAN_CAPACITY).map((preset, index) => ({
    id: preset.id,
    name: preset.name,
    preset,
    spot: { x: hall.x + SPOTS[index]!.x, z: hall.z + SPOTS[index]!.z },
    chair: chairs[index] ?? null,
    phase: (hash(preset.id) % 100) / 25,
  }));
  return { placed, waiting: presets.slice(HUMAN_CAPACITY) };
}

/** Quanto ao lado da cadeira a pessoa para: o vão entre uma cadeira e a seguinte. */
const SIDE_STEP = 0.5;

/**
 * O caminho do lugar até o lado da cadeira, sem cruzar móvel. Ela entra de lado: por trás
 * atravessaria o encosto. Cadeira virada para o sul fica atrás da bancada, e o caminho
 * contorna a ponta dela.
 */
export function chairRoute(spot: Point, seat: OfficeSeat): Point[] {
  const hall = OFFICE_ROOMS_BY_ID.hall!.center;
  const local = (x: number, z: number) => ({ x: hall.x + x, z: hall.z + z });
  const side = { x: seat.x - SIDE_STEP, z: seat.z };
  if (seat.yaw === FACING.north) return [spot, { x: side.x, z: hall.z + 0.62 }, side];
  return [spot, local(0.35, 0.62), local(0.35, -2.1), { x: side.x, z: hall.z - 2.1 }, side];
}

export function pathLength(path: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) total += Math.hypot(path[index]!.x - path[index - 1]!.x, path[index]!.z - path[index - 1]!.z);
  return total;
}

export interface PathPose extends Point {
  /** Rotação que faz a figura, que olha para +Z, seguir o trecho. */
  yaw: number;
}

/** Onde se está depois de percorrer `distance` metros. Fora da faixa, fica nas pontas. */
export function pathPose(path: readonly Point[], distance: number): PathPose {
  let left = Math.max(0, distance);
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]!;
    const to = path[index]!;
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (left <= length || index === path.length - 1) {
      const t = length > 0 ? Math.min(left / length, 1) : 1;
      return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, yaw: Math.atan2(to.x - from.x, to.z - from.z) };
    }
    left -= length;
  }
  return { ...path[0]!, yaw: 0 };
}

/** Volta pelo caminho mais curto do círculo, sem passar de `maxStep`. */
export function turnToward(current: number, goal: number, maxStep: number): number {
  const difference = Math.atan2(Math.sin(goal - current), Math.cos(goal - current));
  return current + Math.sign(difference) * Math.min(Math.abs(difference), maxStep);
}

/** Onde o quadril assenta: a pose recua o corpo, então a figura compensa. */
export function seatedRoot(seat: OfficeSeat, hipsZ: number, scale = HUMAN_SCALE): Point {
  const back = hipsZ * scale;
  return { x: seat.x - Math.sin(seat.yaw) * back, z: seat.z - Math.cos(seat.yaw) * back };
}
