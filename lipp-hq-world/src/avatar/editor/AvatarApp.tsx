import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dices, Plus, Trash2 } from "lucide-react";
import { normalizeHex } from "@/character-studio/model/schema";
import { CATEGORIES, CATEGORIES_BY_ID, ITEMS_BY_ID, type Category, type CategoryId } from "@/avatar/human/catalog";
import { HUMAN_ROOT } from "@/avatar/human/humanAssets";
import { AVATAR_STORAGE_KEY, browserStorage, loadAvatars, saveAvatars, type AvatarDoc } from "@/avatar/human/persistence";
import {
  EXPRESSIONS,
  EXPRESSION_LABEL,
  NAME_MAX,
  newPreset,
  randomized,
  resolveHuman,
  validateName,
  withColor,
  withPart,
  type HumanPreset,
} from "@/avatar/human/preset";
import { HumanPreview, type PreviewApi } from "./HumanPreview";
import { RobotStudio } from "./RobotStudio";
import "@/character-studio/studio.css";
import "./avatar.css";

const OFFICE_DEMO = "/?escritorio=completo&modo=demonstracao";
const QA_ENABLED = import.meta.env.DEV || new URLSearchParams(window.location.search).has("qa");

/** O escritório abre o editor já na pessoa clicada. */
const askedPerson = new URLSearchParams(window.location.search).get("pessoa");

type Tab = "pessoas" | "robos";
const askedTab: Tab = new URLSearchParams(window.location.search).get("aba") === "robos" ? "robos" : "pessoas";

const newId = () => `pessoa-${crypto.randomUUID().slice(0, 8)}`;
const nextName = (doc: AvatarDoc) => `Pessoa ${doc.presets.length + 1}`;

function samePreset(a: HumanPreset, b: HumanPreset | undefined) {
  if (!b) return false;
  return JSON.stringify({ ...a, updatedAt: "" }) === JSON.stringify({ ...b, updatedAt: "" });
}

