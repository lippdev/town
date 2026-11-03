import type { AgentDefinition } from "@/types/hq";

/**
 * Biblioteca de personagens prontos: cada preset é uma aparência completa
 * (pele, cabelo, calça, sapato e acessório) que pode ser atribuída a
 * qualquer agente sem mudar nome, função ou cor de identidade — a camisa
 * continua sendo a cor do agente, que é como ele é reconhecido na cena.
 */

export type HairStyle = "curto" | "coque" | "raspado";
export type Accessory = "nenhum" | "oculos";

export interface CharacterPreset {
  id: string;
  label: string;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  pants: string;
  shoes: string;
  accessory: Accessory;
}

export const CHARACTER_PRESETS: CharacterPreset[] = [
  {
    id: "classico",
    label: "Clássico",
    skin: "#e8b98a",
    hair: "#2c333d",
    hairStyle: "curto",
    pants: "#2f3742",
    shoes: "#1e242e",
    accessory: "nenhum",
  },
  {
    id: "marin",
    label: "Marina",
    skin: "#f0c8a0",
    hair: "#7a3b22",
    hairStyle: "coque",
    pants: "#3d2f4f",
    shoes: "#241c2e",
    accessory: "oculos",
  },
  {
    id: "tucan",
    label: "Tucano",
    skin: "#8d5a3b",
    hair: "#15181d",
    hairStyle: "curto",
    pants: "#24344d",
    shoes: "#11151c",
    accessory: "nenhum",
  },
  {
    id: "ruivo",
    label: "Ruivo",
    skin: "#f4d3ae",
    hair: "#b4522e",
    hairStyle: "coque",
    pants: "#2f4237",
    shoes: "#1c2620",
    accessory: "nenhum",
  },
  {
    id: "prata",
    label: "Prata",
    skin: "#e8b98a",
    hair: "#c9ccd4",
    hairStyle: "curto",
    pants: "#3a3f47",
    shoes: "#191d23",
    accessory: "oculos",
  },
  {
    id: "nox",
    label: "Nox",
    skin: "#6f4530",
    hair: "#0e1116",
    hairStyle: "raspado",
    pants: "#1f2733",
    shoes: "#0d1117",
    accessory: "nenhum",
  },
  {
    id: "trigo",
    label: "Trigo",
    skin: "#d9a878",
    hair: "#5c4632",
    hairStyle: "curto",
    pants: "#4a3a55",
    shoes: "#221c29",
    accessory: "nenhum",
  },
  {
    id: "luar",
    label: "Luar",
    skin: "#f0c8a0",
    hair: "#2c333d",
    hairStyle: "raspado",
    pants: "#2f3742",
    shoes: "#1e242e",
    accessory: "oculos",
  },
  {
    id: "cipreste",
    label: "Cipreste",
    skin: "#a06a44",
    hair: "#3f6b3a",
    hairStyle: "curto",
    pants: "#313a46",
    shoes: "#171c24",
    accessory: "nenhum",
  },
  {
    id: "aurora",
    label: "Aurora",
    skin: "#f4d3ae",
    hair: "#c2924d",
    hairStyle: "coque",
    pants: "#54324a",
    shoes: "#241822",
    accessory: "nenhum",
  },
  {
    id: "grafite",
    label: "Grafite",
    skin: "#8d5a3b",
    hair: "#3a3f47",
    hairStyle: "raspado",
    pants: "#2a2f38",
    shoes: "#14181e",
    accessory: "oculos",
  },
  {
    id: "arena",
    label: "Arena",
    skin: "#d9a878",
    hair: "#8a6a2c",
    hairStyle: "curto",
    pants: "#3d4436",
    shoes: "#1e2419",
    accessory: "nenhum",
  },
];

const PRESETS_BY_ID = new Map(CHARACTER_PRESETS.map((preset) => [preset.id, preset]));

/** Aparência de fábrica do agente: pele padrão, cabelo do cadastro, calça escura. */
export function agentDefaultAppearance(agent: AgentDefinition): CharacterPreset {
  return {
    id: "padrao",
    label: "Padrão",
    skin: "#e8b98a",
    hair: agent.hairColor ?? "#2c333d",
    hairStyle: "curto",
    pants: "#2f3742",
    shoes: "#1e242e",
    accessory: "nenhum",
  };
}

/**
 * Resolve a aparência do agente: preset escolhido (ids válidos) ou o visual
 * de fábrica. Ids desconhecidos nunca quebram a cena — caem no padrão.
 */
export function resolveAppearance(agent: AgentDefinition, presetId: string | null): CharacterPreset {
  if (!presetId) return agentDefaultAppearance(agent);
  return PRESETS_BY_ID.get(presetId) ?? agentDefaultAppearance(agent);
}
