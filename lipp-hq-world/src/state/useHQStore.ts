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
  events: HQEvent[];
  cameraCommand: CameraCommand | null;
  cameraView: CameraView | null;
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
}

const MAX_EVENTS = 60;

export const useHQStore = create<HQState>((set) => ({
  wallMode: "auto",
  dataSource: "demo",
  connectionStatus: "offline",
  selectedRoomId: null,
  selectedAgentId: null,
  events: [],
  cameraCommand: null,
  cameraView: null,
  agentStates: {},

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
}));
