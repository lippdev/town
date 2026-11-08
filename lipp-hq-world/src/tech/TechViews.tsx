import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useHQStore } from "@/state/useHQStore";
import { Building2, FolderTree, LayoutDashboard } from "lucide-react";
import { escapeLayers, useOfficeStore } from "@/world/office/officeStore";
import { DailyPanel } from "./DailyPanel";
import { ProjectsView } from "./ProjectsView";
import { TECH_VIEWS, TECH_VIEW_LABEL, useTechStore, type TechView } from "./techStore";
import { closeViewLayer, escapeFromView, takeOpener } from "./viewParts";

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
    } else if (event.key === "Tab" && !event.shiftKey && view !== "predio") {
      // A visão vem depois da navegação lateral no DOM: o Tab da aba vai direto para o painel dela.
      const panel = document.getElementById(PANEL_ID[view]);
      if (panel && !panel.inert) {
        event.preventDefault();
        panel.focus();
      }
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

/** O que recebe o Tab dentro da visão, para saber se o Shift+Tab sai dela. */
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
const focusLost = () => !document.activeElement || document.activeElement === document.body;

/**
 * Projetos ou Painel por cima da cena. O Esc fecha a gaveta antes; depois volta ao prédio.
 * `covered`: outra tela do HUD (Conversas, Equipe, Kanban) está por cima, e a visão sai do Tab e do
 * leitor de tela até ela fechar.
 */
export function TechViewLayer({ covered = false }: { covered?: boolean }) {
  const view = useTechStore((store) => store.view);
  const section = useRef<HTMLElement>(null);
  const epic = useTechStore((store) => Boolean(store.selectedEpicId));
  const human = useOfficeStore((state) => Boolean(state.selectedHumanId));
  const bot = useHQStore((state) => Boolean(state.selectedBotId));
  const drawer = epic || human || bot;
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
  // Saindo da visão (Esc), o foco que estava nela cai no body: volta para a aba ativa.
  const lastView = useRef(view);
  useEffect(() => {
    const was = lastView.current;
    lastView.current = view;
    if (was !== view && view === "predio" && focusLost()) document.getElementById(tabId(view))?.focus();
  }, [view]);
  // Fechando a gaveta (X ou Esc) com a visão aberta: o foco volta a quem a abriu, ou ao painel.
  const hadDrawer = useRef(drawer);
  useEffect(() => {
    const was = hadDrawer.current;
    hadDrawer.current = drawer;
    if (!was || drawer || view === "predio" || covered || !focusLost()) return;
    const opener = takeOpener();
    (opener?.isConnected && section.current?.contains(opener) ? opener : section.current)?.focus({ preventScroll: true });
  }, [drawer, view, covered]);
  if (view === "predio") return null;
  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Tab" && event.shiftKey && section.current) {
      // Do começo do painel, o Shift+Tab volta à aba que o controla, e não à navegação lateral.
      const first = section.current.querySelector<HTMLElement>(TABBABLE);
      if (event.target === section.current || event.target === first) {
        event.preventDefault();
        document.getElementById(tabId(view))?.focus();
      }
      return;
    }
    escapeFromView(event);
  };
  return (
    <section
      ref={section}
      className="tech-view"
      id={PANEL_ID[view]}
      role="tabpanel"
      aria-labelledby={tabId(view)}
      tabIndex={-1}
      inert={covered}
      data-covered={covered ? "true" : undefined}
      data-tech-view={view}
      data-scene-keys-off
      data-scene-cover
      onKeyDown={onKeyDown}
    >
      {view === "projetos" ? <ProjectsView /> : <DailyPanel />}
    </section>
  );
}
