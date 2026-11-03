import type { AgentDefinition } from "@/types/hq";

/**
 * Aparência de personagem em peças editáveis.
 *
 * Um preset é só uma combinação inicial: por cima dele o usuário pode ajustar
 * cada peça por agente (pele, cabelo, acessório, calça, sapato, altura e a
 * camisa, que por padrão continua sendo a cor de identidade do agente).
 */

export type HairStyle = "curto" | "coque" | "raspado" | "longo" | "moicano";
export type Accessory = "nenhum" | "oculos" | "bone" | "fone";

export interface CharacterLook {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  /** Ausente = camisa na cor do agente (identidade preservada por padrão). */
  shirt?: string;
  pants: string;
  shoes: string;
  accessory: Accessory;
  /** Escala do corpo: 1 é a altura padrão. */
  height: number;
}

export interface CharacterPreset extends CharacterLook {
  id: string;
  label: string;
}

/** Ajustes por agente: qualquer peça pode sobrescrever o preset. */
export type CharacterOverride = Partial<CharacterLook> & { presetId?: string | null };

export const SKIN_TONES = ["#f4d3ae", "#f0c8a0", "#e8b98a", "#d9a878", "#a06a44", "#8d5a3b", "#6f4530"] as const;
export const HAIR_COLORS = ["#15181d", "#2c333d", "#5c4632", "#7a4b28", "#b4522e", "#c2924d", "#c9ccd4", "#7a3b22", "#3f6b3a", "#5a3a5e"] as const;
export const PANTS_COLORS = ["#2f3742", "#1f2733", "#3d2f4f", "#2f4237", "#4a3a55", "#24344d", "#3a3f47", "#54324a"] as const;
export const SHOE_COLORS = ["#1e242e", "#11151c", "#241c2e", "#1c2620", "#3a2a1e"] as const;
export const SHIRT_COLORS = ["#2563eb", "#f97316", "#3b82f6", "#a855f7", "#22c55e", "#f59e0b", "#ec4899", "#0ea5e9", "#14b8a6", "#eab308"] as const;
export const HAIR_STYLES: Array<{ id: HairStyle; label: string }> = [
  { id: "curto", label: "Curto" },
  { id: "coque", label: "Coque" },
  { id: "longo", label: "Longo" },
  { id: "raspado", label: "Raspado" },
  { id: "moicano", label: "Moicano" },
];
export const ACCESSORIES: Array<{ id: Accessory; label: string }> = [
  { id: "nenhum", label: "Nenhum" },
  { id: "oculos", label: "Óculos" },
  { id: "bone", label: "Boné" },
  { id: "fone", label: "Fone" },
];

export const MIN_HEIGHT = 0.94;
export const MAX_HEIGHT = 1.06;

export const CHARACTER_PRESETS: CharacterPreset[] = [
  { id: "classico", label: "Clássico", skin: "#e8b98a", hair: "#2c333d", hairStyle: "curto", pants: "#2f3742", shoes: "#1e242e", accessory: "nenhum", height: 1 },
  { id: "marin", label: "Marina", skin: "#f0c8a0", hair: "#7a3b22", hairStyle: "coque", pants: "#3d2f4f", shoes: "#241c2e", accessory: "oculos", height: 0.98 },
  { id: "tucan", label: "Tucano", skin: "#8d5a3b", hair: "#15181d", hairStyle: "curto", pants: "#24344d", shoes: "#11151c", accessory: "nenhum", height: 1.03 },
  { id: "ruivo", label: "Ruivo", skin: "#f4d3ae", hair: "#b4522e", hairStyle: "coque", pants: "#2f4237", shoes: "#1c2620", accessory: "nenhum", height: 0.97 },
  { id: "prata", label: "Prata", skin: "#e8b98a", hair: "#c9ccd4", hairStyle: "curto", pants: "#3a3f47", shoes: "#191d23", accessory: "oculos", height: 1 },
  { id: "nox", label: "Nox", skin: "#6f4530", hair: "#0e1116", hairStyle: "raspado", pants: "#1f2733", shoes: "#0d1117", accessory: "nenhum", height: 1.04 },
  { id: "trigo", label: "Trigo", skin: "#d9a878", hair: "#5c4632", hairStyle: "curto", pants: "#4a3a55", shoes: "#221c29", accessory: "nenhum", height: 0.99 },
  { id: "luar", label: "Luar", skin: "#f0c8a0", hair: "#2c333d", hairStyle: "raspado", pants: "#2f3742", shoes: "#1e242e", accessory: "oculos", height: 1.01 },
  { id: "cipreste", label: "Cipreste", skin: "#a06a44", hair: "#3f6b3a", hairStyle: "curto", pants: "#313a46", shoes: "#171c24", accessory: "nenhum", height: 0.98 },
  { id: "aurora", label: "Aurora", skin: "#f4d3ae", hair: "#c2924d", hairStyle: "coque", pants: "#54324a", shoes: "#241822", accessory: "nenhum", height: 0.96 },
  { id: "grafite", label: "Grafite", skin: "#8d5a3b", hair: "#3a3f47", hairStyle: "raspado", pants: "#2a2f38", shoes: "#14181e", accessory: "oculos", height: 1.02 },
  { id: "arena", label: "Arena", skin: "#d9a878", hair: "#8a6a2c", hairStyle: "curto", pants: "#3d4436", shoes: "#1e2419", accessory: "nenhum", height: 1 },
  { id: "punk", label: "Punk", skin: "#d9a878", hair: "#15181d", hairStyle: "moicano", pants: "#2a2f38", shoes: "#11151c", accessory: "fone", height: 1 },
  { id: "player", label: "Player", skin: "#f0c8a0", hair: "#5c4632", hairStyle: "longo", pants: "#24344d", shoes: "#191d23", accessory: "bone", height: 1.02 },
];

