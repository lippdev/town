import { newPreset, type HumanPreset } from "@/avatar/human/preset";
import { ENTRANCE, OFFICE_ROOMS_BY_ID } from "./officeLayout";
import type { Point } from "./officeHumans";

export const CHIEF_ID = "chefe";

/**
 * O chefe da equipe: sempre presente na demonstração, sem precisar ser criado no editor.
 * Não vem do Hermes. O roteiro dele é desenho, com uma agenda de exemplo: ainda não lê Outlook.
 */
export const CHIEF_PRESET: HumanPreset = (() => {
  const base = newPreset(CHIEF_ID, "Chefe", "2026-11-04T00:00:00.000Z");
  return {
    ...base,
    parts: { ...base.parts, hair: "Hair.002", facialHair: "FacialHair.002", eyebrow: "EyeBrow.005" },
    colors: { ...base.colors, hair: "#17120f", eyebrow: "#17120f", facialHair: "#17120f", top: "#23262c", bottom: "#2f4256", shoes: "#23262c" },
  };
})();

/** O chefe vem primeiro, com o melhor lugar. Quem foi salvo no editor segue a ordem de sempre. */
export const withChief = (saved: readonly HumanPreset[]): HumanPreset[] => [CHIEF_PRESET, ...saved.filter((preset) => preset.id !== CHIEF_ID)];

export type ChiefStatus = "chegando" | "entrando" | "mesa" | "reuniao" | "levantando" | "ronda" | "voltando";
export type ChiefRequest = "chegada" | "reuniao" | "ronda";

export const CHIEF_STATUS_LABEL: Record<ChiefStatus, string> = {
  chegando: "Chegando de carro",
  entrando: "Entrando no escritório",
  mesa: "Na mesa",
  reuniao: "Em reunião",
  levantando: "Levantando",
  ronda: "Fazendo a ronda",
  voltando: "Voltando para a mesa",
};

/** Agenda de exemplo, para ver como ficaria. Vira a leitura do Outlook quando houver integração. */
export const SAMPLE_AGENDA = [
  { time: "09:00", title: "Daily da equipe", calendar: "Trabalho" },
  { time: "11:30", title: "Revisão de propostas", calendar: "Clientes" },
  { time: "14:00", title: "1:1 de produto", calendar: "Trabalho" },
  { time: "17:00", title: "Médico", calendar: "Pessoal" },
] as const;

export const WORK_SECONDS = 14;
export const MEETING_SECONDS = 18;
export const PATROL_PAUSE = 1.6;

export const ARRIVAL = {
  startX: -32,
  stopX: ENTRANCE.x - 1,
  speed: 7,
  doorSeconds: 0.7,
  door: { x: ENTRANCE.x, z: 11.3 },
} as const;

/** Onde o carro está e se já parou: freia nos últimos metros. */
export function carTravel(seconds: number): { x: number; done: boolean } {
  const total = ARRIVAL.stopX - ARRIVAL.startX;
  const cruise = (total - ARRIVAL.speed) / ARRIVAL.speed;
  if (seconds <= cruise) return { x: ARRIVAL.startX + ARRIVAL.speed * seconds, done: false };
  const braking = Math.min((seconds - cruise) / 2, 1);
  const eased = 1 - (1 - braking) * (1 - braking);
  return { x: ARRIVAL.stopX - ARRIVAL.speed * (1 - eased), done: braking >= 1 };
}

const hall = OFFICE_ROOMS_BY_ID.hall!.center;
const local = (x: number, z: number): Point => ({ x: hall.x + x, z: hall.z + z });
const NORTH_CORRIDOR = OFFICE_ROOMS_BY_ID.comando!.bounds.maxZ + 0.75;
const WEST_CORRIDOR = ENTRANCE.x;
const EAST_CORRIDOR = OFFICE_ROOMS_BY_ID.hall!.bounds.maxX + 0.75;

/** Da porta do carro até o lugar dele no hall: entrada, corredor e porta oeste, sem cruzar móvel. */
export function arrivalPath(spot: Point): Point[] {
  return [ARRIVAL.door, { x: WEST_CORRIDOR, z: 8.8 }, { x: WEST_CORRIDOR, z: hall.z }, local(-3, 0), local(-1, 0.2), local(0.3, 0.45), spot];
}

/**
 * A ronda: sai do hall, olha as salas pelos corredores e volta. Só visual. Cada trecho termina
 * numa parada, e o último, no lugar dele.
 */
export function patrolLegs(spot: Point): Point[][] {
  const westDoor = { x: WEST_CORRIDOR, z: hall.z };
  const north = { x: hall.x, z: NORTH_CORRIDOR };
  const eastDoor = { x: EAST_CORRIDOR, z: hall.z + 1.2 };
  return [
    [spot, local(0.3, 0.45), local(-1, 0.2), local(-3, 0), westDoor],
    [westDoor, { x: WEST_CORRIDOR, z: NORTH_CORRIDOR }, north],
    [north, { x: EAST_CORRIDOR, z: NORTH_CORRIDOR }, eastDoor],
    [eastDoor, local(3, 1.2), spot],
  ];
}
