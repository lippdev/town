import { create } from "zustand";
import { useHQStore } from "@/state/useHQStore";
import { initialBuildingView, viewFit, type BuildingView, type FloorId } from "./officeBuilding";
import { CITY_BOUNDS } from "./officeCity";
import type { ChiefRequest, ChiefStatus } from "./officeChief";
import { FLOOR_BOUNDS, OFFICE_SEATS_BY_ID } from "./officeLayout";
import { clampView, fitView, zoomLimits, zoomViewAt, type Insets, type OfficeView, type Viewport } from "./officeCamera";
import type { HumanFigure } from "@/avatar/human/HumanFigure";
import type { RobotLooks } from "@/avatar/robot/robotLook";
import type { HumanActor } from "./HumanActor";
import type { RobotActor } from "./RobotActor";
import type { HumanGoal, HumanPhase, OfficeHuman } from "./officeHumans";
import { type OfficeBot, type Seating } from "./officeRoster";
import type { OfficeMode } from "./officeRoute";

export type Framing = "floor" | "room" | "free";
export type LoadState = "loading" | "stalled" | "ready" | "failed";

/** O andar enquadrado folga 4% de cada lado. */
export const FLOOR_MARGIN = 0.04;

interface OfficeState {
  mode: OfficeMode;
  /** O que está montado na cena. Na frota real é sempre o escritório. */
  buildingView: BuildingView;
  /** Para onde a troca em curso está indo. Enquanto houver, nada na cena responde ao clique. */
  pendingView: BuildingView | null;
  /** Pavimento apontado na fachada, com o prédio fechado. */
  hoveredLevel: number | null;
  /** Pede a troca e limpa o que era do andar anterior. Na frota real, não faz nada. */
  goToView: (view: BuildingView) => void;
  /** Conclui a troca: quem chama é quem escureceu a tela. */
  commitView: () => void;
  setHoveredLevel: (level: number | null) => void;
  focusedRoomId: string | null;
  framing: Framing;
  hoveredRoomId: string | null;
  hoveredBotId: string | null;
  hoveredHumanId: string | null;
  bots: OfficeBot[];
  seating: Seating;
  /** Pessoas salvas no editor, na cena. Só na demonstração; nunca entram em `bots`. */
  humans: OfficeHuman[];
  /** Salvas além da capacidade: listadas, sem corpo. */
  humansWaiting: { id: string; name: string }[];
  selectedHumanId: string | null;
  humanGoals: Record<string, HumanGoal>;
  humanPhases: Record<string, HumanPhase>;
  humansError: string | null;
  chiefStatus: ChiefStatus;
  chiefRequest: ChiefRequest | null;
  setChiefStatus: (status: ChiefStatus) => void;
  setChiefRequest: (request: ChiefRequest | null) => void;
  /** Cor e expressão escolhidas no editor; quem não está aqui usa o padrão. */
  robotLooks: RobotLooks;
  setRobotLooks: (looks: RobotLooks) => void;
  /** Painéis fixos que cobrem a cena; a gaveta vem de `viewInsetRight`. */
  insets: Omit<Insets, "right">;
  load: LoadState;
  loadError: string | null;
  figuresError: string | null;
  setMode: (mode: OfficeMode) => void;
  setRoster: (bots: OfficeBot[], seating: Seating) => void;
  setHovered: (roomId: string | null, botId: string | null, humanId?: string | null) => void;
  setHumans: (humans: OfficeHuman[], waiting: { id: string; name: string }[]) => void;
  setHumanPhase: (id: string, phase: HumanPhase) => void;
  setHumanGoal: (id: string, goal: HumanGoal) => void;
  setHumansError: (error: string | null) => void;
  selectHuman: (id: string) => void;
  clearHuman: () => void;
  setInsets: (insets: Omit<Insets, "right">) => void;
  setLoad: (load: LoadState, error?: string) => void;
  setFiguresError: (error: string | null) => void;
  focusRoom: (roomId: string) => void;
  backToFloor: () => void;
  selectBot: (botId: string) => void;
  markFree: () => void;
}

/** Selecionar quem está em outro andar leva até lá. Na frota real, tudo é o mesmo andar. */
function arrival(state: Pick<OfficeState, "mode" | "buildingView">, floor: FloorId): Pick<OfficeState, "pendingView"> | Record<string, never> {
  return state.mode === "demo" && state.buildingView !== floor ? { pendingView: floor } : {};
}

