import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadStudio, saveStudio, serializeStudio, STORAGE_BACKUP_KEY, STORAGE_KEY, type StorageLike } from "@/character-studio/model/persistence";
import { BASE_PRESET_ID, PRESETS, PULSE_BASE_SPEC, presetById } from "@/character-studio/model/presets";
import { COLOR_SLOTS, normalizeHex, parseSpec, PROPORTIONS, PROPORTION_KEYS, SLOT_MATERIAL, specFingerprint, type CharacterSpec } from "@/character-studio/model/schema";
import { BASE_MODEL, chatRequestText, parseSheet, sheetFileName, sheetFromVariant, SHEET_KIND } from "@/character-studio/model/sheet";
import { emptyDoc, HISTORY_LIMIT, initialState, originDrift, originOf, resolveSelection, studioReducer, type StudioAction, type StudioState, type Variant } from "@/character-studio/model/studio";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => void (data[key] = value) };
}

const stamp = (at: number, newId = `v-${at}`) => ({ at, newId });

function run(state: StudioState, ...actions: StudioAction[]) {
  return actions.reduce(studioReducer, state);
}

const start = () => initialState(emptyDoc());

function variantWith(overrides: Partial<Variant> = {}): Variant {
  return {
    id: "v-1",
    name: "Teste",
    origin: originOf(presetById(BASE_PRESET_ID)!),
    spec: structuredClone(PULSE_BASE_SPEC),
    notes: "",
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("contrato com o pulse.glb", () => {
  const bytes = readFileSync("public/prototipo/pulse.glb");
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as {
    materials: { name: string; pbrMetallicRoughness: { baseColorFactor: number[] } }[];
    nodes: { name?: string; scale?: number[] }[];
    animations: { name: string }[];
  };

  it("cada controle de cor corresponde a um material nomeado do arquivo", () => {
    const names = json.materials.map((material) => material.name);
    expect(new Set(names)).toEqual(new Set(COLOR_SLOTS.map((slot) => SLOT_MATERIAL[slot])));
  });

  it("a base do estúdio traz as cores exatas do arquivo", () => {
    const toLinear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    for (const slot of COLOR_SLOTS) {
      const hex = PULSE_BASE_SPEC.colors[slot];
      const material = json.materials.find((item) => item.name === SLOT_MATERIAL[slot])!;
      [1, 3, 5].forEach((start, channel) => {
        const expected = toLinear(parseInt(hex.slice(start, start + 2), 16) / 255);
        expect(material.pbrMetallicRoughness.baseColorFactor[channel]).toBeCloseTo(expected, 5);
      });
    }
  });

  it("o arquivo é o mesmo que a proveniência registra", () => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(BASE_MODEL.sha256);
    const provenance = readFileSync("public/prototipo/proveniencia.json", "utf8");
    expect(provenance).toContain(BASE_MODEL.sha256);
  });

  it("guarda a cabeça reduzida e os clipes usados nas poses", () => {
    expect(json.nodes.find((node) => node.name === "Head")?.scale?.[0]).toBeCloseTo(0.52, 5);
    expect(json.animations.map((clip) => clip.name)).toEqual(expect.arrayContaining(["CharacterArmature|Idle", "CharacterArmature|SitDown"]));
  });

  it("todo preset da fonte é válido e tem id único", () => {
    expect(new Set(PRESETS.map((preset) => preset.id)).size).toBe(PRESETS.length);
    for (const preset of PRESETS) {
      const { errors } = parseSpec(preset.spec);
      expect(errors, preset.id).toEqual([]);
      expect(preset.revision).toBeGreaterThanOrEqual(1);
    }
  });

  it("as faixas contêm o valor do arquivo", () => {
    for (const key of PROPORTION_KEYS) {
      const { min, max, base } = PROPORTIONS[key];
      expect(base).toBeGreaterThanOrEqual(min);
      expect(base).toBeLessThanOrEqual(max);
      expect(PULSE_BASE_SPEC.proportions[key]).toBe(base);
    }
  });
});

describe("validação de especificação", () => {
  it("normaliza cor digitada e recusa o resto", () => {
    expect(normalizeHex(" ABC ")).toBe("#aabbcc");
    expect(normalizeHex("#3B82F6")).toBe("#3b82f6");
    expect(normalizeHex("azul")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
  });

  it("recusa fora da faixa em vez de corrigir em silêncio", () => {
    const bad = structuredClone(PULSE_BASE_SPEC);
    bad.proportions.head = 5;
    const { spec, errors } = parseSpec(bad);
    expect(spec).toBeNull();
    expect(errors.join()).toContain("spec.proportions.head");
  });

  it("recusa NaN e infinito, que o JSON.stringify esconderia", () => {
    const bad = structuredClone(PULSE_BASE_SPEC);
    bad.proportions.width = Number.POSITIVE_INFINITY;
    expect(parseSpec(bad).spec).toBeNull();
    bad.proportions.width = Number.NaN;
    expect(parseSpec(bad).spec).toBeNull();
  });

  it("monta objeto novo sem carregar chaves extras", () => {
    const hostile = JSON.parse(`{"__proto__":{"polluted":true},"colors":${JSON.stringify(PULSE_BASE_SPEC.colors)},"proportions":${JSON.stringify(PULSE_BASE_SPEC.proportions)},"extra":1}`);
    const { spec } = parseSpec(hostile);
    expect(spec).not.toBeNull();
    expect(Object.keys(spec!)).toEqual(["colors", "proportions", "accessories"]);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("a impressão digital muda com qualquer valor", () => {
    const changed = structuredClone(PULSE_BASE_SPEC);
    changed.colors.shirt = "#000000";
    expect(specFingerprint(changed)).not.toBe(specFingerprint(PULSE_BASE_SPEC));
    expect(specFingerprint(structuredClone(PULSE_BASE_SPEC))).toBe(specFingerprint(PULSE_BASE_SPEC));
  });
});

describe("edição, cópia e desfazer", () => {
  it("editar um preset abre uma variação e não toca no preset", () => {
    const before = JSON.stringify(presetById(BASE_PRESET_ID));
    const state = run(start(), { type: "edit", edit: { kind: "color", slot: "shirt", value: "#112233" }, ...stamp(1000) });
    expect(JSON.stringify(presetById(BASE_PRESET_ID))).toBe(before);
    expect(state.present.variants).toHaveLength(1);
    expect(state.present.selectedId).toBe("v-1000");
    expect(state.present.variants[0]!.spec.colors.shirt).toBe("#112233");
    expect(state.present.variants[0]!.origin?.presetId).toBe(BASE_PRESET_ID);
  });

  it("arrastar um controle vira um só passo de desfazer", () => {
    let state = start();
    for (const [index, value] of [1.1, 1.12, 1.15].entries()) {
      state = run(state, { type: "edit", edit: { kind: "proportion", key: "width", value }, ...stamp(1000 + index * 100, "v-a") });
    }
    expect(state.present.variants[0]!.spec.proportions.width).toBe(1.15);
    expect(state.past).toHaveLength(1);
    expect(run(state, { type: "undo" }).present.variants).toHaveLength(0);
  });

  it("controle diferente ou pausa longa abre novo passo", () => {
    const state = run(
      start(),
      { type: "edit", edit: { kind: "proportion", key: "width", value: 1.1 }, ...stamp(1000, "v-a") },
      { type: "edit", edit: { kind: "proportion", key: "head", value: 1.1 }, ...stamp(1100, "v-a") },
      { type: "edit", edit: { kind: "proportion", key: "head", value: 1.2 }, ...stamp(5000, "v-a") },
    );
    expect(state.past).toHaveLength(3);
  });

  it("desfazer e refazer restauram exclusão com a seleção", () => {
    const created = run(start(), { type: "create", ...stamp(1) });
    const removed = run(created, { type: "remove", at: 2 });
    expect(removed.present.variants).toHaveLength(0);
    expect(removed.present.selectedId).toBe(BASE_PRESET_ID);
    const undone = run(removed, { type: "undo" });
    expect(undone.present.variants).toHaveLength(1);
    expect(undone.present.selectedId).toBe("v-1");
    expect(run(undone, { type: "redo" }).present.variants).toHaveLength(0);
  });

  it("nova edição apaga o refazer e o histórico tem teto", () => {
    let state = run(start(), { type: "create", ...stamp(1) });
    for (let index = 0; index < HISTORY_LIMIT + 20; index += 1) {
      state = run(state, { type: "edit", edit: { kind: "glasses", value: index % 2 === 0 }, at: 10_000 * (index + 2), newId: "x" });
    }
    expect(state.past.length).toBe(HISTORY_LIMIT);
    const undone = run(state, { type: "undo" });
    expect(undone.future).toHaveLength(1);
    expect(run(undone, { type: "edit", edit: { kind: "glasses", value: true }, at: 1e9, newId: "x" }).future).toHaveLength(0);
  });

  it("nomes repetidos ganham número, renomear valida e preset não renomeia", () => {
    const state = run(start(), { type: "create", ...stamp(1) }, { type: "create", ...stamp(2) });
    expect(state.present.variants.map((variant) => variant.name)).toEqual(["Novo personagem", "Novo personagem 2"]);
    const renamed = run(state, { type: "rename", name: "  Ana  ", at: 3 });
    expect(resolveSelection(renamed.present).name).toBe("Ana");
    expect(run(renamed, { type: "rename", name: "   ", at: 4 })).toBe(renamed);
    const onPreset = run(renamed, { type: "select", id: BASE_PRESET_ID });
    expect(run(onPreset, { type: "rename", name: "Outro", at: 5 })).toBe(onPreset);
  });

  it("duplicar copia sem dividir referência", () => {
    const state = run(
      start(),
      { type: "create", ...stamp(1) },
      { type: "duplicate", ...stamp(2) },
      { type: "edit", edit: { kind: "color", slot: "hair", value: "#000000" }, ...stamp(3) },
    );
    const [first, copy] = state.present.variants;
    expect(copy!.name).toBe("Novo personagem — cópia");
    expect(copy!.spec.colors.hair).toBe("#000000");
    expect(first!.spec.colors.hair).toBe(PULSE_BASE_SPEC.colors.hair);
  });
});

describe("revisão dos presets na fonte", () => {
  const stale = () => {
    const preset = presetById(BASE_PRESET_ID)!;
    return variantWith({ origin: { presetId: preset.id, revision: 0, fingerprint: "00000000" } });
  };

  it("avisa quando a fonte mudou, mesmo sem subir o número da revisão", () => {
    const preset = presetById(BASE_PRESET_ID)!;
    const sameNumber = variantWith({ origin: { presetId: preset.id, revision: preset.revision, fingerprint: "00000000" } });
    expect(originDrift(sameNumber).status).toBe("revised");
    expect(originDrift(variantWith()).status).toBe("current");
  });

  it("origem removida da fonte e variação sem origem são estados próprios", () => {
    expect(originDrift(variantWith({ origin: { presetId: "sumiu", revision: 1, fingerprint: "00000000" } }))).toEqual({ status: "removed", presetId: "sumiu" });
    expect(originDrift(variantWith({ origin: null })).status).toBe("none");
  });

  it("restaurar usa o conteúdo atual da fonte, e pode ser desfeito", () => {
    const changed = stale();
    changed.spec.colors.shirt = "#000000";
    const state = run(initialState({ variants: [changed], selectedId: changed.id }), { type: "restoreOrigin", at: 9 });
    expect(state.present.variants[0]!.spec).toEqual(presetById(BASE_PRESET_ID)!.spec);
    expect(originDrift(state.present.variants[0]!).status).toBe("current");
    expect(run(state, { type: "undo" }).present.variants[0]!.spec.colors.shirt).toBe("#000000");
  });

  it("manter a variação só registra que a revisão foi vista", () => {
    const changed = stale();
    changed.spec.colors.shirt = "#000000";
    const state = run(initialState({ variants: [changed], selectedId: changed.id }), { type: "keepRevision", at: 9 });
    expect(state.present.variants[0]!.spec.colors.shirt).toBe("#000000");
    expect(originDrift(state.present.variants[0]!).status).toBe("current");
  });

  it("o localStorage não guarda presets, só a origem da variação", () => {
    const raw = JSON.parse(serializeStudio({ variants: [variantWith()], selectedId: "v-1" }));
    expect(Object.keys(raw).sort()).toEqual(["schema", "selectedId", "variants"]);
    expect(JSON.stringify(raw)).not.toContain("Pulse (base)");
  });
});

describe("persistência", () => {
  it("salva e relê o mesmo documento", () => {
    const storage = memoryStorage();
    const doc = { variants: [variantWith()], selectedId: "v-1" };
    expect(saveStudio(storage, doc).ok).toBe(true);
    const loaded = loadStudio(storage);
    expect(loaded.doc).toEqual(doc);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.writable).toBe(true);
  });

  it("JSON corrompido vai para o backup e não derruba o estúdio", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: "{quebrado" });
    const loaded = loadStudio(storage);
    expect(loaded.doc).toEqual(emptyDoc());
    expect(loaded.warnings.join()).toContain(STORAGE_BACKUP_KEY);
    expect(storage.data[STORAGE_BACKUP_KEY]).toBe("{quebrado");
  });

  it("descarta só a variação inválida e guarda o original", () => {
    const bad = { ...variantWith({ id: "v-ruim" }), spec: { colors: {}, proportions: {} } };
    const raw = JSON.stringify({ schema: 1, variants: [variantWith(), bad], selectedId: "v-ruim" });
    const storage = memoryStorage({ [STORAGE_KEY]: raw });
    const loaded = loadStudio(storage);
    expect(loaded.doc.variants.map((variant) => variant.id)).toEqual(["v-1"]);
    expect(loaded.doc.selectedId).toBe(BASE_PRESET_ID);
    expect(loaded.warnings).toHaveLength(1);
    expect(storage.data[STORAGE_BACKUP_KEY]).toBe(raw);
  });

  it("ids repetidos e id de preset não passam", () => {
    const raw = JSON.stringify({ schema: 1, variants: [variantWith(), variantWith(), variantWith({ id: BASE_PRESET_ID })], selectedId: "v-1" });
    const loaded = loadStudio(memoryStorage({ [STORAGE_KEY]: raw }));
    expect(loaded.doc.variants).toHaveLength(1);
    expect(loaded.warnings[0]).toContain("2 variação");
  });

  it("dado de versão futura fica intocado e o estúdio não grava por cima", () => {
    const raw = JSON.stringify({ schema: 99, variants: [] });
    const loaded = loadStudio(memoryStorage({ [STORAGE_KEY]: raw }));
    expect(loaded.writable).toBe(false);
    expect(loaded.warnings).toHaveLength(1);
  });

  it("sem armazenamento, ou com cota cheia, avisa em vez de quebrar", () => {
    expect(loadStudio(null).writable).toBe(false);
    const full: StorageLike = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(saveStudio(full, emptyDoc()).ok).toBe(false);
    const blocked: StorageLike = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => undefined };
    expect(loadStudio(blocked).writable).toBe(false);
  });

  it.each(["{quebrado", JSON.stringify({ schema: 1 }), JSON.stringify({ schema: 1, variants: [variantWith(), {}] })])(
    "não autoriza sobrescrever dados se o backup falhar: %s", (raw) => {
      const storage = memoryStorage({ [STORAGE_KEY]: raw });
      const originalSet = storage.setItem;
      storage.setItem = (key, value) => {
        if (key === STORAGE_BACKUP_KEY) throw new Error("QuotaExceededError");
        originalSet(key, value);
      };
      const loaded = loadStudio(storage);
      expect(loaded.writable).toBe(false);
      expect(storage.data[STORAGE_KEY]).toBe(raw);
      expect(loaded.warnings.join()).toContain("Não consegui guardar uma cópia");
    },
  );
});

