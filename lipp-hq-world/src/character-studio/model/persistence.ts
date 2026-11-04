import { presetById } from "@/character-studio/model/presets";
import { emptyDoc, parseVariant, type StudioDoc, type Variant } from "@/character-studio/model/studio";

export const STORAGE_KEY = "hq.personagens.v1";
/** Cópia do que não deu para ler; nunca sobrescrevemos dado do Filipe sem guardar. */
export const STORAGE_BACKUP_KEY = "hq.personagens.backup";
const SCHEMA = 1;

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export interface LoadResult {
  doc: StudioDoc;
  warnings: string[];
  /** Falso quando o dado é de uma versão futura: salvar por cima destruiria o que não entendemos. */
  writable: boolean;
}

function keepBackup(storage: StorageLike, raw: string) {
  try {
    storage.setItem(STORAGE_BACKUP_KEY, raw);
  } catch {
    // sem espaço para o backup: o original segue intacto até o próximo salvamento
  }
}

export function loadStudio(storage: StorageLike | null): LoadResult {
  if (!storage) {
    return { doc: emptyDoc(), writable: false, warnings: ["O navegador não permite salvar aqui. As variações duram só até fechar a aba; exporte a ficha."] };
  }
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { doc: emptyDoc(), writable: false, warnings: ["Não consegui ler o armazenamento local. Exporte a ficha antes de fechar a aba."] };
  }
  if (raw === null) return { doc: emptyDoc(), warnings: [], writable: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    keepBackup(storage, raw);
    return { doc: emptyDoc(), writable: true, warnings: [`O dado salvo estava corrompido. Comecei do zero e guardei uma cópia em ${STORAGE_BACKUP_KEY}.`] };
  }

  const envelope = (typeof parsed === "object" && parsed !== null ? parsed : {}) as { schema?: unknown; variants?: unknown; selectedId?: unknown };
  if (typeof envelope.schema === "number" && envelope.schema > SCHEMA) {
    return { doc: emptyDoc(), writable: false, warnings: ["Estas variações foram salvas por uma versão mais nova do estúdio. Nada será gravado por cima; atualize a página ou o checkout."] };
  }
  if (envelope.schema !== SCHEMA || !Array.isArray(envelope.variants)) {
    keepBackup(storage, raw);
    return { doc: emptyDoc(), writable: true, warnings: [`O dado salvo não tem o formato esperado. Comecei do zero e guardei uma cópia em ${STORAGE_BACKUP_KEY}.`] };
  }

  const variants: Variant[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  envelope.variants.forEach((item, index) => {
    const { variant } = parseVariant(item, `variants[${index}]`);
    if (variant && !seen.has(variant.id)) {
      seen.add(variant.id);
      variants.push(variant);
    } else {
      dropped += 1;
    }
  });
  const warnings: string[] = [];
  if (dropped) {
    keepBackup(storage, raw);
    warnings.push(`${dropped} variação(ões) inválida(s) ficaram de fora. A cópia completa está em ${STORAGE_BACKUP_KEY}.`);
  }
  const wanted = typeof envelope.selectedId === "string" ? envelope.selectedId : "";
  const selectedId = seen.has(wanted) || presetById(wanted) ? wanted : emptyDoc().selectedId;
  return { doc: { variants, selectedId }, warnings, writable: true };
}

/** Só variações e seleção: os presets moram no arquivo-fonte e nunca são copiados para cá. */
export function serializeStudio(doc: StudioDoc): string {
  return JSON.stringify({ schema: SCHEMA, variants: doc.variants, selectedId: doc.selectedId });
}

export function saveStudio(storage: StorageLike | null, doc: StudioDoc): { ok: boolean } {
  if (!storage) return { ok: false };
  try {
    storage.setItem(STORAGE_KEY, serializeStudio(doc));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
