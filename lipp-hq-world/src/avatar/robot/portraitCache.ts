import type { RobotPortrait } from "./robotPortraits";

/**
 * Retratos prontos guardados no navegador. Desenhar os sete custa meio segundo de WebGL e leitura
 * de pixels logo na abertura, e o resultado só muda se a aparência do robô ou este código mudar.
 * Troque a versão ao mudar como o retrato é desenhado.
 */
const PORTRAIT_CACHE_VERSION = 1;
const KEY_PREFIX = "lipp-hq.retrato.";

type PortraitStorage = Pick<Storage, "getItem" | "setItem">;

const keyOf = (id: string, look: unknown) => `${KEY_PREFIX}v${PORTRAIT_CACHE_VERSION}.${id}.${JSON.stringify(look)}`;

export function readPortrait(storage: PortraitStorage | null, id: string, look: unknown): RobotPortrait | null {
  try {
    const raw = storage?.getItem(keyOf(id, look));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RobotPortrait>;
    return typeof parsed.still === "string" && typeof parsed.sheet === "string" ? { still: parsed.still, sheet: parsed.sheet } : null;
  } catch {
    return null;
  }
}

export function savePortrait(storage: PortraitStorage | null, id: string, look: unknown, portrait: RobotPortrait) {
  try {
    storage?.setItem(keyOf(id, look), JSON.stringify(portrait));
  } catch {
    // Sem espaço ou sem armazenamento: o retrato só é desenhado de novo na próxima abertura.
  }
}

export function portraitStorage(): PortraitStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
