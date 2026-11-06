import { create } from "zustand";
import { useHQStore } from "@/state/useHQStore";
import { BUILDING_ROOMS_BY_ID, cityBoundsAt, initialBuildingView, viewElevation, viewFit, type BuildingView, type FloorId } from "./officeBuilding";
import { CITY_BOUNDS } from "./officeCity";
import type { ChiefRequest, ChiefStatus } from "./officeChief";
import { FLOOR_BOUNDS, OFFICE_SEATS_BY_ID } from "./officeLayout";
import { clampView, fitView, keepGroundInside, zoomLimits, zoomViewAt, type Insets, type OfficeView, type Viewport } from "./officeCamera";
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
  /** Pavimento apontado na fachada, com o prédio fechado. */
  hoveredLevel: number | null;
  /** Troca de andar na hora e limpa o que era do anterior. Na frota real, não faz nada. */
  goToView: (view: BuildingView) => void;
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
function arrival(state: Pick<OfficeState, "mode" | "buildingView">, floor: FloorId): Pick<OfficeState, "buildingView"> | Record<string, never> {
  return state.mode === "demo" && state.buildingView !== floor ? { buildingView: floor } : {};
}

/** Depois de mudar de andar: a câmera já está no lugar e a URL já diz onde se está, sem navegar. */
function arrived(view: BuildingView) {
  aimCamera();
  officeRuntime.view = { ...officeRuntime.goal };
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    url.searchParams.set("andar", view);
    window.history.replaceState(window.history.state, "", url);
  }
}

export const useOfficeStore = create<OfficeState>((set, get) => ({
  mode: "demo",
  buildingView: "operacao",
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
      buildingView: view,
    });
    // Pedir o andar em tela só volta ao enquadramento dele.
    if (view !== state.buildingView) arrived(view);
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
  setMode: (mode) => set({ mode, buildingView: initialBuildingView(mode, window.location.search) }),
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
    const moving = arrival(get(), human?.floor ?? "operacao");
    set({ selectedHumanId: id, focusedRoomId: human?.roomId ?? "hall", framing: "room", ...moving });
    if (moving.buildingView) arrived(moving.buildingView);
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
    if (!seat) return;
    const moving = arrival(get(), "operacao");
    set({ focusedRoomId: seat.roomId, framing: "room", ...moving });
    if (moving.buildingView) arrived(moving.buildingView);
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
/** Gente de cenário: à parte de `humanActors`, para o clique nunca achar ninguém ali. */
export const sceneryActors = new Map<string, HumanActor>();

export function currentInsets(): Insets {
  const { insets } = useOfficeStore.getState();
  return { ...insets, right: useHQStore.getState().viewInsetRight };
}

/** Do lado de fora, a cidade em volta também pode ser vista; dentro, o arrasto fica no andar. */
export const panBounds = () => {
  const { mode, buildingView } = useOfficeStore.getState();
  return mode === "demo" && (buildingView === "exterior" || buildingView === "terreo") ? CITY_BOUNDS : FLOOR_BOUNDS;
};

export function floorFit(viewport: Viewport): OfficeView {
  const { bounds, top } = viewFit(useOfficeStore.getState().buildingView);
  return fitView(bounds, viewport, currentInsets(), { margin: FLOOR_MARGIN, ...(top === undefined ? {} : { top }) });
}

/**
 * Para onde a câmera deve olhar agora. O quadro chama, e a troca de andar também: rótulos e clique
 * leem `officeRuntime`, e não podem ver o andar novo com a câmera do anterior.
 */
export function aimCamera() {
  const runtime = officeRuntime;
  const store = useOfficeStore.getState();
  const floor = floorFit(runtime.viewport);
  runtime.floorZoom = floor.zoom;
  const room = store.focusedRoomId ? BUILDING_ROOMS_BY_ID[store.focusedRoomId] : null;
  if (store.framing === "floor") runtime.goal = floor;
  else if (store.framing === "room" && room) runtime.goal = fitView(room.bounds, runtime.viewport, currentInsets(), { margin: FLOOR_MARGIN });
  // Enquadrando o andar alto, ele manda: no celular, o limite da cidade cortaria a ponta do piso.
  const elevation = viewElevation(store.buildingView);
  if (store.mode === "demo" && !(store.framing === "floor" && elevation > 0)) runtime.goal = keepGroundInside(runtime.goal, runtime.viewport, cityBoundsAt(CITY_BOUNDS, elevation));
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
