import { newPreset, type HumanPreset } from "@/avatar/human/preset";
import { CHIEF_SEAT, CHIEF_SPOT } from "./officeDirectorate";
import { placeHumans, standPoint, type HumanPlacement, type OfficeHuman } from "./officeHumans";
import { ENTRANCE } from "./officeLayout";

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

/**
 * O chefe fica na sala dele, na Diretoria; quem foi salvo no editor segue no hall, na ordem de
 * sempre, e nenhum preset com o id dele vira um segundo chefe.
 */
export function placeChief(): OfficeHuman {
  return {
    id: CHIEF_ID,
    name: CHIEF_PRESET.name,
    preset: CHIEF_PRESET,
    floor: "diretoria",
    roomId: CHIEF_SEAT.roomId,
    spot: CHIEF_SPOT,
    chair: CHIEF_SEAT,
    route: [CHIEF_SPOT, { x: CHIEF_SEAT.x + 0.3, z: standPoint(CHIEF_SEAT).z }, standPoint(CHIEF_SEAT)],
    phase: 0.4,
  };
}

export function placeEveryone(saved: readonly HumanPreset[], occupiedSeats: Iterable<string> = []): HumanPlacement {
  const { placed, waiting } = placeHumans(saved.filter((preset) => preset.id !== CHIEF_ID), occupiedSeats);
  return { placed: [placeChief(), ...placed], waiting };
}

export type ChiefStatus = "chegando" | "entrando" | "mesa" | "reuniao" | "levantando" | "ronda" | "voltando";
export type ChiefRequest = "chegada" | "reuniao" | "ronda";

export const CHIEF_STATUS_LABEL: Record<ChiefStatus, string> = {
  chegando: "Chegando de carro",
  entrando: "Subindo para a Diretoria",
  mesa: "Na mesa",
  reuniao: "Em reunião",
  levantando: "Levantando",
  ronda: "Andando pela Diretoria",
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

/** Quanto dura "subindo": não há trajeto de elevador desenhado, só o tempo até a mesa. */
export const CLIMB_SECONDS = 2.5;
