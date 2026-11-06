import { useLayoutEffect, useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { ChevronDown, House, Columns3, MessagesSquare, Network, Search, Armchair, ArrowLeft, ExternalLink, Maximize, Minus, PanelLeftClose, PanelLeftOpen, Pencil, PersonStanding, Plus, RefreshCw, TriangleAlert, X } from "lucide-react";
import { buildRosterSections } from "@/agents/organization";
import { lookFor } from "@/avatar/robot/robotLook";
import { robotPortraits } from "@/avatar/robot/robotPortraits";
import { stateLabel } from "@/components/hud/fleetView";
import { BotDrawer } from "@/components/hud/BotDrawer";
import { useHQStore } from "@/state/useHQStore";
import { GRAPHICS_LABEL, GRAPHICS_MODES } from "@/world/quality";
import { BUILDING_ROOMS_BY_ID } from "@/world/office/officeBuilding";
import { OFFICE_ROOMS_BY_ID, OFFICE_SEATS_BY_ID, SEAT_KIND_LABEL } from "@/world/office/officeLayout";
import { OFFICE_DEMO_URL, OFFICE_LIVE_URL, officeConnection, type OfficeConnection } from "@/world/office/officeRoute";
import { HUMAN_CAPACITY, HUMAN_PHASE_LABEL } from "@/world/office/officeHumans";
import { botsInRoom, type OfficeBot } from "@/world/office/officeRoster";
import { AgentPortrait } from "./AgentPortrait";
import { FloorSelector } from "./BuildingControls";
import { OfficeAccountMenu } from "./OfficeAccountMenu";
import { OfficeConversations } from "./OfficeConversations";
import { OfficeKanban } from "./OfficeKanban";
import { OfficeOrgChart } from "./OfficeOrgChart";
import { useDemoConversations, type DemoConversations } from "./useDemoConversations";
import { CHIEF_ID, CHIEF_STATUS_LABEL, SAMPLE_AGENDA } from "@/world/office/officeChief";
import { officeRuntime, useOfficeStore, zoomStep } from "@/world/office/officeStore";

/** Abaixo disto o painel abre recolhido: a planta precisa da largura. */
const ROSTER_MIN_WIDTH = 1180;
/** Sem resposta do Hermes neste tempo, o app para de dizer "conectando". */
const CONNECT_WAIT_MS = 6000;
/** Nesta largura a sidebar cobre a tela: escolher uma conversa precisa revelá-la. */
const SIDEBAR_OVERLAY_WIDTH = 600;

type WorkspaceView = "escritorio" | "conversas" | "equipe" | "kanban";

const VIEW_TITLE: Record<WorkspaceView, string> = { escritorio: "Escritório", conversas: "Conversas", equipe: "Equipe", kanban: "Kanban" };
const SEARCH_KEY = /mac|iphone|ipad/i.test(navigator.platform) ? "⌘K" : "Ctrl K";

/** Retratos dos robôs, compartilhados pela sidebar e pela conversa. */
function usePortraits(bots: readonly OfficeBot[]): { stills: Record<string, string>; sheets: Record<string, string> } {
  const savedLooks = useOfficeStore((state) => state.robotLooks);
  const portraitKey = JSON.stringify(Object.fromEntries(bots.map((bot) => [bot.id, lookFor(bot.color, savedLooks[bot.id])])));
  const [portraits, setPortraits] = useState<{ stills: Record<string, string>; sheets: Record<string, string> }>({ stills: {}, sheets: {} });
  useEffect(() => {
    let cancelled = false;
    robotPortraits(JSON.parse(portraitKey)).then((images) => {
      if (cancelled) return;
      const ids = Object.keys(images);
      setPortraits({
        stills: Object.fromEntries(ids.map((id) => [id, images[id]!.still])),
        sheets: Object.fromEntries(ids.map((id) => [id, images[id]!.sheet])),
      });
    }).catch(() => { if (!cancelled) setPortraits({ stills: {}, sheets: {} }); });
    return () => { cancelled = true; };
  }, [portraitKey]);
  return portraits;
}

function useConnection(): OfficeConnection {
  const fleet = useHQStore((state) => state.fleet);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), CONNECT_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return officeConnection(fleet, waited);
}

