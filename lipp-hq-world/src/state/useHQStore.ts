import { create } from "zustand";
import type { AgentAnimationState, ConnectionStatus, DataSource, HQEvent, WallMode } from "@/types/hq";

export interface CameraView {
  azimuthDeg: number;
  elevationDeg: number;
  distance: number;
  target: [number, number, number];
}

export interface CameraCommand {
  kind: "focus" | "reset";
  roomId?: string;
  nonce: number;
  /** true: aplica sem animação (usado pelo harness de QA). */
  instant?: boolean;
}

interface HQState {
  wallMode: WallMode;
  dataSource: DataSource;
  connectionStatus: ConnectionStatus;
  selectedRoomId: string | null;
  selectedAgentId: string | null;
  hoveredRoomId: string | null;
  setHoveredRoom: (roomId: string | null) => void;
  events: HQEvent[];
  cameraCommand: CameraCommand | null;
  cameraView: CameraView | null;
  demoPaused: boolean;
  setDemoPaused: (paused: boolean) => void;
  demoRestart: number;
  agentStates: Record<string, AgentAnimationState>;
  setAgentState: (agentId: string, state: AgentAnimationState, summary?: string) => void;
  setWallMode: (mode: WallMode) => void;
  selectRoom: (roomId: string | null) => void;
  selectAgent: (agentId: string | null) => void;
  clearSelection: () => void;
  focusRoom: (roomId: string, options?: { instant?: boolean }) => void;
  resetCamera: (options?: { instant?: boolean }) => void;
  pushEvent: (event: HQEvent) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setDataSource: (source: DataSource) => void;
  agentPresets: Record<string, string>;
  setAgentPreset: (agentId: string, presetId: string | null) => void;
}

const MAX_EVENTS = 60;

/** Persistência local da aparência escolhida por agente (UX local, V0). */
const PRESET_STORAGE_KEY = "lipp-hq-world:agent-presets:v1";

function loadAgentPresets(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    const entries = Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string");
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

function saveAgentPresets(presets: Record<string, string>): void {
  try {
    window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // sem localStorage (modo privado etc.): a escolha vale só para a sessão
  }
}

export const useHQStore = create<HQState>((set) => ({
  wallMode: "auto",
  dataSource: "demo",
  connectionStatus: "offline",
  selectedRoomId: null,
  selectedAgentId: null,
  hoveredRoomId: null,
  setHoveredRoom: (hoveredRoomId) => set({ hoveredRoomId }),
  events: [],
  cameraCommand: null,
  cameraView: null,
  agentStates: {},
  demoPaused: false,
  setDemoPaused: (demoPaused) => set({ demoPaused }),
  demoRestart: 0,

  setAgentState: (agentId, agentState, summary) =>
    set((state) => {
      const event: HQEvent | null = summary
        ? {
            id: `${agentId}-${agentState}-${Date.now()}`,
            timestamp: Date.now(),
            agentId,
            source: state.dataSource,
            type: agentState === "working" ? "agent.working" : agentState === "idle" ? "agent.idle" : "agent.started",
            summary,
          }
        : null;
      return {
        agentStates: { ...state.agentStates, [agentId]: agentState },
        events: event ? [event, ...state.events].slice(0, MAX_EVENTS) : state.events,
      };
    }),

  setWallMode: (wallMode) => set({ wallMode }),
  selectRoom: (selectedRoomId) => set({ selectedRoomId, selectedAgentId: null }),
  selectAgent: (selectedAgentId) => set({ selectedAgentId }),
  clearSelection: () => set({ selectedRoomId: null, selectedAgentId: null }),
  focusRoom: (roomId, options) =>
    set({
      selectedRoomId: roomId,
      selectedAgentId: null,
      cameraCommand: { kind: "focus", roomId, nonce: Date.now(), ...options },
    }),
  resetCamera: (options) =>
    set({ cameraCommand: { kind: "reset", nonce: Date.now(), ...options } }),
  pushEvent: (event) =>
    set((state) => ({ events: [event, ...state.events].slice(0, MAX_EVENTS) })),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setDataSource: (dataSource) => set({ dataSource }),
  agentPresets: loadAgentPresets(),
  setAgentPreset: (agentId, presetId) =>
    set((state) => {
      const next = { ...state.agentPresets };
      if (presetId === null) delete next[agentId];
      else next[agentId] = presetId;
      saveAgentPresets(next);
      return { agentPresets: next };
    }),
}));