export const useOfficeStore = create<OfficeState>((set, get) => ({
  mode: "demo",
  buildingView: "operacao",
  pendingView: null,
  hoveredLevel: null,
  goToView: (view) => {
    const state = get();
    if (state.mode !== "demo") return;
    useHQStore.getState().clearSelection();
    set({
      selectedHumanId: null,
      focusedRoomId: null,
      framing: "floor",
      hoveredRoomId: null,
      hoveredBotId: null,
      hoveredHumanId: null,
      hoveredLevel: null,
      // Pedir o andar em tela cancela a troca e só volta ao enquadramento dele.
      pendingView: view === state.buildingView ? null : view,
    });
  },
  commitView: () => {
    const { pendingView } = get();
    if (!pendingView) return;
    // O andar novo entra pronto: a câmera não atravessa a cena.
    officeRuntime.placed = false;
    set({ buildingView: pendingView, pendingView: null, hoveredRoomId: null, hoveredBotId: null, hoveredHumanId: null, hoveredLevel: null });
  },
  setHoveredLevel: (hoveredLevel) => {
    if (get().hoveredLevel !== hoveredLevel) set({ hoveredLevel });
  },
  focusedRoomId: null,
  framing: "floor",
  hoveredRoomId: null,
  hoveredBotId: null,
  hoveredHumanId: null,
  bots: [],
  seating: { seats: {}, unseated: [] },
  humans: [],
  humansWaiting: [],
  selectedHumanId: null,
  humanGoals: {},
  chiefStatus: "chegando",
  chiefRequest: null,
  setChiefStatus: (chiefStatus) => set({ chiefStatus }),
  setChiefRequest: (chiefRequest) => set({ chiefRequest }),
  humanPhases: {},
  humansError: null,
  robotLooks: {},
  setRobotLooks: (robotLooks) => set({ robotLooks }),
  insets: { left: 0, top: 0, bottom: 0 },
  load: "loading",
  loadError: null,
  figuresError: null,
  setMode: (mode) => set({ mode, buildingView: initialBuildingView(mode, window.location.search), pendingView: null }),
  setRoster: (bots, seating) => set({ bots, seating }),
  setHovered: (hoveredRoomId, hoveredBotId, hoveredHumanId = null) => {
    const state = get();
    if (state.hoveredRoomId !== hoveredRoomId || state.hoveredBotId !== hoveredBotId || state.hoveredHumanId !== hoveredHumanId) {
      set({ hoveredRoomId, hoveredBotId, hoveredHumanId });
    }
  },
  setHumans: (humans, humansWaiting) => {
    const { selectedHumanId } = get();
    set({ humans, humansWaiting, selectedHumanId: humans.some((human) => human.id === selectedHumanId) ? selectedHumanId : null });
  },
  setHumanPhase: (id, phase) => set((state) => ({ humanPhases: { ...state.humanPhases, [id]: phase } })),
  setHumanGoal: (id, goal) => set((state) => ({ humanGoals: { ...state.humanGoals, [id]: goal } })),
  setHumansError: (humansError) => set({ humansError }),
  selectHuman: (id) => {
    // Pessoa e bot não dividem a gaveta: abrir uma fecha o outro.
    useHQStore.getState().clearSelection();
    const human = get().humans.find((candidate) => candidate.id === id);
    const floor = human?.floor ?? "operacao";
    set({ selectedHumanId: id, focusedRoomId: human?.roomId ?? "hall", framing: "room", ...arrival(get(), floor) });
  },
  clearHuman: () => set({ selectedHumanId: null }),
  setInsets: (insets) => {
    const current = get().insets;
    if (current.left !== insets.left || current.top !== insets.top || current.bottom !== insets.bottom) set({ insets });
  },
  setLoad: (load, error) => set({ load, loadError: error ?? null }),
  setFiguresError: (figuresError) => set({ figuresError }),
  focusRoom: (roomId) => set({ focusedRoomId: roomId, framing: "room" }),
  backToFloor: () => {
    useHQStore.getState().clearSelection();
    set({ selectedHumanId: null, focusedRoomId: null, framing: "floor" });
  },
  selectBot: (botId) => {
    useHQStore.getState().selectBot(botId);
    set({ selectedHumanId: null });
    const seatId = get().seating.seats[botId];
    const seat = seatId ? OFFICE_SEATS_BY_ID[seatId] : undefined;
    // Bot sem posto não tem sala para focar: a gaveta abre e a câmera fica onde está.
    if (seat) set({ focusedRoomId: seat.roomId, framing: "room", ...arrival(get(), "operacao") });
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
  /** Quem se mexe na cena: id → ponto da etiqueta, atualizado a cada quadro. */
  liveAnchors: new Map<string, readonly [number, number, number]>(),
};

/** Fora do estado do React: mudam a cada quadro. O clique e o QA leem daqui. */
export const humanActors = new Map<string, HumanActor>();
export const humanFigures = new Map<string, HumanFigure>();
export const robotActors = new Map<string, RobotActor>();

export function currentInsets(): Insets {
  const { insets } = useOfficeStore.getState();
  return { ...insets, right: useHQStore.getState().viewInsetRight };
}

/** Do lado de fora, a cidade em volta também pode ser vista; dentro, o arrasto fica no andar. */
export const panBounds = () => {
  const { mode, buildingView } = useOfficeStore.getState();
  return mode === "demo" && buildingView === "exterior" ? CITY_BOUNDS : FLOOR_BOUNDS;
};

export function floorFit(viewport: Viewport): OfficeView {
  const { bounds, top } = viewFit(useOfficeStore.getState().buildingView);
  return fitView(bounds, viewport, currentInsets(), { margin: FLOOR_MARGIN, ...(top === undefined ? {} : { top }) });
}

/** Botões + e −: zoom em torno do meio da área livre. */
export function zoomStep(factor: number) {
  const { goal, viewport, floorZoom } = officeRuntime;
  const insets = currentInsets();
  const px = insets.left + (viewport.width - insets.left - insets.right) / 2;
  const py = insets.top + (viewport.height - insets.top - insets.bottom) / 2;
  const limits = zoomLimits(floorZoom);
  const next = Math.min(limits.max, Math.max(limits.min, goal.zoom * factor));
  officeRuntime.goal = clampView(zoomViewAt(goal, next, px, py, viewport), panBounds(), limits.min, limits.max);
  useOfficeStore.getState().markFree();
}
