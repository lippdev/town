import { KitBuilder, FLOOR_TILE, type Batch, type Footprint, type PropPlacement } from "./officeKit";
import { BOARD_TABLE, BOARD_XS, CHIEF_DESK, CHIEF_DOOR, CHIEF_ROOM, CHIEF_SEAT, DIRECTOR_SEAT, LOUNGE_DOOR, LOUNGE_ROOM, MEETING_DOOR, MEETING_ROOM } from "./officeDirectorate";
import { screenUv } from "./officeTextures";
import { ELEVATOR_CORE_X, ELEVATOR_XS, RECEPTION } from "./officeLobby";
import { BACK_WALL_CUT, CORRIDOR, DESK_REACH, ENTRANCE, FACING, FLOOR_BOUNDS, FRONT_WALL_CUT, WALL_HEIGHT, WALL_THICKNESS, type OfficeBounds } from "./officeLayout";
import { DESK_TOP, FRAME, WALL_FRONT, WALL_NORTH, WALL_WEST, WOOD, armchair, bookshelf, cabinet, chair, deskTop, lowTable, monitor, rug, sofa, wallRuns, windowUnit, workstation } from "./officeRooms";

/**
 * Os andares que não são o escritório dos bots. Usam as mesmas peças e os mesmos materiais dele,
 * e custam o mesmo: uma malha por material, montada uma vez só.
 */
export interface FloorBuild {
  fixed: Batch;
  props: PropPlacement[];
  footprints: Footprint[];
}

const { minX, maxX, minZ, maxZ } = FLOOR_BOUNDS;
const WIDTH = maxX - minX;
const DEPTH = maxZ - minZ;
const INSET = 0.07;

/** Laje com a borda do corte à mostra e piso inteiro de pedra. */
export function floorSlab(b: KitBuilder, color = "#d9d1c4") {
  b.box([0, -0.16, 0], [WIDTH + 0.7, 0.3, DEPTH + 0.7], { color: "#61554a", cast: false });
  b.box([0, -0.03, 0], [WIDTH, 0.06, DEPTH], { surface: "stone", color, cast: false, tile: [3.4, 3.4] });
}

interface WallPlan {
  /** Janelas, de `from` a `to` no eixo da parede. */
  windows?: ReadonlyArray<readonly [number, number]>;
  /** Vãos: centro e largura, no eixo da parede. */
  doors?: ReadonlyArray<{ at: number; width: number }>;
}

/** Parede do fundo, inteira: não há nada atrás dela para esconder. */
export function backWall(b: KitBuilder, side: "north" | "west", { windows = [], doors = [] }: WallPlan = {}) {
  const color = side === "north" ? WALL_NORTH : WALL_WEST;
  const half = (side === "north" ? WIDTH / 2 : DEPTH / 2) + 0.16;
  const frame = (fn: () => void) => (side === "north" ? b.at([0, 0, minZ - INSET], 0, fn) : b.at([minX - INSET, 0, 0], Math.PI / 2, fn));
  frame(() => {
    const gaps = [...windows.map(([from, to]) => ({ at: (from + to) / 2, width: to - from })), ...doors];
    for (const [from, to] of wallRuns(half, gaps)) b.box([(from + to) / 2, WALL_HEIGHT / 2, 0], [to - from, WALL_HEIGHT, WALL_THICKNESS], { color });
    for (const [from, to] of windows) windowUnit(b, from, to, color);
    for (const door of doors) b.box([door.at, (2.3 + WALL_HEIGHT) / 2, 0], [door.width, WALL_HEIGHT - 2.3, WALL_THICKNESS], { color });
    for (const [from, to] of wallRuns(half - 0.2, gaps)) b.box([(from + to) / 2, 0.12, 0.12], [to - from, 0.2, 0.06], { ...WOOD, cast: false });
  });
}

