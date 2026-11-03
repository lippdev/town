import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, SlidersHorizontal, X } from "lucide-react";
import { useHQStore } from "@/state/useHQStore";
import type { BotSnapshot, SessionSnapshot } from "@/integrations/hq/types";
import type { RoomDefinition } from "@/types/hq";
import { useGatewayStatus } from "@/integrations/hermes/gatewayStatus";
import { sceneAgentsFromFleet } from "@/world/characters/sceneAgents";
import { ageLabel, gatewayNotice, relativeTime, stateLabel } from "@/components/hud/fleetView";
import { routineHealth, routineStatusText } from "@/components/hud/routines";
import { sessionTitle, sourceLabel } from "@/components/hud/sessions";
import { drawerSubject } from "@/components/hud/selection";
import { CharacterEditor } from "@/components/hud/CharacterEditor";

type DrawerTab = "resumo" | "sessoes" | "personagem";

/** Quantas sessões o resumo mostra antes do "ver todas". */
const SUMMARY_SESSIONS = 3;

/**
 * Gaveta lateral direita: tudo sobre o bot (ou a sala) selecionado.
 *
 * Fica fora da cena em vez de flutuar sobre ela — o painel antigo abria no
 * meio da tela e cobria o próprio personagem. A gaveta informa sua largura
 * ao store, e a câmera desloca o centro da projeção para o foco cair na área
 * que continua visível.
 */
export function BotDrawer() {
  const fleet = useHQStore((state) => state.fleet);
  const selectedBotId = useHQStore((state) => state.selectedBotId);
  const selectedRoomId = useHQStore((state) => state.selectedRoomId);
  const clearSelection = useHQStore((state) => state.clearSelection);
  const setViewInsetRight = useHQStore((state) => state.setViewInsetRight);
  const subject = drawerSubject(fleet, selectedBotId, selectedRoomId);
  const open = subject !== null;
  const drawerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = drawerRef.current;
    if (!open || !node) {
      setViewInsetRight(0);
      return;
    }
    const measure = () => setViewInsetRight(Math.max(0, window.innerWidth - node.getBoundingClientRect().left));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      setViewInsetRight(0);
    };
  }, [open, setViewInsetRight]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, clearSelection]);

  if (!subject) return null;

  return (
    <aside
      ref={drawerRef}
      className="drawer"
      aria-label={subject.kind === "bot" ? `Bot ${subject.bot.name}` : `Sala ${subject.room.name}`}
    >
      {subject.kind === "bot" ? (
        <BotContent key={subject.bot.id} bot={subject.bot} onClose={clearSelection} />
      ) : (
        <RoomContent room={subject.room} onClose={clearSelection} />
      )}
    </aside>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="panel-close" onClick={onClose} aria-label="Fechar (Esc)" title="Fechar (Esc)">
      <X size={16} aria-hidden />
    </button>
  );
}

function BotContent({ bot, onClose }: { bot: BotSnapshot; onClose: () => void }) {
  const [tab, setTab] = useState<DrawerTab>("resumo");
  const fleet = useHQStore((state) => state.fleet);
  const sessions = bot.sessions ?? [];
  const base = sceneAgentsFromFleet(fleet).find((agent) => agent.id === bot.id) ?? { color: "#2563eb" };

  const tabs: Array<{ id: DrawerTab; label: string; count?: number }> = [
    { id: "resumo", label: "Resumo" },
    { id: "sessoes", label: "Sessões", count: bot.sessionCount },
    { id: "personagem", label: "Personagem" },
  ];

  return (
    <>
      <header className="drawer-head">
        <div className="drawer-title">
          <span className={`bot-state-dot bot-state-${bot.state}`} aria-hidden />
          <strong>{bot.name}</strong>
          {bot.isDefault && <span className="panel-tag">default</span>}
          <CloseButton onClose={onClose} />
        </div>
        <div className="drawer-sub">
          {bot.title && <span className="panel-role">{bot.title}</span>}
          <span className="panel-state">
            <em>{stateLabel(bot.state)}</em> · {relativeTime(bot.lastActiveAt)}
          </span>
        </div>
        <nav className="drawer-tabs" role="tablist" aria-label="Seções do bot">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={tab === entry.id ? "drawer-tab active" : "drawer-tab"}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
              {entry.count !== undefined && entry.count > 0 && <span className="drawer-tab-count">{entry.count}</span>}
            </button>
          ))}
        </nav>
      </header>

      <div className="drawer-body" role="tabpanel">
        {tab === "resumo" && (
          <BotSummary bot={bot} onAllSessions={() => setTab("sessoes")} />
        )}
        {tab === "sessoes" &&
          (sessions.length === 0 ? (
            <p className="panel-sessions-empty">Nenhuma sessão reportada para este bot.</p>
          ) : (
            <SessionItems sessions={sessions} total={bot.sessionCount} />
          ))}
        {tab === "personagem" && <CharacterEditor agentId={bot.id} base={base} />}
      </div>
    </>
  );
}

