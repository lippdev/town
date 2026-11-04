import { Plus, Upload } from "lucide-react";
import { PRESETS } from "@/character-studio/model/presets";
import type { CharacterSpec } from "@/character-studio/model/schema";
import type { Variant } from "@/character-studio/model/studio";
import { originDrift } from "@/character-studio/model/studio";

function Swatches({ spec }: { spec: CharacterSpec }) {
  return (
    <span className="cs-dots" aria-hidden="true">
      <span style={{ background: spec.colors.hair }} />
      <span style={{ background: spec.colors.skin }} />
      <span style={{ background: spec.colors.shirt }} />
    </span>
  );
}

function CastItem({ name, meta, spec, selected, flagged, onSelect }: {
  name: string;
  meta: string;
  spec: CharacterSpec;
  selected: boolean;
  flagged?: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button type="button" className="cs-cast__item" aria-current={selected ? "true" : undefined} onClick={onSelect}>
        <Swatches spec={spec} />
        <span className="cs-cast__text">
          <span className="cs-cast__name">{name}</span>
          <span className="cs-cast__meta">{meta}</span>
        </span>
        {flagged && <span className="cs-flag" title="O modelo de origem mudou na fonte" aria-label="Origem revisada" />}
      </button>
    </li>
  );
}

export function CastRail({ variants, selectedId, onSelect, onCreate, onImport }: {
  variants: Variant[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
}) {
  return (
    <nav className="cs-rail" aria-label="Personagens">
      <header className="cs-brand">
        <span className="cs-brand__mark">Lipp HQ</span>
        <h1>Estúdio de personagens</h1>
      </header>

      <div className="cs-rail__scroll">
        <section aria-labelledby="cs-presets">
          <h2 id="cs-presets" className="cs-eyebrow">Modelos</h2>
          <ul className="cs-cast">
            {PRESETS.map((preset) => (
              <CastItem
                key={preset.id}
                name={preset.name}
                meta={`Revisão ${preset.revision}`}
                spec={preset.spec}
                selected={selectedId === preset.id}
                onSelect={() => onSelect(preset.id)}
              />
            ))}
          </ul>
        </section>

        <section aria-labelledby="cs-variants">
          <h2 id="cs-variants" className="cs-eyebrow">Minhas variações <span className="cs-count">{variants.length}</span></h2>
          {variants.length === 0 ? (
            <p className="cs-empty">Nenhuma ainda. Mexa em qualquer controle de um modelo para criar a primeira.</p>
          ) : (
            <ul className="cs-cast">
              {variants.map((variant) => (
                <CastItem
                  key={variant.id}
                  name={variant.name}
                  meta={variant.spec.proportions.heightM.toFixed(2).replace(".", ",") + " m"}
                  spec={variant.spec}
                  selected={selectedId === variant.id}
                  flagged={originDrift(variant).status === "revised"}
                  onSelect={() => onSelect(variant.id)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="cs-rail__actions">
        <button type="button" className="cs-button" onClick={onCreate}><Plus size={15} aria-hidden="true" /> Novo</button>
        <button type="button" className="cs-button" onClick={onImport}><Upload size={15} aria-hidden="true" /> Importar</button>
      </footer>
    </nav>
  );
}
