import { create } from "zustand";
import { useHQStore } from "@/state/useHQStore";
import { BUILDING_ROOMS_BY_ID, FLOOR_LEVEL, HIDEOUT, STORY, cityBoundsAt, initialBuildingView, urlViewOf, viewElevation, viewFit, type BuildingView, type FloorId } from "./officeBuilding";
import { cutAt, lerp, planTravel, plateOpacity, restCut, shownAt, travelProgress, type TravelPlan } from "./floorTravel";
import { CITY_BOUNDS } from "./officeCity";
import { useSecretStore, type SecretSpotId } from "./officeSecrets";
import type { ChiefRequest, ChiefStatus } from "./officeChief";
import { FLOOR_BOUNDS, OFFICE_SEATS_BY_ID } from "./officeLayout";
import { clampView, fitView, keepGroundInside, zoomLimits, zoomViewAt, type Insets, type OfficeView, type Viewport } from "./officeCamera";
import type { Group } from "three";
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
  /** Onde se está, ou para onde se está indo: URL, seletor e rótulos seguem isto na mesma hora. */
  buildingView: BuildingView;
  /** Andares com móveis e gente na cena: o de destino e, na viagem, o que ainda está à mostra. */
  mountedFloors: FloorId[];
  /** O único andar à mostra agora; a viagem o muda com a laje fechada. */
  shownFloor: FloorId | null;
  /** Luz do dia agora: 1 em pleno dia, 0 à noite. Vem do relógio de Brasília. */
  daylight: number;
  setDaylight: (daylight: number) => void;
  /** Em movimento entre vistas: a cena não responde a ponteiro, e a barra lateral segue respondendo. */
  traveling: boolean;
  /** Pavimento apontado na fachada, com o prédio fechado. */
  hoveredLevel: number | null;
  /** Parte para outra vista e limpa o que era do anterior. Na frota real, não faz nada. */
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
function arrival(state: Pick<OfficeState, "mode" | "buildingView">, floor: FloorId): Partial<OfficeState> {
  return state.mode === "demo" && state.buildingView !== floor ? { buildingView: floor, hoveredRoomId: null, hoveredBotId: null, hoveredHumanId: null, hoveredLevel: null } : {};
}

const floorOf = (view: BuildingView): FloorId | null => (view === "exterior" ? null : view);
const prefersStillness = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Depois de pedir outra vista: a URL já diz para onde se vai, sem navegar; a câmera parte no próximo quadro. */
function arrived(view: BuildingView) {
  aimCamera();
  useSecretStore.getState().viewChanged(view);
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    url.searchParams.set("andar", urlViewOf(view));
    window.history.replaceState(window.history.state, "", url);
  }
  if (prefersStillness()) {
    settleAt(view);
    officeRuntime.view = { ...officeRuntime.goal };
    return;
  }
  const travel = officeRuntime.travel;
  const plan = planTravel({ cut: travel.cut, shown: travel.shown, moving: travel.flight !== null, elevation: travel.elevation }, view);
  travel.flight = { plan, elapsed: 0, fromView: { ...officeRuntime.view }, fromElevation: travel.elevation, started: false };
  const floors = new Set<FloorId>();
  if (travel.shown) floors.add(travel.shown);
  const destination = floorOf(view);
  if (destination) floors.add(destination);
  useOfficeStore.setState({ traveling: true, mountedFloors: [...floors] });
}

/** Gesto num segredo, venha do clique ou do teclado. O segredo diz para onde; quem leva é o prédio. */
export function triggerSpot(spot: SecretSpotId) {
  const result = useSecretStore.getState().activate(spot);
  if (result === "entrar") useOfficeStore.getState().goToView(HIDEOUT);
  else if (result === "sair") useOfficeStore.getState().goToView("diretoria");
}

/** Vista parada, sem nada a meio caminho. */
function settleAt(view: BuildingView) {
  const travel = officeRuntime.travel;
  travel.flight = null;
  travel.cut = restCut(view);
  travel.elevation = viewElevation(view);
  travel.shown = floorOf(view);
  travel.plate = 0;
  travel.progress = 1;
  travel.root = viewElevation(view);
  const shown = floorOf(view);
  useOfficeStore.setState({ traveling: false, mountedFloors: shown ? [shown] : [], shownFloor: shown });
}

