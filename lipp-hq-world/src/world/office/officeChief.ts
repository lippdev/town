import { newPreset, type HumanPreset } from "@/avatar/human/preset";

export const CHIEF_ID = "chefe";

/**
 * O chefe da equipe: sempre presente na demonstração, sem precisar ser criado no editor.
 * Não vem do Hermes. O comportamento próprio dele ainda será definido; por ora, é uma pessoa
 * como as outras, que senta e levanta quando mandam.
 */
export const CHIEF_PRESET: HumanPreset = (() => {
  const base = newPreset(CHIEF_ID, "Chefe", "2026-11-04T00:00:00.000Z");
  return {
    ...base,
    parts: { ...base.parts, hair: "Hair.002", facialHair: "FacialHair.002", eyebrow: "EyeBrow.005" },
    colors: { ...base.colors, hair: "#17120f", eyebrow: "#17120f", facialHair: "#17120f", top: "#23262c", bottom: "#2f4256", shoes: "#23262c" },
  };
})();

/** O chefe vem primeiro, com o melhor lugar. Quem foi salvo no editor segue a ordem de sempre. */
export const withChief = (saved: readonly HumanPreset[]): HumanPreset[] => [CHIEF_PRESET, ...saved.filter((preset) => preset.id !== CHIEF_ID)];