/** Mureta da frente: é o corte do diorama, nunca cobre quem está dentro. */
export function frontWall(b: KitBuilder, side: "south" | "east", doors: ReadonlyArray<{ at: number; width: number }> = []) {
  const half = (side === "south" ? WIDTH / 2 : DEPTH / 2) + 0.16;
  const frame = (fn: () => void) => (side === "south" ? b.at([0, 0, maxZ + INSET], Math.PI, fn) : b.at([maxX + INSET, 0, 0], -Math.PI / 2, fn));
  frame(() => {
    for (const [from, to] of wallRuns(half, doors)) b.box([(from + to) / 2, FRONT_WALL_CUT / 2, 0], [to - from, FRONT_WALL_CUT, WALL_THICKNESS], { color: WALL_FRONT });
  });
}

/** Coluna cortada na altura do diorama, com o topo escuro da seção. */
function column(b: KitBuilder, x: number, z: number) {
  b.cylinder([x, BACK_WALL_CUT / 2, z], 0.26, BACK_WALL_CUT, { color: "#b9ae9d" }, 16);
  b.cylinder([x, BACK_WALL_CUT + 0.01, z], 0.265, 0.02, { color: "#4b4238", cast: false }, 16);
  b.solid("coluna", x, z, 0.56, 0.56);
}

/**
 * Portas de elevador na parede do fundo. Abrir, chamar e subir não existem: quem muda de andar
 * é o seletor. Quem chama já está no referencial da parede (+Z aponta para dentro).
 */
export function elevatorBank(b: KitBuilder, xs: readonly number[], { portal = 1.9, panel = true }: { portal?: number; panel?: boolean } = {}) {
  const y = 2.25;
  const leaf = (portal - 0.34) / 2;
  for (const [index, x] of xs.entries()) {
    b.box([x, y / 2 + 0.06, 0.05], [portal, y + 0.12, 0.08], { color: "#5a5850", cast: false });
    for (const side of [-1, 1]) b.box([x + side * (leaf / 2 + 0.01), y / 2 + 0.03, 0.1], [leaf, y - 0.04, 0.04], { color: "#a9adb0" });
    b.box([x, y / 2 + 0.03, 0.122], [0.018, y - 0.04, 0.01], { color: "#3a3d40", cast: false });
    // Mostrador aceso de cada porta: só dá vida, não diz onde cabine nenhuma está.
    b.box([x, y + 0.2, 0.09], [0.56, 0.16, 0.04], { color: "#191c20", cast: false });
    b.box([x + (index - (xs.length - 1) / 2) * 0.14, y + 0.2, 0.115], [0.1, 0.08, 0.01], { surface: "glow", color: "#ffcf7a", cast: false });
    if (panel) {
      b.box([x + portal / 2 + 0.18, 1.1, 0.09], [0.13, 0.24, 0.04], { color: "#2a2d31", cast: false });
      b.box([x + portal / 2 + 0.18, 1.1, 0.115], [0.05, 0.05, 0.01], { surface: "glow", color: "#ffcf7a", cast: false });
    }
  }
  const span = xs.at(-1)! - xs[0]! + portal + (panel ? 0.7 : 0);
  b.box([(xs[0]! + xs.at(-1)!) / 2, 0.03, 0.7], [span, 0.012, 1.1], { color: "#8d8476", cast: false });
}

function receptionDesk(b: KitBuilder) {
  const { x, z, width } = RECEPTION;
  b.at([x, 0, z], 0, () => {
    // Frente mais baixa que a do hall: dá para ver a atendente da cintura para cima.
    b.box([0, 0.43, 0], [width, 0.86, 0.16], WOOD);
    b.box([0, 0.885, -0.1], [width + 0.12, 0.05, 0.46], { color: "#e2d8c4" });
    b.box([0, 0.2, 0.09], [width - 0.5, 0.05, 0.02], { surface: "glow", color: "#e0b873", cast: false });
    for (const side of [-1, 1]) {
      b.box([side * (width / 2 - 0.08), 0.43, -0.7], [0.16, 0.86, 1.3], WOOD);
      b.box([side * (width / 2 - 0.08), 0.885, -0.7], [0.28, 0.05, 1.42], { color: "#e2d8c4" });
    }
    b.solid("balcão", 0, -0.1, width + 0.12, 0.5);
    b.solid("balcão", -(width / 2 - 0.08), -0.7, 0.28, 1.42);
    b.solid("balcão", width / 2 - 0.08, -0.7, 0.28, 1.42);
    // Bancada de trabalho atrás: o monitor olha para quem está no balcão, não para a rua.
    // Do lado oposto ao da câmera: na frente dela, o monitor cobriria a atendente.
    deskTop(b, -1.35, -0.62, 1.7, 0.6);
    monitor(b, -1.35, -0.5, 2, Math.PI);
    b.box([1.5, 0.92, -0.08], [0.34, 0.03, 0.24], { color: "#3f4750", cast: false });
    b.cylinder([2.1, 0.98, -0.1], 0.05, 0.14, { color: "#2f4256", cast: false }, 10);
  });
  // Painel do logo na parede do fundo, com um aparador embaixo.
  b.at([x, 0, minZ + 0.1], 0, () => {
    b.box([0, 1.5, 0], [6.2, 3.0, 0.04], { ...WOOD, color: "#7b5a42" });
    b.box([0, 1.75, 0.03], [5.2, 1.2, 0.02], { color: "#14171d", cast: false });
    b.at([0, 0, 0.55], 0, () => cabinet(b, 4.2, 0.8, 0.5));
    b.prop("planta", [-2.75, 0.02, 0.45], 0.95);
    b.prop("planta", [2.75, 0.02, 0.45], 0.95);
  });
}

