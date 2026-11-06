/**
 * Quando o carregamento do escritório está travado de verdade.
 *
 * A regra antiga era um cronômetro fixo de 20 s: em máquina lenta (render por
 * software) a cena terminava de montar depois disso e o aviso "está demorando"
 * aparecia antes do prédio, como se tivesse falhado. Aqui o critério é o
 * progresso dos arquivos — sem download e sem arquivo novo por um tempo, travou.
 */

/** Sem download em andamento e sem arquivo novo por este tempo: travou. */
export const IDLE_STALL_MS = 12_000;
/** Teto duro: nem baixando devagar a tela de carregamento pode ser eterna. */
export const HARD_STALL_MS = 90_000;

export interface LoadPulse {
  /** Há download em andamento (`useProgress().active`). */
  active: boolean;
  /** Tempo desde o último arquivo novo. */
  idleMs: number;
  /** Tempo total desde o começo do carregamento. */
  elapsedMs: number;
}

export function shouldStall(pulse: LoadPulse): boolean {
  if (pulse.elapsedMs > HARD_STALL_MS) return true;
  return !pulse.active && pulse.idleMs > IDLE_STALL_MS;
}
