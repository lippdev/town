import { useEffect, useState } from "react";
import { clockMinutes } from "./officeActivity";

/**
 * Relógio da atividade simulada: anda sozinho, a um minuto do dia a cada dois segundos, e o QA o
 * pausa e o pula. Fica fora do zustand de propósito: os robôs leem a cada quadro, sem re-render.
 */
export const SECONDS_PER_MINUTE = 2;

const state = { base: 9 * 60, anchor: 0, paused: false };
const now = () => performance.now() / 1000;

export function clockNow(): number {
  return state.paused ? state.base : state.base + (now() - state.anchor) / SECONDS_PER_MINUTE;
}

export function setClock(minute: number, paused = state.paused) {
  state.base = minute;
  state.anchor = now();
  state.paused = paused;
}

/** Os minutos do relógio, inteiros, para a interface: muda no máximo uma vez por segundo. Desligado, nem lê. */
export function useClockMinute(enabled = true): number {
  const [minute, setMinute] = useState(() => Math.floor(clockNow()));
  useEffect(() => {
    if (!enabled) return;
    setMinute(Math.floor(clockNow()));
    const timer = window.setInterval(() => setMinute(Math.floor(clockNow())), 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return minute;
}

declare global {
  interface Window {
    __HQ_ALYX_QA__?: {
      pause: () => void;
      resume: () => void;
      jumpToClock: (text: string) => void;
      clock: () => number;
    };
  }
}

/** Começa na hora dada (a de `?hora=` ou a de Brasília) e expõe o gancho do QA. */
export function startClock(minute: number) {
  setClock(minute, false);
  window.__HQ_ALYX_QA__ = {
    pause: () => setClock(clockNow(), true),
    resume: () => setClock(clockNow(), false),
    jumpToClock: (text) => setClock(clockMinutes(text)),
    clock: clockNow,
  };
}
