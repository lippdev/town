import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Building2, FolderTree, LayoutDashboard } from "lucide-react";
import { escapeLayers, useOfficeStore } from "@/world/office/officeStore";
import { DailyPanel } from "./DailyPanel";
import { ProjectsView } from "./ProjectsView";
import { TECH_VIEWS, TECH_VIEW_LABEL, useTechStore, type TechView } from "./techStore";
import { closeViewLayer, escapeFromView } from "./viewParts";

/**
 * As visões Projetos e Painel do cenário: os mesmos dados da cena, lidos do mesmo `useTechStore`,
 * em árvore (como o Notion) e em painel (como um dashboard). Abrir um item leva à gaveta que o
 * prédio já tem, em vez de duplicar a gaveta aqui.
 */

const VIEW_ICON: Record<TechView, typeof Building2> = { predio: Building2, projetos: FolderTree, painel: LayoutDashboard };
const PANEL_ID: Record<TechView, string> = { predio: "", projetos: "tech-view-projetos", painel: "tech-view-painel" };
const tabId = (view: TechView) => `tech-tab-${view}`;

// ─── Seletor de visão ────────────────────────────────────────────────────────

/** Prédio | Projetos | Painel, na barra de cima. Setas, Home e End trocam, como abas. */
export function TechViewSwitch() {
  const view = useTechStore((store) => store.view);
  const refs = useRef<Partial<Record<TechView, HTMLButtonElement | null>>>({});
  const choose = (next: TechView, focus = false) => {
    useTechStore.getState().setView(next);
    if (focus) refs.current[next]?.focus();
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = TECH_VIEWS.indexOf(view);
    const step: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (event.key in step) {
      event.preventDefault();
      choose(TECH_VIEWS[(index + step[event.key]! + TECH_VIEWS.length) % TECH_VIEWS.length]!, true);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      choose(event.key === "Home" ? TECH_VIEWS[0] : TECH_VIEWS[TECH_VIEWS.length - 1]!, true);
    } else escapeFromView(event);
  };
  return (
    <div className="tech-views" role="tablist" aria-label="Visão do cenário" data-tech-views data-scene-keys-off onKeyDown={onKeyDown}>
      {TECH_VIEWS.map((option) => {
        const Icon = VIEW_ICON[option];
        const active = option === view;
        return (
          <button
            key={option}
            ref={(node) => {
              refs.current[option] = node;
            }}
            type="button"
            role="tab"
            id={tabId(option)}
            aria-selected={active}
            aria-controls={active && option !== "predio" ? PANEL_ID[option] : undefined}
            tabIndex={active ? 0 : -1}
            className={active ? "active" : undefined}
            data-view-tab={option}
            title={TECH_VIEW_LABEL[option]}
            onClick={() => choose(option)}
          >
            <Icon size={14} aria-hidden />
            <span>{TECH_VIEW_LABEL[option]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── A camada ────────────────────────────────────────────────────────────────

/** Projetos ou Painel por cima da cena. O Esc fecha a gaveta antes; depois volta ao prédio. */
export function TechViewLayer() {
  const view = useTechStore((store) => store.view);
  useEffect(() => {
    escapeLayers.add(closeViewLayer);
    return () => {
      escapeLayers.delete(closeViewLayer);
    };
  }, []);
  // Voltando ao prédio com uma pessoa aberta, a câmera vai até ela.
  useEffect(() => {
    if (view !== "predio") return;
    const id = useOfficeStore.getState().selectedHumanId;
    if (id?.startsWith("squad-")) useOfficeStore.getState().selectHuman(id);
  }, [view]);
  if (view === "predio") return null;
  return (
    <section className="tech-view" id={PANEL_ID[view]} role="tabpanel" aria-labelledby={tabId(view)} data-tech-view={view} data-scene-keys-off onKeyDown={escapeFromView}>
      {view === "projetos" ? <ProjectsView /> : <DailyPanel />}
    </section>
  );
}
