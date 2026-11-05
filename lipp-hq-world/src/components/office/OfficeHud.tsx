import { useEffect, useRef, useState } from "react";
import { Armchair, ArrowLeft, ExternalLink, Maximize, Minus, PanelLeftClose, PanelLeftOpen, Pencil, PersonStanding, Plus, RefreshCw, TriangleAlert, X } from "lucide-react";
import { stateLabel } from "@/components/hud/fleetView";
import { BotDrawer } from "@/components/hud/BotDrawer";
import { useHQStore } from "@/state/useHQStore";
import { GRAPHICS_LABEL, GRAPHICS_MODES } from "@/world/quality";
import { OFFICE_ROOMS, OFFICE_ROOMS_BY_ID, OFFICE_SEATS_BY_ID, SEAT_CAPACITY, SEAT_KIND_LABEL } from "@/world/office/officeLayout";
import { OFFICE_DEMO_URL, OFFICE_LIVE_URL, officeConnection, type OfficeConnection } from "@/world/office/officeRoute";
import { HUMAN_CAPACITY, HUMAN_PHASE_LABEL } from "@/world/office/officeHumans";
import { botsInRoom, type OfficeBot } from "@/world/office/officeRoster";
import { OfficeKanban } from "./OfficeKanban";
import { CHIEF_ID, CHIEF_STATUS_LABEL, SAMPLE_AGENDA } from "@/world/office/officeChief";
import { useOfficeStore, zoomStep } from "@/world/office/officeStore";

/** Abaixo disto o painel abre recolhido: a planta precisa da largura. */
const ROSTER_MIN_WIDTH = 1180;
/** Sem resposta do Hermes neste tempo, o app para de dizer "conectando". */
const CONNECT_WAIT_MS = 6000;

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

