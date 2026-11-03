import { useState } from "react";
import {
  ACCESSORIES,
  CHARACTER_PRESETS,
  HAIR_COLORS,
  HAIR_STYLES,
  MAX_HEIGHT,
  MIN_HEIGHT,
  PANTS_COLORS,
  SHIRT_COLORS,
  SHOE_COLORS,
  SKIN_TONES,
  resolveLook,
} from "@/world/characters/appearance";
import { useHQStore } from "@/state/useHQStore";
import { characterFor, useCharacterManifest } from "@/world/characters/characterManifest";

function Swatches({
  label,
  colors,
  value,
  onPick,
}: {
  label: string;
  colors: readonly string[];
  value: string;
  onPick: (color: string) => void;
}) {
  return (
    <div className="look-row">
      <span className="look-label">{label}</span>
      <div className="look-swatches" role="group" aria-label={label}>
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            className={value.toLowerCase() === color.toLowerCase() ? "swatch active" : "swatch"}
            style={{ background: color }}
            aria-label={`${label} ${color}`}
            aria-pressed={value.toLowerCase() === color.toLowerCase()}
            onClick={() => onPick(color)}
          />
        ))}
      </div>
    </div>
  );
}

function Chips<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: Array<{ id: T; label: string }>;
  value: T;
  onPick: (id: T) => void;
}) {
  return (
    <div className="look-row">
      <span className="look-label">{label}</span>
      <div className="look-chips" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={value === option.id ? "chip active" : "chip"}
            aria-pressed={value === option.id}
            onClick={() => onPick(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Editor de personagem por agente: presets são só ponto de partida e cada
 * peça pode ser trocada depois. A camisa começa na cor de identidade do
 * agente — sair dela é escolha explícita, para o bot não perder o rosto na cena.
 */
export function CharacterEditor({ agentId, base }: { agentId: string; base: { color: string; hairColor?: string } }) {
  const [open, setOpen] = useState(false);
  const model = characterFor(useCharacterManifest(), agentId);
  const override = useHQStore((state) => state.agentLooks[agentId]);
  const chooseAgentPreset = useHQStore((state) => state.chooseAgentPreset);
  const updateAgentLook = useHQStore((state) => state.updateAgentLook);
  const randomizeAgentLook = useHQStore((state) => state.randomizeAgentLook);
  const resetAgentLook = useHQStore((state) => state.resetAgentLook);

  const identityColor = base.color;
  const look = resolveLook(base, override);
  const presetId = override?.presetId ?? null;
  // Preset só fica marcado enquanto o look é exatamente ele: depois de mexer
  // numa peça o personagem não é mais aquele preset, e marcar a miniatura
  // diria o contrário do que a cena mostra.
  const customized = Object.keys(override ?? {}).some((key) => key !== "presetId");

  return (
    <section className="character-editor" aria-label="Editor de personagem">
      {model && (
        <p className="character-model-note">
          Este bot usa o modelo 3D <code>{model.file}</code> (public/characters). Cores e peças abaixo valem para
          a figura simples, que volta se o arquivo faltar; a altura vale para os dois.
        </p>
      )}
      <div className="appearance-head">
        <span>Personagem</span>
        <div className="editor-actions">
          <button type="button" className="chip" onClick={() => randomizeAgentLook(agentId)}>
            Aleatório
          </button>
          <button type="button" className="chip" onClick={() => resetAgentLook(agentId)}>
            Restaurar
          </button>
          <button
            type="button"
            className="chip"
            aria-expanded={open}
            aria-controls={`editor-${agentId}`}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Fechar" : "Editar"}
          </button>
        </div>
      </div>

      <div className="appearance-grid" role="listbox" aria-label="Personagens prontos">
        {CHARACTER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="option"
            aria-selected={presetId === preset.id && !customized}
            aria-label={preset.label}
            title={customized && presetId === preset.id ? `${preset.label} (com ajustes)` : preset.label}
            className={presetId === preset.id && !customized ? "preset-card active" : "preset-card"}
            onClick={() => chooseAgentPreset(agentId, preset.id)}
          >
            <span className="preset-hair" style={{ background: preset.hair }} aria-hidden />
            <span className="preset-skin" style={{ background: preset.skin }} aria-hidden />
            <span className="preset-body" style={{ background: override?.shirt ?? identityColor }} aria-hidden />
            <span className="preset-pants" style={{ background: preset.pants }} aria-hidden />
          </button>
        ))}
      </div>

      {open && (
        <div className="look-groups" id={`editor-${agentId}`}>
          <Swatches label="Pele" colors={SKIN_TONES} value={look.skin} onPick={(skin) => updateAgentLook(agentId, { skin })} />
          <Swatches label="Cabelo" colors={HAIR_COLORS} value={look.hair} onPick={(hair) => updateAgentLook(agentId, { hair })} />
          <Chips
            label="Estilo"
            options={HAIR_STYLES}
            value={look.hairStyle}
            onPick={(hairStyle) => updateAgentLook(agentId, { hairStyle })}
          />
          <Chips
            label="Acessório"
            options={ACCESSORIES}
            value={look.accessory}
            onPick={(accessory) => updateAgentLook(agentId, { accessory })}
          />
          <Swatches label="Calça" colors={PANTS_COLORS} value={look.pants} onPick={(pants) => updateAgentLook(agentId, { pants })} />
          <Swatches label="Sapato" colors={SHOE_COLORS} value={look.shoes} onPick={(shoes) => updateAgentLook(agentId, { shoes })} />
          <div className="look-row">
            <span className="look-label">Camisa</span>
            <div className="look-swatches" role="group" aria-label="Camisa">
              <button
                type="button"
                className={look.shirt === undefined ? "swatch identity active" : "swatch identity"}
                style={{ background: identityColor }}
                aria-label="Camisa na cor do agente"
                aria-pressed={look.shirt === undefined}
                onClick={() => updateAgentLook(agentId, { shirt: undefined })}
              />
              {SHIRT_COLORS.filter((color) => color.toLowerCase() !== identityColor.toLowerCase()).map((color) => (
                <button
                  key={color}
                  type="button"
                  className={look.shirt?.toLowerCase() === color.toLowerCase() ? "swatch active" : "swatch"}
                  style={{ background: color }}
                  aria-label={`Camisa ${color}`}
                  aria-pressed={look.shirt?.toLowerCase() === color.toLowerCase()}
                  onClick={() => updateAgentLook(agentId, { shirt: color })}
                />
              ))}
            </div>
          </div>
          <div className="look-row">
            <span className="look-label">Altura</span>
            <input
              type="range"
              className="look-range"
              min={MIN_HEIGHT}
              max={MAX_HEIGHT}
              step={0.01}
              value={look.height}
              aria-label="Altura do personagem"
              onChange={(event) => updateAgentLook(agentId, { height: Number(event.target.value) })}
            />
            <span className="look-value">{look.height.toFixed(2)}×</span>
          </div>
        </div>
      )}
    </section>
  );
}
