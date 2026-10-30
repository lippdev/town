import { useEffect, useState } from "react";
import {
  BookOpen,
  Bot,
  Boxes,
  Cable,
  Camera,
  MonitorUp,
  Radio,
  RotateCcw,
  Play,
  SlidersHorizontal,
  Users,
  BrickWall,
} from "lucide-react";
import { AGENTS, AGENTS_BY_ID } from "@/agents/agents";
import { PROJECTS } from "@/agents/agents";
import { useHQStore } from "@/state/useHQStore";
import { ROOMS_BY_ID, roomCenter } from "@/world/rooms/rooms";

const CONNECTION_LABEL = {
  connecting: "conectando",
  online: "ao vivo",
  offline: "sem conexão",
  error: "erro",
} as const;

/** Ponto da sala em coordenadas de tela para o painel flutuante. */
function useAgentSummary(agentId: string | null) {
  const agentStates = useHQStore((state) => state.agentStates);
  const events = useHQStore((state) => state.events);
  if (!agentId) return null;
  const agent = AGENTS_BY_ID[agentId];
  if (!agent) return null;
  const state = agentStates[agentId] ?? "idle";
  const lastEvent = events.find((event) => event.agentId === agentId);
  return {
    agent,
    state,
    summary: lastEvent?.summary,
    source: lastEvent?.source,
    roomName: ROOMS_BY_ID[agent.roomId]?.name ?? "",
  };
}

function Sidebar() {
  const [section, setSection] = useState("escritorio");
  const dataSource = useHQStore((state) => state.dataSource);
  const items = [
    { id: "escritorio", label: "Escritório", icon: Boxes },
    { id: "agentes", label: "Agentes", icon: Users },
    { id: "atividades", label: "Atividades", icon: BookOpen },
    { id: "projetos", label: "Projetos", icon: Bot },
    { id: "integracoes", label: "Integrações", icon: Cable },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-dot" aria-hidden />
        <strong>Lipp HQ</strong>
        <span className="sidebar-mode">{dataSource === "demo" ? "Demo" : "Live"}</span>
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
          </button>
        ))}
      </nav>
      {section === "agentes" && (
        <div className="sidebar-list">
          {AGENTS.map((agent) => (
            <AgentRow key={agent.id} agentId={agent.id} />
          ))}
        </div>
      )}
      {section === "projetos" && (
        <div className="sidebar-list">
          {PROJECTS.map((project) => (
            <div key={project} className="sidebar-row">
              <Boxes size={13} />
              {project}
            </div>
          ))}
        </div>
      )}
      {section === "integracoes" && (
        <div className="sidebar-note">
          OpenMausBot em modo somente leitura. Nenhum comando é enviado ao
          servidor dos agentes.
        </div>
      )}
    </aside>
  );
}

function AgentRow({ agentId }: { agentId: string }) {
  const agentStates = useHQStore((state) => state.agentStates);
  const selectAgent = useHQStore((state) => state.selectAgent);
  const focusRoom = useHQStore((state) => state.focusRoom);
  const agent = AGENTS_BY_ID[agentId];
  const state = agentStates[agentId] ?? "idle";

  return (
    <button
      type="button"
      className="sidebar-row agent-row"
      onClick={() => {
        selectAgent(agentId);
        focusRoom(agent.roomId);
      }}
    >
      <span className="agent-dot" style={{ background: agent.color }} aria-hidden />
      <span className="agent-name">{agent.name}</span>
      <span className="agent-state">{state}</span>
    </button>
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

function TopBar() {
  const connectionStatus = useHQStore((state) => state.connectionStatus);
  const dataSource = useHQStore((state) => state.dataSource);
  const wallMode = useHQStore((state) => state.wallMode);
  const setWallMode = useHQStore((state) => state.setWallMode);
  const resetCamera = useHQStore((state) => state.resetCamera);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const clockLabel = clock.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateLabel = clock.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });

  return (
    <div className="topbar">
      <div className={`connection connection-${connectionStatus}`}>
        <Radio size={13} />
        {dataSource === "demo" ? "Simulação" : "Live"} · {CONNECTION_LABEL[connectionStatus]}
      </div>
      <div className="topbar-clock">
        {dateLabel} · {clockLabel}
      </div>
      <div className="wall-modes" role="group" aria-label="Modo das paredes">
        <BrickWall size={13} />
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
                  {new Date(event.timestamp).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {agent && (
                  <span className="agent-dot" style={{ background: agent.color }} aria-hidden />
                )}
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

function AgentPanel() {
  const selectedAgentId = useHQStore((state) => state.selectedAgentId);
  const selectedRoomId = useHQStore((state) => state.selectedRoomId);
  const clearSelection = useHQStore((state) => state.clearSelection);
  const summary = useAgentSummary(selectedAgentId ?? null);

  if (summary) {
    return (
      <div className="panel">
        <div className="panel-head">
          <span className="agent-dot" style={{ background: summary.agent.color }} aria-hidden />
          <strong>{summary.agent.name}</strong>
          <button type="button" className="panel-close" onClick={clearSelection} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="panel-role">{summary.agent.role} · {summary.roomName}</div>
        <div className="panel-state">
          Estado: <em>{summary.state}</em>
          {summary.source === "demo" ? " (simulação)" : ""}
        </div>
        {summary.summary && <p>{summary.summary}</p>}
        <p className="panel-resp">{summary.agent.responsibility}</p>
      </div>
    );
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
          <div className="panel-role">
            {room.kind === "department" ? "Departamento" : "Área comum"}
          </div>
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
