import { parsePreset, type HumanPreset } from "./preset";

export const AVATAR_STORAGE_KEY = "hq.avatares.v1";
/** Cópia do que não deu para ler; nunca sobrescrevemos dado do Filipe sem guardar. */
export const AVATAR_BACKUP_KEY = "hq.avatares.backup";
const SCHEMA = 1;

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export interface AvatarDoc {
  presets: HumanPreset[];
  selectedId: string | null;
}

export interface LoadResult {
  doc: AvatarDoc;
  warnings: string[];
  /** Falso quando o dado é de uma versão futura: salvar por cima destruiria o que não entendemos. */
  writable: boolean;
}

const empty = (): AvatarDoc => ({ presets: [], selectedId: null });

function backup(storage: StorageLike, raw: string, message: string): Pick<LoadResult, "warnings" | "writable"> {
  try {
    storage.setItem(AVATAR_BACKUP_KEY, raw);
    return { writable: true, warnings: [`${message} A cópia completa está em ${AVATAR_BACKUP_KEY}.`] };
  } catch {
    return { writable: false, warnings: [`${message} Não consegui guardar uma cópia, então nada será gravado por cima.`] };
  }
}

export function loadAvatars(storage: StorageLike | null): LoadResult {
  if (!storage) return { doc: empty(), writable: false, warnings: ["O navegador não permite salvar aqui. As pessoas duram só até fechar a aba."] };
  let raw: string | null;
  try {
    raw = storage.getItem(AVATAR_STORAGE_KEY);
  } catch {
    return { doc: empty(), writable: false, warnings: ["Não consegui ler o armazenamento local."] };
  }
  if (raw === null) return { doc: empty(), writable: true, warnings: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { doc: empty(), ...backup(storage, raw, "O dado salvo estava corrompido. Comecei do zero.") };
  }
  const envelope = (typeof parsed === "object" && parsed !== null ? parsed : {}) as { schema?: unknown; presets?: unknown; selectedId?: unknown };
  if (typeof envelope.schema === "number" && envelope.schema > SCHEMA) {
    return { doc: empty(), writable: false, warnings: ["Estas pessoas foram salvas por uma versão mais nova do editor. Nada será gravado por cima."] };
  }
  if (envelope.schema !== SCHEMA || !Array.isArray(envelope.presets)) {
    return { doc: empty(), ...backup(storage, raw, "O dado salvo não tem o formato esperado. Comecei do zero.") };
  }

  const presets: HumanPreset[] = [];
  const seen = new Set<string>();
  const problems: string[] = [];
  envelope.presets.forEach((item, index) => {
    const result = parsePreset(item, `presets[${index}]`);
    problems.push(...result.problems);
    if (result.preset && !seen.has(result.preset.id)) {
      seen.add(result.preset.id);
      presets.push(result.preset);
    }
  });
  const selectedId = typeof envelope.selectedId === "string" && seen.has(envelope.selectedId) ? envelope.selectedId : (presets[0]?.id ?? null);
  const doc = { presets, selectedId };
  if (problems.length === 0) return { doc, writable: true, warnings: [] };
  return { doc, ...backup(storage, raw, `${problems.length} problema(s) no dado salvo foram trocados pelo padrão.`) };
}

export function saveAvatars(storage: StorageLike | null, doc: AvatarDoc): boolean {
  if (!storage) return false;
  try {
    storage.setItem(AVATAR_STORAGE_KEY, JSON.stringify({ schema: SCHEMA, presets: doc.presets, selectedId: doc.selectedId }));
    return true;
  } catch {
    return false;
  }
}

export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
