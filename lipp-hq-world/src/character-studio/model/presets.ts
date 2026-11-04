import { specFingerprint, type CharacterSpec, type ColorSlot } from "@/character-studio/model/schema";

/**
 * Modelos e paletas do estúdio. Este arquivo é o lugar para o agente editar
 * quando um pedido no chat vira um ponto de partida novo.
 *
 * Os presets nunca vão para o localStorage: a lista sempre mostra o que está aqui.
 * Ao mudar os valores de um preset, suba `revision` e conte o motivo em `changelog`.
 * Variações feitas a partir dele continuam como estão e recebem o aviso de revisão.
 */
export interface CharacterPreset {
  id: string;
  name: string;
  /** Número para leitura humana; quem detecta a mudança é a impressão digital. */
  revision: number;
  changelog: string;
  spec: CharacterSpec;
}

/** Cores exatas de public/prototipo/pulse.glb; o teste do contrato confere contra o arquivo. */
export const PULSE_BASE_SPEC: CharacterSpec = {
  colors: {
    skin: "#c58d6c",
    hair: "#3b281d",
    shirt: "#3b82f6",
    pants: "#33363d",
    belt: "#40332a",
    face: "#ece7db",
  },
  proportions: { heightM: 1.76, width: 1, head: 1 },
  accessories: { glasses: false },
};

export const BASE_PRESET_ID = "pulse-base";

export const PRESETS: readonly CharacterPreset[] = [
  {
    id: BASE_PRESET_ID,
    name: "Pulse (base)",
    revision: 1,
    changelog: "Valores do pulse.glb, sem nenhuma alteração.",
    spec: PULSE_BASE_SPEC,
  },
  {
    id: "alto-musgo",
    name: "Alto, camisa musgo",
    revision: 1,
    changelog: "Ponto de partida: mais alto e estreito, tons de oficina.",
    spec: {
      colors: { skin: "#8d5a3c", hair: "#17120f", shirt: "#55664a", pants: "#3a3f46", belt: "#2b211a", face: "#ece7db" },
      proportions: { heightM: 1.9, width: 0.95, head: 0.95 },
      accessories: { glasses: false },
    },
  },
  {
    id: "compacto-ruivo",
    name: "Compacto, ruivo",
    revision: 1,
    changelog: "Ponto de partida: mais baixo e largo, com óculos.",
    spec: {
      colors: { skin: "#e8bfa0", hair: "#8e4a24", shirt: "#c9b89a", pants: "#2f4256", belt: "#5a3d28", face: "#f2eee6" },
      proportions: { heightM: 1.62, width: 1.1, head: 1.08 },
      accessories: { glasses: true },
    },
  },
];

/** Amostras rápidas por material; qualquer outra cor continua disponível no seletor. */
export const PALETTES: Partial<Record<ColorSlot, readonly string[]>> = {
  skin: ["#f1d0b5", "#e8bfa0", "#c58d6c", "#a4704f", "#8d5a3c", "#5f3b28"],
  hair: ["#17120f", "#3b281d", "#6b4426", "#8e4a24", "#c49a5b", "#9a9a98"],
  shirt: ["#3b82f6", "#55664a", "#c9b89a", "#b4483c", "#e6e4df", "#2b2f36"],
  pants: ["#33363d", "#2f4256", "#4b4238", "#6d6f73", "#1d1f23", "#8a7a62"],
};

export function presetById(id: string | null | undefined): CharacterPreset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}

export function presetFingerprint(preset: CharacterPreset): string {
  return specFingerprint(preset.spec);
}

