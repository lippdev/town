import type { BotSnapshot } from "@/integrations/hq/types";

/**
 * Histórico curto da frota, em memória, para a sparkline do resumo.
 *
 * Só entra aqui o que a leitura do Hermes reportou: cada amostra é um retrato
 * real (quantos trabalhando, aguardando, em briefing e ociosos). Sem leitura,
 * sem amostra — a linha não é inventada nem interpolada.
 */

export interface FleetSample {
  at: number;
  working: number;
  waiting: number;
  briefing: number;
  idle: number;
}

/** Quantas amostras guardar (~4 min de polling de 4 s). */
export const HISTORY_LIMIT = 60;

/** Menos que isto não desenha linha: um ponto não é tendência. */
export const MIN_SAMPLES_TO_DRAW = 3;

export function sampleFromBots(bots: BotSnapshot[], at: number): FleetSample {
  return {
    at,
    working: bots.filter((bot) => bot.state === "working").length,
    waiting: bots.filter((bot) => bot.state === "waiting").length,
    briefing: bots.filter((bot) => Boolean(bot.briefing) || bot.state === "meeting").length,
    idle: bots.filter((bot) => bot.state === "idle").length,
  };
}

export function pushSample(history: FleetSample[], sample: FleetSample): FleetSample[] {
  const next = [...history, sample];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

/** Pontos de um caminho SVG para uma série, normalizados na altura dada. */
export function sparklinePath(
  samples: FleetSample[],
  pick: (sample: FleetSample) => number,
  width: number,
  height: number,
): string {
  if (samples.length < MIN_SAMPLES_TO_DRAW) return "";
  const values = samples.map(pick);
  const max = Math.max(1, ...values);
  const step = width / (values.length - 1);
  return values
    .map((value, index) => {
      const x = Number((index * step).toFixed(2));
      const y = Number((height - (value / max) * height).toFixed(2));
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

/** Variação no período, para o texto ("+2 desde o início da janela"). */
export function trend(samples: FleetSample[], pick: (sample: FleetSample) => number): number {
  if (samples.length < 2) return 0;
  return pick(samples[samples.length - 1]) - pick(samples[0]);
}
