import {
  cloneSpec,
  NOTES_MAX,
  parseSpec,
  validateName,
  type CharacterSpec,
  type ColorSlot,
  type ProportionKey,
} from "@/character-studio/model/schema";
import {
  BASE_PRESET_ID,
  presetById,
  presetFingerprint,
  type CharacterPreset,
} from "@/character-studio/model/presets";

/** De qual preset, e de qual conteúdo dele, esta variação nasceu. */
export interface VariantOrigin {
  presetId: string;
  revision: number;
  fingerprint: string;
}

export interface Variant {
  id: string;
  name: string;
  origin: VariantOrigin | null;
  spec: CharacterSpec;
  notes: string;
  updatedAt: string;
}

export interface StudioDoc {
  variants: Variant[];
  /** Id de um preset (leitura) ou de uma variação (edição). */
  selectedId: string;
}

export interface StudioState {
  past: StudioDoc[];
  present: StudioDoc;
  future: StudioDoc[];
  /** Edições seguidas do mesmo controle viram um só passo de desfazer. */
  lastEdit: { key: string; at: number } | null;
}

export const HISTORY_LIMIT = 100;
const COALESCE_MS = 700;

export type StudioEdit =
  | { kind: "color"; slot: ColorSlot; value: string }
  | { kind: "proportion"; key: ProportionKey; value: number }
  | { kind: "glasses"; value: boolean }
  | { kind: "notes"; value: string };

/** Ids e horário vêm na ação: o reducer continua puro no StrictMode. */
interface Stamp {
  newId: string;
  at: number;
}

export type StudioAction =
  | { type: "select"; id: string }
  | ({ type: "edit"; edit: StudioEdit } & Stamp)
  | ({ type: "create" } & Stamp)
  | ({ type: "duplicate" } & Stamp)
  | ({ type: "import"; name: string; spec: CharacterSpec; notes: string; origin: VariantOrigin | null } & Stamp)
  | { type: "rename"; name: string; at: number }
  | { type: "remove"; at: number }
  | { type: "restoreOrigin"; at: number }
  | { type: "keepRevision"; at: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "hydrate"; doc: StudioDoc };

export function initialState(doc: StudioDoc): StudioState {
  return { past: [], present: doc, future: [], lastEdit: null };
}

export function emptyDoc(): StudioDoc {
  return { variants: [], selectedId: BASE_PRESET_ID };
}

export function originOf(preset: CharacterPreset): VariantOrigin {
  return { presetId: preset.id, revision: preset.revision, fingerprint: presetFingerprint(preset) };
}

/** O que está selecionado, seja preset ou variação; seleção órfã cai na base. */
export function resolveSelection(doc: StudioDoc): { preset?: CharacterPreset; variant?: Variant; spec: CharacterSpec; name: string; notes: string } {
  const variant = doc.variants.find((candidate) => candidate.id === doc.selectedId);
  if (variant) return { variant, spec: variant.spec, name: variant.name, notes: variant.notes };
  const preset = presetById(doc.selectedId) ?? presetById(BASE_PRESET_ID)!;
  return { preset, spec: preset.spec, name: preset.name, notes: "" };
}

export type OriginDrift =
  | { status: "none" }
  | { status: "current"; preset: CharacterPreset }
  | { status: "revised"; preset: CharacterPreset; fromRevision: number }
  | { status: "removed"; presetId: string };

/** Compara o que a variação guardou com o que o arquivo-fonte diz agora. */
export function originDrift(variant: Variant): OriginDrift {
  if (!variant.origin) return { status: "none" };
  const preset = presetById(variant.origin.presetId);
  if (!preset) return { status: "removed", presetId: variant.origin.presetId };
  if (presetFingerprint(preset) === variant.origin.fingerprint) return { status: "current", preset };
  return { status: "revised", preset, fromRevision: variant.origin.revision };
}