function TopBar({ connection }: { connection: OfficeConnection | null }) {
  const [kanbanOpen, setKanbanOpen] = useState(false);
  const demo = connection === null;
  return (
    <>
    <header className="office-top" data-office-inset="top">
      <div className="office-brand">
        <span className="sidebar-dot" aria-hidden />
        <strong>Lipp HQ</strong>
        <span>Escritório completo</span>
      </div>
      <ModeChip connection={connection} />
      {demo && <span className="office-demo-note">Sete bots de referência, sem Hermes: nada aqui é atividade real.</span>}
      <nav className="office-nav" aria-label="Outras páginas">
        <a href={demo ? OFFICE_LIVE_URL : OFFICE_DEMO_URL}>{demo ? "Usar frota do Hermes" : "Ver demonstração"}</a>
        <a href="/">Painel clássico</a>
        <a href="/?prototipo=engenharia">Sala Engenharia</a>
        <a href="/personagens.html">Estúdio</a>
        <a href="/avatares.html">Criar pessoa</a>
        <a href="/avatares.html?aba=robos">Robôs</a>
        {demo && <button type="button" className="office-nav-button" onClick={() => setKanbanOpen(true)}>Kanban</button>}
      </nav>
    </header>
      {kanbanOpen && <OfficeKanban onClose={() => setKanbanOpen(false)} />}
    </>
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
function PeopleList() {
  const humans = useOfficeStore((state) => state.humans);
  const waiting = useOfficeStore((state) => state.humansWaiting);
  const selectedHumanId = useOfficeStore((state) => state.selectedHumanId);
  return (
    <section className="office-people" aria-label="Pessoas" data-people>
      <div className="office-people-head">
        <strong>Pessoas</strong>
        <a href="/avatares.html">Criar pessoa</a>
      </div>
      {humans.length === 0 && <p className="office-roster-empty">Ninguém ainda. Quem você criar e salvar aparece no hall.</p>}
      {humans.map((human) => (
        <button
          key={human.id}
          type="button"
          className={human.id === selectedHumanId ? "office-roster-bot active" : "office-roster-bot"}
          data-person-row={human.id}
          onClick={() => useOfficeStore.getState().selectHuman(human.id)}
        >
          <span className="agent-dot" style={{ background: human.preset.colors.top }} aria-hidden />
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

function Roster({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const bots = useOfficeStore((state) => state.bots);
  const seating = useOfficeStore((state) => state.seating);
  const focusedRoomId = useOfficeStore((state) => state.focusedRoomId);
  const selectedBotId = useHQStore((state) => state.selectedBotId);
  const mode = useOfficeStore((state) => state.mode);
  const byId = new Map(bots.map((bot) => [bot.id, bot]));
  const seated = Object.keys(seating.seats).length;

  if (!open) {
    return (
      <button type="button" className="office-roster-toggle closed" onClick={onToggle} aria-expanded={false} aria-label="Abrir salas e bots">
        <PanelLeftOpen size={16} aria-hidden /> Salas e bots
      </button>
    );
  }

  const row = (bot: OfficeBot) => (
    <button
      key={bot.id}
      type="button"
      className={bot.id === selectedBotId ? "office-roster-bot active" : "office-roster-bot"}
      onClick={() => useOfficeStore.getState().selectBot(bot.id)}
    >
      <span className="agent-dot" style={{ background: bot.color }} aria-hidden />
      <span className="office-roster-name">{bot.name}</span>
      {mode === "live" && bot.state && <span className="office-roster-state">{stateLabel(bot.state)}</span>}
    </button>
  );

  return (
    <aside className="office-roster" data-office-inset="left" aria-label="Salas e bots">
      <div className="office-roster-head">
        <strong>Salas e bots</strong>
        <button type="button" className="panel-close" onClick={onToggle} aria-expanded aria-label="Recolher salas e bots">
          <PanelLeftClose size={16} aria-hidden />
        </button>
      </div>
      <p className="office-capacity" data-capacity>
        {seated} de {SEAT_CAPACITY} postos ocupados
        {seating.unseated.length > 0 ? ` · ${seating.unseated.length} sem posto` : ""}
      </p>
      {mode === "demo" && <PeopleList />}
      <ul className="office-roster-list">
        {OFFICE_ROOMS.map((room) => {
          const here = botsInRoom(seating, room.id).map((id) => byId.get(id)).filter((bot): bot is OfficeBot => Boolean(bot));
          return (
            <li key={room.id} className={room.id === focusedRoomId ? "focused" : undefined}>
              <button type="button" className="office-roster-room" onClick={() => useOfficeStore.getState().focusRoom(room.id)}>
                <span className="office-room-dot" style={{ background: room.color }} aria-hidden />
                {room.name}
                {room.kind === "common" && <em>área comum</em>}
              </button>
              {here.map(row)}
              {here.length === 0 && room.kind === "department" && <span className="office-roster-empty">posto vazio</span>}
            </li>
          );
        })}
        {seating.unseated.length > 0 && (
          <li className="office-unseated">
            <div className="office-roster-room static">
              <TriangleAlert size={13} aria-hidden /> Sem posto ({seating.unseated.length})
            </div>
            <p>O andar tem {SEAT_CAPACITY} postos. Estes bots seguem na frota e abrem aqui, mas não têm corpo na cena.</p>
            {seating.unseated.map((id) => {
              const bot = byId.get(id);
              return bot ? row(bot) : null;
            })}
          </li>
        )}
      </ul>
    </aside>
  );
}

function FocusBar() {
  const focusedRoomId = useOfficeStore((state) => state.focusedRoomId);
  const seating = useOfficeStore((state) => state.seating);
  const bots = useOfficeStore((state) => state.bots);
  const room = focusedRoomId ? OFFICE_ROOMS_BY_ID[focusedRoomId] : null;
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
          <Maximize size={13} aria-hidden /> Ver o andar inteiro
        </button>
      </div>
      <p className="office-hint">Clique numa sala para entrar · arraste para mover · role para aproximar · Esc volta</p>
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
  useEffect(() => {
    const element = node.current;
    if (!open || !element) return;
    const measure = () => setViewInsetRight(Math.max(0, window.innerWidth - element.getBoundingClientRect().left));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      setViewInsetRight(0);
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
          <span className="agent-dot" style={{ background: human.preset.colors.top }} aria-hidden />
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
          {human.id === CHIEF_ID ? "Exemplo, só na demonstração: a agenda é fictícia e ainda não lê o Outlook. A ronda é só visual." : "Pessoa criada por você, não é um bot: não executa nada e não vem do Hermes. Ela só anda e senta quando você manda."}
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
        <button type="button" className="office-button" disabled={Boolean(pending)} onClick={() => request("ronda")}>Fazer a ronda</button>
        <button type="button" className="office-button" disabled={Boolean(pending)} onClick={() => request("chegada")}>Rever a chegada</button>
      </div>
    </section>
  );
}

/** A gaveta da demonstração: quem é e onde senta. Nada de sessão, chat ou estado. */
function DemoPanel() {
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
  if (load === "loading") return <div className="boot-label">Montando o escritório…</div>;
  if (load === "stalled" || load === "failed") {
    return (
      <div className="boot-error" role="alert">
        <strong>{load === "stalled" ? "O escritório está demorando para carregar." : "Não consegui montar o escritório."}</strong>
        <p>{error ?? "Os arquivos da cena não chegaram. Verifique se o servidor local segue de pé."}</p>
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
  const connection = useConnection();
  const shown = live ? connection : null;
  const layer = useRef<HTMLDivElement | null>(null);

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
    <div className="office-hud" ref={layer}>
      <TopBar connection={shown} />
      <Roster open={rosterOpen} onToggle={() => setRosterOpen((value) => !value)} />
      <FocusBar />
      <OfflineNotice connection={shown} />
      <CameraBar />
      {live ? <BotDrawer characterTab={false} /> : <DemoPanel />}
      {!live && <HumanPanel />}
      <LoadOverlay />
    </div>
  );
}
