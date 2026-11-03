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
  Radio,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { AGENTS_BY_ID } from "@/agents/agents";
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
import { STATE_FILTERS, nextIndex, visibleBots, type StateFilter } from "@/components/hud/fleetFilter";
import { sparklinePath, trend, type FleetSample } from "@/integrations/hermes/fleetHistory";
import { routineHealth, routineStatusText, routineTotals, routinesByBot } from "@/components/hud/routines";
import { activeSessionTotal, fleetSessions, sessionTitle, sourceLabel } from "@/components/hud/sessions";
import { botRoomId } from "@/components/hud/selection";
import { BotDrawer } from "@/components/hud/BotDrawer";
import { diagnosticsSummary, endpointRows, latencyText, type DiagnosticsSeverity } from "@/components/hud/diagnostics";
import {
  connectHermes,
  connectLocalHermes,
  detectLocalHermes,
  disconnectHermes,
  useGatewayStatus,
  type ConnectResult,
  type GatewayStatus,
  type LocalDiscovery,
} from "@/integrations/hermes/gatewayStatus";

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
      <ConnectionForm config={config} onConnected={() => refresh?.()} />

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
            {diagnostic?.action && <span className="gateway-action">{diagnostic.action}</span>}
          </div>
        );
      })}

      <dl className="gateway-config">
        <div>
          <dt>Modo</dt>
          <dd>{dataSource === "live" ? "Hermes (ao vivo)" : "Sem bots lidos"}</dd>
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
          <dt>Origem</dt>
          <dd>{config ? (config.source === "saved" ? "link salvo nesta máquina" : "variáveis de ambiente") : "—"}</dd>
        </div>
        <div>
          <dt>Credenciais</dt>
          <dd>
            {config
              ? config.source === "saved"
                ? config.tokenSource === "served"
                  ? `token do Hermes local ${config.tokenPreview ?? ""} (renova sozinho)`
                  : `session token ${config.tokenPreview ?? "vazio"}`
                : `${config.hasApiKey ? "chave ok" : "sem chave"} · ${config.hasDashboardToken ? "token ok" : "sem token"}`
              : "—"}
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

/**
 * Conectar ao Hermes como o Hermes Desktop faz: link do dashboard + session
 * token. O par vai ao proxy deste app, que testa e salva; o token nunca volta
 * para a página, só a prévia `...abc123`.
 */
