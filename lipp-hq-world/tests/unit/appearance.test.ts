import { describe, expect, it } from "vitest";
import { AGENTS_BY_ID } from "@/agents/agents";
import {
  CHARACTER_PRESETS,
  agentDefaultAppearance,
  resolveAppearance,
} from "@/world/characters/appearance";

describe("biblioteca de personagens", () => {
  it("presets têm ids e cores únicos", () => {
    const ids = CHARACTER_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of CHARACTER_PRESETS) {
      expect(preset.skin).toMatch(/^#[0-9a-f]{6}$/);
      expect(preset.hair).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("sem preset (null) usa o visual de fábrica do agente, com o cabelo do cadastro", () => {
    const argos = AGENTS_BY_ID.argos;
    const resolved = resolveAppearance(argos, null);
    expect(resolved.hair).toBe(argos.hairColor);
    expect(resolved.id).toBe("padrao");
  });

  it("preset válido substitui a aparência mas não existe 'renome'", () => {
    const scout = AGENTS_BY_ID.scout;
    const resolved = resolveAppearance(scout, "nox");
    expect(resolved.skin).not.toBe(resolveAppearance(scout, null).skin);
    expect(resolved.label).toBe("Nox");
  });

  it("id desconhecido cai no padrão em vez de quebrar a cena", () => {
    const forge = AGENTS_BY_ID.forge;
    expect(resolveAppearance(forge, "nao-existe")).toEqual(agentDefaultAppearance(forge));
  });
});
