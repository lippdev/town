import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Boxes,
  Cable,
  Camera,
  Clock,
  MessageSquareText,
  MonitorUp,
  Users,
  Play,
  Radio,
  RotateCcw,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { AGENTS_BY_ID } from "@/agents/agents";
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
import { ROOMS_BY_ID, roomCenter } from "@/world/rooms/rooms";
import { sceneAgentsFromFleet } from "@/world/characters/sceneAgents";
import {
  GATEWAY_LABEL,
  ageLabel,
  fleetCounts,
  freshnessBadge,
  gatewayNotice,
  relativeTime,
  stateLabel,
} from "@/components/hud/fleetView";
import type { BotSnapshot } from "@/integrations/hq/types";
import { STATE_FILTERS, nextIndex, visibleBots, type StateFilter } from "@/components/hud/fleetFilter";
import { sparklinePath, trend, type FleetSample } from "@/integrations/hermes/fleetHistory";
import { activeSessionTotal, fleetSessions, sourceLabel, type FleetSession } from "@/components/hud/sessions";
import { diagnosticsSummary, endpointRows, latencyText, type DiagnosticsSeverity } from "@/components/hud/diagnostics";
import { useGatewayStatus } from "@/integrations/hermes/gatewayStatus";

const SEVERITY_LABEL: Record<DiagnosticsSeverity, string> = {
  ok: "tudo respondendo",
  partial: "respondendo em parte",
  down: "sem resposta",
  unknown: "ainda sem leitura",
};

/**
 * Diagnóstico do gateway: é a tela que responde "por que não tem bot aqui?".
 *
 * Mostra cada endpoint com o caminho real (`/api/profiles`), status, latência e
 * o erro cru do Hermes — sem chave nenhuma: só diz se a credencial está
 * configurada, nunca o valor.
 */
function GatewayDiagnostics() {
  const fleet = useHQStore((state) => state.fleet);
  const dataSource = useHQStore((state) => state.dataSource);
  const refresh = useHQStore((state) => state.gatewayRefresh);
  const config = useGatewayStatus();
  const rows = endpointRows(fleet);
  const summary = diagnosticsSummary(fleet);

  return (
    <div className="sidebar-list gateway-diagnostics">
      <div className={`gateway-summary gateway-${summary.severity}`}>
        <strong>{SEVERITY_LABEL[summary.severity]}</strong>
        <span>
          {summary.okCount} de {summary.total} endpoints
        </span>
      </div>

      {rows.map((row) => {
        const diagnostic = row.diagnostic;
        const status = latencyText(diagnostic);
        const ok = diagnostic?.ok === true;
        return (
          <div key={row.id} className={`gateway-row ${ok ? "ok" : diagnostic ? "fail" : "idle"}`}>
            <span className="gateway-dot" aria-hidden />
            <span className="gateway-label">
              {row.label}
              <code>{row.path}</code>
            </span>
            <span className="gateway-latency">{status}</span>
            {diagnostic?.error && <span className="gateway-error">{diagnostic.error}</span>}
          </div>
        );
      })}

      <dl className="gateway-config">
        <div>
          <dt>Modo</dt>
          <dd>{dataSource === "live" ? "Hermes (ao vivo)" : "Demo"}</dd>
        </div>
        <div>
          <dt>API</dt>
          <dd>{config?.apiUrl ?? "—"}</dd>
        </div>
        <div>
          <dt>Dashboard</dt>
          <dd>{config?.dashboardUrl ?? "—"}</dd>
        </div>
        <div>
          <dt>Credenciais</dt>
          <dd>
            {config ? `${config.hasApiKey ? "chave ok" : "sem chave"} · ${config.hasDashboardToken ? "token ok" : "sem token"}` : "—"}
          </dd>
        </div>
        <div>
          <dt>Última leitura</dt>
          <dd>{fleet ? relativeTime(fleet.fetchedAt) : "—"}</dd>
        </div>
      </dl>

      <button type="button" className="gateway-retry" onClick={() => refresh?.()} disabled={!refresh}>
        Testar agora
      </button>
      <div className="sidebar-note">
        Somente leitura: o app faz GET nos endpoints documentados e nunca envia comando ao Hermes.
      </div>
    </div>
  );
}