function ConnectionForm({ config, onConnected }: { config: GatewayStatus | null; onConnected: () => void }) {
  const saved = config?.source === "saved";
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "fail"; text: string; action?: string } | null>(null);
  const [local, setLocal] = useState<LocalDiscovery | null>(null);
  const [detecting, setDetecting] = useState(false);

  const detect = async () => {
    setDetecting(true);
    setLocal(await detectLocalHermes());
    setDetecting(false);
  };

  // como o Claw3D faz com o gateway local: procura sozinho ao abrir a aba
  useEffect(() => {
    void detect();
  }, []);

  const report = (result: ConnectResult) => {
    if (!result.ok) {
      setMessage({ tone: "fail", text: result.error ?? "não foi possível conectar", action: result.action });
      return false;
    }
    const version = result.version ? ` · Hermes ${result.version}` : "";
    setMessage({ tone: "ok", text: `Conectado: ${result.profileCount ?? 0} perfis${version}` });
    onConnected();
    return true;
  };

  const connectLocal = async () => {
    setBusy(true);
    setMessage(null);
    const result = await connectLocalHermes();
    setBusy(false);
    if (report(result)) setUrl(local?.url ?? "");
  };

  // com conexão salva, o campo de link abre preenchido com ela
  useEffect(() => {
    if (saved && config?.dashboardUrl) setUrl((current) => current || config.dashboardUrl || "");
  }, [saved, config?.dashboardUrl]);

  const connect = async () => {
    setBusy(true);
    setMessage(null);
    const result = await connectHermes(url, token);
    setBusy(false);
    if (report(result)) setToken("");
  };

  const disconnect = async () => {
    setBusy(true);
    const result = await disconnectHermes();
    setBusy(false);
    setUrl("");
    setToken("");
    setMessage(result.ok ? { tone: "ok", text: "Desconectado." } : { tone: "fail", text: result.error ?? "falhou" });
    onConnected();
    void detect();
  };

  return (
    <form
      className="connection-form"
      onSubmit={(event) => {
        event.preventDefault();
        void connect();
      }}
    >
      <strong>Conectar ao Hermes</strong>
      <LocalHermesBanner
        local={local}
        detecting={detecting}
        connectedHere={saved && config?.tokenSource === "served"}
        busy={busy}
        onUse={() => void connectLocal()}
        onRetry={() => void detect()}
        onFillUrl={(value) => setUrl(value)}
      />
      <label>
        <span>Link do dashboard</span>
        <input
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="http://127.0.0.1:9119"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={busy}
          required
        />
      </label>
      <label>
        <span>Session token</span>
        <input
          type="password"
          autoComplete="off"
          placeholder={saved && config?.tokenPreview ? `token salvo ${config.tokenPreview}` : "cole o session token"}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          disabled={busy}
        />
      </label>
      <div className="connection-actions">
        <button type="submit" className="gateway-retry" disabled={busy || !url.trim()}>
          {busy ? "Testando…" : saved ? "Reconectar" : "Conectar"}
        </button>
        {saved && (
          <button type="button" className="note-retry" onClick={() => void disconnect()} disabled={busy}>
            desconectar
          </button>
        )}
      </div>
      {message && (
        <span className={`connection-message ${message.tone}`}>
          {message.text}
          {message.action && <em className="connection-action">{message.action}</em>}
        </span>
      )}
    </form>
  );
}

/**
 * O que a detecção do Hermes local achou. Encontrado com token publicado:
 * conecta num clique. Encontrado sem token: preenche o link e pede o token.
 * Nada escutando: mostra o comando para subir o dashboard, com copiar.
 */
