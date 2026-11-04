import { useState } from "react";
import { ClipboardCopy, Copy, Download, Image, RefreshCw, Trash2 } from "lucide-react";
import { PALETTES } from "@/character-studio/model/presets";
import { ACCESSORY_LABEL, COLOR_SLOTS, NAME_MAX, NOTES_MAX, PROPORTION_KEYS, validateName, type CharacterSpec } from "@/character-studio/model/schema";
import { BASE_MODEL } from "@/character-studio/model/sheet";
import { originDrift, type StudioEdit, type Variant } from "@/character-studio/model/studio";
import type { CharacterPreset } from "@/character-studio/model/presets";
import { ColorRow, ProportionRow } from "@/character-studio/panels/Controls";

function NameField({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const invalid = validateName(draft) === null;
  return (
    <input
      id="cs-name"
      className="cs-name"
      type="text"
      value={draft}
      maxLength={NAME_MAX}
      aria-label="Nome do personagem"
      aria-invalid={invalid}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (validateName(draft)) onCommit(draft);
        else setDraft(value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setDraft(value);
      }}
    />
  );
}

function OriginNotice({ variant, onRestore, onKeep }: { variant: Variant; onRestore: () => void; onKeep: () => void }) {
  const drift = originDrift(variant);
  if (drift.status === "revised") {
    return (
      <div className="cs-notice" role="status">
        <p><strong>{drift.preset.name}</strong> mudou na fonte (revisão {drift.fromRevision} → {drift.preset.revision}). {drift.preset.changelog}</p>
        <div className="cs-notice__actions">
          <button type="button" className="cs-button cs-button--small" onClick={onRestore}>Usar a revisão</button>
          <button type="button" className="cs-button cs-button--small" onClick={onKeep}>Manter a minha</button>
        </div>
      </div>
    );
  }
  if (drift.status === "removed") {
    return <div className="cs-notice" role="status"><p>O modelo de origem “{drift.presetId}” saiu da fonte. Esta variação segue intacta; restaurar volta ao Pulse.</p></div>;
  }
  return null;
}

export function ControlPanel(props: {
  name: string;
  spec: CharacterSpec;
  notes: string;
  preset?: CharacterPreset;
  variant?: Variant;
  onEdit: (edit: StudioEdit) => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onRestore: () => void;
  onKeepRevision: () => void;
  onCopyRequest: () => void;
  onExportSheet: () => void;
  onExportPng: () => void;
  canExportPng: boolean;
}) {
  const { spec, preset, variant, onEdit } = props;
  const origin = variant?.origin ? originDrift(variant) : null;
  const originName = origin && "preset" in origin ? origin.preset.name : null;

  return (
    <aside className="cs-panel" aria-label="Controles do personagem">
      <header className="cs-panel__head">
        {variant ? (
          <NameField value={props.name} onCommit={props.onRename} />
        ) : (
          <h2 className="cs-name cs-name--static">{props.name}</h2>
        )}
        <p className="cs-subtitle">
          {preset && "Modelo da fonte. Ao editar, uma variação é criada e o modelo fica intacto."}
          {variant && (originName ? `Variação de ${originName}.` : "Variação.")}
        </p>
        <div className="cs-panel__actions">
          <button type="button" className="cs-button cs-button--small" onClick={props.onDuplicate}>
            <Copy size={14} aria-hidden="true" /> {preset ? "Criar variação" : "Duplicar"}
          </button>
          {variant && (
            <>
              <button type="button" className="cs-button cs-button--small" onClick={props.onRestore}>
                <RefreshCw size={14} aria-hidden="true" /> Restaurar origem
              </button>
              <button type="button" className="cs-button cs-button--small cs-button--danger" onClick={props.onRemove}>
                <Trash2 size={14} aria-hidden="true" /> Excluir
              </button>
            </>
          )}
        </div>
        {variant && <OriginNotice variant={variant} onRestore={props.onRestore} onKeep={props.onKeepRevision} />}
      </header>

      <div className="cs-panel__scroll">
        <section className="cs-section" aria-labelledby="cs-colors">
          <h3 id="cs-colors" className="cs-eyebrow">Cores</h3>
          <div className="cs-colors">
            {COLOR_SLOTS.map((slot) => (
              <ColorRow
                key={slot}
                slot={slot}
                value={spec.colors[slot]}
                palette={PALETTES[slot]}
                onChange={(value) => onEdit({ kind: "color", slot, value })}
              />
            ))}
          </div>
        </section>

        <section className="cs-section" aria-labelledby="cs-proportions">
          <h3 id="cs-proportions" className="cs-eyebrow">Proporções</h3>
          {PROPORTION_KEYS.map((key) => (
            <ProportionRow key={key} propKey={key} value={spec.proportions[key]} onChange={(value) => onEdit({ kind: "proportion", key, value })} />
          ))}
        </section>

        <section className="cs-section" aria-labelledby="cs-accessories">
          <h3 id="cs-accessories" className="cs-eyebrow">Acessórios</h3>
          <label className="cs-check">
            <input type="checkbox" checked={spec.accessories.glasses} onChange={(event) => onEdit({ kind: "glasses", value: event.target.checked })} />
            {ACCESSORY_LABEL.glasses}
          </label>
          <p className="cs-hint">Cabelo e roupa fazem parte da malha do modelo: dá para mudar a cor, não o corte. Formas novas pedem outro modelo.</p>
        </section>

        <section className="cs-section" aria-labelledby="cs-chat">
          <h3 id="cs-chat" className="cs-eyebrow">Continuar no chat</h3>
          <p className="cs-hint cs-hint--body">
            Pedidos livres são feitos no chat com o agente. Esta página não interpreta texto nem chama IA: copie a ficha com seu pedido (botão abaixo), e o agente responde com um modelo novo aqui ou uma ficha para importar.
          </p>
          <label className="cs-field-label" htmlFor="cs-notes">Notas e pedido</label>
          <textarea
            id="cs-notes"
            rows={3}
            maxLength={NOTES_MAX}
            placeholder="Ex.: mais velho, camisa social, olhar sério"
            value={props.notes}
            onChange={(event) => onEdit({ kind: "notes", value: event.target.value })}
          />
        </section>

        <footer className="cs-credits">
          <p>
            Base: <strong>{BASE_MODEL.asset}</strong>, de {BASE_MODEL.author}, {BASE_MODEL.license}. Cabeça reduzida e materiais refeitos neste projeto.
          </p>
          <p>
            <a href={BASE_MODEL.credits} target="_blank" rel="noreferrer">Créditos</a>
            {" · "}
            <a href={BASE_MODEL.provenance} target="_blank" rel="noreferrer">Proveniência</a>
            {" · "}
            <a href={BASE_MODEL.source} target="_blank" rel="noreferrer">Pack original</a>
          </p>
        </footer>
      </div>

      <footer className="cs-panel__foot">
        <button type="button" className="cs-button cs-button--primary" onClick={props.onCopyRequest}>
          <ClipboardCopy size={15} aria-hidden="true" /> Copiar pedido e ficha
        </button>
        <button type="button" className="cs-button" onClick={props.onExportSheet} title="Baixar a ficha em JSON">
          <Download size={15} aria-hidden="true" /> JSON
        </button>
        <button type="button" className="cs-button" disabled={!props.canExportPng} onClick={props.onExportPng} title="Baixar a prévia, com fundo transparente">
          <Image size={15} aria-hidden="true" /> PNG
        </button>
      </footer>
    </aside>
  );
}
