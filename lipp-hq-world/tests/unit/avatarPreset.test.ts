import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_IDS } from "@/avatar/human/catalog";
import { AVATAR_BACKUP_KEY, AVATAR_STORAGE_KEY, loadAvatars, saveAvatars, type StorageLike } from "@/avatar/human/persistence";
import { newPreset, parsePreset, randomized, resolveHuman, validateName, withColor, withPart } from "@/avatar/human/preset";

const base = () => newPreset("p1", "Ana", "2026-11-04T00:00:00.000Z");

function memory(initial: Record<string, string> = {}, failing = false): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      if (failing) throw new Error("cheio");
      data[key] = value;
    },
  };
}

describe("preset de pessoa", () => {
  it("o padrão veste tudo o que é obrigatório, com uma peça por categoria", () => {
    const human = resolveHuman(base());
    const present = human.parts.map((part) => part.category);
    expect(new Set(present).size).toBe(present.length);
    for (const category of CATEGORIES.filter((item) => item.required)) expect(present).toContain(category.id);
  });

  it("a fantasia cobre a roupa e o cabelo sem apagar a escolha guardada", () => {
    const dressed = withPart(base(), "outfit", "Outfit.001");
    const human = resolveHuman(dressed);
    const present = human.parts.map((part) => part.category);
    for (const covered of ["top", "bottom", "shoes", "hair"] as const) {
      expect(present).not.toContain(covered);
      expect(human.locked[covered]).toBe("Outfit.001");
    }
    expect(dressed.parts.top).toBe("Top.001");
    expect(resolveHuman(withPart(dressed, "outfit", null)).parts.map((part) => part.category)).toContain("top");
  });

  it("o vestido cobre blusa e calça, mas deixa os sapatos", () => {
    const present = resolveHuman(withPart(base(), "outfit", "WawaDress")).parts.map((part) => part.category);
    expect(present).not.toContain("top");
    expect(present).not.toContain("bottom");
    expect(present).toContain("shoes");
  });

  it("a abóbora toma o lugar da cabeça", () => {
    const present = resolveHuman(withPart(base(), "hat", "PumpkinHead")).parts.map((part) => part.category);
    expect(present).not.toContain("head");
    expect(present).toContain("hat");
    expect(present).toContain("top");
  });

  it("não deixa tirar peça obrigatória nem vestir peça de outra categoria", () => {
    expect(withPart(base(), "top", null).parts.top).toBe("Top.001");
    expect(withPart(base(), "top", "Hair.001").parts.top).toBe("Top.001");
    expect(withPart(base(), "hair", null).parts.hair).toBeNull();
  });

  it("só peça com material de cor recebe cor", () => {
    const human = resolveHuman(withColor(withPart(base(), "earring", "Earring.001"), "top", "#112233"));
    expect(human.parts.find((part) => part.category === "top")!.color).toBe("#112233");
    expect(human.parts.find((part) => part.category === "earring")!.color).toBeNull();
    expect(human.parts.find((part) => part.category === "nose")!.color).toBeNull();
  });

  it("rejeita cor fora do formato", () => {
    expect(withColor(base(), "top", "azul").colors.top).toBe(base().colors.top);
  });

  it("valida o nome", () => {
    expect(validateName("  ")).not.toBeNull();
    expect(validateName("a".repeat(33))).not.toBeNull();
    expect(validateName("Filipe")).toBeNull();
  });

  it("o sorteio é o mesmo para a mesma semente e nunca deixa obrigatória vazia", () => {
    expect(randomized(base(), 42)).toEqual(randomized(base(), 42));
    expect(randomized(base(), 42)).not.toEqual(randomized(base(), 43));
    for (let seed = 1; seed < 300; seed += 1) {
      const preset = randomized(base(), seed);
      for (const category of CATEGORIES.filter((item) => item.required)) expect(preset.parts[category.id], `${seed} ${category.id}`).not.toBeNull();
    }
  });

  it("o sorteio varia as peças de verdade", () => {
    const hair = new Set(Array.from({ length: 200 }, (_, seed) => randomized(base(), seed + 1).parts.hair));
    expect(hair.size).toBeGreaterThan(6);
    const outfits = Array.from({ length: 200 }, (_, seed) => randomized(base(), seed + 1).parts.outfit).filter(Boolean);
    expect(outfits.length).toBeLessThan(100);
  });
});