export function uniqueName(wanted: string, doc: StudioDoc): string {
  const taken = new Set(doc.variants.map((variant) => variant.name.toLowerCase()));
  const clip = (text: string, suffix: string) => text.slice(0, 60 - suffix.length).trimEnd() + suffix;
  if (!taken.has(wanted.toLowerCase())) return wanted;
  for (let index = 2; ; index += 1) {
    const candidate = clip(wanted, ` ${index}`);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

function commit(state: StudioState, present: StudioDoc, editKey: string | null, at: number | null): StudioState {
  const merges = editKey !== null && at !== null && state.lastEdit?.key === editKey && at - state.lastEdit.at < COALESCE_MS;
  return {
    past: merges ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT),
    present,
    future: [],
    lastEdit: editKey !== null && at !== null ? { key: editKey, at } : null,
  };
}

function applyEdit(spec: CharacterSpec, edit: StudioEdit): CharacterSpec {
  const next = cloneSpec(spec);
  if (edit.kind === "color") next.colors[edit.slot] = edit.value;
  if (edit.kind === "proportion") next.proportions[edit.key] = edit.value;
  if (edit.kind === "glasses") next.accessories.glasses = edit.value;
  return next;
}

function replaceVariant(doc: StudioDoc, variant: Variant): StudioDoc {
  return { ...doc, variants: doc.variants.map((item) => (item.id === variant.id ? variant : item)) };
}

function newVariant(doc: StudioDoc, source: { name: string; spec: CharacterSpec; notes: string; origin: VariantOrigin | null }, stamp: Stamp): StudioDoc {
  const variant: Variant = {
    id: stamp.newId,
    name: uniqueName(source.name, doc),
    origin: source.origin,
    spec: cloneSpec(source.spec),
    notes: source.notes,
    updatedAt: new Date(stamp.at).toISOString(),
  };
  return { variants: [...doc.variants, variant], selectedId: variant.id };
}

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  const doc = state.present;
  const { preset, variant } = resolveSelection(doc);

  switch (action.type) {
    case "select":
      if (action.id === doc.selectedId) return state;
      return { ...state, present: { ...doc, selectedId: action.id }, lastEdit: null };

    case "edit": {
      const editKey = `${action.edit.kind}:${"slot" in action.edit ? action.edit.slot : "key" in action.edit ? action.edit.key : ""}`;
      const stampIso = new Date(action.at).toISOString();
      if (variant) {
        const notes = action.edit.kind === "notes" ? action.edit.value.slice(0, NOTES_MAX) : variant.notes;
        const next = { ...variant, spec: applyEdit(variant.spec, action.edit), notes, updatedAt: stampIso };
        return commit(state, replaceVariant(doc, next), `${variant.id}:${editKey}`, action.at);
      }
      // Preset é só leitura: a primeira edição abre uma cópia e o preset fica intacto.
      const source = preset!;
      const created = newVariant(
        doc,
        {
          name: `${source.name.replace(/\s*\(base\)$/, "")} — variação`,
          spec: applyEdit(source.spec, action.edit),
          notes: action.edit.kind === "notes" ? action.edit.value.slice(0, NOTES_MAX) : "",
          origin: originOf(source),
        },
        action,
      );
      return commit(state, created, `${action.newId}:${editKey}`, action.at);
    }

    case "create": {
      const base = presetById(BASE_PRESET_ID)!;
      return commit(state, newVariant(doc, { name: "Novo personagem", spec: base.spec, notes: "", origin: originOf(base) }, action), null, null);
    }

    case "duplicate": {
      if (variant) {
        return commit(state, newVariant(doc, { name: `${variant.name} — cópia`, spec: variant.spec, notes: variant.notes, origin: variant.origin }, action), null, null);
      }
      const source = preset!;
      return commit(state, newVariant(doc, { name: `${source.name.replace(/\s*\(base\)$/, "")} — variação`, spec: source.spec, notes: "", origin: originOf(source) }, action), null, null);
    }

    case "import":
      return commit(state, newVariant(doc, { name: action.name, spec: action.spec, notes: action.notes, origin: action.origin }, action), null, null);

    case "rename": {
      const name = validateName(action.name);
      if (!variant || !name || name === variant.name) return state;
      return commit(state, replaceVariant(doc, { ...variant, name, updatedAt: new Date(action.at).toISOString() }), null, null);
    }

    case "remove": {
      if (!variant) return state;
      const index = doc.variants.indexOf(variant);
      const variants = doc.variants.filter((item) => item !== variant);
      const neighbor = variants[Math.min(index, variants.length - 1)];
      const selectedId = neighbor?.id ?? variant.origin?.presetId ?? BASE_PRESET_ID;
      return commit(state, { variants, selectedId: neighbor || presetById(selectedId) ? selectedId : BASE_PRESET_ID }, null, null);
    }

    case "restoreOrigin": {
      if (!variant) return state;
      // Sempre o conteúdo atual da fonte, nunca uma cópia antiga guardada no navegador.
      const source = presetById(variant.origin?.presetId) ?? presetById(BASE_PRESET_ID)!;
      return commit(state, replaceVariant(doc, { ...variant, spec: cloneSpec(source.spec), origin: originOf(source), updatedAt: new Date(action.at).toISOString() }), null, null);
    }

    case "keepRevision": {
      if (!variant?.origin) return state;
      const source = presetById(variant.origin.presetId);
      if (!source) return state;
      return commit(state, replaceVariant(doc, { ...variant, origin: originOf(source) }), null, null);
    }

    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future], lastEdit: null };
    }

    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return { past: [...state.past, state.present], present: next, future: state.future.slice(1), lastEdit: null };
    }

    case "hydrate":
      return initialState(action.doc);
  }
}

