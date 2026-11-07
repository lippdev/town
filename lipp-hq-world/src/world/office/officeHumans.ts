import type { HumanPreset } from "@/avatar/human/preset";
import { HUMAN_SCALE, SIT, SIT_TIMELINE } from "@/avatar/human/seatFit";
import type { FloorId } from "./officeBuilding";
import { FACING, OFFICE_ROOMS_BY_ID, OFFICE_SEATS, type OfficeSeat } from "./officeLayout";

/**
 * Gente no escritório, separada dos bots de propósito: pessoa não vem do Hermes, não tem
 * sessão nem estado, e só existe na demonstração. Este arquivo não importa three.
 */

export type HumanPhase = "standing" | "toChair" | "sitting" | "seated" | "rising" | "toSpot" | "errand";
export type HumanGoal = "standing" | "seated";

export const HUMAN_PHASE_LABEL: Record<HumanPhase, string> = {
  standing: "Em pé",
  toChair: "Indo até a cadeira",
  sitting: "Sentando",
  seated: "Sentada",
  rising: "Levantando",
  toSpot: "Voltando",
  errand: "Andando",
};

export { HUMAN_SCALE };

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
  /** Onde a pessoa fica: só existe corpo com esse andar em tela. */
  floor: FloorId;
  roomId: string;
  spot: Point;
  /** Cadeira livre da bancada do hall; nula se os bots ocuparam todas. */
  chair: OfficeSeat | null;
  /** Caminho até a cadeira, quando ela não é a da bancada do hall. */
  route?: readonly Point[];
  /** Só muda o instante da piscada, para não piscarem todos juntos. */
  phase: number;
  /**
   * E-mail de quem é do squad de um cenário: o corpo, a etiqueta e a gaveta são do cenário, e a
   * pessoa não entra em Pessoas.
   */
  squad?: string;
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
    floor: "operacao" as const,
    roomId: "hall",
    spot: { x: hall.x + SPOTS[index]!.x, z: hall.z + SPOTS[index]!.z },
    chair: chairs[index] ?? null,
    phase: (hash(preset.id) % 100) / 25,
  }));
  return { placed, waiting: presets.slice(HUMAN_CAPACITY) };
}

/**
 * Atrás da fileira de cadeiras: a pessoa é mais larga que o vão entre duas delas e nunca passa
 * por ali. Por esta faixa, ela cruza as costas das vizinhas sem encostar.
 */
const LANE = 0.8;
/** A que distância do eixo da cadeira ela sai da faixa e vem até o lugar de sentar. */
const LANE_EXIT = 0.3;

const forwardOf = (yaw: number): Point => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

/** Onde a pessoa fica em pé, de costas para a cadeira já virada para ela. */
export function standPoint(seat: OfficeSeat): Point {
  const back = forwardOf(seat.yaw);
  const distance = SIT.swivelClear + SIT.standOff;
  return { x: seat.x - back.x * distance, z: seat.z - back.z * distance };
}

/**
 * O caminho do lugar até a frente da cadeira, pelo lado de trás da fileira. Cadeira virada
 * para o sul fica atrás da bancada, e o caminho contorna a ponta dela.
 */
export function chairRoute(spot: Point, seat: OfficeSeat): Point[] {
  const hall = OFFICE_ROOMS_BY_ID.hall!.center;
  const local = (x: number, z: number) => ({ x: hall.x + x, z: hall.z + z });
  const stand = standPoint(seat);
  if (seat.yaw === FACING.north) {
    const side = spot.x >= seat.x ? 1 : -1;
    return [spot, { x: seat.x + side * LANE_EXIT, z: seat.z + LANE }, stand];
  }
  const lane = seat.z - LANE;
  return [spot, local(0.3, 0.95), local(0.3, lane - hall.z), { x: seat.x - LANE_EXIT, z: lane }, stand];
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

/** Onde a cadeira está e para onde o assento olha. */
export interface ChairPose extends Point {
  yaw: number;
}

export function chairAtHome(seat: OfficeSeat): ChairPose {
  return { x: seat.x, z: seat.z, yaw: seat.yaw };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** A cadeira se prepara: recua da mesa e dá meia-volta. `amount` vai de 0 a 1. */
export function chairReady(seat: OfficeSeat, amount: number): ChairPose {
  const k = smooth(clamp01(amount));
  const forward = forwardOf(seat.yaw);
  return { x: seat.x - forward.x * SIT.swivelClear * k, z: seat.z - forward.z * SIT.swivelClear * k, yaw: seat.yaw + Math.PI * k };
}

/**
 * A que distância do lugar de sentar a cadeira começa e termina de se preparar. Quando termina,
 * a pessoa ainda está fora do alcance do encosto, que gira a até 45 cm do eixo.
 */
export const CHAIR_READY_FROM = 1.67;
const CHAIR_READY_TO = 0.62;

/** Quanto a cadeira já se preparou com a pessoa a `remaining` metros do lugar de sentar. */
export function chairReadiness(remaining: number): number {
  return clamp01((CHAIR_READY_FROM - remaining) / (CHAIR_READY_FROM - CHAIR_READY_TO));
}

export interface SeatMoment {
  chair: ChairPose;
  /** Onde estão os pés da figura, que é a origem dela. */
  root: Point;
  yaw: number;
  /** Quanto a bacia já recuou dos pés, em metros. */
  hipsBack: number;
}

/**
 * Cadeira e pessoa num instante do clipe de sentar. Quem chama anda o tempo: levantar é o mesmo
 * caminho, de trás para a frente. Primeiro ela sobe com a cadeira parada; depois o assento gira
 * com ela em cima, com os pés no apoio da própria cadeira; por fim, a cadeira rola até a mesa.
 */
export function seatMoment(seat: OfficeSeat, time: number): SeatMoment {
  const { climbEnd, swivelEnd, tuckEnd } = SIT_TIMELINE;
  const forward = forwardOf(seat.yaw);
  const ready = chairReady(seat, 1);
  const spin = smooth(clamp01((time - climbEnd) / (swivelEnd - climbEnd)));
  const roll = smooth(clamp01((time - swivelEnd) / (tuckEnd - swivelEnd)));
  const distance = -SIT.swivelClear + (SIT.swivelClear + SIT.tuck) * roll;
  const chair: ChairPose = { x: seat.x + forward.x * distance, z: seat.z + forward.z * distance, yaw: ready.yaw + Math.PI * spin };
  const facing = forwardOf(chair.yaw);
  const root = { x: chair.x + facing.x * SIT.standOff, z: chair.z + facing.z * SIT.standOff };
  return { chair, root, yaw: chair.yaw, hipsBack: (SIT.standOff - SIT.hipsZ) * smooth(clamp01(time / climbEnd)) };
}