function turnstiles(b: KitBuilder) {
  const z = -2.2;
  for (const x of [2.1, 3.4, 4.7, 6.0, 7.3, 8.6]) {
    b.box([x, 0.46, z], [0.2, 0.92, 0.9], { color: "#3a3d42" });
    b.box([x, 0.935, z], [0.22, 0.03, 0.92], { surface: "glow", color: "#6fd29a", cast: false });
    b.solid("catraca", x, z, 0.2, 0.9);
  }
  for (const x of [2.75, 4.05, 5.35, 6.65, 7.95]) {
    b.box([x, 0.62, z], [0.95, 0.46, 0.015], { surface: "glass", color: "#b8d6dd", cast: false });
  }
}

function lounge(b: KitBuilder) {
  rug(b, 6.1, 4.2, 7.2, 5.2, "#6f736e");
  b.at([6.2, 0, 2.55], 0, () => sofa(b, "#c2a26a"));
  b.at([3.25, 0, 4.2], Math.PI / 2, () => sofa(b, "#94a3b8"));
  b.at([8.9, 0, 3.7], -Math.PI / 2, () => armchair(b, "#7c2d3a"));
  b.at([8.9, 0, 5.0], -Math.PI / 2, () => armchair(b, "#6e7076"));
  b.at([6.1, 0, 4.3], 0, () => {
    lowTable(b, 1.5, 0.8);
    b.box([0.2, 0.475, 0], [0.34, 0.03, 0.24], { color: "#b7aa8d", cast: false });
    b.box([-0.3, 0.475, 0.1], [0.28, 0.02, 0.2], { color: "#d9d2c0", cast: false });
  });
  b.prop("planta", [10.2, 0.02, 7.9], 1.05);
  b.prop("planta", [2.3, 0.02, 7.6], 0.9);
  b.prop("planta", [10.3, 0.02, 1.2], 0.95);
  // Banco de espera na frente dos elevadores.
  b.at([ELEVATOR_XS[1], 0, -6.0], 0, () => {
    b.box([0, 0.26, 0], [3.2, 0.12, 0.62], { surface: "fabric", color: "#6e7076" });
    for (const side of [-1, 1]) b.box([side * 1.4, 0.1, 0], [0.1, 0.2, 0.5], { color: "#343943", cast: false });
    b.solid("banco", 0, 0, 3.2, 0.62);
  });
}