/** Para testes e para a ficha: uma variação vinda de fora passa pela mesma régua. */
export function parseVariant(input: unknown, path: string): { variant: Variant | null; errors: string[] } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { variant: null, errors: [`${path}: esperava um objeto`] };
  }
  const raw = input as Record<string, unknown>;
  const errors: string[] = [];
  const name = validateName(raw.name);
  if (!name) errors.push(`${path}.name: nome inválido`);
  if (typeof raw.id !== "string" || !raw.id || raw.id.length > 80) errors.push(`${path}.id: id inválido`);
  if (typeof raw.id === "string" && presetById(raw.id)) errors.push(`${path}.id: colide com um preset da fonte`);
  const { spec, errors: specErrors } = parseSpec(raw.spec, `${path}.spec`);
  errors.push(...specErrors);
  const origin = parseOrigin(raw.origin, `${path}.origin`, errors);
  const notes = typeof raw.notes === "string" ? raw.notes.slice(0, NOTES_MAX) : "";
  const updatedAt = typeof raw.updatedAt === "string" && !Number.isNaN(Date.parse(raw.updatedAt)) ? raw.updatedAt : new Date(0).toISOString();
  if (errors.length || !spec || !name) return { variant: null, errors };
  return { variant: { id: raw.id as string, name, origin, spec, notes, updatedAt }, errors };
}

export function parseOrigin(input: unknown, path: string, errors: string[]): VariantOrigin | null {
  if (input === null || input === undefined) return null;
  const raw = input as Partial<VariantOrigin>;
  if (
    typeof input !== "object" ||
    typeof raw.presetId !== "string" ||
    raw.presetId.length > 80 ||
    typeof raw.revision !== "number" ||
    !Number.isInteger(raw.revision) ||
    typeof raw.fingerprint !== "string" ||
    !/^[0-9a-f]{8}$/.test(raw.fingerprint)
  ) {
    errors.push(`${path}: origem inválida`);
    return null;
  }
  return { presetId: raw.presetId, revision: raw.revision, fingerprint: raw.fingerprint };
}

