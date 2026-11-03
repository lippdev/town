import { describe, expect, it } from "vitest";
import { AGENTS_BY_ID } from "@/agents/agents";
import {
  CHARACTER_PRESETS,
  MAX_HEIGHT,
  MIN_HEIGHT,
  defaultLook,
  randomLookFor,
  resolveLook,
} from "@/world/characters/appearance";

describe("biblioteca de personagens", () => {
  it("presets têm ids e cores únicos", () => {
    const ids = CHARACTER_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of CHARACTER_PRESETS) {
      expect(preset.skin).toMatch(/^#[0-9a-f]{6}$/);
      expect(preset.hair).toMatch(/^#[0-9a-f]{6}$/);
      expect(preset.height).toBeGreaterThanOrEqual(MIN_HEIGHT);
      expect(preset.height).toBeLessThanOrEqual(MAX_HEIGHT);
    }
  });

  it("sem ajuste usa o visual de fábrica do agente, com o cabelo do cadastro", () => {
    const argos = AGENTS_BY_ID.argos;
    const resolved = resolveLook(argos, null);
    expect(resolved.hair).toBe(argos.hairColor);
    expect(resolved).toEqual(defaultLook(argos));
  });

  it("preset válido substitui a aparência", () => {
    const scout = AGENTS_BY_ID.scout;
    const resolved = resolveLook(scout, { presetId: "nox" });
    expect(resolved.skin).not.toBe(resolveLook(scout, null).skin);
    expect(resolved.accessory).toBe("nenhum");
  });

  it("id desconhecido cai no padrão em vez de quebrar a cena", () => {
    const forge = AGENTS_BY_ID.forge;
    expect(resolveLook(forge, { presetId: "nao-existe" })).toEqual(defaultLook(forge));
  });
});

describe("edições por peça", () => {
  const scout = AGENTS_BY_ID.scout;

  it("peça editada vence o preset e o padrão", () => {
    const look = resolveLook(scout, { presetId: "nox", hair: "#b4522e", hairStyle: "moicano" });
    expect(look.hair).toBe("#b4522e");
    expect(look.hairStyle).toBe("moicano");
    expect(look.skin).toBe(CHARACTER_PRESETS.find((preset) => preset.id === "nox")?.skin);
  });

  it("camisa é opcional: sem escolha não há cor própria (a cena usa a do agente)", () => {
    expect(resolveLook(scout, { presetId: "marin" }).shirt).toBeUndefined();
    expect(resolveLook(scout, { shirt: "#22c55e" }).shirt).toBe("#22c55e");
  });

  it("altura fora da faixa é presa ao limite em vez de gerar personagem gigante", () => {
    expect(resolveLook(scout, { height: 9 }).height).toBe(MAX_HEIGHT);
    expect(resolveLook(scout, { height: 0.1 }).height).toBe(MIN_HEIGHT);
    expect(resolveLook(scout, { height: Number.NaN }).height).toBe(1);
  });

  it("ajuste vazio não muda nada além do que veio", () => {
    const look = resolveLook(scout, {});
    expect(look).toEqual(defaultLook(scout));
  });

  it("sorteio é determinístico por agente e sempre válido", () => {
    const first = randomLookFor("scout", 7);
    expect(randomLookFor("scout", 7)).toEqual(first);
    expect(randomLookFor("forge", 7)).not.toEqual(first);
    const look = resolveLook(scout, first);
    expect(look.height).toBeGreaterThanOrEqual(MIN_HEIGHT);
    expect(look.height).toBeLessThanOrEqual(MAX_HEIGHT);
    expect(look.shirt).toBeUndefined();
  });
});