function BotSummary({ bot, onAllSessions }: { bot: BotSnapshot; onAllSessions: () => void }) {
  const fleet = useHQStore((state) => state.fleet);
  const notice = gatewayNotice(fleet);
  const sessions = bot.sessions ?? [];
  const failing = (bot.routines ?? []).filter((routine) => {
    const health = routineHealth(routine);
    return health === "failed" || health === "delivery";
  });

  return (
    <>
      {bot.activity ? (
        <p className="panel-activity">{bot.activity}</p>
      ) : (
        <p className="panel-activity muted">Sem atividade recente reportada pelo Hermes.</p>
      )}
      <dl className="panel-stats">
        <div>
          <dt>Sessões</dt>
          <dd>
            {bot.sessionCount}
            {bot.activeSessions > 0 ? ` (${bot.activeSessions} ativa${bot.activeSessions > 1 ? "s" : ""})` : ""}
          </dd>
        </div>
        <div>
          <dt>Rotinas</dt>
          <dd>{bot.routineCount}</dd>
        </div>
        <div>
          <dt>Modelo</dt>
          <dd title={bot.model ?? undefined}>{bot.model ?? "—"}</dd>
        </div>
        <div>
          <dt>Próxima rotina</dt>
          <dd>{bot.nextRoutineAt ? relativeTime(bot.nextRoutineAt) : "—"}</dd>
        </div>
      </dl>
      {failing.length > 0 && (
        <p className="panel-warn">
          Rotina <strong>{failing[0].name}</strong> {routineStatusText(failing[0])}
          {failing[0].lastAt ? ` ${relativeTime(failing[0].lastAt)}` : ""}
          {failing[0].lastError ? `: ${failing[0].lastError}` : ""}
          {failing.length > 1 ? ` (+${failing.length - 1} com problema)` : ""}
        </p>
      )}
      {fleet?.stale && (
        <p className="panel-warn">
          Leitura atrasada: os dados têm {ageLabel(fleet.fetchedAt)}
          {fleet.errorDetail ? ` (${fleet.errorDetail})` : ""}.
        </p>
      )}
      {notice && !fleet?.stale && <p className="panel-warn">{notice}</p>}
      {sessions.length > 0 ? (
        <SessionItems
          sessions={sessions.slice(0, SUMMARY_SESSIONS)}
          total={bot.sessionCount}
          footer={
            sessions.length > SUMMARY_SESSIONS || bot.sessionCount > SUMMARY_SESSIONS ? (
              <button type="button" className="drawer-more" onClick={onAllSessions}>
                Ver todas as sessões
              </button>
            ) : null
          }
        />
      ) : (
        <p className="panel-sessions-empty">Nenhuma sessão reportada para este bot.</p>
      )}
      {bot.description && <p className="panel-resp">{bot.description}</p>}
      <DashboardLink botId={bot.id} />
    </>
  );
}

/**
 * Lista de sessões em duas linhas fixas: título e origem em cima, quando e
 * quantas mensagens embaixo. A versão anterior deixava o grid quebrar a meta
 * em uma palavra por linha ("16 / min / · / 10 / msg").
 */
function SessionItems({
  sessions,
  total,
  footer,
}: {
  sessions: SessionSnapshot[];
  total: number;
  footer?: ReactNode;
}) {
  return (
    <div className="panel-sessions">
      <div className="panel-sessions-head">
        Sessões recentes <span>{total > sessions.length ? `${sessions.length} de ${total}` : total}</span>
      </div>
      <ul>
        {sessions.map((session) => (
          <li key={session.id} className={session.active ? "session-item active" : "session-item"}>
            <span className="session-line">
              <span className="session-name" title={sessionTitle(session)}>
                {sessionTitle(session)}
              </span>
              <span className="session-source">{sourceLabel(session.source)}</span>
            </span>
            <span className="session-meta">
              {session.active && <span className="session-live">ativa</span>}
              {relativeTime(session.lastActiveAt)} · {session.messageCount ?? 0} msg
            </span>
          </li>
        ))}
      </ul>
      {footer}
    </div>
  );
}

function RoomContent({ room, onClose }: { room: RoomDefinition; onClose: () => void }) {
  return (
    <header className="drawer-head">
      <div className="drawer-title">
        <span className="agent-dot" style={{ background: room.color }} aria-hidden />
        <strong>{room.name}</strong>
        <CloseButton onClose={onClose} />
      </div>
      <div className="drawer-sub">
        <span className="panel-role">{room.kind === "department" ? "Departamento sem bot no posto" : "Área comum"}</span>
        <span className="panel-state">
          <SlidersHorizontal size={12} aria-hidden /> Duplo clique foca a sala
        </span>
      </div>
    </header>
  );
}

/**
 * Link para o dashboard do Hermes com o escopo do perfil daquele bot.
 *
 * `?profile=` é o parâmetro que o próprio dashboard lê para abrir no perfil
 * certo (apps/desktop …/use-gateway-boot-webapp-profile). Sem URL de dashboard
 * configurada, não existe link — melhor ausente que quebrado.
 */
function DashboardLink({ botId }: { botId: string }) {
  const status = useGatewayStatus();
  const dataSource = useHQStore((state) => state.dataSource);
  if (dataSource !== "live" || !status?.dashboardUrl) return null;

  const base = status.dashboardUrl.replace(/\/+$/, "");
  const href = `${base}/?profile=${encodeURIComponent(botId)}`;
  return (
    <a className="panel-link" href={href} target="_blank" rel="noreferrer noopener">
      <ExternalLink size={12} aria-hidden />
      Abrir no dashboard do Hermes
    </a>
  );
}
