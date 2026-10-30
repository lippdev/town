import { create } from "zustand";
import type { ConnectionStatus, DataSource, HQEvent, WallMode } from "@/types/hq";

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
  setWallMode: (mode: WallMode) => void;
  selectRoom: (roomId: string | null) => void;
  selectAgent: (agentId: string | null) => void;
  clearSelection: () => void;
  focusRoom: (roomId: string) => void;
  resetCamera: () => void;
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

  setWallMode: (wallMode) => set({ wallMode }),
  selectRoom: (selectedRoomId) => set({ selectedRoomId, selectedAgentId: null }),
  selectAgent: (selectedAgentId) => set({ selectedAgentId }),
  clearSelection: () => set({ selectedRoomId: null, selectedAgentId: null }),
  focusRoom: (roomId) =>
    set({
      selectedRoomId: roomId,
      selectedAgentId: null,
      cameraCommand: { kind: "focus", roomId, nonce: Date.now() },
    }),
  resetCamera: () =>
    set({ cameraCommand: { kind: "reset", nonce: Date.now() } }),
  pushEvent: (event) =>
    set((state) => ({ events: [event, ...state.events].slice(0, MAX_EVENTS) })),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setDataSource: (dataSource) => set({ dataSource }),
}));
