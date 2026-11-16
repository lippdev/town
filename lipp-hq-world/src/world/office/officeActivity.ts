import type { OfficeScenario, ScenarioMeeting, ScenarioTask } from "./officeScenario";

/**
 * O dia simulado dos bots de um cenário. Não lê relógio nem sorteia: dado o minuto e a semente,
 * o estado é sempre o mesmo. Nada daqui vem de atividade real; é o desenho da demonstração.
 */

export type BotState = "trabalhando" | "reuniao" | "aprovacao" | "ocioso";

export const BOT_STATE_LABEL: Record<BotState, string> = {
  trabalhando: "Trabalhando",
  reuniao: "Em reunião",
  aprovacao: "Esperando aprovação",
  ocioso: "Ocioso",
};

export const WORKDAY = { start: 8 * 60, end: 18 * 60 } as const;
const LUNCH = { start: 12 * 60, end: 13 * 60 } as const;
/** Cada meia hora fora de reunião ganha um estado da semente. */
export const SLOT_MINUTES = 30;

export interface BotActivity {
  state: BotState;
  /** O que ele faz agora: a reunião, a tarefa ou o motivo de estar parado. */
  detail: string;
  /** Cartão do quadro ligado ao estado, quando há. */
  taskId?: string;
}

/** "09:30" em minutos do dia. */
export function clockMinutes(text: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) throw new Error(`Hora fora do formato HH:MM: ${text}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function clockText(minutes: number): string {
  const at = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
}

/** Hash inteiro de 32 bits (FNV-1a com a finalização do murmur3): mesma entrada, mesmo número. */
function hash(seed: number, text: string): number {
  let value = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619) >>> 0;
  // Finalização do murmur3: sem ela, nomes parecidos caem em fatias parecidas.
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
}

export interface MeetingWindow extends ScenarioMeeting {
  from: number;
  to: number;
}

/** As reuniões de que o bot participa, em minutos do dia: as da equipe dele. */
export function meetingsOf(scenario: OfficeScenario, botId: string): MeetingWindow[] {
  const team = scenario.teams.find((candidate) => candidate.id === scenario.bots.find((bot) => bot.id === botId)?.team);
  return (team?.meetings ?? []).map((meeting) => ({ ...meeting, from: clockMinutes(meeting.start), to: clockMinutes(meeting.end) }));
}

const tasksOf = (scenario: OfficeScenario, botId: string, column: ScenarioTask["column"]) =>
  scenario.activity.tasks.filter((task) => task.owner === botId && task.column === column);

export function activityAt(scenario: OfficeScenario, botId: string, minute: number, seed = scenario.activity.seed): BotActivity {
  const at = ((minute % 1440) + 1440) % 1440;
  const meetings = meetingsOf(scenario, botId);
  const meeting = meetings.find((window) => at >= window.from && at < window.to);
  if (meeting) return { state: "reuniao", detail: meeting.title };
  if (at < WORKDAY.start || at >= WORKDAY.end) return { state: "ocioso", detail: "Fora do expediente da demonstração" };
  if (at >= LUNCH.start && at < LUNCH.end) return { state: "ocioso", detail: "Pausa do meio-dia" };
  const slot = Math.floor(at / SLOT_MINUTES);
  const roll = hash(seed, `${botId}:${slot}`) % 100;
  const doing = tasksOf(scenario, botId, "fazendo");
  const review = tasksOf(scenario, botId, "revisao");
  // Esperar aprovação só faz sentido com cartão em revisão; sem ele, a fatia vira trabalho. Quem
  // sai de reunião da equipe passa a meia hora seguinte esperando o que foi combinado ali.
  const afterMeeting = meetings.some((window) => at >= window.to && at < window.to + SLOT_MINUTES);
  if ((afterMeeting || roll < 15) && review.length > 0) {
    const task = review[hash(seed, `${botId}:${slot}:r`) % review.length]!;
    return { state: "aprovacao", detail: task.title, taskId: task.id };
  }
  if (roll >= 85) return { state: "ocioso", detail: "Sem tarefa nesta meia hora" };
  const pool = doing.length > 0 ? doing : review;
  if (pool.length === 0) return { state: "trabalhando", detail: "Rotina da equipe" };
  const task = pool[hash(seed, `${botId}:${slot}:t`) % pool.length]!;
  return { state: "trabalhando", detail: task.title, taskId: task.id };
}

function ease(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Metros andados do posto até o lugar da reunião, neste minuto. Sai na hora da reunião, chega em
 * `leg` minutos e volta quando ela acaba: a posição sai do relógio, então pausar e pular funcionam.
 */
export function meetingDistanceAt(windows: readonly Pick<MeetingWindow, "from" | "to">[], minute: number, leg: number, length: number): number {
  const at = ((minute % 1440) + 1440) % 1440;
  for (const { from, to } of windows) {
    if (at < from || at >= to + leg) continue;
    if (at < from + leg) return length * ease((at - from) / leg);
    if (at < to) return length;
    return length * ease(1 - (at - to) / leg);
  }
  return 0;
}
