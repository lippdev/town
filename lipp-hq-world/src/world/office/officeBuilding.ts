import { CITY_VIEW } from "./officeCity";
import { FLOOR_BOUNDS, OFFICE_ROOMS, OFFICE_ROOMS_BY_ID, roomAt, type OfficeBounds } from "./officeLayout";
import { AZIMUTH, ELEVATION, type PickBox } from "./officeCamera";
import { DIRECTORATE_ROOMS, DIRECTORATE_SCENERY } from "./officeDirectorate";
import { EXPANSION_FLOORS, expansionFloor, expansionRooms, expansionScenery, type ExpansionFloorId } from "./officeExpansion";
import { HIDEOUT_LEVEL, HIDEOUT_ROOMS, HIDEOUT_SCENERY } from "./officeHideout";
import { LOBBY_ROOMS, LOBBY_SCENERY, type BuildingRoom, type SceneryHuman } from "./officeLobby";
import type { OfficeMode } from "./officeRoute";

/**
 * O prédio do Lipp HQ, só na demonstração.
 *
 * O andar em tela fica sempre em y = 0, e é o entorno (cidade e fachada) que desce: assim
 * `worldToScreen`, o raio do clique, `roomAt`, as cadeiras e as sombras seguem valendo sem
 * nenhum deslocamento. O custo é o entorno precisar saber a elevação do andar em tela.
 */
export type FloorId = "terreo" | "operacao" | "diretoria" | ExpansionFloorId | typeof HIDEOUT;
/** Fora do seletor, das teclas de andar, da fachada e da URL: só se chega pela estante da Diretoria. */
export const HIDEOUT = "esconderijo";
export type BuildingView = "exterior" | FloorId;

/** Altura de um pavimento na fachada: 3 m de parede mais a laje. */
export const STORY = 3.4;
/** Pavimentos da torre. Só os de `FLOOR_LEVEL` têm interior; os outros são fachada. */
export const BUILDING_LEVELS = 14;
export const BUILDING_HEIGHT = STORY * BUILDING_LEVELS;
/** Pavimentos que formam a base da torre, com colunas no lugar da fita de janelas. */
export const BASE_LEVELS = 2;

/**
 * A coroa, de baixo para cima: cada degrau recua dos quatro lados. Todo recuo fica acima da última
 * laje: a Diretoria é o andar inteiro, e um recuo mais abaixo faria os móveis vazarem da fachada.
 */
export const CROWN_STEPS: ReadonlyArray<{ inset: number; height: number }> = [
  { inset: 1.5, height: 3.6 },
  { inset: 4, height: 3.2 },
  { inset: 6.4, height: 2.8 },
];
/** Quanto o mastro passa do último degrau: é ele o ponto mais alto, e o que o enquadramento respeita. */
export const SPIRE_HEIGHT = 4.6;
/** Coroa e mastro acima da última laje: entram no enquadramento do exterior. */
export const CROWN_HEIGHT = CROWN_STEPS.reduce((sum, step) => sum + step.height, 0) + SPIRE_HEIGHT;

/** Fachada um pouco para dentro da laje do andar: a borda do corte fica à mostra. */
export const FACADE_BOUNDS: OfficeBounds = {
  minX: FLOOR_BOUNDS.minX - 0.25,
  maxX: FLOOR_BOUNDS.maxX + 0.25,
  minZ: FLOOR_BOUNDS.minZ - 0.25,
  maxZ: FLOOR_BOUNDS.maxZ + 0.25,
};

/** Topo do último degrau da coroa: é onde o heliporto se apoia. */
export const CROWN_ROOF = BUILDING_HEIGHT + 0.01 + CROWN_STEPS.reduce((sum, step) => sum + step.height, 0);

/**
 * O heliporto, sobre o último degrau. O degrau mede 10 × 5,7 m e o rotor pede 8 m de diâmetro: o
 * deque balança 2,65 m para a frente e para trás, ainda dentro do degrau de baixo, sobre colunas.
 * O mastro fica fora do deque, no canto de trás: a câmera olha de +x +z e ele segue lendo como o
 * eixo da torre na silhueta, a quase 8 m do cubo do rotor.
 */
