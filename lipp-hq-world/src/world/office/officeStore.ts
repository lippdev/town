import { create } from "zustand";
import { useHQStore } from "@/state/useHQStore";
import { FLOOR_BOUNDS, OFFICE_SEATS_BY_ID } from "./officeLayout";
import { clampView, fitView, zoomLimits, zoomViewAt, type Insets, type OfficeView, type Viewport } from "./officeCamera";
import { type OfficeBot, type Seating } from "./officeRoster";
import type { OfficeMode } from "./officeRoute";

export type Framing = "floor" | "room" | "free";
export type LoadState = "loading" | "stalled" | "ready" | "failed";

/** O andar enquadrado folga 4% de cada lado. */
export const FLOOR_MARGIN = 0.04;

interface OfficeState {
  mode: OfficeMode;
  focusedRoomId: string | null;
  framing: Framing;
  hoveredRoomId: string | null;
  hoveredBotId: string | null;
  bots: OfficeBot[];
  seating: Seating;
  /** Painéis fixos que cobrem a cena; a gaveta vem de `viewInsetRight`. */
  insets: Omit<Insets, "right">;
  load: LoadState;
  loadError: string | null;
  figuresError: string | null;
  setMode: (mode: OfficeMode) => void;
  setRoster: (bots: OfficeBot[], seating: Seating) => void;
  setHovered: (roomId: string | null, botId: string | null) => void;
  setInsets: (insets: Omit<Insets, "right">) => void;
  setLoad: (load: LoadState, error?: string) => void;
  setFiguresError: (error: string | null) => void;
  focusRoom: (roomId: string) => void;
  backToFloor: () => void;
  selectBot: (botId: string) => void;
  markFree: () => void;
}

export const useOfficeStore = create<OfficeState>((set, get) => ({
  mode: "demo",
  focusedRoomId: null,
  framing: "floor",
  hoveredRoomId: null,
  hoveredBotId: null,
  bots: [],
  seating: { seats: {}, unseated: [] },
  insets: { left: 0, top: 0, bottom: 0 },
  load: "loading",
  loadError: null,
  figuresError: null,
  setMode: (mode) => set({ mode }),
  setRoster: (bots, seating) => set({ bots, seating }),
  setHovered: (hoveredRoomId, hoveredBotId) => {
    const state = get();
    if (state.hoveredRoomId !== hoveredRoomId || state.hoveredBotId !== hoveredBotId) set({ hoveredRoomId, hoveredBotId });
  },
  setInsets: (insets) => {
    const current = get().insets;
    if (current.left !== insets.left || current.top !== insets.top || current.bottom !== insets.bottom) set({ insets });
  },
  setLoad: (load, error) => set({ load, loadError: error ?? null }),
  setFiguresError: (figuresError) => set({ figuresError }),
  focusRoom: (roomId) => set({ focusedRoomId: roomId, framing: "room" }),
  backToFloor: () => {
    useHQStore.getState().clearSelection();
    set({ focusedRoomId: null, framing: "floor" });
  },
  selectBot: (botId) => {
    useHQStore.getState().selectBot(botId);
    const seatId = get().seating.seats[botId];
    const seat = seatId ? OFFICE_SEATS_BY_ID[seatId] : undefined;
    // Bot sem posto não tem sala para focar: a gaveta abre e a câmera fica onde está.
    if (seat) set({ focusedRoomId: seat.roomId, framing: "room" });
  },
  markFree: () => set({ framing: "free" }),
}));

/** Estado da câmera a cada quadro, fora do React para não renderizar nada por isso. */
export const officeRuntime = {
  view: { x: 0, z: 0, zoom: 30 } as OfficeView,
  goal: { x: 0, z: 0, zoom: 30 } as OfficeView,
  viewport: { width: 1, height: 1 } as Viewport,
  floorZoom: 30,
  /** Foi posicionada ao menos uma vez: o primeiro quadro entra sem animar. */
  placed: false,
};

export function currentInsets(): Insets {
  const { insets } = useOfficeStore.getState();
  return { ...insets, right: useHQStore.getState().viewInsetRight };
}

export function floorFit(viewport: Viewport): OfficeView {
  return fitView(FLOOR_BOUNDS, viewport, currentInsets(), { margin: FLOOR_MARGIN });
}

/** Botões + e −: zoom em torno do meio da área livre. */
export function zoomStep(factor: number) {
  const { goal, viewport, floorZoom } = officeRuntime;
  const insets = currentInsets();
  const px = insets.left + (viewport.width - insets.left - insets.right) / 2;
  const py = insets.top + (viewport.height - insets.top - insets.bottom) / 2;
  const limits = zoomLimits(floorZoom);
  const next = Math.min(limits.max, Math.max(limits.min, goal.zoom * factor));
  officeRuntime.goal = clampView(zoomViewAt(goal, next, px, py, viewport), FLOOR_BOUNDS, limits.min, limits.max);
  useOfficeStore.getState().markFree();
}
