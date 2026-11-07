/**
 * Trabalho que a primeira tela não precisa, um passo por vez e só com o navegador folgado. A vista
 * inicial é o prédio fechado: nada de andar, móvel ou personagem aparece nela até alguém entrar.
 */
type Step = () => unknown;

interface IdleHost {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (handle: number) => void;
}

/** O Safari não tem `requestIdleCallback`: lá cada passo espera um pouco no relógio. */
const IDLE_TIMEOUT_MS = 1500;
const FALLBACK_DELAY_MS = 120;

/** Roda os passos em ordem, um por folga, esperando cada promessa. Devolve como cancelar. */
export function idleSequence(steps: readonly Step[], host: IdleHost = window as unknown as IdleHost): () => void {
  let cancelled = false;
  let index = 0;
  let cancelWait = () => undefined as void;
  const wait = (next: () => void) => {
    if (host.requestIdleCallback) {
      const handle = host.requestIdleCallback(next, { timeout: IDLE_TIMEOUT_MS });
      cancelWait = () => host.cancelIdleCallback?.(handle);
    } else {
      const handle = host.setTimeout(next, FALLBACK_DELAY_MS);
      cancelWait = () => host.clearTimeout(handle);
    }
  };
  const run = () => {
    if (cancelled || index >= steps.length) return;
    const step = steps[index]!;
    index += 1;
    // Um passo que falha só deixa aquele arquivo para quando alguém precisar dele de verdade.
    Promise.resolve()
      .then(step)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) wait(run);
      });
  };
  wait(run);
  return () => {
    cancelled = true;
    cancelWait();
  };
}