function LocalHermesBanner({
  local,
  detecting,
  connectedHere,
  busy,
  onUse,
  onRetry,
  onFillUrl,
}: {
  local: LocalDiscovery | null;
  detecting: boolean;
  connectedHere: boolean;
  busy: boolean;
  onUse: () => void;
  onRetry: () => void;
  onFillUrl: (url: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  if (detecting && !local) return <div className="local-hermes">Procurando Hermes local…</div>;
  if (!local) return null;

  if (local.found && local.tokenServed && !local.error) {
    const version = local.version ? ` · v${local.version}` : "";
    return (
      <div className="local-hermes found">
        <span>
          Hermes local em <code>{local.url}</code>
          {version} · {local.profileCount ?? 0} perfis
        </span>
        {connectedHere ? (
          <span className="local-hermes-tag">em uso</span>
        ) : (
          <button type="button" className="gateway-retry" onClick={onUse} disabled={busy}>
            Usar Hermes local
          </button>
        )}
      </div>
    );
  }

  if (local.found) {
    return (
      <div className="local-hermes partial">
        <span>
          Dashboard em <code>{local.url}</code>: {local.error}
        </span>
        {local.url && (
          <button type="button" className="note-retry" onClick={() => onFillUrl(local.url ?? "")}>
            usar este link
          </button>
        )}
      </div>
    );
  }

  const command = local.hint ?? "hermes dashboard --no-open";
  return (
    <div className="local-hermes missing">
      <span>Nenhum Hermes local na {local.tried?.join(", ") ?? "9119"}. Para subir:</span>
      <span className="local-hermes-command">
        <code>{command}</code>
        <button
          type="button"
          className="note-retry"
          onClick={() => {
            void navigator.clipboard?.writeText(command).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? "copiado" : "copiar"}
        </button>
        <button type="button" className="note-retry" onClick={onRetry} disabled={detecting}>
          {detecting ? "procurando…" : "procurar de novo"}
        </button>
      </span>
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
        <span className="sidebar-mode">{dataSource === "live" ? "Hermes" : "Aguardando Hermes"}</span>
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
    const roomId = botRoomId(fleet, target.id);
    if (roomId) focusRoom(roomId);
    selectBot(target.id);
    const node = listRef.current?.querySelector<HTMLElement>(`[data-bot-id="${target.id}"]`);
    node?.scrollIntoView({ block: "nearest" });
  };

  if (!fleet || fleet.bots.length === 0) {
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
          const roomId = botRoomId(fleet, bot.id);
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

/**
 * Agenda real das rotinas: quando roda, quando rodou e como terminou.
 *
 * O Hermes é a única fonte do status (`last_status`/`last_error`); a tela
 * destaca falha e entrega falha porque é o que denuncia briefing quebrado.
 */
function RoutineList() {
  const fleet = useHQStore((state) => state.fleet);
  const bots = fleet?.bots ?? [];
  const colors = useMemo(
    () => Object.fromEntries(sceneAgentsFromFleet(fleet).map((agent) => [agent.id, agent.color])),
    [fleet],
  );
  const groups = routinesByBot(bots, colors);
  const totals = routineTotals(bots);

  if (groups.length === 0) {
    return <div className="sidebar-note">Nenhuma rotina agendada reportada pelo Hermes.</div>;
  }

  return (
    <div className="sidebar-list routine-list">
      <div className="sidebar-note">
        {totals.total} {totals.total === 1 ? "rotina" : "rotinas"}
        {totals.failed > 0 ? ` · ${totals.failed} com falha` : ""}
        {totals.paused > 0 ? ` · ${totals.paused} ${totals.paused === 1 ? "pausada" : "pausadas"}` : ""}
      </div>
      {groups.map((group) => (
        <div key={group.botId} className="routine-group">
          <div className="routine-bot">
            <span className="agent-dot" style={{ background: group.botColor }} aria-hidden />
            <span className="agent-name">{group.botName}</span>
            <span className="agent-state">{group.routines.length}</span>
          </div>
          {group.routines.map((routine) => {
            const health = routineHealth(routine);
            return (
              <div key={`${group.botId}-${routine.id}`} className="routine-row" title={routine.lastError ?? routine.name}>
                <span className={`routine-status routine-${health}`}>{routineStatusText(routine)}</span>
                <span className="routine-name">{routine.name}</span>
                <span className="routine-when">
                  {routine.paused || routine.enabled === false
                    ? "pausada"
                    : routine.nextAt
                      ? `em ${relativeTime(routine.nextAt)}`
                      : "sem agenda"}
                </span>
                <span className="routine-meta">
                  {routine.schedule ? `${routine.schedule} · ` : ""}
                  {routine.lastAt ? `rodou ${relativeTime(routine.lastAt)}` : "nunca rodou"}
                  {routine.failureStreak && routine.failureStreak > 1 ? ` · ${routine.failureStreak} falhas seguidas` : ""}
                </span>
              </div>
            );
          })}
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
  const openBotSession = useHQStore((state) => state.openBotSession);
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
          onClick={() => openBotSession(row.botId, row.session.id)}
          title={row.session.preview ?? row.session.title ?? "Abrir conversa"}
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
              </li>
            );
          })}
          {events.length === 0 && <li className="feed-empty">Sem atividade registrada.</li>}
        </ul>
      )}
    </div>
  );
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
        <CameraHint />
      </div>
      <BotDrawer />
    </div>
  );
}

export function roomLabel(roomId: string): string {
  const room = ROOMS_BY_ID[roomId];
  return room ? `${room.name} · ${roomCenter(room).map((n) => n.toFixed(1)).join(", ")}` : roomId;
}
