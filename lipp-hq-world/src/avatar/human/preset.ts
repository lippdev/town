import { CATEGORIES, CATEGORIES_BY_ID, CATEGORY_IDS, ITEMS_BY_ID, itemFile, type CategoryId } from "./catalog";

export const EXPRESSIONS = ["neutral", "smile", "sad"] as const;
export type Expression = (typeof EXPRESSIONS)[number];
export const EXPRESSION_LABEL: Record<Expression, string> = { neutral: "Neutra", smile: "Sorrindo", sad: "Triste" };

/** O que o editor salva. Só ids e cores: nada de geometria nem de estado da cena. */
export interface HumanPreset {
  id: string;
  name: string;
  parts: Record<CategoryId, string | null>;
  colors: Record<CategoryId, string>;
  expression: Expression;
  updatedAt: string;
}

export const NAME_MAX = 32;
const HEX = /^#[0-9a-f]{6}$/;

const DEFAULT_PARTS: Record<CategoryId, string | null> = {
  head: "Head.001",
  hair: "Hair.002",
  eyes: "Eyes.001",
  eyebrow: "EyeBrow.005",
  nose: "Nose.001",
  face: null,
  facialHair: null,
  glasses: null,
  hat: null,
  bow: null,
  earring: null,
  top: "Top.001",
  bottom: "Bottom.001",
  shoes: "Shoes.003",
  outfit: null,
};

const DEFAULT_COLORS: Record<CategoryId, string> = {
  head: "#eab08c",
  hair: "#3b2417",
  eyes: "#23262c",
  eyebrow: "#3b2417",
  nose: "#eab08c",
  face: "#a83232",
  facialHair: "#3b2417",
  glasses: "#23262c",
  hat: "#2f4256",
  bow: "#a83232",
  earring: "#23262c",
  top: "#2563eb",
  bottom: "#2f4256",
  shoes: "#23262c",
  outfit: "#2f4256",
};

export function newPreset(id: string, name: string, at: string): HumanPreset {
  return { id, name, parts: { ...DEFAULT_PARTS }, colors: { ...DEFAULT_COLORS }, expression: "neutral", updatedAt: at };
}

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Dê um nome à pessoa.";
  if (trimmed.length > NAME_MAX) return `O nome pode ter até ${NAME_MAX} letras.`;
  return null;
}

function validPart(category: CategoryId, value: unknown): value is string {
  return typeof value === "string" && ITEMS_BY_ID[value]?.category === category;
}

/**
 * Lê um preset vindo de fora (armazenamento ou ficha importada). O que estiver inválido
 * volta ao padrão e vira aviso; só devolve nulo quando não dá para saber quem é.
 */
export function parsePreset(value: unknown, where = "preset"): { preset: HumanPreset | null; problems: string[] } {
  const problems: string[] = [];
  const source = (typeof value === "object" && value !== null ? value : {}) as Partial<Record<keyof HumanPreset, unknown>>;
  if (typeof source.id !== "string" || !source.id) return { preset: null, problems: [`${where}: sem id.`] };
  const nameProblem = typeof source.name === "string" ? validateName(source.name) : "Sem nome.";
  if (nameProblem) problems.push(`${where}: ${nameProblem}`);
  const parts = (typeof source.parts === "object" && source.parts !== null ? source.parts : {}) as Record<string, unknown>;
  const colors = (typeof source.colors === "object" && source.colors !== null ? source.colors : {}) as Record<string, unknown>;

  const preset = newPreset(source.id, nameProblem ? "Sem nome" : (source.name as string).trim(), typeof source.updatedAt === "string" ? source.updatedAt : "");
  for (const category of CATEGORY_IDS) {
    const part = parts[category];
    if (validPart(category, part)) preset.parts[category] = part;
    else if (part === null && !CATEGORIES_BY_ID[category].required) preset.parts[category] = null;
    else if (part !== undefined) problems.push(`${where}: peça desconhecida em ${CATEGORIES_BY_ID[category].label}.`);
    const color = colors[category];
    if (typeof color === "string" && HEX.test(color.toLowerCase())) preset.colors[category] = color.toLowerCase();
    else if (color !== undefined) problems.push(`${where}: cor inválida em ${CATEGORIES_BY_ID[category].label}.`);
  }
  if (EXPRESSIONS.includes(source.expression as Expression)) preset.expression = source.expression as Expression;
  return { preset, problems };
}

export interface ResolvedPart {
  category: CategoryId;
  itemId: string;
  file: string;
  /** Cor do `Color_` da peça; nulo quando ela não aceita cor. */
  color: string | null;
}

export interface ResolvedHuman {
  parts: ResolvedPart[];
  skin: string;
  expression: Expression;
  /** Categoria coberta → peça que a cobre. Ela fica guardada, só não é desenhada. */
  locked: Partial<Record<CategoryId, string>>;
}

/** O que realmente vai para a cena. Sempre uma peça por categoria, nunca roupa sobre roupa. */
export function resolveHuman(preset: HumanPreset): ResolvedHuman {
  const locked: Partial<Record<CategoryId, string>> = {};
  for (const category of CATEGORY_IDS) {
    const itemId = preset.parts[category];
    if (!itemId) continue;
    for (const covered of ITEMS_BY_ID[itemId]!.locks) locked[covered] = itemId;
  }
  const parts: ResolvedPart[] = [];
  for (const { id: category } of CATEGORIES) {
    const itemId = preset.parts[category];
    if (!itemId || locked[category]) continue;
    parts.push({ category, itemId, file: itemFile(itemId), color: ITEMS_BY_ID[itemId]!.colorable ? preset.colors[category] : null });
  }
  return { parts, skin: preset.colors.head, expression: preset.expression, locked };
}

/** Trocar peça sem deixar faltar o que é obrigatório. */
export function withPart(preset: HumanPreset, category: CategoryId, itemId: string | null): HumanPreset {
  if (itemId === null && CATEGORIES_BY_ID[category].required) return preset;
  if (itemId !== null && !validPart(category, itemId)) return preset;
  return { ...preset, parts: { ...preset.parts, [category]: itemId } };
}

export function withColor(preset: HumanPreset, category: CategoryId, color: string): HumanPreset {
  const value = color.toLowerCase();
  if (!HEX.test(value)) return preset;
  return { ...preset, colors: { ...preset.colors, [category]: value } };
}

/** Sorteio com semente: o mesmo número dá sempre a mesma pessoa, e o teste consegue conferir. */
export function randomized(preset: HumanPreset, seed: number): HumanPreset {
  let state = seed >>> 0 || 1;
  const next = (limit: number) => {
    state = Math.imul(state ^ (state >>> 15), 2654435761) >>> 0;
    state = (state ^ (state >>> 13)) >>> 0;
    return state % limit;
  };
  const parts = { ...preset.parts };
  const colors = { ...preset.colors };
  for (const category of CATEGORIES) {
    // Fantasia e chapéu cobrem o resto: entram às vezes, para o sorteio não dar só isso.
    const empty = !category.required && next(category.id === "outfit" || category.id === "hat" ? 8 : 3) !== 0;
    parts[category.id] = empty ? null : category.items[next(category.items.length)]!.id;
    if (category.palette.length) colors[category.id] = category.palette[next(category.palette.length)]!;
  }
  return { ...preset, parts, colors };
}
