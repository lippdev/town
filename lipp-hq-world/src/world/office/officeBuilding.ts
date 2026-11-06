import { CITY_VIEW } from "./officeCity";
import { FLOOR_BOUNDS, OFFICE_ROOMS, OFFICE_ROOMS_BY_ID, roomAt, type OfficeBounds } from "./officeLayout";
import { AZIMUTH, ELEVATION, type PickBox } from "./officeCamera";
import { DIRECTORATE_ROOMS, DIRECTORATE_SCENERY } from "./officeDirectorate";
import { LOBBY_ROOMS, LOBBY_SCENERY, type BuildingRoom, type SceneryHuman } from "./officeLobby";
import type { OfficeMode } from "./officeRoute";

/**
 * O prédio do Lipp HQ, só na demonstração.
 *
 * O andar em tela fica sempre em y = 0, e é o entorno (cidade e fachada) que desce: assim
 * `worldToScreen`, o raio do clique, `roomAt`, as cadeiras e as sombras seguem valendo sem
 * nenhum deslocamento. O custo é o entorno precisar saber a elevação do andar em tela.
 */
export type FloorId = "terreo" | "operacao" | "diretoria";
export type BuildingView = "exterior" | FloorId;

/** Altura de um pavimento na fachada: 3 m de parede mais a laje. */
export const STORY = 3.4;
/** Pavimentos desenhados na fachada. Só os de `FLOOR_LEVEL` têm interior. */
export const BUILDING_LEVELS = 11;
export const BUILDING_HEIGHT = STORY * BUILDING_LEVELS;
/** Coroa e placa acima da última laje: entram no enquadramento do exterior. */
export const CROWN_HEIGHT = 3.4;

/** Fachada um pouco para dentro da laje do andar: a borda do corte fica à mostra. */
export const FACADE_BOUNDS: OfficeBounds = {
  minX: FLOOR_BOUNDS.minX - 0.25,
  maxX: FLOOR_BOUNDS.maxX + 0.25,
  minZ: FLOOR_BOUNDS.minZ - 0.25,
  maxZ: FLOOR_BOUNDS.maxZ + 0.25,
};

export const FLOOR_LEVEL: Record<FloorId, number> = { terreo: 0, operacao: 1, diretoria: BUILDING_LEVELS - 1 };

export const FLOOR_LABEL: Record<FloorId, { name: string; short: string }> = {
  diretoria: { name: "Diretoria", short: "D" },
  operacao: { name: "Operação", short: "1" },
  terreo: { name: "Térreo", short: "T" },
};

/** Ordem do seletor, como num painel de elevador: de cima para baixo, com o exterior à parte. */
export const FLOOR_ORDER: readonly FloorId[] = ["diretoria", "operacao", "terreo"];
export const BUILDING_VIEWS: readonly BuildingView[] = ["exterior", ...FLOOR_ORDER];

export const isBuildingView = (value: string | null): value is BuildingView => BUILDING_VIEWS.includes(value as BuildingView);

const VIEW_QUERY = "andar";

/** A frota real só tem o escritório; a demonstração abre no prédio fechado, ou em `?andar=`. */
export function initialBuildingView(mode: OfficeMode, search: string): BuildingView {
  if (mode === "live") return "operacao";
  const asked = new URLSearchParams(search).get(VIEW_QUERY);
  return isBuildingView(asked) ? asked : "exterior";
}

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

/** Andar acima ou abaixo: o exterior fica no alto da lista, como quem sai do prédio. */
export function neighborView(view: BuildingView, direction: 1 | -1): BuildingView {
  const index = BUILDING_VIEWS.indexOf(view);
  return BUILDING_VIEWS[Math.min(BUILDING_VIEWS.length - 1, Math.max(0, index - direction))]!;
}

/** Salas do andar em tela. O exterior não tem sala nenhuma. */
export function viewRooms(view: BuildingView): readonly BuildingRoom[] {
  if (view === "operacao") return OFFICE_ROOMS;
  if (view === "diretoria") return DIRECTORATE_ROOMS;
  return view === "terreo" ? LOBBY_ROOMS : [];
}

export const BUILDING_ROOMS_BY_ID: Record<string, BuildingRoom> = {
  ...OFFICE_ROOMS_BY_ID,
  ...Object.fromEntries([...LOBBY_ROOMS, ...DIRECTORATE_ROOMS].map((room) => [room.id, room])),
};

export function viewRoomAt(view: BuildingView, x: number, z: number): BuildingRoom | null {
  if (view === "operacao") return roomAt(x, z);
  return viewRooms(view).find(({ bounds }) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ) ?? null;
}

/** Gente de cenário do andar em tela. */
export function sceneryOfView(view: BuildingView): readonly SceneryHuman[] {
  if (view === "diretoria") return DIRECTORATE_SCENERY;
  return view === "terreo" ? LOBBY_SCENERY : [];
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
