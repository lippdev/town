import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { FileUp } from "lucide-react";
import { parseSheet, SHEET_MAX_BYTES, type ParsedSheet } from "@/character-studio/model/sheet";

type ParsedOk = Extract<ParsedSheet, { ok: true }>;

function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return ref;
}

/** Colar ou escolher arquivo passam pela mesma validação; nada entra sem ela. */
export function ImportDialog({ open, onClose, onImported }: {
  open: boolean;
  onClose: () => void;
  onImported: (sheet: ParsedOk) => void;
}) {
  const ref = useDialog(open);
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const close = () => {
    setText("");
    setErrors([]);
    onClose();
  };

  const consume = (content: string) => {
    const parsed = parseSheet(content);
    if (parsed.ok) {
      setText("");
      setErrors([]);
      onImported(parsed);
    } else {
      setErrors(parsed.errors);
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > SHEET_MAX_BYTES) {
      setErrors(["Arquivo grande demais para uma ficha (limite de 64 KB)."]);
      return;
    }
    try {
      consume(await file.text());
    } catch {
      setErrors(["Não consegui ler o arquivo."]);
    }
  };

  return (
    <dialog ref={ref} className="cs-dialog" aria-labelledby="cs-import-title" onClose={close}>
      <form method="dialog" onSubmit={(event) => { event.preventDefault(); consume(text); }}>
        <h2 id="cs-import-title">Importar ficha</h2>
        <p className="cs-hint">Vira uma variação nova; nada é sobrescrito. Serve para a ficha exportada aqui ou para a que o agente responder no chat.</p>
        <label className="cs-field-label" htmlFor="cs-import-text">Cole a ficha</label>
        <textarea
          id="cs-import-text"
          rows={9}
          spellCheck={false}
          value={text}
          aria-invalid={errors.length > 0}
          aria-describedby={errors.length ? "cs-import-errors" : undefined}
          onChange={(event) => setText(event.target.value)}
        />
        {errors.length > 0 && (
          <ul id="cs-import-errors" className="cs-errors" role="alert">
            {errors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}
            {errors.length > 8 && <li>E mais {errors.length - 8} problema(s).</li>}
          </ul>
        )}
        <div className="cs-dialog__actions">
          <label className="cs-button cs-button--file">
            <FileUp size={15} aria-hidden="true" /> Escolher arquivo
            <input type="file" accept=".json,application/json" onChange={onFile} data-testid="cs-import-file" />
          </label>
          <span className="cs-spacer" />
          <button type="button" className="cs-button" onClick={close}>Cancelar</button>
          <button type="submit" className="cs-button cs-button--primary" disabled={!text.trim()}>Importar</button>
        </div>
      </form>
    </dialog>
  );
}

/** Quando a área de transferência é negada, o texto fica à mão para copiar. */
export function ManualCopyDialog({ text, onClose }: { text: string | null; onClose: () => void }) {
  const ref = useDialog(text !== null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (text !== null) area.current?.select();
  }, [text]);
  return (
    <dialog ref={ref} className="cs-dialog" aria-labelledby="cs-copy-title" onClose={onClose}>
      <h2 id="cs-copy-title">Copie o pedido</h2>
      <p className="cs-hint">O navegador não liberou a área de transferência. O texto já está selecionado: use ⌘C.</p>
      <textarea ref={area} rows={12} readOnly spellCheck={false} value={text ?? ""} aria-label="Pedido e ficha" />
      <div className="cs-dialog__actions">
        <span className="cs-spacer" />
        <button type="button" className="cs-button cs-button--primary" onClick={onClose}>Fechar</button>
      </div>
    </dialog>
  );
}