describe("ficha", () => {
  const sheet = () => sheetFromVariant(variantWith({ name: "Ana Clara", notes: "cabelo mais claro" }), new Date("2026-11-03T12:00:00Z"));

  it("exporta e importa sem perder nada, com crédito da base", () => {
    const original = sheet();
    expect(original.base.author).toBe("Quaternius");
    expect(original.base.license).toBe("CC0 1.0");
    const parsed = parseSheet(JSON.stringify(original));
    expect(parsed).toMatchObject({ ok: true, name: "Ana Clara", notes: "cabelo mais claro" });
    if (parsed.ok) {
      expect(parsed.spec).toEqual(original.character.spec);
      expect(parsed.origin).toEqual(original.character.origin);
    }
  });

  it("aceita a ficha colada do chat, com a cerca de código e o pedido em volta", () => {
    const parsed = parseSheet(chatRequestText(sheet()));
    expect(parsed.ok).toBe(true);
  });

  const rejects: [string, (draft: Record<string, unknown>) => void, string][] = [
    ["outro tipo de arquivo", (d) => { d.kind = "outra-coisa"; }, SHEET_KIND],
    ["versão futura", (d) => { d.version = 2; }, "só entende"],
    ["outro modelo base", (d) => { (d.base as { id: string }).id = "robo"; }, "base.id"],
    ["nome vazio", (d) => { (d.character as { name: string }).name = "  "; }, "character.name"],
    ["nome com caractere de controle", (d) => { (d.character as { name: string }).name = "a\u0000b"; }, "character.name"],
    ["cor inválida", (d) => { (d.character as { spec: CharacterSpec }).spec.colors.skin = "red"; }, "colors.skin"],
    ["cor faltando", (d) => { delete (d.character as { spec: { colors: Partial<CharacterSpec["colors"]> } }).spec.colors.hair; }, "colors.hair"],
    ["proporção fora da faixa", (d) => { (d.character as { spec: CharacterSpec }).spec.proportions.heightM = 3; }, "heightM"],
    ["proporção como texto", (d) => { (d.character as { spec: { proportions: { width: unknown } } }).spec.proportions.width = "1"; }, "width"],
    ["origem malformada", (d) => { (d.character as { origin: unknown }).origin = { presetId: 3 }; }, "origin"],
  ];
  it.each(rejects)("recusa %s com mensagem clara", (_label, mutate, message) => {
    const draft = JSON.parse(JSON.stringify(sheet())) as Record<string, unknown>;
    mutate(draft);
    const parsed = parseSheet(JSON.stringify(draft));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(" ")).toContain(message);
  });

  it("recusa lixo, lista e arquivo enorme", () => {
    expect(parseSheet("não é json").ok).toBe(false);
    expect(parseSheet("[]").ok).toBe(false);
    expect(parseSheet("null").ok).toBe(false);
    expect(parseSheet(" ".repeat(70 * 1024)).ok).toBe(false);
  });

  it("avisa sobre campos desconhecidos", () => {
    const parsed = parseSheet(JSON.stringify({ ...sheet(), futuro: true }));
    expect(parsed.ok && parsed.warnings[0]).toContain("futuro");
  });

  it("nome de arquivo seguro", () => {
    expect(sheetFileName("Ana Clará / 2")).toBe("ana-clara-2.personagem");
    expect(sheetFileName("///")).toBe("personagem.personagem");
  });
});
