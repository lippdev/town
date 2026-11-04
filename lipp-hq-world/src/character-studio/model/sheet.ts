import { originOf, parseOrigin, type Variant, type VariantOrigin } from "@/character-studio/model/studio";
import { NOTES_MAX, parseSpec, validateName, type CharacterSpec } from "@/character-studio/model/schema";
import type { CharacterPreset } from "@/character-studio/model/presets";

export const SHEET_KIND = "lipp-hq/ficha-personagem";
export const SHEET_VERSION = 1;
export const SHEET_MAX_BYTES = 64 * 1024;

/** A base real de toda ficha; crédito e proveniência andam junto com o personagem. */
export const BASE_MODEL = {
  id: "pulse",
  file: "/prototipo/pulse.glb",
  sha256: "9312180dcd6e92bd9fc207e74a6eaf1e682a1a71e8089a8a0cb4c8314ba59c1c",
  asset: "Casual Male — Ultimate Animated Character Pack",
  author: "Quaternius",
  license: "CC0 1.0",
  source: "https://quaternius.com/packs/ultimatedanimatedcharacter.html",
  credits: "/prototipo/CREDITOS.md",
  provenance: "/prototipo/proveniencia.json",
} as const;

export interface CharacterSheet {
  kind: typeof SHEET_KIND;
  version: typeof SHEET_VERSION;
  exportedAt: string;
  base: typeof BASE_MODEL;
  character: {
    name: string;
    notes: string;
    origin: VariantOrigin | null;
    spec: CharacterSpec;
  };
}

export function sheetFromVariant(variant: Variant, at: Date): CharacterSheet {
  return wrap({ name: variant.name, notes: variant.notes, origin: variant.origin, spec: variant.spec }, at);
}

export function sheetFromPreset(preset: CharacterPreset, at: Date): CharacterSheet {
  return wrap({ name: preset.name, notes: "", origin: originOf(preset), spec: preset.spec }, at);
}

function wrap(character: CharacterSheet["character"], at: Date): CharacterSheet {
  return { kind: SHEET_KIND, version: SHEET_VERSION, exportedAt: at.toISOString(), base: BASE_MODEL, character };
}

export function sheetFileName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "personagem"}.personagem`;
}

/** O texto que vai para o chat: o pedido em palavras do Filipe e a ficha inteira. */
export function chatRequestText(sheet: CharacterSheet): string {
  const request = sheet.character.notes.trim() || "(escreva aqui o que quer mudar)";
  return [
    `Estúdio de personagens — pedido sobre "${sheet.character.name}":`,
    request,
    "",
    "Ficha atual:",
    "```json",
    JSON.stringify(sheet, null, 2),
    "```",
  ].join("\n");
}

export type ParsedSheet =
  | { ok: true; name: string; notes: string; origin: VariantOrigin | null; spec: CharacterSpec; warnings: string[] }
  | { ok: false; errors: string[] };

const KNOWN_TOP = new Set(["kind", "version", "exportedAt", "base", "character"]);

/** Tira a cerca de código de uma ficha colada do chat. */
function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/.exec(text);
  return (fenced?.[1] ?? text).trim();
}

export function parseSheet(text: string): ParsedSheet {
  if (new Blob([text]).size > SHEET_MAX_BYTES) return { ok: false, errors: ["Arquivo grande demais para uma ficha (limite de 64 KB)."] };
  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch {
    return { ok: false, errors: ["Não é um JSON válido."] };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, errors: ["A ficha deve ser um objeto JSON."] };

  const sheet = raw as Record<string, unknown>;
  if (sheet.kind !== SHEET_KIND) return { ok: false, errors: [`Não é uma ficha de personagem (kind deveria ser "${SHEET_KIND}").`] };
  if (typeof sheet.version !== "number" || !Number.isInteger(sheet.version) || sheet.version < 1) return { ok: false, errors: ["version: esperava um inteiro positivo."] };
  if (sheet.version > SHEET_VERSION) return { ok: false, errors: [`Ficha da versão ${sheet.version}; este estúdio só entende até a ${SHEET_VERSION}.`] };

  const base = sheet.base as { id?: unknown } | null | undefined;
  if (typeof base !== "object" || base === null || base.id !== BASE_MODEL.id) return { ok: false, errors: [`base.id: esta ficha não é do modelo ${BASE_MODEL.id}.`] };

  if (typeof sheet.character !== "object" || sheet.character === null) return { ok: false, errors: ["character: esperava um objeto."] };
  const character = sheet.character as Record<string, unknown>;

  const errors: string[] = [];
  const name = validateName(character.name);
  if (!name) errors.push("character.name: nome obrigatório, até 60 caracteres, sem caracteres de controle.");
  const notes = character.notes === undefined ? "" : character.notes;
  if (typeof notes !== "string" || notes.length > NOTES_MAX) errors.push(`character.notes: texto de até ${NOTES_MAX} caracteres.`);
  const origin = parseOrigin(character.origin, "character.origin", errors);
  const { spec, errors: specErrors } = parseSpec(character.spec, "character.spec");
  errors.push(...specErrors);
  if (errors.length || !spec || !name || typeof notes !== "string") return { ok: false, errors };

  const ignored = Object.keys(sheet).filter((key) => !KNOWN_TOP.has(key));
  const warnings = ignored.length ? [`Campos desconhecidos ignorados: ${ignored.join(", ")}.`] : [];
  return { ok: true, name, notes, origin, spec, warnings };
}