function cafe(b: KitBuilder) {
  const x = minX + 0.75;
  b.at([x, 0, 4.2], 0, () => {
    b.box([0, 0.5, 0], [0.8, 1.0, 4.4], WOOD);
    b.box([0.03, 1.03, 0], [0.92, 0.05, 4.5], { color: "#e2d8c4" });
    b.solid("balcão do café", 0, 0, 0.92, 4.5);
    b.box([-0.05, 1.2, -1.2], [0.4, 0.34, 0.5], { color: "#2c2f33" });
    b.box([-0.05, 1.42, -1.2], [0.26, 0.1, 0.3], { color: "#c2a26a", cast: false });
    for (const z of [-0.3, 0.15, 0.6]) b.cylinder([0.1, 1.11, z], 0.05, 0.1, { color: "#ece6da", cast: false }, 10);
  });
  for (const z of [2.9, 4.2, 5.5]) {
    b.cylinder([x + 1.15, 0.38, z], 0.03, 0.72, { color: "#343943", cast: false }, 8);
    b.cylinder([x + 1.15, 0.74, z], 0.2, 0.06, { color: "#4d5159" }, 14);
    b.solid("banqueta", x + 1.15, z, 0.4, 0.4);
  }
  for (const [tableX, tableZ] of [[-7.6, 2.1], [-7.4, 6.6]] as const) {
    b.at([tableX, 0, tableZ], 0, () => {
      b.cylinder([0, 0.6, 0], 0.46, 0.05, WOOD, 18);
      b.cylinder([0, 0.3, 0], 0.04, 0.58, { color: "#282e35", cast: false }, 8);
      b.solid("mesinha", 0, 0, 0.92, 0.92);
      b.at([-0.82, 0, 0], Math.PI / 2, () => chair(b, "#4a4038"));
      b.at([0.82, 0, 0], -Math.PI / 2, () => chair(b, "#4a4038"));
    });
  }
  b.prop("planta", [-10.5, 0.02, 7.9], 0.9);
}

/** A rua chega até a porta: capacho, soleira e canteiros, sem a torre por cima. */
function doorway(b: KitBuilder) {
  const x = ENTRANCE.x;
  b.box([x, 0.012, maxZ - 0.75], [CORRIDOR + 1, 0.018, 1.2], { color: "#2c2d30", cast: false });
  b.box([x, -0.02, maxZ + 0.95], [4.8, 0.05, 2.2], { color: "#77726a", cast: false });
  for (const side of [-1, 1]) {
    b.box([x + side * 1.32, 0.65, maxZ + 0.07], [0.14, 1.3, 0.24], { color: FRAME });
    b.box([x + side * 3.6, 0.25, maxZ + 0.6], [1.8, 0.5, 0.8], { color: "#3b3e42" });
    b.box([x + side * 3.6, 0.53, maxZ + 0.6], [1.65, 0.06, 0.65], { color: "#4b8d57", cast: false });
  }
  // Passadeira da porta ao balcão, com o medalhão no piso onde ela encontra a recepção.
  const from = RECEPTION.z + 1.1;
  const to = maxZ - 1.4;
  b.box([x, 0.012, (from + to) / 2], [1.7, 0.012, to - from], { surface: "fabric", color: "#6b4a44", cast: false });
  for (const side of [-1, 1]) b.box([x + side * 0.92, 0.008, (from + to) / 2], [0.05, 0.008, to - from], { color: "#c2a26a", cast: false });
  b.cylinder([x, 0.008, from - 0.1], 1.45, 0.012, { color: "#bfae93", cast: false }, 40);
  b.cylinder([x, 0.016, from - 0.1], 0.95, 0.012, { color: "#6b4a44", cast: false }, 40);
  // Totem com a lista de andares, à direita de quem entra. Só desenho.
  b.at([x + 2.6, 0, 6.3], 0, () => {
    b.box([0, 0.85, 0], [0.7, 1.7, 0.14], { color: "#26292e" });
    b.box([0, 1.1, 0.075], [0.58, 1.0, 0.01], { surface: "screen", cast: false });
    b.solid("totem", 0, 0, 0.7, 0.14);
  });
}

/**
 * A porta do elevador no fim do corredor do escritório, só na demonstração: o escritório da
 * frota real é o mesmo de sempre. O corredor mede 1,5 m, e a porta cabe nele sem estreitar.
 */
let operationCore: FloorBuild | null = null;
export function buildOperationCore(): FloorBuild {
  if (operationCore) return operationCore;
  const b = new KitBuilder();
  b.at([0, 0, minZ + 0.02], 0, () => elevatorBank(b, [ELEVATOR_CORE_X], { portal: 1.4, panel: false }));
  operationCore = { fixed: b.build(), props: b.props, footprints: b.footprints };
  return operationCore;
}