function ModeChip({ connection }: { connection: OfficeConnection | null }) {
  if (!connection) {
    return <span className="office-chip demo">Demonstração</span>;
  }
  switch (connection.kind) {
    case "connecting":
      return <span className="office-chip wait">Conectando ao Hermes…</span>;
    case "live":
      return <span className="office-chip live">Hermes ao vivo · {connection.bots} {connection.bots === 1 ? "bot" : "bots"}</span>;
    case "stale":
      return <span className="office-chip wait">Hermes: leitura atrasada · {connection.bots} bots</span>;
    case "empty":
      return <span className="office-chip wait">Hermes sem bots</span>;
    case "offline":
      return <span className="office-chip off">Hermes offline</span>;
  }
}

function TopBar({ connection, title }: { connection: OfficeConnection | null; title: string }) {
  const demo = connection === null;
  return (
    <header className="office-top" data-office-inset="top">
      <h1 className="office-page-title">{title}</h1>
      <ModeChip connection={connection} />
      {demo && <span className="office-demo-note">Sete bots de exemplo, sem atividade real.</span>}
      <nav className="office-nav" aria-label="Fonte dos dados">
        <a href={demo ? OFFICE_LIVE_URL : OFFICE_DEMO_URL}>{demo ? "Usar frota do Hermes" : "Ver demonstração"}</a>
      </nav>
    </header>
  );
}

function OfflineNotice({ connection }: { connection: OfficeConnection | null }) {
  const refresh = useHQStore((state) => state.gatewayRefresh);
  const [dismissed, setDismissed] = useState(false);
  if (!connection || dismissed) return null;
  if (connection.kind === "offline" || connection.kind === "empty") {
    return (
      <div className="office-notice" role="status">
        <TriangleAlert size={16} aria-hidden />
        <div>
          <strong>{connection.kind === "offline" ? "Hermes sem conexão: não há bots reais para mostrar." : "O Hermes respondeu, mas não reportou nenhum bot."}</strong>
          <p>
            As cadeiras ficam vazias de propósito. A demonstração mostra os sete bots de referência, sem dados reais.
            {connection.detail ? ` Detalhe: ${connection.detail}` : ""}
          </p>
          <div className="office-notice-actions">
            <a className="office-button primary" href={OFFICE_DEMO_URL}>Ver demonstração</a>
            <button type="button" className="office-button" onClick={() => refresh?.()} disabled={!refresh}>
              <RefreshCw size={13} aria-hidden /> Tentar de novo
            </button>
            <a className="office-button" href="/">Configurar conexão</a>
          </div>
        </div>
        <button type="button" className="panel-close" aria-label="Dispensar aviso" onClick={() => setDismissed(true)}>
          <X size={16} aria-hidden />
        </button>
      </div>
    );
  }
  if (connection.kind === "stale") {
    return (
      <div className="office-notice slim" role="status">
        <TriangleAlert size={14} aria-hidden />
        <span>A última leitura boa continua na tela: o Hermes não respondeu agora.{connection.detail ? ` ${connection.detail}` : ""}</span>
      </div>
    );
  }
  return null;
}

/** Pessoas à parte dos bots: não têm sala nem estado, e são criadas por você. */
function PeopleList({ matches, onSelect }: { matches: (text: string) => boolean; onSelect: (humanId: string) => void }) {
  const humans = useOfficeStore((state) => state.humans);
  const waiting = useOfficeStore((state) => state.humansWaiting);
  const selectedHumanId = useOfficeStore((state) => state.selectedHumanId);
  return (
    <section className="office-people" aria-label="Pessoas" data-people>
      <div className="office-people-head">
        <strong>Pessoas</strong>
        <a href="/avatares.html" aria-label="Criar pessoa">Criar</a>
      </div>
      {humans.length === 0 && <p className="office-roster-empty">Ninguém ainda. Quem você criar e salvar aparece no hall.</p>}
      {humans.filter((human) => matches(human.name)).map((human) => (
        <button
          key={human.id}
          type="button"
          className={human.id === selectedHumanId ? "office-roster-bot active" : "office-roster-bot"}
          data-person-row={human.id}
          onClick={() => onSelect(human.id)}
        >
          <span className="office-agent-avatar" style={{ "--agent-color": human.preset.colors.top } as React.CSSProperties} aria-hidden><PersonStanding size={22} /></span>
          <span className="office-roster-name">{human.name}</span>
        </button>
      ))}
      {waiting.length > 0 && (
        <p className="office-roster-empty" data-people-waiting>
          O hall tem lugar para {HUMAN_CAPACITY}. Fora da cena: {waiting.map((person) => person.name).join(", ")}.
        </p>
      )}
    </section>
  );
}