describe("leitura de preset de fora", () => {
  it("devolve o mesmo que recebeu quando está tudo certo", () => {
    expect(parsePreset(JSON.parse(JSON.stringify(base())))).toEqual({ preset: base(), problems: [] });
  });

  it("sem id não há como saber quem é", () => {
    expect(parsePreset({ name: "x" }).preset).toBeNull();
    expect(parsePreset("lixo").preset).toBeNull();
  });

  it("peça desconhecida, categoria errada e cor ruim voltam ao padrão e viram aviso", () => {
    const { preset, problems } = parsePreset({ ...base(), parts: { ...base().parts, hair: "Hair.999", top: "Hair.001" }, colors: { ...base().colors, top: "vermelho" } });
    expect(preset!.parts.hair).toBe(base().parts.hair);
    expect(preset!.parts.top).toBe("Top.001");
    expect(preset!.colors.top).toBe(base().colors.top);
    expect(problems.length).toBe(3);
  });

  it("obrigatória nula não passa; opcional nula continua nula", () => {
    const { preset } = parsePreset({ ...base(), parts: { ...base().parts, top: null, hair: null } });
    expect(preset!.parts.top).toBe("Top.001");
    expect(preset!.parts.hair).toBeNull();
  });

  it("toda categoria existe no resultado, mesmo em dado antigo com menos campos", () => {
    const { preset } = parsePreset({ id: "x", name: "Velha", parts: { hair: "Hair.003" } });
    for (const category of CATEGORY_IDS) expect(preset!.parts).toHaveProperty(category);
    expect(preset!.parts.hair).toBe("Hair.003");
  });
});

describe("persistência das pessoas", () => {
  const stored = (presets: unknown[], schema = 1, selectedId: unknown = null) => ({ [AVATAR_STORAGE_KEY]: JSON.stringify({ schema, presets, selectedId }) });

  it("salvar e ler devolve o mesmo", () => {
    const storage = memory();
    const doc = { presets: [base()], selectedId: "p1" };
    expect(saveAvatars(storage, doc)).toBe(true);
    expect(loadAvatars(storage)).toEqual({ doc, warnings: [], writable: true });
  });

  it("primeira visita é vazia e gravável", () => {
    expect(loadAvatars(memory())).toEqual({ doc: { presets: [], selectedId: null }, warnings: [], writable: true });
  });

  it("dado corrompido vai para a cópia de segurança", () => {
    const storage = memory({ [AVATAR_STORAGE_KEY]: "{quebrado" });
    const result = loadAvatars(storage);
    expect(result.doc.presets).toEqual([]);
    expect(result.writable).toBe(true);
    expect(storage.data[AVATAR_BACKUP_KEY]).toBe("{quebrado");
  });

  it("versão futura nunca é sobrescrita", () => {
    const storage = memory(stored([base()], 99));
    const result = loadAvatars(storage);
    expect(result.writable).toBe(false);
    expect(result.doc.presets).toEqual([]);
    expect(storage.data[AVATAR_BACKUP_KEY]).toBeUndefined();
  });

  it("sem conseguir guardar a cópia, não grava por cima", () => {
    expect(loadAvatars(memory({ [AVATAR_STORAGE_KEY]: "{quebrado" }, true)).writable).toBe(false);
  });

  it("id repetido entra uma vez e item sem id sai", () => {
    const result = loadAvatars(memory(stored([base(), base(), { name: "sem id" }])));
    expect(result.doc.presets.length).toBe(1);
  });

  it("seleção de quem não existe cai no primeiro", () => {
    expect(loadAvatars(memory(stored([base()], 1, "fantasma"))).doc.selectedId).toBe("p1");
  });

  it("peça que saiu do catálogo não apaga a pessoa", () => {
    const storage = memory(stored([{ ...base(), parts: { ...base().parts, outfit: "Outfit.002" } }]));
    const result = loadAvatars(storage);
    expect(result.doc.presets[0]!.parts.outfit).toBeNull();
    expect(result.warnings.length).toBe(1);
    expect(storage.data[AVATAR_BACKUP_KEY]).toBeTruthy();
  });

  it("sem armazenamento, avisa e não grava", () => {
    const result = loadAvatars(null);
    expect(result.writable).toBe(false);
    expect(result.warnings.length).toBe(1);
    expect(saveAvatars(null, result.doc)).toBe(false);
  });

  it("armazenamento cheio devolve falso em vez de quebrar", () => {
    expect(saveAvatars(memory({}, true), { presets: [base()], selectedId: "p1" })).toBe(false);
  });
});
