import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redo2, Undo2, X } from "lucide-react";
import { chatRequestText, sheetFileName, sheetFromPreset, sheetFromVariant, type CharacterSheet } from "@/character-studio/model/sheet";
import { CastRail } from "@/character-studio/panels/CastRail";
import { ControlPanel } from "@/character-studio/panels/ControlPanel";
import { ImportDialog, ManualCopyDialog } from "@/character-studio/panels/SheetDialogs";
import { useStudio } from "@/character-studio/useStudio";
import type { FigurePose } from "@/character-studio/viewport/figureRig";
import type { SceneApi } from "@/character-studio/viewport/StudioScene";
import { detectWebGL, StudioViewport } from "@/character-studio/viewport/StudioViewport";

interface Notice {
  text: string;
  undo?: boolean;
}

const QA_ENABLED = import.meta.env.DEV || new URLSearchParams(window.location.search).has("qa");

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  // O navegador precisa da URL viva até iniciar o download.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function StudioApp() {
  const studio = useStudio();
  const { actions, selection, doc } = studio;
  const scene = useRef<SceneApi | null>(null);
  const [webgl] = useState(detectWebGL);
  const [pose, setPose] = useState<FigurePose>("standing");
  const [motion, setMotion] = useState(false);
  const [importing, setImporting] = useState(false);
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const warnings = studio.loadWarnings;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.undo ? 9000 : 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const buildSheet = useCallback((): CharacterSheet => {
    const now = new Date();
    return selection.variant ? sheetFromVariant(selection.variant, now) : sheetFromPreset(selection.preset!, now);
  }, [selection]);

  const copyRequest = async () => {
    const text = chatRequestText(buildSheet());
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ text: "Pedido e ficha copiados. Cole no chat com o agente." });
    } catch {
      setManualCopy(text);
    }
  };

  const exportSheet = () => {
    const sheet = buildSheet();
    download(new Blob([JSON.stringify(sheet, null, 2)], { type: "application/json" }), `${sheetFileName(sheet.character.name)}.json`);
    setNotice({ text: "Ficha exportada." });
  };

  const exportPng = async () => {
    if (!scene.current) return;
    try {
      const blob = await scene.current.capture();
      download(blob, `${sheetFileName(selection.name).replace(/\.personagem$/, "")}.png`);
      setNotice({ text: "Prévia exportada, com fundo transparente." });
    } catch {
      setNotice({ text: "Não consegui gerar o PNG." });
    }
  };

  // ⌘Z fora dos campos de texto: dentro deles, quem desfaz é o próprio campo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement;
      const isText = target.tagName === "TEXTAREA" || (target.tagName === "INPUT" && (target as HTMLInputElement).type === "text");
      if (isText) return;
      event.preventDefault();
      if (event.shiftKey) actions.redo();
      else actions.undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions]);

  useEffect(() => {
    if (!QA_ENABLED) return;
    const bridge = {
      snapshot: () => scene.current?.snapshot() ?? null,
      frames: () => scene.current?.frames() ?? -1,
      pixelRatio: () => scene.current?.pixelRatio() ?? -1,
      capture: () => scene.current?.captureDataUrl() ?? null,
      loseContext: () => scene.current?.loseContextForQa() ?? null,
    };
    (window as unknown as { __CHARACTER_STUDIO_QA__?: typeof bridge }).__CHARACTER_STUDIO_QA__ = bridge;
    return () => {
      delete (window as unknown as { __CHARACTER_STUDIO_QA__?: typeof bridge }).__CHARACTER_STUDIO_QA__;
    };
  }, []);

  const statusLine = useMemo(() => {
    if (!studio.persistent) return "Sem salvamento local nesta aba.";
    if (studio.saveFailed) return "Não consegui salvar: exporte a ficha para não perder.";
    return "Salvo neste navegador.";
  }, [studio.persistent, studio.saveFailed]);

  return (
    <div className="cs-app">
      <CastRail
        variants={doc.variants}
        selectedId={selection.variant?.id ?? selection.preset!.id}
        onSelect={actions.select}
        onCreate={actions.create}
        onImport={() => setImporting(true)}
      />

      <main className="cs-main">
        <StudioViewport
          spec={selection.spec}
          name={selection.name}
          pose={pose}
          motion={motion}
          onPose={setPose}
          onMotion={setMotion}
          apiRef={scene}
          webgl={webgl}
        />
        <div className="cs-topbar">
          <span className={studio.saveFailed || !studio.persistent ? "cs-save cs-save--warn" : "cs-save"} role="status">{statusLine}</span>
          <button type="button" className="cs-tool cs-tool--icon" aria-label="Desfazer" title="Desfazer (⌘Z)" disabled={!studio.canUndo} onClick={actions.undo}>
            <Undo2 size={16} aria-hidden="true" />
          </button>
          <button type="button" className="cs-tool cs-tool--icon" aria-label="Refazer" title="Refazer (⇧⌘Z)" disabled={!studio.canRedo} onClick={actions.redo}>
            <Redo2 size={16} aria-hidden="true" />
          </button>
        </div>
        {warnings.length > 0 && (
          <div className="cs-banner" role="alert">
            <div>{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
            <button type="button" className="cs-icon" aria-label="Dispensar aviso" onClick={studio.dismissWarnings}><X size={14} aria-hidden="true" /></button>
          </div>
        )}
        <div className="cs-toast-slot" aria-live="polite">
          {notice && (
            <div className="cs-toast">
              <span>{notice.text}</span>
              {notice.undo && (
                <button
                  type="button"
                  className="cs-toast__action"
                  onClick={() => {
                    actions.undo();
                    setNotice(null);
                  }}
                >
                  Desfazer
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      <ControlPanel
        name={selection.name}
        spec={selection.spec}
        notes={selection.notes}
        preset={selection.preset}
        variant={selection.variant}
        onEdit={actions.edit}
        onRename={actions.rename}
        onDuplicate={actions.duplicate}
        onRemove={() => {
          actions.remove();
          setNotice({ text: `“${selection.name}” excluída.`, undo: true });
        }}
        onRestore={() => {
          actions.restoreOrigin();
          setNotice({ text: "Valores da origem restaurados.", undo: true });
        }}
        onKeepRevision={actions.keepRevision}
        onCopyRequest={() => void copyRequest()}
        onExportSheet={exportSheet}
        onExportPng={() => void exportPng()}
        canExportPng={webgl}
      />

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        onImported={(sheet) => {
          actions.importCharacter({ name: sheet.name, notes: sheet.notes, spec: sheet.spec, origin: sheet.origin });
          setImporting(false);
          setNotice({ text: sheet.warnings.length ? `Ficha importada. ${sheet.warnings.join(" ")}` : `“${sheet.name}” importada como variação nova.`, undo: true });
        }}
      />
      <ManualCopyDialog text={manualCopy} onClose={() => setManualCopy(null)} />
    </div>
  );
}