export const HELIPAD = {
  x: (FACADE_BOUNDS.minX + FACADE_BOUNDS.maxX) / 2,
  z: (FACADE_BOUNDS.minZ + FACADE_BOUNDS.maxZ) / 2,
  /** Meio lado do deque, que é quadrado como os degraus. */
  half: 5.5,
  /** Parte de baixo da laje do deque. */
  bottom: CROWN_ROOF + 0.62,
  /** Piso do deque: onde os esquis encostam e o chefe anda. */
  top: CROWN_ROOF + 0.9,
  /** Mastro, em relação ao centro do deque. */
  mast: { x: -6.4, z: -4.6 },
  /** Casinha da escada, em relação ao centro do deque: fora do giro do rotor, com a porta para +z. */
  kiosk: { x: 4.55, z: -4.55, size: 1.6, height: 2 },
} as const;

export const FLOOR_LEVEL = {
  terreo: 0,
  operacao: 1,
  diretoria: BUILDING_LEVELS - 1,
  [HIDEOUT]: HIDEOUT_LEVEL,
  ...Object.fromEntries(EXPANSION_FLOORS.map((floor) => [floor.id, floor.level])),
} as Record<FloorId, number>;

export const FLOOR_LABEL = {
  diretoria: { name: "Diretoria", short: "D" },
  operacao: { name: "Operação", short: "1" },
  terreo: { name: "Térreo", short: "T" },
  [HIDEOUT]: { name: "Esconderijo", short: "E" },
  ...Object.fromEntries(EXPANSION_FLOORS.map((floor) => [floor.id, { name: floor.title, short: String(floor.level) }])),
} as Record<FloorId, { name: string; short: string }>;

/** Ordem do seletor, como num painel de elevador: de cima para baixo, com o exterior à parte. */
export const FLOOR_ORDER: readonly FloorId[] = ["diretoria", ...[...EXPANSION_FLOORS].sort((a, b) => b.level - a.level).map((floor) => floor.id), "operacao", "terreo"];
export const BUILDING_VIEWS: readonly BuildingView[] = ["exterior", ...FLOOR_ORDER];

export const isBuildingView = (value: string | null): value is BuildingView => BUILDING_VIEWS.includes(value as BuildingView);

const VIEW_QUERY = "andar";

/** A frota real só tem o escritório; a demonstração abre no prédio fechado, ou em `?andar=`. */
export function initialBuildingView(mode: OfficeMode, search: string): BuildingView {
  if (mode === "live") return "operacao";
  const asked = new URLSearchParams(search).get(VIEW_QUERY);
  return isBuildingView(asked) ? asked : "exterior";
}

/** O que a URL mostra: o esconderijo não tem endereço, e recarregar volta à estante de onde se veio. */
export const urlViewOf = (view: BuildingView): BuildingView => (view === HIDEOUT ? "diretoria" : view);

/** Quanto o entorno desce para o andar em tela ficar em y = 0. */
export function viewElevation(view: BuildingView): number {
  return view === "exterior" ? 0 : FLOOR_LEVEL[view] * STORY;
}

/** Pavimentos de fachada visíveis: no corte, só os que ficam abaixo do andar em tela. */
export function visibleLevels(view: BuildingView): number {
  return view === "exterior" ? BUILDING_LEVELS : FLOOR_LEVEL[view];
}

/** O que o enquadramento de "andar inteiro" mostra em cada vista. */
export function viewFit(view: BuildingView): { bounds: OfficeBounds; top?: number } {
  if (view === "exterior") {
    return { bounds: { minX: FACADE_BOUNDS.minX, maxX: FACADE_BOUNDS.maxX, minZ: FACADE_BOUNDS.minZ, maxZ: CITY_VIEW.maxZ - 2.5 }, top: BUILDING_HEIGHT + CROWN_HEIGHT };
  }
  // No térreo a rua faz parte: é por ela que se chega.
  return { bounds: view === "terreo" ? CITY_VIEW : FLOOR_BOUNDS };
}

