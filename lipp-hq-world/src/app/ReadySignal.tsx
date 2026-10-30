import { useEffect } from "react";

declare global {
  interface Window {
    /** Marcado quando a cena WebGL renderizou o primeiro frame. */
    __HQ_WORLD_READY__?: boolean;
  }
}

/**
 * Sinaliza para as ferramentas de QA visual que a cena já desenhou pelo menos
 * um frame. Sem isso, um screenshot pode capturar um canvas vazio.
 */
export function ReadySignal() {
  useEffect(() => {
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      if (frame >= 3) {
        window.__HQ_WORLD_READY__ = true;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return null;
}