/** Parede interna alinhada a um eixo, com vãos medidos no próprio eixo. */
function innerWall(b: KitBuilder, axis: "x" | "z", at: number, from: number, to: number, height: number, doors: ReadonlyArray<{ at: number; width: number }> = [], color = WALL_FRONT) {
  const mid = (from + to) / 2;
  const relative = doors.map((door) => ({ at: door.at - mid, width: door.width }));
  for (const [start, end] of wallRuns((to - from) / 2, relative)) {
    const center = mid + (start + end) / 2;
    if (axis === "x") b.box([center, height / 2, at], [end - start, height, WALL_THICKNESS], { color });
    else b.box([at, height / 2, center], [WALL_THICKNESS, height, end - start], { color });
  }
  for (const door of doors) {
    const strip = axis === "x" ? ([door.at, 0.022, at] as const) : ([at, 0.022, door.at] as const);
    b.box(strip, axis === "x" ? [door.width - 0.06, 0.012, 0.16] : [0.16, 0.012, door.width - 0.06], { color: "#c2a26a", cast: false });
  }
}

function woodFloor(b: KitBuilder, room: OfficeBounds, color: string) {
  b.box([(room.minX + room.maxX) / 2, -0.015, (room.minZ + room.maxZ) / 2], [room.maxX - room.minX, 0.06, room.maxZ - room.minZ], { surface: "wood", tile: FLOOR_TILE, color, cast: false });
}

function chiefRoom(b: KitBuilder) {
  woodFloor(b, CHIEF_ROOM, "#8a6a4f");
  innerWall(b, "z", CHIEF_ROOM.maxX, minZ, CHIEF_ROOM.maxZ, FRONT_WALL_CUT, [{ at: CHIEF_DOOR.z, width: CHIEF_DOOR.width }]);
  innerWall(b, "x", CHIEF_ROOM.maxZ, minX, CHIEF_ROOM.maxX, FRONT_WALL_CUT);

  // A mesa. O monitor fica a oeste do eixo dele: a câmera vem de +x +z, e o rosto fica livre.
  rug(b, CHIEF_SEAT.x, -5.6, 5.2, 4.2, "#5e5a5a");
  workstation(b, CHIEF_SEAT, { width: CHIEF_DESK.width, depth: CHIEF_DESK.depth, pedestal: 1, monitors: [[-0.85, 2]], lamp: -1.2 });
  // Duas visitas do outro lado da mesa, olhando para ele.
  for (const x of [-0.8, 0.7]) b.at([CHIEF_SEAT.x + x, 0, CHIEF_SEAT.z + DESK_REACH + CHIEF_DESK.depth + 0.75], Math.PI, () => chair(b, "#5a4436"));

  // O que fica atrás dele: aparador sob a janela e estante na parede oeste.
  b.at([CHIEF_SEAT.x, 0, minZ + 0.42], 0, () => cabinet(b, 3.4));
  b.box([CHIEF_SEAT.x - 0.9, 0.9, minZ + 0.42], [0.34, 0.05, 0.26], { color: "#c9b89a", cast: false });
  b.at([minX + 0.42, 0, -6.6], 0, () => bookshelf(b, 2.5, 3.6, [0.12, 0.67, 1.22, 1.77, 2.38]));
  b.prop("planta", [CHIEF_SEAT.x + 2.4, 0.02, minZ + 0.55], 0.95);

  // Reunião privada, a sudoeste: quatro lugares em volta de uma mesa redonda.
  const table = { x: -9.1, z: -2.55 };
  rug(b, table.x, table.z, 3.6, 3.4, "#6f6d70");
  b.at([table.x, 0, table.z], 0, () => {
    b.cylinder([0, DESK_TOP - 0.02, 0], 0.72, 0.05, WOOD, 28);
    b.cylinder([0, (DESK_TOP - 0.04) / 2, 0], 0.05, DESK_TOP - 0.04, { color: "#282e35", cast: false }, 10);
    b.cylinder([0, 0.03, 0], 0.36, 0.04, { color: "#282e35", cast: false }, 18);
    b.solid("mesa redonda", 0, 0, 1.44, 1.44);
    for (const [x, z, yaw] of [[-1.1, 0, Math.PI / 2], [1.1, 0, -Math.PI / 2], [0, -1.1, 0], [0, 1.1, Math.PI]] as const) {
      b.at([x, 0, z], yaw, () => chair(b, "#4a4038"));
    }
    b.box([0.15, DESK_TOP + 0.015, 0.05], [0.34, 0.02, 0.24], { color: "#c2a26a", cast: false });
  });

  // Lounge dele, a sudeste, entre a porta e a janela da cidade.
  const lounge = { x: -4.85, z: -2.6 };
  rug(b, lounge.x, lounge.z, 3.9, 3.3, "#6e6a6b");
  b.at([lounge.x - 0.1, 0, lounge.z - 1.05], 0, () => sofa(b, "#c2a26a"));
  b.at([lounge.x + 1.35, 0, lounge.z + 0.1], -Math.PI / 2, () => armchair(b, "#7c2d3a"));
  b.at([lounge.x - 0.1, 0, lounge.z + 0.15], 0, () => {
    lowTable(b, 1.2, 0.65);
    b.box([0.1, 0.475, 0], [0.32, 0.03, 0.24], { color: "#b7aa8d", cast: false });
  });
  b.prop("planta", [CHIEF_ROOM.maxX - 0.6, 0.02, CHIEF_ROOM.maxZ - 0.6], 0.8);
}