const PRESETS_BY_ID = new Map(CHARACTER_PRESETS.map((preset) => [preset.id, preset]));

/** O mínimo que a aparência precisa do agente: o cabelo do cadastro. */
export type LookBase = Pick<AgentDefinition, "hairColor"> | { hairColor?: string };

/** Aparência de fábrica do agente: pele padrão, cabelo do cadastro, altura neutra. */
export function defaultLook(agent: LookBase): CharacterLook {
  return {
    skin: "#e8b98a",
    hair: agent.hairColor ?? "#2c333d",
    hairStyle: "curto",
    pants: "#2f3742",
    shoes: "#1e242e",
    accessory: "nenhum",
    height: 1,
  };
}

function clampHeight(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, value));
}

/**
 * Resolve a aparência final: fábrica ← preset ← ajustes do usuário.
 * Valor inválido em qualquer camada cai no anterior — nada quebra a cena.
 */
export function resolveLook(agent: LookBase, override?: CharacterOverride | null): CharacterLook {
  const base = defaultLook(agent);
  if (!override) return base;

  const presetId = override.presetId ?? null;
  const preset = presetId ? PRESETS_BY_ID.get(presetId) : undefined;
  const fromPreset: CharacterLook = preset
    ? {
        skin: preset.skin,
        hair: preset.hair,
        hairStyle: preset.hairStyle,
        pants: preset.pants,
        shoes: preset.shoes,
        accessory: preset.accessory,
        height: preset.height,
        ...(preset.shirt ? { shirt: preset.shirt } : {}),
      }
    : base;

  return {
    skin: override.skin ?? fromPreset.skin,
    hair: override.hair ?? fromPreset.hair,
    hairStyle: override.hairStyle ?? fromPreset.hairStyle,
    ...(override.shirt ?? fromPreset.shirt ? { shirt: override.shirt ?? fromPreset.shirt } : {}),
    pants: override.pants ?? fromPreset.pants,
    shoes: override.shoes ?? fromPreset.shoes,
    accessory: override.accessory ?? fromPreset.accessory,
    height: clampHeight(override.height ?? fromPreset.height),
  };
}

/**
 * Sorteio determinístico por agente: o mesmo bot recebe sempre o mesmo
 * "aleatório", sem Math.random e sem mudar entre reloads.
 */
export function randomLookFor(agentId: string, seed: number): CharacterOverride {
  let idHash = 0;
  for (let index = 0; index < agentId.length; index += 1) idHash = (idHash * 31 + agentId.charCodeAt(index)) >>> 0;
  let hash = (seed ^ idHash) >>> 0;
  if (hash === 0) hash = 1;
  const next = () => {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    return hash / 0xffffffff;
  };
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length) % list.length];

  return {
    presetId: null,
    skin: pick(SKIN_TONES),
    hair: pick(HAIR_COLORS),
    hairStyle: pick(HAIR_STYLES).id,
    pants: pick(PANTS_COLORS),
    shoes: pick(SHOE_COLORS),
    accessory: pick(ACCESSORIES).id,
    height: Number((MIN_HEIGHT + next() * (MAX_HEIGHT - MIN_HEIGHT)).toFixed(2)),
  };
}
