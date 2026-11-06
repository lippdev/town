import { Color } from "three";

/**
 * Dia e noite seguindo o relógio de Brasília: escuro das 18h às 5h, claro das 6h às 17h, com uma
 * hora de transição em cada ponta. `?hora=HH:MM` fixa a hora, para conferir qualquer momento.
 */
export const TIME_ZONE = "America/Sao_Paulo";
export const DUSK_START = 17 * 60;
export const NIGHT_START = 18 * 60;
export const DAWN_START = 5 * 60;
export const DAY_START = 6 * 60;
/** De quanto em quanto tempo a cena relê o relógio. */
export const CLOCK_POLL_MS = 30_000;
export const NIGHT_BACKGROUND = "#111828";
/** Cor do ar à noite: é para onde vai a cidade ao longe. */
export const NIGHT_AIR = "#151c28";

const clockFormat = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Minutos desde a meia-noite em Brasília. */
export function brasiliaMinutes(date: Date): number {
  let hour = 0;
  let minute = 0;
  for (const part of clockFormat.formatToParts(date)) {
    if (part.type === "hour") hour = Number(part.value);
    if (part.type === "minute") minute = Number(part.value);
  }
  return (hour % 24) * 60 + minute;
}

/** Quanto de luz do dia há: 1 em pleno dia, 0 à noite, entre os dois nas transições. */
export function daylightAt(minutes: number): number {
  const at = ((minutes % 1440) + 1440) % 1440;
  if (at >= DAY_START && at < DUSK_START) return 1;
  if (at >= NIGHT_START || at < DAWN_START) return 0;
  if (at < DAY_START) return (at - DAWN_START) / (DAY_START - DAWN_START);
  return 1 - (at - DUSK_START) / (NIGHT_START - DUSK_START);
}

export type DayPhase = "dia" | "entardecer" | "noite" | "amanhecer";

export function dayPhase(minutes: number): DayPhase {
  const at = ((minutes % 1440) + 1440) % 1440;
  if (at >= DAY_START && at < DUSK_START) return "dia";
  if (at >= NIGHT_START || at < DAWN_START) return "noite";
  return at < DAY_START ? "amanhecer" : "entardecer";
}

/** `?hora=HH:MM` em minutos, ou null se não houver ou não fizer sentido. */
export function parseHourOverride(search: string): number | null {
  const raw = new URLSearchParams(search).get("hora");
  if (!raw) return null;
  const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(raw.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Minutos a usar agora: a hora fixada pela URL ou o relógio de Brasília. */
export function currentMinutes(search: string, now = new Date()): number {
  return parseHourOverride(search) ?? brasiliaMinutes(now);
}

export interface SkyLook {
  background: string;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  sun: number;
  sunColor: string;
  fill: number;
  fillColor: string;
  environment: number;
  /** Força das janelas acesas da fachada: de dia quase apagadas. */
  litWindows: number;
  /** Exposição do mapeamento de tons: o dia é mais claro no todo, sem mexer em cada cor. */
  exposure: number;
  /** Cor da névoa da cidade: a mesma cidade se dissolve no ar daquela hora. */
  air: string;
}

/** A noite é exatamente a cena de antes; o dia é o mesmo escritório com céu claro e sol alto. */
const NIGHT: SkyLook = { background: NIGHT_BACKGROUND, hemiSky: "#cad9f5", hemiGround: "#5a4131", hemi: 0.55, sun: 3.3, sunColor: "#ffd5a0", fill: 0.8, fillColor: "#bccff2", environment: 0.45, litWindows: 1, exposure: 1, air: NIGHT_AIR };
const DAY: SkyLook = { background: "#9ec4ec", hemiSky: "#eef4ff", hemiGround: "#9a8266", hemi: 1.35, sun: 4.6, sunColor: "#fff4e0", fill: 1.1, fillColor: "#e2ecfb", environment: 0.7, litWindows: 0.12, exposure: 1.45, air: "#8fa8c4" };
/** O entardecer passa por um céu alaranjado em vez de só misturar azul com azul-escuro. */
const DUSK_TINT = new Color("#d98a5a");
/** Ao longe o entardecer é mais apagado que o céu: é ar, não sol. */
const DUSK_AIR = new Color("#a8705a");

const mixHex = (a: string, b: string, t: number) => "#" + new Color(a).lerp(new Color(b), t).getHexString();
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Aparência do céu e das luzes para um nível de luz do dia. */
export function skyFor(daylight: number): SkyLook {
  const t = Math.min(1, Math.max(0, daylight));
  const background = new Color(NIGHT.background).lerp(new Color(DAY.background), t);
  // O tom quente aparece no meio da transição e some nas pontas.
  background.lerp(DUSK_TINT, 0.55 * Math.sin(Math.PI * t) ** 2);
  const air = new Color(NIGHT.air).lerp(new Color(DAY.air), t).lerp(DUSK_AIR, 0.6 * Math.sin(Math.PI * t) ** 2);
  return {
    background: "#" + background.getHexString(),
    hemiSky: mixHex(NIGHT.hemiSky, DAY.hemiSky, t),
    hemiGround: mixHex(NIGHT.hemiGround, DAY.hemiGround, t),
    hemi: mix(NIGHT.hemi, DAY.hemi, t),
    sun: mix(NIGHT.sun, DAY.sun, t),
    sunColor: mixHex(NIGHT.sunColor, DAY.sunColor, t),
    fill: mix(NIGHT.fill, DAY.fill, t),
    fillColor: mixHex(NIGHT.fillColor, DAY.fillColor, t),
    environment: mix(NIGHT.environment, DAY.environment, t),
    litWindows: mix(NIGHT.litWindows, DAY.litWindows, t),
    exposure: mix(NIGHT.exposure, DAY.exposure, t),
    air: "#" + air.getHexString(),
  };
}
