/**
 * Contrato do estúdio de personagens: só o que o modelo Pulse realmente permite.
 * Não importa three nem React, para a validação rodar também nos testes.
 */

/** Um material nomeado do pulse.glb por chave. Cortes de cabelo e roupas não existem no arquivo. */
export const COLOR_SLOTS = ["skin", "hair", "shirt", "pants", "belt", "face"] as const;
export type ColorSlot = (typeof COLOR_SLOTS)[number];

/** Nome de cada material dentro do GLB. */
export const SLOT_MATERIAL: Record<ColorSlot, string> = {
  skin: "Skin",
  hair: "Hair",
  shirt: "Shirt",
  pants: "Pants",
  belt: "Belt",
  face: "Face",
};

export const SLOT_LABEL: Record<ColorSlot, string> = {
  skin: "Pele",
  hair: "Cabelo",
  shirt: "Camisa",
  // No arquivo o material chama Pants, mas a malha termina acima do joelho.
  pants: "Bermuda",
  belt: "Cinto",
  // O material Face é só isto: não há boca nem nariz separados.
  face: "Olhos e sobrancelhas",
};

export type ProportionKey = "heightM" | "width" | "head";

export interface ProportionRange {
  label: string;
  min: number;
  max: number;
  step: number;
  /** Valor do arquivo original: é para onde o reset do controle volta. */
  base: number;
  hint: string;
  format: (value: number) => string;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * Faixas conferidas no modelo: fora delas a cabeça solta do pescoço ou o tronco
 * deixa de parecer o mesmo personagem. A altura é a da figura em pé, com a cabeça.
 */
export const PROPORTIONS: Record<ProportionKey, ProportionRange> = {
  heightM: {
    label: "Altura",
    min: 1.5,
    max: 2,
    step: 0.01,
    base: 1.76,
    hint: "Da sola ao topo do cabelo, em pé.",
    format: (value) => `${value.toFixed(2).replace(".", ",")} m`,
  },
  width: {
    label: "Largura do corpo",
    min: 0.85,
    max: 1.2,
    step: 0.01,
    base: 1,
    hint: "Tronco e membros; a cabeça não deforma.",
    format: percent,
  },
  head: {
    label: "Tamanho da cabeça",
    min: 0.8,
    max: 1.3,
    step: 0.01,
    base: 1,
    hint: "100% é a cabeça atual do Pulse.",
    format: percent,
  },
};

export const PROPORTION_KEYS = Object.keys(PROPORTIONS) as ProportionKey[];

export interface Accessories {
  glasses: boolean;
}

export const ACCESSORY_LABEL: Record<keyof Accessories, string> = {
  glasses: "Óculos",
};

export interface CharacterSpec {
  colors: Record<ColorSlot, string>;
  proportions: Record<ProportionKey, number>;
  accessories: Accessories;
}

const HEX = /^#[0-9a-f]{6}$/;
export const NAME_MAX = 60;
export const NOTES_MAX = 2000;
const CONTROL_CHARS = /\p{Cc}/u;

/** Aceita #RGB e #RRGGBB, com ou sem cerquilha; devolve sempre #rrggbb minúsculo. */
export function normalizeHex(input: string): string | null {
  const value = input.trim().toLowerCase().replace(/^#?/, "#");
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${[...value.slice(1)].map((digit) => digit + digit).join("")}`;
  }
  return HEX.test(value) ? value : null;
}

export function validateName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim();
  if (!name || name.length > NAME_MAX || CONTROL_CHARS.test(name)) return null;
  return name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Lê uma especificação vinda de fora (ficha, localStorage) e monta um objeto novo
 * só com os campos conhecidos. Valor fora da faixa é erro, não é corrigido em
 * silêncio: quem importou precisa saber que o personagem não é o que a ficha dizia.
 */
export function parseSpec(input: unknown, path = "spec"): { spec: CharacterSpec | null; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(input)) return { spec: null, errors: [`${path}: esperava um objeto`] };

  const colors = {} as Record<ColorSlot, string>;
  const rawColors = isRecord(input.colors) ? input.colors : null;
  if (!rawColors) errors.push(`${path}.colors: esperava um objeto`);
  for (const slot of COLOR_SLOTS) {
    if (!rawColors) break;
    const value = rawColors[slot];
    const hex = typeof value === "string" && HEX.test(value.toLowerCase()) ? value.toLowerCase() : null;
    if (hex) colors[slot] = hex;
    else errors.push(`${path}.colors.${slot}: esperava cor no formato #rrggbb`);
  }

  const proportions = {} as Record<ProportionKey, number>;
  const rawProportions = isRecord(input.proportions) ? input.proportions : null;
  if (!rawProportions) errors.push(`${path}.proportions: esperava um objeto`);
  for (const key of PROPORTION_KEYS) {
    if (!rawProportions) break;
    const value = rawProportions[key];
    const { min, max } = PROPORTIONS[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max) proportions[key] = value;
    else errors.push(`${path}.proportions.${key}: esperava número entre ${min} e ${max}`);
  }

  // Fichas antigas sem acessórios continuam válidas; tipo errado não.
  let glasses = false;
  if (input.accessories !== undefined) {
    if (!isRecord(input.accessories)) errors.push(`${path}.accessories: esperava um objeto`);
    else if (input.accessories.glasses !== undefined && typeof input.accessories.glasses !== "boolean") {
      errors.push(`${path}.accessories.glasses: esperava verdadeiro ou falso`);
    } else glasses = input.accessories.glasses === true;
  }

  if (errors.length) return { spec: null, errors };
  return { spec: { colors, proportions, accessories: { glasses } }, errors };
}

export function cloneSpec(spec: CharacterSpec): CharacterSpec {
  return {
    colors: { ...spec.colors },
    proportions: { ...spec.proportions },
    accessories: { ...spec.accessories },
  };
}

export function sameSpec(a: CharacterSpec, b: CharacterSpec): boolean {
  return specFingerprint(a) === specFingerprint(b);
}

/**
 * Impressão digital do conteúdo (FNV-1a de 32 bits sobre a forma canônica). É ela
 * que denuncia uma revisão do preset na fonte: não depende de alguém lembrar de
 * subir o número de revisão.
 */
export function specFingerprint(spec: CharacterSpec): string {
  const canonical = JSON.stringify([
    COLOR_SLOTS.map((slot) => spec.colors[slot]),
    PROPORTION_KEYS.map((key) => spec.proportions[key]),
    spec.accessories.glasses,
  ]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
