import { useId, useState } from "react";
import { RotateCcw } from "lucide-react";
import { normalizeHex, PROPORTIONS, SLOT_LABEL, type ColorSlot, type ProportionKey } from "@/character-studio/model/schema";

export function ColorRow({ slot, value, palette, onChange }: {
  slot: ColorSlot;
  value: string;
  palette?: readonly string[];
  onChange: (hex: string) => void;
}) {
  const id = useId();
  const label = SLOT_LABEL[slot];
  // O texto pode estar a meio caminho; só cor válida sai daqui.
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const invalid = normalizeHex(draft) === null;

  return (
    <div className="cs-color">
      <label className="cs-color__label" htmlFor={`${id}-hex`}>{label}</label>
      <input
        className="cs-color__well"
        type="color"
        value={value}
        aria-label={`Escolher cor: ${label}`}
        onChange={(event) => onChange(event.target.value.toLowerCase())}
      />
      <input
        id={`${id}-hex`}
        className="cs-color__hex"
        type="text"
        inputMode="text"
        spellCheck={false}
        autoComplete="off"
        maxLength={7}
        value={draft}
        aria-invalid={invalid}
        onChange={(event) => {
          setDraft(event.target.value);
          const hex = normalizeHex(event.target.value);
          if (hex && event.target.value.replace("#", "").length === 6) onChange(hex);
        }}
        onBlur={() => {
          const hex = normalizeHex(draft);
          if (hex && hex !== value) onChange(hex);
          setDraft(hex ?? value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(value);
        }}
      />
      {palette && (
        <div className="cs-color__palette" role="group" aria-label={`Amostras de ${label}`}>
          {palette.map((hex) => (
            <button
              key={hex}
              type="button"
              className="cs-chip"
              style={{ background: hex }}
              aria-label={`${label} ${hex}`}
              aria-pressed={hex === value}
              title={hex}
              onClick={() => onChange(hex)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProportionRow({ propKey, value, onChange }: {
  propKey: ProportionKey;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const range = PROPORTIONS[propKey];
  const atBase = Math.abs(value - range.base) < 1e-6;
  return (
    <div className="cs-slider">
      <div className="cs-slider__head">
        <label htmlFor={id}>{range.label}</label>
        <output htmlFor={id}>{range.format(value)}</output>
        <button
          type="button"
          className="cs-icon"
          disabled={atBase}
          aria-label={`Voltar ${range.label} ao valor da base`}
          title="Voltar ao valor da base"
          onClick={() => onChange(range.base)}
        >
          <RotateCcw size={13} aria-hidden="true" />
        </button>
      </div>
      <input
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        aria-valuetext={range.format(value)}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <p id={`${id}-hint`} className="cs-hint">{range.hint}</p>
    </div>
  );
}