function anteroom(b: KitBuilder) {
  // Painel de madeira com a placa, entre o canto da sala e os elevadores.
  b.at([-0.9, 0, minZ + 0.1], 0, () => {
    b.box([0, 1.5, 0], [2.8, 3.0, 0.04], { ...WOOD, color: "#6e5140" });
    b.box([0, 1.9, 0.03], [2.5, 0.5, 0.02], { color: "#14171d", cast: false });
  });
  b.at([0, 0, minZ + 0.02], 0, () => elevatorBank(b, ELEVATOR_XS));
  // Banco e jardim baixo a leste: dão fim ao corredor sem parede nem móvel alto.
  b.at([4.35, 0, -5.9], 0, () => {
    b.box([0, 0.26, 0], [3, 0.12, 0.62], { surface: "fabric", color: "#6e7076" });
    for (const side of [-1, 1]) b.box([side * 1.3, 0.1, 0], [0.1, 0.2, 0.5], { color: "#343943", cast: false });
    b.solid("banco", 0, 0, 3, 0.62);
  });
  b.box([9.6, 0.2, -4.4], [2.4, 0.4, 7], { color: "#3b3e42" });
  b.box([9.6, 0.42, -4.4], [2.2, 0.04, 6.8], { color: "#4f7a55", cast: false });
  b.solid("jardim", 9.6, -4.4, 2.4, 7);
  for (const [z, width] of [[-7, 1.05], [-4.6, 0.9], [-2.2, 1.1]] as const) b.prop("planta", [9.6, 0.44, z], width);
}

function boardRoom(b: KitBuilder) {
  woodFloor(b, MEETING_ROOM, "#b6a593");
  innerWall(b, "z", MEETING_ROOM.minX, MEETING_ROOM.minZ, maxZ, BACK_WALL_CUT);
  innerWall(b, "x", MEETING_ROOM.minZ, MEETING_ROOM.minX, maxX, BACK_WALL_CUT, [{ at: MEETING_DOOR.x, width: MEETING_DOOR.width }]);
  const { x, z, width, depth } = BOARD_TABLE;
  rug(b, x, z, width + 2, depth + 3, "#6f6d70");
  b.at([x, 0, z], 0, () => {
    deskTop(b, 0, 0, width, depth);
    b.box([0, DESK_TOP + 0.01, 0], [1.6, 0.012, 0.4], { color: "#3a3d42", cast: false });
  });
  // A cadeira do diretor simulado é a que mexe; ao lado dela, só as peças fixas.
  for (const [index, offset] of BOARD_XS.entries()) {
    if (index > 0) b.at([x + offset, 0, z - depth / 2 - DESK_REACH], FACING.south, () => chair(b, "#3b3f46"));
    b.at([x + offset, 0, z + depth / 2 + DESK_REACH], FACING.north, () => chair(b, "#3b3f46"));
  }
  b.solid("cadeira", DIRECTOR_SEAT.x, DIRECTOR_SEAT.z, 0.62, 0.62);
  // Tela baixa contra a parede cortada: acima dela, nada tapa a mesa.
  b.at([MEETING_ROOM.minX + 0.45, 0, z], Math.PI / 2, () => {
    cabinet(b, 3, 0.5, 0.4);
    b.box([0, 0.86, 0], [1.9, 0.62, 0.06], { color: "#1f2329", cast: false });
    b.plane([0, 0.86, 0.04], 1.8, 0.54, screenUv(1), "screen");
  });
  b.prop("planta", [maxX - 0.7, 0.02, maxZ - 0.7], 0.9);
  b.prop("planta", [maxX - 0.7, 0.02, MEETING_ROOM.minZ + 0.7], 0.8);
}