/** Ponto da sala em coordenadas de tela para o painel flutuante. */

function Sidebar() {
  const [section, setSection] = useState("bots");
  const fleet = useHQStore((state) => state.fleet);
  const dataSource = useHQStore((state) => state.dataSource);
  const bots = fleet?.bots ?? [];
  const counts = fleetCounts(fleet);

  const briefings = bots.filter((bot) => bot.briefing).length;
  const items = [
    { id: "bots", label: "Bots", icon: Bot, badge: bots.length || null },
    { id: "briefing", label: "Briefing", icon: Users, badge: briefings || null },
    { id: "rotinas", label: "Rotinas", icon: Clock, badge: counts.routines || null },
    { id: "sessoes", label: "Sessões", icon: MessageSquareText, badge: counts.sessions || null },
    { id: "escritorio", label: "Escritório", icon: Boxes, badge: null },
    { id: "integracoes", label: "Integrações", icon: Cable, badge: null },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-dot" aria-hidden />
        <strong>Lipp HQ</strong>
        <span className="sidebar-mode">{dataSource === "demo" ? "Demo" : "Hermes"}</span>
      </div>
      <nav>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? "sidebar-item active" : "sidebar-item"}
            onClick={() => setSection(item.id)}
          >
            <item.icon size={15} />
            {item.label}
            {item.badge !== null && <span className="sidebar-badge">{item.badge}</span>}
          </button>
        ))}
      </nav>
      {section === "bots" && <BotRoster />}
      {section === "briefing" && <BriefingPanel />}
      {section === "rotinas" && <RoutineList />}
      {section === "sessoes" && <SessionList />}
      {section === "escritorio" && (
        <div className="sidebar-note">
          {bots.length > 0
            ? `${counts.working} trabalhando · ${counts.waiting} aguardando · ${counts.idle} ociosos`
            : "Nenhuma frota lida ainda: o gateway ainda não respondeu."}
        </div>
      )}
      {section === "integracoes" && <GatewayDiagnostics />}
    </aside>
  );
}