/**
 * Cidade em que dá para olhar sem ver a ponta dela. Descer o chão em `elevation` desloca, na
 * tela, o pedaço visível para -x e -z; a folga sai só desse lado.
 */
export function cityBoundsAt(city: OfficeBounds, elevation: number): OfficeBounds {
  const shift = (elevation * Math.cos(ELEVATION) * Math.sin(AZIMUTH)) / Math.sin(ELEVATION);
  return { ...city, minX: city.minX + shift, minZ: city.minZ + shift };
}

/**
 * Pavimentos só de fachada: não clicam, não têm sala e não custam nada além da malha. Para um deles
 * virar andar reservado, basta entrar em `EXPANSION_FLOORS`, com as zonas e a mobília dele.
 */
export function decorativeLevels(): number[] {
  return Array.from({ length: BUILDING_LEVELS }, (_, level) => level).filter((level) => floorAtLevel(level) === null);
}

/** Andar acima ou abaixo: o exterior fica no alto da lista, como quem sai do prédio. */
export function neighborView(view: BuildingView, direction: 1 | -1): BuildingView {
  // O esconderijo não está na fila dos andares: qualquer tecla leva de volta por onde se entrou.
  if (view === HIDEOUT) return "diretoria";
  const index = BUILDING_VIEWS.indexOf(view);
  return BUILDING_VIEWS[Math.min(BUILDING_VIEWS.length - 1, Math.max(0, index - direction))]!;
}

const EXPANSION_ROOMS = Object.fromEntries(EXPANSION_FLOORS.map((floor) => [floor.id, expansionRooms(floor)])) as Record<ExpansionFloorId, BuildingRoom[]>;

/** Salas do andar em tela. O exterior não tem sala nenhuma. */
export function viewRooms(view: BuildingView): readonly BuildingRoom[] {
  if (view === "operacao") return OFFICE_ROOMS;
  if (view === "diretoria") return DIRECTORATE_ROOMS;
  if (view === "terreo") return LOBBY_ROOMS;
  if (view === HIDEOUT) return HIDEOUT_ROOMS;
  const expansion = expansionFloor(view);
  return expansion ? EXPANSION_ROOMS[expansion.id] : [];
}

export const BUILDING_ROOMS_BY_ID: Record<string, BuildingRoom> = {
  ...OFFICE_ROOMS_BY_ID,
  ...Object.fromEntries([...LOBBY_ROOMS, ...DIRECTORATE_ROOMS, ...HIDEOUT_ROOMS, ...Object.values(EXPANSION_ROOMS).flat()].map((room) => [room.id, room])),
};

export function viewRoomAt(view: BuildingView, x: number, z: number): BuildingRoom | null {
  if (view === "operacao") return roomAt(x, z);
  return viewRooms(view).find(({ bounds }) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ) ?? null;
}

/** Gente de cenário do andar em tela. */
export function sceneryOfView(view: BuildingView): readonly SceneryHuman[] {
  if (view === "diretoria") return DIRECTORATE_SCENERY;
  if (view === "terreo") return LOBBY_SCENERY;
  if (view === HIDEOUT) return HIDEOUT_SCENERY;
  const expansion = expansionFloor(view);
  return expansion ? expansionScenery(expansion.id) : [];
}

/** Uma caixa de clique por pavimento da fachada; o id é o número dele. */
export const FACADE_BOUNDS_LEVELS: PickBox[] = Array.from({ length: BUILDING_LEVELS }, (_, level) => ({
  id: String(level),
  ...FACADE_BOUNDS,
  minY: level * STORY,
  maxY: (level + 1) * STORY,
}));

/** O andar real de um pavimento da fachada, se ele tiver um. */
export function floorAtLevel(level: number): FloorId | null {
  return FLOOR_ORDER.find((floor) => FLOOR_LEVEL[floor] === level) ?? null;
}