function ItemGrid({ category, selected, onPick }: { category: Category; selected: string | null; onPick: (itemId: string | null) => void }) {
  return (
    <div className="av-grid" role="radiogroup" aria-label={category.label}>
      {!category.required && (
        <button type="button" role="radio" aria-checked={selected === null} className="av-item av-item--none" onClick={() => onPick(null)}>
          <span>Nenhum</span>
        </button>
      )}
      {category.items.map((item) => (
        <button key={item.id} type="button" role="radio" aria-checked={selected === item.id} className="av-item" data-item={item.id} title={item.label} onClick={() => onPick(item.id)}>
          <img src={`${HUMAN_ROOT}/miniaturas/${item.id}.webp`} alt="" width={96} height={96} loading="lazy" />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function ColorField({ label, value, palette, onChange }: { label: string; value: string; palette: readonly string[]; onChange: (hex: string) => void }) {
  return (
    <div className="cs-color">
      <span className="cs-color__label">{label}</span>
      <input className="cs-color__well" type="color" value={value} aria-label={`Escolher cor: ${label}`} onChange={(event) => onChange(event.target.value)} />
      <input
        key={value}
        className="cs-color__hex"
        type="text"
        spellCheck={false}
        autoComplete="off"
        maxLength={7}
        defaultValue={value}
        aria-label={`Código da cor: ${label}`}
        onBlur={(event) => {
          const hex = normalizeHex(event.target.value);
          if (hex) onChange(hex);
          else event.target.value = value;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <div className="cs-color__palette" role="group" aria-label={`Amostras de ${label}`}>
        {palette.map((hex) => (
          <button key={hex} type="button" className="cs-chip" style={{ background: hex }} aria-label={hex} aria-pressed={value === hex} onClick={() => onChange(hex)} />
        ))}
      </div>
    </div>
  );
}

function Tabs({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  return (
    <div className="av-kind" role="tablist" aria-label="O que editar">
      <button type="button" role="tab" aria-selected={tab === "pessoas"} data-tab="pessoas" onClick={() => onTab("pessoas")}>Pessoas</button>
      <button type="button" role="tab" aria-selected={tab === "robos"} data-tab="robos" onClick={() => onTab("robos")}>Robôs</button>
    </div>
  );
}

export function AvatarApp() {
  const [tab, setTab] = useState<Tab>(askedTab);
  if (tab === "robos") {
    return (
      <div className="cs-app">
        <nav className="cs-rail" aria-label="Editor">
          <header className="cs-brand">
            <span className="cs-brand__mark">Lipp HQ</span>
            <h1>Editar robôs</h1>
          </header>
          <div className="cs-rail__scroll">
            <Tabs tab={tab} onTab={setTab} />
            <p className="cs-empty">Os robôs representam os bots: cada um segue com o nome, a sala e o estado que já tem.</p>
          </div>
          <div className="cs-rail__actions av-rail__actions">
            <a className="cs-button" href={OFFICE_DEMO}>Ver escritório</a>
          </div>
        </nav>
        <RobotStudio />
      </div>
    );
  }
  return <PeopleEditor tabs={<Tabs tab={tab} onTab={setTab} />} />;
}

function PeopleEditor({ tabs }: { tabs: ReactNode }) {
  const [loaded] = useState(() => loadAvatars(browserStorage()));
  const [doc, setDoc] = useState<AvatarDoc>(loaded.doc);
  const [draft, setDraft] = useState<HumanPreset>(() => doc.presets.find((preset) => preset.id === askedPerson) ?? doc.presets.find((preset) => preset.id === doc.selectedId) ?? newPreset(newId(), nextName(doc), ""));
  const [categoryId, setCategoryId] = useState<CategoryId>("hair");
  const [notice, setNotice] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const preview = useRef<PreviewApi | null>(null);

  const saved = doc.presets.find((preset) => preset.id === draft.id);
  const dirty = !samePreset(draft, saved);
  const nameProblem = validateName(draft.name);
  const human = useMemo(() => resolveHuman(draft), [draft]);
  const category = CATEGORIES_BY_ID[categoryId];
  const selectedItemId = draft.parts[categoryId];
  const lockedBy = human.locked[categoryId];

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Edição sem salvar não some em silêncio ao fechar a aba.
  useEffect(() => {
    if (!dirty || !saved) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, saved]);

  // Outra aba mudou a lista: atualiza a lista sem tocar no rascunho aberto.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === AVATAR_STORAGE_KEY) setDoc(loadAvatars(browserStorage()).doc);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = (next: AvatarDoc) => {
    setDoc(next);
    const ok = loaded.writable && saveAvatars(browserStorage(), next);
    setSaveFailed(!ok);
    return ok;
  };

  const save = () => {
    if (nameProblem) return null;
    const stamped = { ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() };
    const presets = saved ? doc.presets.map((preset) => (preset.id === stamped.id ? stamped : preset)) : [...doc.presets, stamped];
    setDraft(stamped);
    return persist({ presets, selectedId: stamped.id });
  };

  const confirmDiscard = () => !dirty || !saved || window.confirm("Descartar as alterações sem salvar?");

  const select = (preset: HumanPreset) => {
    if (preset.id === draft.id || !confirmDiscard()) return;
    setDraft(preset);
    persist({ ...doc, selectedId: preset.id });
  };

  const create = () => {
    if (!confirmDiscard()) return;
    setDraft(newPreset(newId(), nextName(doc), ""));
  };

  const remove = () => {
    if (!saved || !window.confirm(`Apagar ${saved.name}? Ela também sai do escritório.`)) return;
    const presets = doc.presets.filter((preset) => preset.id !== saved.id);
    const fallback = presets[0] ?? null;
    persist({ presets, selectedId: fallback?.id ?? null });
    setDraft(fallback ?? newPreset(newId(), `Pessoa ${presets.length + 1}`, ""));
    setNotice(`${saved.name} foi apagada.`);
  };

  const onWorn = useCallback((list: string[]) => setMissing(list), []);

  useEffect(() => {
    if (!QA_ENABLED) return;
    const bridge = {
      snapshot: () => preview.current?.snapshot() ?? null,
      measure: () => preview.current?.measure() ?? null,
      capture: () => preview.current?.capture() ?? null,
      frames: () => preview.current?.frames() ?? -1,
    };
    (window as unknown as { __HQ_AVATAR_QA__?: typeof bridge }).__HQ_AVATAR_QA__ = bridge;
    return () => {
      delete (window as unknown as { __HQ_AVATAR_QA__?: typeof bridge }).__HQ_AVATAR_QA__;
    };
  }, []);

  const showColor = category.palette.length > 0 && (categoryId === "head" || Boolean(selectedItemId && ITEMS_BY_ID[selectedItemId]!.colorable));

  return (
    <div className="cs-app">
      <nav className="cs-rail" aria-label="Pessoas">
        <header className="cs-brand">
          <span className="cs-brand__mark">Lipp HQ</span>
          <h1>Criar pessoa</h1>
        </header>
        <div className="cs-rail__scroll">
          {tabs}
          <section aria-labelledby="av-people">
            <h2 id="av-people" className="cs-eyebrow">Pessoas salvas <span className="cs-count">{doc.presets.length}</span></h2>
            {doc.presets.length === 0 && <p className="cs-empty">Nenhuma ainda. Monte a primeira e salve: ela aparece no hall do escritório.</p>}
            <ul className="cs-cast">
              {doc.presets.map((preset) => (
                <li key={preset.id}>
                  <button type="button" className="cs-cast__item" aria-current={preset.id === draft.id ? "true" : undefined} data-person={preset.id} onClick={() => select(preset)}>
                    <span className="cs-dots" aria-hidden="true">
                      <span style={{ background: preset.colors.hair }} />
                      <span style={{ background: preset.colors.head }} />
                      <span style={{ background: preset.colors.top }} />
                    </span>
                    <span className="cs-cast__text">
                      <span className="cs-cast__name">{preset.name}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <div className="cs-rail__actions av-rail__actions">
          <button type="button" className="cs-button" onClick={create}><Plus size={15} aria-hidden="true" /> Nova pessoa</button>
          <a className="cs-button" href={OFFICE_DEMO}>Ver escritório</a>
          <a className="cs-button" href="/personagens.html">Estúdio antigo</a>
        </div>
      </nav>

      <main className="cs-main">
        <HumanPreview human={human} name={draft.name.trim() || "Sem nome"} apiRef={preview} onWorn={onWorn} />
        {loaded.warnings.length > 0 && (
          <div className="cs-banner" role="status">
            <span>{loaded.warnings.join(" ")}</span>
          </div>
        )}
        {missing.length > 0 && (
          <div className="cs-banner" role="alert">
            <span>Não consegui baixar: {missing.join(", ")}. O resto da pessoa continua aqui; tente trocar a peça.</span>
          </div>
        )}
        <div className="cs-toast-slot" aria-live="polite">
          {notice && <div className="cs-toast">{notice}</div>}
        </div>
      </main>

      <aside className="cs-panel" aria-label="Peças e cores">
        <header className="cs-panel__head">
          <input
            className="cs-name"
            value={draft.name}
            maxLength={NAME_MAX + 8}
            aria-label="Nome da pessoa"
            aria-invalid={Boolean(nameProblem)}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
          <p className="cs-subtitle">{nameProblem ?? (saved ? (dirty ? "Alterações sem salvar" : "Salva neste navegador") : "Ainda não salva")}</p>
        </header>
        <div className="cs-panel__scroll">
          <section className="cs-section" aria-label="Categorias">
            <div className="av-tabs" role="tablist" aria-label="Categorias de peças">
              {CATEGORIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={item.id === categoryId}
                  className={human.locked[item.id] ? "av-tab av-tab--locked" : "av-tab"}
                  data-category={item.id}
                  onClick={() => setCategoryId(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>
          <section className="cs-section" aria-label={category.label}>
            {lockedBy && (
              <div className="cs-notice" role="status" data-locked={categoryId}>
                <span>{category.label} fica coberta por {ITEMS_BY_ID[lockedBy]!.label}, que está vestida. A escolha fica guardada para quando tirar.</span>
                <div className="cs-notice__actions">
                  <button type="button" className="cs-button cs-button--small" onClick={() => setDraft(withPart(draft, ITEMS_BY_ID[lockedBy]!.category, null))}>
                    Tirar {ITEMS_BY_ID[lockedBy]!.label}
                  </button>
                </div>
              </div>
            )}
            <ItemGrid category={category} selected={selectedItemId} onPick={(itemId) => setDraft(withPart(draft, categoryId, itemId))} />
          </section>
          {showColor && (
            <section className="cs-section" aria-label="Cor">
              <ColorField label={categoryId === "head" ? "Pele" : "Cor"} value={draft.colors[categoryId]} palette={category.palette} onChange={(hex) => setDraft(withColor(draft, categoryId, hex))} />
            </section>
          )}
          {categoryId === "head" && (
            <section className="cs-section" aria-label="Expressão">
              <h3 className="cs-eyebrow">Expressão</h3>
              <div className="av-segmented" role="radiogroup" aria-label="Expressão">
                {EXPRESSIONS.map((expression) => (
                  <button key={expression} type="button" role="radio" aria-checked={draft.expression === expression} className="cs-button cs-button--small" onClick={() => setDraft({ ...draft, expression })}>
                    {EXPRESSION_LABEL[expression]}
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="cs-credits" aria-label="Créditos">
            <span><strong>Pessoas:</strong> pacote de avatar do Wawa Sensei. Sem licença declarada no repositório; uso autorizado pelo Filipe.</span>
          </section>
        </div>
        <footer className="cs-panel__foot av-foot">
          <button type="button" className="cs-button" title="Sortear peças e cores" onClick={() => setDraft(randomized(draft, Date.now() & 0xffffff))}>
            <Dices size={15} aria-hidden="true" /> Sortear
          </button>
          <button type="button" className="cs-button cs-button--danger" disabled={!saved} onClick={remove}>
            <Trash2 size={15} aria-hidden="true" /> Apagar
          </button>
          <button
            type="button"
            className="cs-button cs-button--primary av-save"
            disabled={Boolean(nameProblem)}
            data-save
            onClick={() => {
              const ok = save();
              if (ok !== null) setNotice(ok ? `${draft.name.trim()} foi salva e já aparece no escritório.` : "Não consegui gravar neste navegador: a pessoa dura só até fechar a aba.");
            }}
          >
            Salvar
          </button>
          <a
            className={nameProblem ? "cs-button av-go av-go--off" : "cs-button av-go"}
            href={OFFICE_DEMO}
            data-save-go
            onClick={(event) => {
              if (nameProblem || save() === null) event.preventDefault();
            }}
          >
            Salvar e ver no escritório
          </a>
          {saveFailed && <p className="cs-save cs-save--warn av-foot__warn">Sem salvamento local nesta aba.</p>}
        </footer>
      </aside>
    </div>
  );
}