function BotRoster() {
  const fleet = useHQStore((state) => state.fleet);
  const dataSource = useHQStore((state) => state.dataSource);
  const agentStates = useHQStore((state) => state.agentStates);
  const selectedBotId = useHQStore((state) => state.selectedBotId);
  const selectBot = useHQStore((state) => state.selectBot);
  const focusRoom = useHQStore((state) => state.focusRoom);
  const notice = gatewayNotice(fleet);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StateFilter>("todos");
  const listRef = useRef<HTMLDivElement | null>(null);

  const bots = fleet?.bots ?? [];
  const shown = visibleBots(bots, query, filter);

  const moveSelection = (delta: number) => {
    if (shown.length === 0) return;
    const current = shown.findIndex((bot) => bot.id === selectedBotId);
    const target = shown[nextIndex(current, delta, shown.length)];
    if (!target) return;
    const roomId = AGENTS_BY_ID[target.id]?.roomId;
    if (roomId) focusRoom(roomId);
    selectBot(target.id);
    const node = listRef.current?.querySelector<HTMLElement>(`[data-bot-id="${target.id}"]`);
    node?.scrollIntoView({ block: "nearest" });
  };

  if (!fleet || fleet.bots.length === 0) {
    if (dataSource === "demo") {
      return (
        <>
          <div className="sidebar-note">
            Modo Demo: frota simulada. Configure o gateway Hermes (<code>HERMES_DASHBOARD_URL</code>) para ver os bots reais.
          </div>
          <div className="sidebar-list">
            {Object.entries(agentStates)
              .filter(([agentId]) => AGENTS_BY_ID[agentId])
              .map(([agentId, state]) => (
                <button
                  key={agentId}
                  type="button"
                  className={selectedBotId === agentId ? "sidebar-row agent-row active" : "sidebar-row agent-row"}
                  onClick={() => {
                    focusRoom(AGENTS_BY_ID[agentId].roomId);
                    selectBot(agentId);
                  }}
                >
                  <span className={`bot-state-dot bot-state-${state === "working" ? "working" : "idle"}`} aria-hidden />
                  <span className="agent-name">{AGENTS_BY_ID[agentId].name}</span>
                  <span className="agent-state">{stateLabel(state)}</span>
                </button>
              ))}
          </div>
        </>
      );
    }
    return (
      <div className="sidebar-note sidebar-note-warn">
        <TriangleAlert size={12} />
        <span>
          {notice ?? "Nenhum bot reportado pelo Hermes."}
          <button
            type="button"
            className="note-retry"
            onClick={() => useHQStore.getState().gatewayRefresh?.()}
          >
            tentar de novo
          </button>
        </span>
      </div>
    );
  }

  return (
    <>
      {fleet.stale && (
        <div className="sidebar-note sidebar-note-warn">
          <TriangleAlert size={12} />
          <span>
            Leitura atrasada há {ageLabel(fleet.fetchedAt)}.
            <button
              type="button"
              className="note-retry"
              onClick={() => useHQStore.getState().gatewayRefresh?.()}
            >
              tentar de novo
            </button>
          </span>
        </div>
      )}
      <div className="roster-tools">
        <input
          className="roster-search"
          type="search"
          value={query}
          placeholder="Buscar bot, título ou modelo"
          aria-label="Buscar na frota"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveSelection(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveSelection(-1);
            } else if (event.key === "Escape") {
              setQuery("");
            }
          }}
        />
        <div className="roster-filters" role="group" aria-label="Filtrar por estado">
          {STATE_FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={filter === entry.id ? "chip active" : "chip"}
              aria-pressed={filter === entry.id}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>
      <div className="sidebar-list" ref={listRef}>
        {shown.length === 0 && <div className="sidebar-note">Nenhum bot com esse filtro.</div>}
        {shown.map((bot) => {
          const roomId = AGENTS_BY_ID[bot.id]?.roomId;
          return (
            <button
              key={bot.id}
              data-bot-id={bot.id}
              type="button"
              className={selectedBotId === bot.id ? "sidebar-row agent-row active" : "sidebar-row agent-row"}
              onClick={() => {
                if (roomId) focusRoom(roomId);
                selectBot(bot.id);
              }}
              title={bot.activity ?? bot.title ?? bot.id}
            >
              <span className={`bot-state-dot bot-state-${bot.briefing ? "working" : bot.state}`} aria-hidden />
              <span className="agent-name">{bot.name}</span>
              <span className="agent-state">{bot.briefing ? "em briefing" : stateLabel(bot.state)}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function BriefingPanel() {
  const fleet = useHQStore((state) => state.fleet);
  const focusRoom = useHQStore((state) => state.focusRoom);
  const inMeeting = (fleet?.bots ?? []).filter((bot) => bot.briefing);
  const scheduled = (fleet?.bots ?? []).flatMap((bot) =>
    (bot.routines ?? [])
      .filter((routine) => /briefing|resumo|di[áa]ri|semanal|mensal/i.test(routine.name))
      .map((routine) => ({ bot: bot.name, routine })),
  );

  return (
    <>
      {inMeeting.length === 0 ? (
        <div className="sidebar-note">
          Nenhum briefing acontecendo agora. Quando um bot roda um briefing de rotina, ele vai para a sala de reuniões.
        </div>
      ) : (
        <div className="sidebar-list">
          {inMeeting.map((bot) => (
            <button
              key={bot.id}
              type="button"
              className="sidebar-row agent-row"
              onClick={() => focusRoom("reunioes")}
            >
              <span className="bot-state-dot bot-state-working" aria-hidden />
              <span className="agent-name">{bot.name}</span>
              <span className="agent-state">há {bot.briefing?.since ? Math.max(0, Math.round((Date.now() - bot.briefing.since) / 60000)) : 0} min</span>
            </button>
          ))}
        </div>
      )}
      {scheduled.length > 0 && (
        <div className="sidebar-list">
          <div className="sidebar-subhead">Agenda de briefing</div>
          {scheduled.map(({ bot, routine }) => (
            <div key={`${bot}-${routine.id}`} className="sidebar-row">
              <Clock size={12} />
              <span className="agent-name">{routine.name}</span>
              <span className="agent-state">
                {bot} · {routine.nextAt ? relativeTime(routine.nextAt) : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function RoutineList() {
  const fleet = useHQStore((state) => state.fleet);
  const bots = fleet?.bots.filter((bot) => bot.routineCount > 0) ?? [];

  if (bots.length === 0) {
    return <div className="sidebar-note">Nenhuma rotina agendada reportada pelo Hermes.</div>;
  }

  return (
    <div className="sidebar-list">
      {bots.map((bot) => (
        <div key={bot.id} className="sidebar-row">
          <Clock size={12} />
          <span className="agent-name">{bot.name}</span>
          <span className="agent-state">
            {bot.routineCount} · {bot.nextRoutineAt ? relativeTime(bot.nextRoutineAt) : "sem agenda"}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Sessões reais da frota, uma linha por sessão, da mais recente para a mais
 * antiga. Clicar leva ao bot dono dela — é o drill-down do número que aparece
 * no resumo ("21 sessões").
 */
function SessionList() {
  const fleet = useHQStore((state) => state.fleet);
  const selectBot = useHQStore((state) => state.selectBot);
  const bots = fleet?.bots ?? [];
  const colors = useMemo(
    () => Object.fromEntries(sceneAgentsFromFleet(fleet).map((agent) => [agent.id, agent.color])),
    [fleet],
  );
  const rows = fleetSessions(bots, colors);
  const active = activeSessionTotal(bots);
  const total = bots.reduce((sum, bot) => sum + bot.sessionCount, 0);

  if (rows.length === 0) {
    return <div className="sidebar-note">Nenhuma sessão reportada pelo Hermes.</div>;
  }

  return (
    <div className="sidebar-list">
      <div className="sidebar-note">
        {active} ativas de {total} sessões · janela de 5 min do Hermes
      </div>
      {rows.map((row) => (
        <button
          key={`${row.botId}-${row.session.id}`}
          type="button"
          className="sidebar-row session-row"
          onClick={() => selectBot(row.botId)}
          title={row.session.preview ?? row.session.title ?? "Sessão"}
        >
          <span className="agent-dot" style={{ background: row.botColor }} aria-hidden />
          <span className="session-bot">{row.botName}</span>
          <span className="session-source">{sourceLabel(row.session.source)}</span>
          <span className="agent-state">{relativeTime(row.session.lastActiveAt)}</span>
          <span className="session-title">{sessionTitle(row.session)}</span>
        </button>
      ))}
    </div>
  );
}

function sessionTitle(session: FleetSession["session"]): string {
  return session.title ?? session.preview ?? "sem título";
}

/** Sessões recentes de um bot, dentro do painel. */
function BotSessions({ bot }: { bot: BotSnapshot }) {
  const sessions = bot.sessions ?? [];
  if (sessions.length === 0) {
    return <p className="panel-sessions-empty">Nenhuma sessão reportada para este bot.</p>;
  }
  return (
    <div className="panel-sessions">
      <div className="panel-sessions-head">
        Sessões recentes <span>{bot.sessionCount > sessions.length ? `${sessions.length} de ${bot.sessionCount}` : bot.sessionCount}</span>
      </div>
      <ul>
        {sessions.map((session) => (
          <li key={session.id} className={session.active ? "active" : undefined}>
            <span className="session-source">{sourceLabel(session.source)}</span>
            <span className="session-name">{sessionTitle(session)}</span>
            <span className="session-meta">
              {relativeTime(session.lastActiveAt)} · {session.messageCount ?? 0} msg
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Janela real das amostras e a variação de quem está trabalhando. */
function windowLabel(samples: FleetSample[]): string {
  if (samples.length < 2) return "lendo…";
  const minutes = Math.max(1, Math.round((samples[samples.length - 1].at - samples[0].at) / 60000));
  const delta = trend(samples, (sample) => sample.working);
  const variation = delta === 0 ? "estável" : `${delta > 0 ? "+" : ""}${delta} trabalhando`;
  return `${minutes} min · ${variation}`;
}

/** Sparkline real da frota: cada ponto é uma leitura do gateway. */
function FleetSparkline({ samples }: { samples: FleetSample[] }) {
  const series = [
    { key: "working", color: "#4ade80", pick: (sample: FleetSample) => sample.working },
    { key: "briefing", color: "#93c5fd", pick: (sample: FleetSample) => sample.briefing },
    { key: "waiting", color: "#facc15", pick: (sample: FleetSample) => sample.waiting },
  ];
  const hasLine = series.some((entry) => sparklinePath(samples, entry.pick, 120, 22) !== "");

  if (!hasLine) return null;

  return (
    <div className="fleet-spark" title="Atividade real nos últimos minutos">
      <svg viewBox="0 0 120 22" preserveAspectRatio="none" aria-hidden focusable="false">
        {series.map((entry) => {
          const path = sparklinePath(samples, entry.pick, 120, 22);
          return path ? <path key={entry.key} d={path} fill="none" stroke={entry.color} strokeWidth={1.4} /> : null;
        })}
      </svg>
      <span className="fleet-spark-label">{windowLabel(samples)}</span>
    </div>
  );
}

function FleetSummary() {
  const fleet = useHQStore((state) => state.fleet);
  const fleetHistory = useHQStore((state) => state.fleetHistory);
  if (!fleet || fleet.bots.length === 0) return null;
  const counts = fleetCounts(fleet);
  const items = [
    { key: "working", label: "trabalhando", value: counts.working },
    { key: "waiting", label: "aguardando", value: counts.waiting },
    { key: "idle", label: "ociosos", value: counts.idle },
    { key: "sessions", label: "sessões", value: counts.sessions },
    { key: "routines", label: "rotinas", value: counts.routines },
  ];

  return (
    <div className="fleet-summary">
      {items.map((item) => (
        <div key={item.key} className={`fleet-stat fleet-stat-${item.key}`}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
      <FleetSparkline samples={fleetHistory} />
    </div>
  );
}

function ReplayDemoButton() {
  const dataSource = useHQStore((state) => state.dataSource);
  if (dataSource !== "demo") return null;

  return (
    <button
      type="button"
      className="chip"
      onClick={() => useHQStore.setState({ demoRestart: Date.now() })}
    >
      <Play size={12} /> Replay demo
    </button>
  );
}

function GatewayChip() {
  const fleet = useHQStore((state) => state.fleet);
  const health = fleet?.health;
  const overall = health?.api === "online" && health.dashboard === "online"
    ? "online"
    : health?.dashboard === "offline" && health.api === "offline"
      ? "offline"
      : "degraded";
  const counts = fleetCounts(fleet);
  const badge = freshnessBadge(fleet);

  return (
    <div className={`connection connection-${overall}`} title={gatewayNotice(fleet) ?? "Hermes via gateway"}>
      <Radio size={13} />
      Hermes · {GATEWAY_LABEL[overall]}
      {health?.version ? <span className="connection-version">v{health.version.replace(/^fixture-/, "")}</span> : null}
      {counts.total > 0 ? <span className="connection-count">{counts.total} bots</span> : null}
      {badge && badge.tone === "stale" ? <span className="connection-stale">{badge.label}</span> : null}
    </div>
  );
}

function TopBar() {
  const wallMode = useHQStore((state) => state.wallMode);
  const setWallMode = useHQStore((state) => state.setWallMode);
  const resetCamera = useHQStore((state) => state.resetCamera);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const clockLabel = clock.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dateLabel = clock.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  return (
    <div className="topbar">
      <GatewayChip />
      <div className="topbar-clock">
        {dateLabel} · {clockLabel}
      </div>
      <div className="wall-modes" role="group" aria-label="Modo das paredes">
        {(["auto", "low", "full"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={wallMode === mode ? "chip active" : "chip"}
            onClick={() => setWallMode(mode)}
          >
            {mode === "auto" ? "Auto" : mode === "low" ? "Baixas" : "Completas"}
          </button>
        ))}
      </div>
      <button type="button" className="chip" onClick={() => resetCamera()}>
        <RotateCcw size={12} /> Reset
      </button>
      <ReplayDemoButton />
    </div>
  );
}

function ActivityFeed() {
  const events = useHQStore((state) => state.events);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`feed ${collapsed ? "collapsed" : ""}`}>
      <button type="button" className="feed-toggle" onClick={() => setCollapsed(!collapsed)}>
        <MonitorUp size={13} /> Atividade {collapsed ? "" : `(${events.length})`}
      </button>
      {!collapsed && (
        <ul>
          {events.slice(0, 8).map((event) => {
            const agent = event.agentId ? AGENTS_BY_ID[event.agentId] : null;
            return (
              <li key={event.id}>
                <span className="feed-time">
                  {new Date(event.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
                {agent && <span className="agent-dot" style={{ background: agent.color }} aria-hidden />}
                <span className="feed-summary">{event.summary ?? event.type}</span>
                {event.source === "demo" && <span className="feed-demo">demo</span>}
              </li>
            );
          })}
          {events.length === 0 && <li className="feed-empty">Sem atividade registrada.</li>}
        </ul>
      )}
    </div>
  );
}

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
function CharacterEditor({ agentId, base }: { agentId: string; base: { color: string; hairColor?: string } }) {
  const [open, setOpen] = useState(false);
  const override = useHQStore((state) => state.agentLooks[agentId]);
  const chooseAgentPreset = useHQStore((state) => state.chooseAgentPreset);
  const updateAgentLook = useHQStore((state) => state.updateAgentLook);
  const randomizeAgentLook = useHQStore((state) => state.randomizeAgentLook);
  const resetAgentLook = useHQStore((state) => state.resetAgentLook);

  const identityColor = base.color;
  const look = resolveLook(base, override);
  const presetId = override?.presetId ?? null;

  return (
    <section className="character-editor" aria-label="Editor de personagem">
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
            aria-selected={presetId === preset.id && !override?.skin && !override?.hair}
            aria-label={preset.label}
            title={preset.label}
            className={presetId === preset.id ? "preset-card active" : "preset-card"}
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

function BotPanel({ bot }: { bot: BotSnapshot }) {
  const clearSelection = useHQStore((state) => state.clearSelection);
  const fleet = useHQStore((state) => state.fleet);
  const notice = gatewayNotice(fleet);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className={`bot-state-dot bot-state-${bot.state}`} aria-hidden />
        <strong>{bot.name}</strong>
        {bot.isDefault && <span className="panel-tag">default</span>}
        <button type="button" className="panel-close" onClick={clearSelection} aria-label="Fechar">
          ×
        </button>
      </div>
      {bot.title && <div className="panel-role">{bot.title}</div>}
      <div className="panel-state">
        Estado: <em>{stateLabel(bot.state)}</em> · {relativeTime(bot.lastActiveAt)}
      </div>
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
          <dd>{bot.model ?? "—"}</dd>
        </div>
        <div>
          <dt>Próxima rotina</dt>
          <dd>{bot.nextRoutineAt ? relativeTime(bot.nextRoutineAt) : "—"}</dd>
        </div>
      </dl>
      <BotSessions bot={bot} />
      {bot.description && <p className="panel-resp">{bot.description}</p>}
      {fleet?.stale && (
        <p className="panel-warn">
          Leitura atrasada: os dados têm {ageLabel(fleet.fetchedAt)}
          {fleet.errorDetail ? ` (${fleet.errorDetail})` : ""}.
        </p>
      )}
      {notice && !fleet?.stale && <p className="panel-warn">{notice}</p>}
      <CharacterEditor
        agentId={bot.id}
        base={sceneAgentsFromFleet(fleet).find((sceneAgent) => sceneAgent.id === bot.id) ?? { color: "#2563eb" }}
      />
    </div>
  );
}

/**
 * Painel de um agente em Demo: mesma estrutura do painel de bot, mas sem as
 * métricas do Hermes (que não existem em simulação) e com o rótulo explícito.
 */
function DemoAgentPanel({ agentId }: { agentId: string }) {
  const agent = AGENTS_BY_ID[agentId];
  const state = useHQStore((store) => store.agentStates[agentId] ?? "idle");
  const clearSelection = useHQStore((store) => store.clearSelection);
  if (!agent) return null;

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="agent-dot" style={{ background: agent.color }} aria-hidden />
        <strong>{agent.name}</strong>
        <button type="button" className="panel-close" onClick={clearSelection} aria-label="Fechar">
          ×
        </button>
      </div>
      <div className="panel-role">
        {agent.role} · {ROOMS_BY_ID[agent.roomId]?.name ?? "—"}
      </div>
      <div className="panel-state">
        Estado: <em>{stateLabel(state)}</em> (simulação)
      </div>
      <p className="panel-resp">{agent.responsibility}</p>
      <CharacterEditor agentId={agent.id} base={agent} />
    </div>
  );
}

function AgentPanel() {
  const fleet = useHQStore((state) => state.fleet);
  const selectedBotId = useHQStore((state) => state.selectedBotId);
  const selectedRoomId = useHQStore((state) => state.selectedRoomId);
  const clearSelection = useHQStore((state) => state.clearSelection);

  // hooks sempre na mesma ordem: a busca é dado, não hook
  const direct = selectedBotId ? fleet?.bots.find((candidate) => candidate.id === selectedBotId) : undefined;
  const viaRoom =
    !direct && selectedRoomId
      ? fleet?.bots.find((candidate) => AGENTS_BY_ID[candidate.id]?.roomId === selectedRoomId)
      : undefined;
  const bot = direct ?? viaRoom;

  if (bot) return <BotPanel bot={bot} />;

  // Demo: o agente selecionado não vem de uma frota, vem da lista fixa.
  // Um snapshot offline também é "sem frota" — bots vazios não são frota.
  const hasFleet = Boolean(fleet && fleet.bots.length > 0);
  if (!hasFleet && selectedBotId && AGENTS_BY_ID[selectedBotId]) {
    return <DemoAgentPanel agentId={selectedBotId} />;
  }

  if (selectedRoomId) {
    const room = ROOMS_BY_ID[selectedRoomId];
    if (room) {
      return (
        <div className="panel">
          <div className="panel-head">
            <span className="agent-dot" style={{ background: room.color }} aria-hidden />
            <strong>{room.name}</strong>
            <button type="button" className="panel-close" onClick={clearSelection} aria-label="Fechar">
              ×
            </button>
          </div>
          <div className="panel-role">{room.kind === "department" ? "Departamento" : "Área comum"}</div>
          <div className="panel-state">
            <SlidersHorizontal size={12} /> Duplo clique foca a sala
          </div>
        </div>
      );
    }
  }

  return null;
}

function CameraHint() {
  return (
    <div className="camera-hint">
      <Camera size={12} /> Botão direito gira · roda aproxima · duplo clique foca
    </div>
  );
}

/** Interface HTML da aplicação, sobre o canvas 3D. */
export function Hud() {
  const wallMode = useHQStore((state) => state.wallMode);
  const setWallMode = useHQStore((state) => state.setWallMode);
  const resetCamera = useHQStore((state) => state.resetCamera);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "r" || event.key === "R") {
        useHQStore.getState().resetCamera();
      } else if (event.key === "w" || event.key === "W") {
        const modes = ["auto", "low", "full"] as const;
        const next = modes[(modes.indexOf(wallMode) + 1) % modes.length];
        setWallMode(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wallMode, setWallMode, resetCamera]);

  return (
    <div className="hud-layer">
      <Sidebar />
      <TopBar />
      <FleetSummary />
      <div className="hud-bottom">
        <ActivityFeed />
        <AgentPanel />
        <CameraHint />
      </div>
    </div>
  );
}

export function roomLabel(roomId: string): string {
  const room = ROOMS_BY_ID[roomId];
  return room ? `${room.name} · ${roomCenter(room).map((n) => n.toFixed(1)).join(", ")}` : roomId;
}