export const useOfficeStore = create<OfficeState>((set, get) => ({
  mode: "demo",
  buildingView: "operacao",
  mountedFloors: ["operacao"],
  shownFloor: "operacao",
  daylight: 0,
  setDaylight: (daylight) => {
    if (get().daylight !== daylight) set({ daylight });
  },
  traveling: false,
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
    // Pedir o andar em tela, ou o destino da viagem, só volta ao enquadramento dele.
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
  setMode: (mode) => {
    const buildingView = initialBuildingView(mode, window.location.search);
    set({ mode, buildingView });
    settleAt(buildingView);
  },
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

interface Flight {
  plan: TravelPlan;
  elapsed: number;
  fromView: OfficeView;
  fromElevation: number;
  /** O primeiro quadro só monta o andar novo: o tempo conta a partir do seguinte. */
  started: boolean;
}

/** Estado da câmera a cada quadro, fora do React para não renderizar nada por isso. */
export const officeRuntime = {
  view: { x: 0, z: 0, zoom: 30 } as OfficeView,
  goal: { x: 0, z: 0, zoom: 30 } as OfficeView,
  viewport: { width: 1, height: 1 } as Viewport,
  floorZoom: 30,
  /** Foi posicionada ao menos uma vez: o primeiro quadro entra sem animar. */
  placed: false,
  /** Onde o prédio está agora: na frota real, sempre parado na Operação. */
  travel: {
    cut: FLOOR_LEVEL.operacao * STORY,
    elevation: FLOOR_LEVEL.operacao * STORY,
    /** Elevação em que a cena está ancorada: a do andar à mostra, que fica sempre em y = 0. */
    root: FLOOR_LEVEL.operacao * STORY,
    shown: "operacao" as FloorId | null,
    plate: 0,
    progress: 1,
    flight: null as Flight | null,
    /** Só o harness: congela a viagem nesta fração do tempo, para fotografar o meio dela. */
    hold: null as number | null,
  },
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
  if (store.mode === "demo" && !(store.framing === "floor" && (elevation > 0 || store.buildingView === "exterior"))) runtime.goal = keepGroundInside(runtime.goal, runtime.viewport, cityBoundsAt(CITY_BOUNDS, elevation));
}

/** O que acompanha a viagem: registrados pelos componentes, movidos só por `applyTravel`. */
export const travelSinks = {
  /** Grupos do chão da cidade: ficam em y = -âncora. */
  ground: new Set<Group>(),
  /** Grupos de cada andar: só o andar à mostra fica visível. */
  floors: new Map<Group, FloorId>(),
  /** Fachada e laje do corte. */
  listeners: new Set<() => void>(),
};

/** Aplica o estado da viagem à cena. Devolve se o andar à mostra mudou: a sombra precisa ser refeita. */
export function applyTravel(): boolean {
  const { root, shown } = officeRuntime.travel;
  for (const group of travelSinks.ground) group.position.y = -root;
  for (const [group, floor] of travelSinks.floors) group.visible = floor === shown;
  for (const listener of travelSinks.listeners) listener();
  if (useOfficeStore.getState().shownFloor === shown) return false;
  useOfficeStore.setState({ shownFloor: shown });
  return true;
}

const LONGEST_TRAVEL_FRAME = 0.05;

/**
 * Um quadro da viagem. A chegada é o `goal` de agora, refeito a cada quadro: abrir a gaveta ou
 * redimensionar a tela no caminho muda o destino sem salto. Não há cronômetro: sem quadro, nada anda.
 */
export function stepTravel(delta: number) {
  const runtime = officeRuntime;
  const travel = runtime.travel;
  const flight = travel.flight;
  if (!flight) return;
  if (flight.started) flight.elapsed += Math.min(delta, LONGEST_TRAVEL_FRAME) * 1000;
  flight.started = true;
  const { plan } = flight;
  if (travel.hold !== null) flight.elapsed = plan.duration * travel.hold;
  if (flight.elapsed >= plan.duration) {
    settleAt(plan.target);
    runtime.view = { ...runtime.goal };
    return;
  }
  const progress = travelProgress(plan, flight.elapsed);
  const target = viewElevation(plan.target);
  travel.progress = progress;
  travel.cut = cutAt(plan, progress);
  travel.elevation = lerp(flight.fromElevation, target, progress);
  travel.shown = shownAt(plan, progress);
  travel.plate = plateOpacity(travel.cut, travel.shown);
  // Com a laje fechada ninguém vê a âncora mudar: ela vai junto com a câmera, no mesmo quadro.
  travel.root = travel.shown ? FLOOR_LEVEL[travel.shown] * STORY : target;
  const { fromView } = flight;
  const { goal } = runtime;
  runtime.view = {
    x: lerp(fromView.x, goal.x, progress),
    z: lerp(fromView.z, goal.z, progress),
    // Em escala: dobrar o zoom leva o mesmo tempo em qualquer ponto do caminho.
    zoom: Math.exp(lerp(Math.log(fromView.zoom), Math.log(goal.zoom), progress)),
  };
}

/** Botões + e −: zoom em torno do meio da área livre. */
export function zoomStep(factor: number) {
  if (officeRuntime.travel.flight) return;
  const { goal, viewport, floorZoom } = officeRuntime;
  const insets = currentInsets();
  const px = insets.left + (viewport.width - insets.left - insets.right) / 2;
  const py = insets.top + (viewport.height - insets.top - insets.bottom) / 2;
  const limits = zoomLimits(floorZoom);
  const next = Math.min(limits.max, Math.max(limits.min, goal.zoom * factor));
  officeRuntime.goal = clampView(zoomViewAt(goal, next, px, py, viewport), panBounds(), limits.min, limits.max);
  useOfficeStore.getState().markFree();
}
