import { describe, expect, it } from "vitest";
import {
  characterFor,
  characterUrl,
  fitScale,
  parseManifest,
  poseForState,
  resolveClips,
} from "@/world/characters/characterManifest";

describe("animações do GLB para cada pose", () => {
  it("acha pelos nomes do Mixamo e do Blender", () => {
    const clips = resolveClips(["Armature|Idle", "Armature|Walking", "Sitting Idle", "Typing", "Talking"]);
    expect(clips).toEqual({
      idle: "Armature|Idle",
      walk: "Armature|Walking",
      sit: "Sitting Idle",
      type: "Typing",
      talk: "Talking",
    });
  });

  it("aceita nomes em português", () => {
    const clips = resolveClips(["parado", "andando", "sentado", "digitando", "conversando"]);
    expect(clips).toMatchObject({ idle: "parado", walk: "andando", sit: "sentado", type: "digitando", talk: "conversando" });
  });

  it("pose que falta usa a parecida: sem digitar e sem conversar, fica sentado", () => {
    const clips = resolveClips(["Idle", "Walking", "Sitting", "Dance", "Wave"]);
    expect(clips.type).toBe("Sitting");
    expect(clips.talk).toBe("Sitting");
  });

  it("nome explícito do manifesto vence o automático", () => {
    expect(resolveClips(["Idle", "Idle_Long", "Walk"], { idle: "Idle_Long" }).idle).toBe("Idle_Long");
    // nome errado no manifesto não quebra: cai no automático
    expect(resolveClips(["Idle"], { idle: "NaoExiste" }).idle).toBe("Idle");
  });

  it("arquivo só com andar: parado não inventa, as poses sentadas caem no que existe", () => {
    const clips = resolveClips(["Walking"]);
    expect(clips.walk).toBe("Walking");
    expect(clips.idle).toBeUndefined();
  });
});

describe("escala e estado", () => {
  it("normaliza centímetros (Mixamo) e metros para a altura pedida", () => {
    expect(fitScale(172, 1.72)).toBeCloseTo(0.01);
    expect(fitScale(1.8, 1.8)).toBe(1);
    expect(fitScale(0)).toBe(1);
    expect(fitScale(Number.NaN)).toBe(1);
  });

  it("estado do bot vira pose", () => {
    expect(poseForState("walking")).toBe("walk");
    expect(poseForState("working")).toBe("type");
    expect(poseForState("blocked")).toBe("type");
    expect(poseForState("meeting")).toBe("talk");
    expect(poseForState("waiting")).toBe("idle");
  });
});

describe("manifesto", () => {
  it("entrada própria vence a padrão; sem manifesto, figura simples", () => {
    const manifest = parseManifest({
      version: 1,
      default: { file: "padrao.glb" },
      characters: { pulse: { file: "pulse.glb" }, quebrado: { nada: 1 } },
    });
    expect(characterFor(manifest, "pulse")?.file).toBe("pulse.glb");
    expect(characterFor(manifest, "echo")?.file).toBe("padrao.glb");
    expect(manifest?.characters.quebrado).toBeUndefined();
    expect(characterFor(null, "pulse")).toBeNull();
    expect(parseManifest("lixo")).toBeNull();
  });

  it("arquivo só dentro de public/characters", () => {
    expect(characterUrl({ file: "pulse.glb" })).toBe("/characters/pulse.glb");
    expect(characterUrl({ file: "../segredo.glb" })).toBeNull();
    expect(characterUrl({ file: "https://outro.site/x.glb" })).toBeNull();
    expect(characterUrl({ file: "pulse.fbx" })).toBeNull();
  });
});