const normalizeSearch = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();

const COLLAPSED_TEAMS_KEY = "lipp-hq.sidebar.equipes-recolhidas";

function readCollapsedTeams(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(COLLAPSED_TEAMS_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function saveCollapsedTeams(ids: readonly string[]) {
  try {
    localStorage.setItem(COLLAPSED_TEAMS_KEY, JSON.stringify(ids));
  } catch {
    // Sem armazenamento, a equipe só não lembra de ficar recolhida.
  }
}

function Roster({ open, onToggle, view, onView, conversationBotId, onConversation, sheets, demo }: {
  open: boolean;
  onToggle: () => void;
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  conversationBotId: string | null;
  onConversation: (botId: string) => void;
  sheets: Record<string, string>;
  demo: DemoConversations;
}) {
  const bots = useOfficeStore((state) => state.bots);
  const seating = useOfficeStore((state) => state.seating);
  const selectedBotId = useHQStore((state) => state.selectedBotId);
  const mode = useOfficeStore((state) => state.mode);
  const [query, setQuery] = useState("");
  const [collapsedTeams, setCollapsedTeams] = useState(readCollapsedTeams);
  const matches = (text: string) => normalizeSearch(text).includes(normalizeSearch(query).trim());
  const filtered = bots.filter((bot) => matches(`${bot.name} ${bot.role}`));
  const searching = query.trim().length > 0;
  const toggleTeam = (id: string) => {
    const next = collapsedTeams.includes(id) ? collapsedTeams.filter((team) => team !== id) : [...collapsedTeams, id];
    setCollapsedTeams(next);
    saveCollapsedTeams(next);
  };
  const pending = mode === "demo" ? bots.reduce((total, bot) => total + demo.pendingOf(bot.id), 0) : 0;
  if (!open) return (
    <button type="button" className="office-roster-toggle closed" onClick={onToggle} aria-expanded={false} aria-label="Abrir navegação">
      <PanelLeftOpen size={18} aria-hidden />
    </button>
  );
  return (
    <aside className="office-roster" data-office-inset="left" aria-label="Navegação do Lipp HQ">
      <div className="office-roster-head">
        <span className="office-workspace-mark" aria-hidden>L</span>
        <div className="office-workspace-title"><strong>Lipp HQ</strong><span>{bots.length} {bots.length === 1 ? "agente" : "agentes"}</span></div>
        <button type="button" className="panel-close" onClick={onToggle} aria-expanded aria-label="Recolher navegação"><PanelLeftClose size={17} aria-hidden /></button>
      </div>
      <label className="office-agent-search"><Search size={16} aria-hidden /><input className="office-roster-search" type="search" aria-label="Buscar agentes ou pessoas" aria-keyshortcuts="Meta+K Control+K" placeholder="Buscar na equipe…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd className="office-search-key" aria-hidden>{SEARCH_KEY}</kbd></label>
      <nav className="office-sidebar-nav" aria-label="Área de trabalho">
        <button type="button" aria-current={view === "escritorio" ? "page" : undefined} onClick={() => { onView("escritorio"); useOfficeStore.getState().backToFloor(); }}><House size={18} aria-hidden /> Escritório</button>
        <button type="button" data-nav-conversas aria-current={view === "conversas" ? "page" : undefined} onClick={() => onView("conversas")}>
          <MessagesSquare size={18} aria-hidden /> Conversas
          {pending > 0 && <span className="office-nav-count" aria-label={`${pending} ${pending === 1 ? "aprovação pendente" : "aprovações pendentes"}`}>{pending}</span>}
        </button>
        <button type="button" data-nav-equipe aria-current={view === "equipe" ? "page" : undefined} onClick={() => onView("equipe")}><Network size={18} aria-hidden /> Equipe</button>
        {mode === "demo" && <button type="button" aria-current={view === "kanban" ? "page" : undefined} onClick={() => onView("kanban")}><Columns3 size={18} aria-hidden /> Kanban</button>}
      </nav>
      <div className="office-directory">
        {buildRosterSections(filtered).map((section) => {
          // A busca abre a equipe: quem foi encontrado nunca fica escondido.
          const collapsed = section.collapsible && !searching && collapsedTeams.includes(section.id);
          const waitingInSection = mode === "demo" ? section.bots.reduce((total, bot) => total + demo.pendingOf(bot.id), 0) : 0;
          return (
            <section key={section.id} className="office-roster-section" aria-label={section.name} data-roster-section={section.id}>
              <h2 className="office-section-title">
                {section.collapsible ? (
                  <button type="button" className="office-section-toggle" aria-expanded={!collapsed} disabled={searching} onClick={() => toggleTeam(section.id)}>
                    <span className="office-section-name">{section.name} <small>{section.bots.length}</small></span>
                    {collapsed && waitingInSection > 0 && <span className="office-nav-count" title="Esperando sua decisão">{waitingInSection}</span>}
                    <ChevronDown size={14} aria-hidden />
                  </button>
                ) : section.name}
              </h2>
              {/* Continua montada ao recolher: é o que deixa a altura animar nos dois sentidos. */}
              <div className="office-section-body" data-collapsed={collapsed} inert={collapsed}>
                <div className="office-team-list">
                  {section.bots.map((bot) => {
                    const active = view === "conversas" ? bot.id === conversationBotId : view === "escritorio" && bot.id === selectedBotId;
                    const waiting = mode === "demo" ? demo.pendingOf(bot.id) : 0;
                    return <button key={bot.id} type="button" aria-pressed={active} data-agent-row={bot.id} title={bot.role} className={active ? "office-roster-bot active" : "office-roster-bot"} onClick={() => {
                      if (view === "conversas") { onConversation(bot.id); return; }
                      onView("escritorio");
                      useOfficeStore.getState().selectBot(bot.id);
                    }}>
                      <span className="office-agent-avatar" style={{ "--agent-color": bot.color } as React.CSSProperties} aria-hidden>
                        {sheets[bot.id] ? <AgentPortrait botId={bot.id} sheet={sheets[bot.id]!} /> : <span>{bot.name.slice(0, 2)}</span>}
                      </span>
                      <span className="office-roster-name">{bot.name}{mode === "demo" && <small>{bot.role}</small>}</span>
                      {waiting > 0 && <span className="office-nav-count" title="Esperando sua decisão">{waiting}</span>}
                      {mode === "live" && bot.state && <span className="office-roster-state">{stateLabel(bot.state)}</span>}
                      {seating.unseated.includes(bot.id) && <span className="office-roster-state">Sem posto</span>}
                    </button>;
                  })}
                </div>
              </div>
            </section>
          );
        })}
        {filtered.length === 0 && <p className="office-roster-empty">Nenhum agente encontrado.</p>}
        {mode === "demo" && <PeopleList matches={matches} onSelect={(humanId) => {
          // Como na linha de bot: a cena precisa estar à vista para a seleção ter efeito.
          onView("escritorio");
          useOfficeStore.getState().selectHuman(humanId);
        }} />}
      </div>
      <OfficeAccountMenu detail={mode === "demo" ? "Demonstração" : "Frota do Hermes"} />
    </aside>
  );
}

function FocusBar() {
  const focusedRoomId = useOfficeStore((state) => state.focusedRoomId);
  const seating = useOfficeStore((state) => state.seating);
  const bots = useOfficeStore((state) => state.bots);
  const room = focusedRoomId ? BUILDING_ROOMS_BY_ID[focusedRoomId] : null;
  if (!room) return null;
  const here = botsInRoom(seating, room.id).map((id) => bots.find((bot) => bot.id === id)).filter((bot): bot is OfficeBot => Boolean(bot));
  return (
    <div className="office-focus" role="region" aria-label={`Sala ${room.name}`} data-focus-room={room.id}>
      <button type="button" className="office-button primary" onClick={() => useOfficeStore.getState().backToFloor()}>
        <ArrowLeft size={14} aria-hidden /> Voltar ao andar
      </button>
      <div className="office-focus-text">
        <strong>
          <span className="office-room-dot" style={{ background: room.color }} aria-hidden /> {room.name}
        </strong>
        <span>{room.purpose}</span>
      </div>
      {here.length > 0 && (
        <div className="office-focus-bots">
          {here.slice(0, 6).map((bot) => (
            <button key={bot.id} type="button" className="office-button" onClick={() => useOfficeStore.getState().selectBot(bot.id)}>
              <span className="agent-dot" style={{ background: bot.color }} aria-hidden />
              {bot.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CameraBar() {
  const framing = useOfficeStore((state) => state.framing);
  const graphicsMode = useHQStore((state) => state.graphicsMode);
  const setGraphicsMode = useHQStore((state) => state.setGraphicsMode);
  const autoQuality = useHQStore((state) => state.autoQuality);
  const outside = useOfficeStore((state) => state.buildingView === "exterior");
  return (
    <div className="office-bottom" data-office-inset="bottom">
      <div className="office-camera" role="group" aria-label="Câmera">
        <button type="button" className="office-icon" onClick={() => zoomStep(0.8)} aria-label="Afastar" title="Afastar (−)">
          <Minus size={15} aria-hidden />
        </button>
        <button type="button" className="office-icon" onClick={() => zoomStep(1.25)} aria-label="Aproximar" title="Aproximar (+)">
          <Plus size={15} aria-hidden />
        </button>
        <button
          type="button"
          className="office-button"
          disabled={framing === "floor"}
          onClick={() => useOfficeStore.getState().backToFloor()}
        >
          <Maximize size={13} aria-hidden /> {outside ? "Ver o prédio inteiro" : "Ver o andar inteiro"}
        </button>
      </div>
      <p className="office-hint">{outside ? "Aponte um andar e clique, ou use o seletor · arraste para mover · role para aproximar" : "Clique em um personagem para abrir · arraste para mover · role para aproximar · Esc volta"}</p>
      <div className="office-quality" role="group" aria-label="Qualidade gráfica">
        <span>Gráficos</span>
        {GRAPHICS_MODES.map((mode) => (
          <button key={mode} type="button" className={graphicsMode === mode ? "active" : undefined} aria-pressed={graphicsMode === mode} onClick={() => setGraphicsMode(mode)}>
            {GRAPHICS_LABEL[mode]}
            {mode === "auto" && graphicsMode === "auto" ? ` (${GRAPHICS_LABEL[autoQuality]})` : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Mede a gaveta aberta para a câmera enquadrar só o que sobra da tela. */
function useDrawerInset(open: boolean) {
  const setViewInsetRight = useHQStore((state) => state.setViewInsetRight);
  const node = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const element = node.current;
    if (!open || !element) return;
    const measure = () => {
      setViewInsetRight(Math.max(0, window.innerWidth - element.getBoundingClientRect().left));
      officeRuntime.placed = false;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      setViewInsetRight(0);
      officeRuntime.placed = false;
    };
  }, [open, setViewInsetRight]);
  return node;
}

/** A gaveta de uma pessoa: o que ela está fazendo agora e o que dá para mandar. */
function HumanPanel() {
  const selectedHumanId = useOfficeStore((state) => state.selectedHumanId);
  const humans = useOfficeStore((state) => state.humans);
  const goals = useOfficeStore((state) => state.humanGoals);
  const phases = useOfficeStore((state) => state.humanPhases);
  const human = humans.find((candidate) => candidate.id === selectedHumanId);
  const node = useDrawerInset(Boolean(human));
  if (!human) return null;
  const goal = goals[human.id] ?? "standing";
  const phase = phases[human.id] ?? "standing";
  const settled = phase === "standing" || phase === "seated";
  const store = useOfficeStore.getState();
  return (
    <aside ref={node} className="drawer office-demo-panel" aria-label={`Pessoa ${human.name}`} data-human-panel={human.id}>
      <header className="drawer-head">
        <div className="drawer-title">
          <span className="office-agent-avatar" style={{ "--agent-color": human.preset.colors.top } as React.CSSProperties} aria-hidden><PersonStanding size={22} /></span>
          <strong>{human.name}</strong>
          <span className="panel-tag">pessoa</span>
          <button type="button" className="panel-close" onClick={store.clearHuman} aria-label="Fechar (Esc)" title="Fechar (Esc)">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="drawer-sub">
          <span className="panel-role" data-human-phase={phase}>{human.id === CHIEF_ID ? "Chefe da equipe" : HUMAN_PHASE_LABEL[phase]}</span>
        </div>
      </header>
      <div className="drawer-body">
        {human.id === CHIEF_ID && <ChiefAgenda />}
        {human.id !== CHIEF_ID && <div className="office-human-actions">
          {goal === "standing" ? (
            <button type="button" className="office-button primary" disabled={!settled || !human.chair} data-human-sit onClick={() => store.setHumanGoal(human.id, "seated")}>
              <Armchair size={14} aria-hidden /> Sentar na bancada
            </button>
          ) : (
            <button type="button" className="office-button primary" disabled={!settled} data-human-stand onClick={() => store.setHumanGoal(human.id, "standing")}>
              <PersonStanding size={14} aria-hidden /> Levantar e voltar
            </button>
          )}
          <a className="office-button" href={`/avatares.html?pessoa=${encodeURIComponent(human.id)}`}>
            <Pencil size={13} aria-hidden /> Editar
          </a>
        </div>}
        {!human.chair && <p className="panel-warn">Os bots ocuparam as cadeiras da bancada: não há onde sentar agora.</p>}
        <p className="panel-warn">
          {human.id === CHIEF_ID ? "Exemplo, só na demonstração: a agenda é fictícia e ainda não lê o Outlook. A ronda é só visual e fica na Diretoria: o trajeto de elevador ainda não existe, então ele não aparece no térreo nem na Operação." : "Pessoa criada por você, não é um bot: não executa nada e não vem do Hermes. Ela só anda e senta quando você manda."}
        </p>
      </div>
    </aside>
  );
}

/** O que o Chefe está fazendo e a agenda de exemplo, com atalhos para ver cada cena. */
function ChiefAgenda() {
  const status = useOfficeStore((state) => state.chiefStatus);
  const pending = useOfficeStore((state) => state.chiefRequest);
  const request = useOfficeStore.getState().setChiefRequest;
  return (
    <section className="office-chief-agenda" data-chief-agenda>
      <p className={status === "reuniao" ? "office-chief-now busy" : "office-chief-now"}>{CHIEF_STATUS_LABEL[status]}</p>
      <h3>Agenda de hoje (exemplo)</h3>
      <ul>
        {SAMPLE_AGENDA.map((event) => (
          <li key={event.time}>
            <time>{event.time}</time>
            <span>{event.title}</span>
            <small>{event.calendar}</small>
          </li>
        ))}
      </ul>
      <div className="office-human-actions">
        <button type="button" className="office-button" disabled={Boolean(pending)} onClick={() => request("reuniao")}>Entrar em reunião</button>
        <button type="button" className="office-button" disabled={Boolean(pending)} onClick={() => request("ronda")}>Andar pela Diretoria</button>
        <button type="button" className="office-button" disabled={Boolean(pending)} onClick={() => { request("chegada"); useOfficeStore.getState().goToView("exterior"); }}>Rever a chegada</button>
      </div>
    </section>
  );
}

/** A gaveta da demonstração: quem é e onde senta. Nada de sessão, chat ou estado. */
function DemoPanel({ onConversation }: { onConversation: (botId: string) => void }) {
  const selectedBotId = useHQStore((state) => state.selectedBotId);
  const clearSelection = useHQStore((state) => state.clearSelection);
  const bots = useOfficeStore((state) => state.bots);
  const seating = useOfficeStore((state) => state.seating);
  const bot = bots.find((candidate) => candidate.id === selectedBotId);
  const node = useDrawerInset(Boolean(bot));

  if (!bot) return null;
  const seat = OFFICE_SEATS_BY_ID[seating.seats[bot.id] ?? ""];
  const room = seat ? OFFICE_ROOMS_BY_ID[seat.roomId] : null;
  return (
    <aside ref={node} className="drawer office-demo-panel" aria-label={`Bot ${bot.name}`} data-demo-panel={bot.id}>
      <header className="drawer-head">
        <div className="drawer-title">
          <span className="agent-dot" style={{ background: bot.color }} aria-hidden />
          <strong>{bot.name}</strong>
          <span className="panel-tag">demonstração</span>
          <button type="button" className="panel-close" onClick={clearSelection} aria-label="Fechar (Esc)" title="Fechar (Esc)">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="drawer-sub">
          <span className="panel-role">{bot.role}</span>
        </div>
      </header>
      <div className="drawer-body">
        <p className="panel-activity">{bot.responsibility}</p>
        <dl className="panel-stats">
          <div>
            <dt>Sala</dt>
            <dd>{room?.name ?? "—"}</dd>
          </div>
          <div>
            <dt>Lugar</dt>
            <dd>{seat ? SEAT_KIND_LABEL[seat.kind] : "—"}</dd>
          </div>
        </dl>
        <p className="panel-warn">
          Isto é uma demonstração: o bot não está executando nada, e não há sessões, mensagens nem estado ao vivo aqui. O
          voo é só desenho: não representa nenhuma tarefa.
        </p>
        <button type="button" className="office-button primary" data-open-conversation onClick={() => onConversation(bot.id)}>
          <MessagesSquare size={14} aria-hidden /> Conversar com {bot.name}
        </button>
        <a className="panel-link" href="/avatares.html?aba=robos">
          <Pencil size={12} aria-hidden />
          Mudar cor e expressão do robô
        </a>
        <a className="panel-link" href={OFFICE_LIVE_URL}>
          <ExternalLink size={12} aria-hidden />
          Abrir com a frota real do Hermes
        </a>
      </div>
    </aside>
  );
}

function LoadOverlay() {
  const load = useOfficeStore((state) => state.load);
  const error = useOfficeStore((state) => state.loadError);
  const figuresError = useOfficeStore((state) => state.figuresError);
  const humansError = useOfficeStore((state) => state.humansError);
  // progresso real dos arquivos (glTF e texturas), não um cronômetro
  const loaded = useProgress((state) => state.loaded);
  const total = useProgress((state) => state.total);
  const progressText = total > 0 ? `${Math.min(loaded, total)} de ${total} arquivos` : null;

  if (load === "loading") {
    return (
      <div className="boot-label">
        Montando o escritório…{progressText ? ` ${progressText}` : ""}
      </div>
    );
  }
  if (load === "stalled" || load === "failed") {
    return (
      <div className="boot-error" role="alert">
        <strong>{load === "stalled" ? "O escritório ainda está carregando." : "Não consegui montar o escritório."}</strong>
        <p>
          {error ??
            (progressText
              ? `Os arquivos da cena pararam de chegar em ${progressText}. Verifique se o servidor local segue de pé.`
              : "Os arquivos da cena não chegaram. Verifique se o servidor local segue de pé.")}
        </p>
        <button type="button" onClick={() => window.location.reload()}>Tentar de novo</button>
      </div>
    );
  }
  if (figuresError) {
    return (
      <div className="office-notice slim figures" role="alert">
        <TriangleAlert size={14} aria-hidden />
        <span>Os robôs não carregaram ({figuresError}); a planta e a lista seguem funcionando.</span>
        <button type="button" className="office-button" onClick={() => window.location.reload()}>Tentar de novo</button>
      </div>
    );
  }
  if (humansError) {
    return (
      <div className="office-notice slim figures" role="alert" data-humans-error>
        <TriangleAlert size={14} aria-hidden />
        <span>Uma pessoa não carregou por inteiro ({humansError}); o resto do escritório segue funcionando.</span>
        <button type="button" className="office-button" onClick={() => window.location.reload()}>Tentar de novo</button>
      </div>
    );
  }
  return null;
}

/** Interface do escritório. Mede os painéis para a câmera enquadrar só a área livre. */
export function OfficeHud({ live }: { live: boolean }) {
  const [rosterOpen, setRosterOpen] = useState(() => window.innerWidth >= ROSTER_MIN_WIDTH);
  const [view, setView] = useState<WorkspaceView>("escritorio");
  const [conversationBotId, setConversationBotId] = useState<string | null>(null);
  const bots = useOfficeStore((state) => state.bots);
  const { stills: portraits, sheets } = usePortraits(bots);
  const demo = useDemoConversations(live ? [] : bots.map((bot) => bot.id));
  const connection = useConnection();
  const shown = live ? connection : null;
  const layer = useRef<HTMLDivElement | null>(null);

  /** A conversa substitui a cena: a gaveta de quem estava selecionado não fica escondida atrás dela. */
  const openConversation = (botId: string) => {
    useHQStore.getState().clearSelection();
    useOfficeStore.getState().clearHuman();
    setConversationBotId(botId);
    setView("conversas");
    if (window.innerWidth <= SIDEBAR_OVERLAY_WIDTH) setRosterOpen(false);
  };
  const changeView = (next: WorkspaceView) => {
    if (next !== "conversas") {
      if (next === "equipe") {
        useHQStore.getState().clearSelection();
        useOfficeStore.getState().clearHuman();
        if (window.innerWidth <= SIDEBAR_OVERLAY_WIDTH) setRosterOpen(false);
      }
      setView(next);
      return;
    }
    const target = useHQStore.getState().selectedBotId ?? conversationBotId ?? bots[0]?.id;
    if (target) openConversation(target);
    else setView(next);
  };
  const conversationBot = bots.find((bot) => bot.id === conversationBotId) ?? bots[0];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setRosterOpen(true);
      requestAnimationFrame(() => layer.current?.querySelector<HTMLInputElement>(".office-roster-search")?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const element = layer.current;
    if (!element) return;
    const measure = () => {
      const top = element.querySelector('[data-office-inset="top"]')?.getBoundingClientRect();
      const left = element.querySelector('[data-office-inset="left"]')?.getBoundingClientRect();
      const bottom = element.querySelector('[data-office-inset="bottom"]')?.getBoundingClientRect();
      useOfficeStore.getState().setInsets({
        top: top ? Math.round(top.bottom) : 0,
        left: left ? Math.round(left.right) : 0,
        bottom: bottom ? Math.round(window.innerHeight - bottom.top) : 0,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.querySelectorAll("[data-office-inset]")) observer.observe(child);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [rosterOpen]);

  return (
    <div className="office-hud" data-sidebar-open={rosterOpen} data-office-view={view} ref={layer}>
      <TopBar connection={shown} title={VIEW_TITLE[view]} />
      <Roster
        open={rosterOpen}
        onToggle={() => setRosterOpen((value) => !value)}
        view={view}
        onView={changeView}
        conversationBotId={conversationBot?.id ?? null}
        onConversation={openConversation}
        sheets={sheets}
        demo={demo}
      />
      {view === "kanban" && <OfficeKanban embedded onClose={() => setView("escritorio")} />}
      {view === "equipe" && <OfficeOrgChart bots={bots} sheets={sheets} onOpen={openConversation} />}
      {view === "conversas" && <OfficeConversations bot={conversationBot} bots={bots} live={live} portraits={portraits} demo={demo} />}
      <FocusBar />
      {!live && <FloorSelector />}
      <OfflineNotice connection={shown} />
      <CameraBar />
      {live ? <BotDrawer characterTab={false} /> : <DemoPanel onConversation={openConversation} />}
      {!live && <HumanPanel />}
      <LoadOverlay />
    </div>
  );
}