function directorsLounge(b: KitBuilder) {
  woodFloor(b, LOUNGE_ROOM, "#c9b398");
  innerWall(b, "x", LOUNGE_ROOM.minZ, minX, LOUNGE_ROOM.maxX, BACK_WALL_CUT, [{ at: LOUNGE_DOOR.x, width: LOUNGE_DOOR.width }]);
  rug(b, -6.6, 5.6, 5.6, 4.2, "#7b7671");
  b.at([-6.6, 0, 4.3], 0, () => sofa(b, "#94a3b8"));
  b.at([-9.1, 0, 5.8], Math.PI / 2, () => armchair(b, "#6e7076"));
  b.at([-4.1, 0, 5.8], -Math.PI / 2, () => armchair(b, "#6e7076"));
  b.at([-6.6, 0, 5.9], 0, () => {
    lowTable(b, 1.5, 0.8);
    b.box([-0.2, 0.475, 0.05], [0.3, 0.03, 0.22], { color: "#b7aa8d", cast: false });
  });
  // Café num balcão baixo, a leste. Só cenário.
  b.at([-1.1, 0, 5.2], 0, () => {
    b.box([0, 0.45, 0], [0.8, 0.9, 4.4], WOOD);
    b.box([0, 0.925, 0], [0.92, 0.05, 4.5], { color: "#e2d8c4" });
    b.solid("café", 0, 0, 0.92, 4.5);
    b.box([0, 1.1, -1.2], [0.4, 0.3, 0.5], { color: "#2c2f33" });
    for (const z of [0.1, 0.6, 1.1]) b.cylinder([0, 1, z], 0.05, 0.1, { color: "#ece6da", cast: false }, 10);
  });
  b.prop("planta", [-10.3, 0.02, 2.3], 0.9);
  b.prop("planta", [-10.3, 0.02, 8.1], 0.95);
}

let directorate: FloorBuild | null = null;
export function buildDirectorate(): FloorBuild {
  if (directorate) return directorate;
  const b = new KitBuilder();
  floorSlab(b, "#cfc6b7");
  backWall(b, "north", { windows: [[-9.6, -5.2]] });
  backWall(b, "west", { windows: [[0.8, 3.8], [-7.4, -3.4]] });
  frontWall(b, "south");
  frontWall(b, "east");
  chiefRoom(b);
  anteroom(b);
  boardRoom(b);
  directorsLounge(b);
  directorate = { fixed: b.build(), props: b.props, footprints: b.footprints };
  return directorate;
}

let lobby: FloorBuild | null = null;
export function buildLobby(): FloorBuild {
  if (lobby) return lobby;
  const b = new KitBuilder();
  floorSlab(b);
  backWall(b, "north", { windows: [[-10.8, -8.4], [9.15, 10.85]] });
  backWall(b, "west", { windows: [[-7.6, -2.8], [2.6, 7.4]] });
  frontWall(b, "south", [{ at: -ENTRANCE.x, width: 2.5 }]);
  frontWall(b, "east");
  doorway(b);
  receptionDesk(b);
  b.at([0, 0, minZ + 0.02], 0, () => elevatorBank(b, ELEVATOR_XS));
  turnstiles(b);
  lounge(b);
  cafe(b);
  for (const [x, z] of [[-9.2, -1.2], [0.6, 0.2], [0.6, 7.2], [-9.2, 8.1]] as const) column(b, x, z);
  lobby = { fixed: b.build(), props: b.props, footprints: b.footprints };
  return lobby;
}

