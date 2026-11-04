import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { loadStudio, saveStudio, serializeStudio, STORAGE_KEY, type StorageLike } from "@/character-studio/model/persistence";
import type { CharacterSpec } from "@/character-studio/model/schema";
import { initialState, resolveSelection, studioReducer, type StudioEdit, type VariantOrigin } from "@/character-studio/model/studio";

const SAVE_DELAY_MS = 200;

export interface ImportedCharacter {
  name: string;
  notes: string;
  spec: CharacterSpec;
  origin: VariantOrigin | null;
}

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function newId(): string {
  return `v-${crypto.randomUUID()}`;
}

/** Estado do estúdio mais o salvamento local. Aviso de falha fica visível, nunca só no console. */
export function useStudio() {
  const storage = useRef(browserStorage());
  const [loaded, setLoaded] = useState(() => loadStudio(storage.current));
  const [state, dispatch] = useReducer(studioReducer, loaded.doc, initialState);
  const [saveFailed, setSaveFailed] = useState(false);
  const lastSaved = useRef(loaded.writable ? serializeStudio(loaded.doc) : "");
  const writable = useRef(loaded.writable);
  const latest = useRef(state.present);
  latest.current = state.present;

  const flush = useCallback(() => {
    if (!writable.current) return;
    const serialized = serializeStudio(latest.current);
    if (serialized === lastSaved.current) return;
    const { ok } = saveStudio(storage.current, latest.current);
    setSaveFailed(!ok);
    if (ok) lastSaved.current = serialized;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(flush, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state.present, flush]);

  // Fechar ou recarregar logo depois de editar não pode perder a última mudança.
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [flush]);

  // Outra aba salvou: adota o que está em disco em vez de sobrescrever depois.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || event.newValue === null || event.newValue === lastSaved.current) return;
      const next = loadStudio(storage.current);
      writable.current = next.writable;
      setLoaded(next);
      // Uma versão que não entendemos bloqueia também o timer já agendado.
      // Mantém a figura atual para o usuário ainda poder exportá-la.
      if (!next.writable) return;
      lastSaved.current = serializeStudio(next.doc);
      dispatch({ type: "hydrate", doc: next.doc });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const selection = useMemo(() => resolveSelection(state.present), [state.present]);

  const stamp = () => ({ newId: newId(), at: Date.now() });

  const actions = useMemo(() => ({
    select: (id: string) => dispatch({ type: "select", id }),
    edit: (edit: StudioEdit) => dispatch({ type: "edit", edit, ...stamp() }),
    create: () => dispatch({ type: "create", ...stamp() }),
    duplicate: () => dispatch({ type: "duplicate", ...stamp() }),
    rename: (name: string) => dispatch({ type: "rename", name, at: Date.now() }),
    remove: () => dispatch({ type: "remove", at: Date.now() }),
    restoreOrigin: () => dispatch({ type: "restoreOrigin", at: Date.now() }),
    keepRevision: () => dispatch({ type: "keepRevision", at: Date.now() }),
    importCharacter: (character: ImportedCharacter) => dispatch({ type: "import", ...character, ...stamp() }),
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
  }), []);

  return {
    doc: state.present,
    selection,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    actions,
    loadWarnings: loaded.warnings,
    dismissWarnings: () => setLoaded((current) => ({ ...current, warnings: [] })),
    saveFailed,
    persistent: loaded.writable,
  };
}
