import type { Instant } from "./types";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Brasília não tem horário de verão desde 2019: o deslocamento é fixo. */
const BRASILIA = -3 * HOUR;

/** O dia simulado: terça, 10 de novembro de 2026, das 9h às 18h em Brasília. */
export const SIM_DAY = { year: 2026, month: 11, day: 10 } as const;
export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 18;

/** Um instante do dia simulado; `days` volta (negativo) ou avança dias. */
export function at(hour: number, minute = 0, days = 0): Instant {
  return Date.UTC(SIM_DAY.year, SIM_DAY.month - 1, SIM_DAY.day + days, hour, minute) - BRASILIA;
}

export const DAY_START = at(WORK_START_HOUR);
export const DAY_END = at(WORK_END_HOUR);

const local = (instant: Instant) => new Date(instant + BRASILIA);
const pad = (value: number) => String(value).padStart(2, "0");

/** "09:30", no horário de Brasília. */
export function clockLabel(instant: Instant): string {
  const date = local(instant);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "ter 09:30" quando não é hoje; só a hora quando é. */
export function whenLabel(instant: Instant, today: Instant = DAY_START): string {
  const date = local(instant);
  const sameDay = Math.floor((instant + BRASILIA) / DAY) === Math.floor((today + BRASILIA) / DAY);
  return sameDay ? clockLabel(instant) : `${WEEKDAY[date.getUTCDay()]} ${clockLabel(instant)}`;
}

/** "hoje às 9h30", "ontem às 17h", "sex às 16h10": desde quando, como se diz numa mensagem. */
export function sinceLabel(instant: Instant, now: Instant): string {
  const date = local(instant);
  const days = Math.floor((now + BRASILIA) / DAY) - Math.floor((instant + BRASILIA) / DAY);
  const minutes = date.getUTCMinutes();
  const hour = `${date.getUTCHours()}h${minutes ? pad(minutes) : ""}`;
  const day = days <= 0 ? "hoje" : days === 1 ? "ontem" : WEEKDAY[date.getUTCDay()];
  return `${day} às ${hour}`;
}

/** "há 12 min", "há 3 h", "há 4 dias". */
export function ageLabel(milliseconds: number): string {
  const minutes = Math.max(0, Math.round(milliseconds / MINUTE));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/** Duração sem o "há": "40 min", "2 h", "3 dias". */
export function spanLabel(milliseconds: number): string {
  return ageLabel(milliseconds).replace(/^há /, "");
}
