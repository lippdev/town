import { CylinderGeometry, ExtrudeGeometry, Shape, type BufferGeometry } from "three";
import { KitBuilder, FLOOR_TILE, type Batch, type Footprint, type PropPlacement } from "./officeKit";
import { BOARD_TABLE, BOARD_XS, CHIEF_DESK, CHIEF_DOOR, CHIEF_ROOM, CHIEF_SEAT, DIRECTOR_SEAT, LOUNGE_DOOR, LOUNGE_ROOM, MEETING_DOOR, MEETING_ROOM } from "./officeDirectorate";
import { screenUv } from "./officeTextures";
import { EXPANSION_CORRIDOR, expansionFloor, expansionSeats, type ExpansionFloor, type ExpansionPiece } from "./officeExpansion";
import { batEmblemGeometry, capeGeometry, cowlGeometry } from "./hideoutGear";
import { BATTLE_CONSOLE, GIANT_COIN, HIDEOUT_DOOR, SIGNAL_LAMP, SUIT_CASE, TRAINING_MAT, TURNTABLE } from "./officeHideout";
import { SECRET_CLOCK, SECRET_SHELF } from "./officeSecrets";
import { ELEVATOR_CORE, ELEVATOR_STOPS, ELEVATOR_XS, RECEPTION, expansionStop, type ElevatorStop, type FloorSignSpec } from "./officeLobby";
import { BACK_WALL_CUT, CORRIDOR, DESK_REACH, ENTRANCE, FACING, FLOOR_BOUNDS, FRONT_WALL_CUT, WALL_HEIGHT, WALL_THICKNESS, type OfficeBounds } from "./officeLayout";
import { DESK_TOP, FRAME, WALL_FRONT, WALL_NORTH, WALL_WEST, WOOD, armchair, bookshelf, cabinet, chair, deskTop, laptop, lowTable, monitor, rug, sofa, wallRuns, windowUnit, workstation } from "./officeRooms";

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
  /** Onde começa a parede por cima dos vãos. */
  head?: number;
}

/** Parede do fundo, inteira: não há nada atrás dela para esconder. */
export function backWall(b: KitBuilder, side: "north" | "west", { windows = [], doors = [], head = 2.3 }: WallPlan = {}) {
  const color = side === "north" ? WALL_NORTH : WALL_WEST;
  const half = (side === "north" ? WIDTH / 2 : DEPTH / 2) + 0.16;
  const frame = (fn: () => void) => (side === "north" ? b.at([0, 0, minZ - INSET], 0, fn) : b.at([minX - INSET, 0, 0], Math.PI / 2, fn));
  frame(() => {
    const gaps = [...windows.map(([from, to]) => ({ at: (from + to) / 2, width: to - from })), ...doors];
    for (const [from, to] of wallRuns(half, gaps)) b.box([(from + to) / 2, WALL_HEIGHT / 2, 0], [to - from, WALL_HEIGHT, WALL_THICKNESS], { color });
    for (const [from, to] of windows) windowUnit(b, from, to, color);
    for (const door of doors) b.box([door.at, (head + WALL_HEIGHT) / 2, 0], [door.width, WALL_HEIGHT - head, WALL_THICKNESS], { color });
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

const CORE_WALL = "#7d776d";
const CORE_CUT = "#3f3a33";
const SHAFT_WALL = "#34373c";
const STEEL = "#a9adb0";
const JAMB = "#4c4f53";
const CAB_WALL = "#d6cab2";

/** Cabine parada no andar: é ela, à vista pela porta aberta, que diz para onde a porta leva. */
function elevatorCab(b: KitBuilder, x: number) {
  const { cab, front } = ELEVATOR_CORE;
  const z = front - cab.depth / 2;
  const half = cab.width / 2;
  b.box([x, 0.02, z], [cab.width, 0.04, cab.depth], { color: "#8f8676", cast: false });
  b.box([x, cab.height / 2, front - cab.depth], [cab.width, cab.height, 0.05], { color: "#b9c2c6", cast: false });
  for (const side of [-1, 1]) {
    b.box([x + side * half, cab.height / 2, z], [0.05, cab.height, cab.depth], { color: CAB_WALL, cast: false });
    // Corrimão e luz nas duas laterais: a parede oeste é a que a câmera enxerga.
    b.box([x + side * (half - 0.05), 0.95, z], [0.04, 0.04, cab.depth - 0.3], { color: "#c2a26a", cast: false });
    b.box([x + side * (half - 0.03), cab.height - 0.12, z], [0.012, 0.09, cab.depth - 0.2], { surface: "glow", color: "#fff0d0", cast: false });
  }
  // Teto com a polia e os cabos: é o que se vê de cima, no poço.
  b.box([x, cab.height + 0.05, z], [cab.width + 0.05, 0.1, cab.depth + 0.05], { color: "#5c5f63" });
  b.cylinder([x, cab.height + 0.17, z], 0.16, 0.12, { color: "#2a2c30" }, 14);
  for (const offset of [-0.09, 0, 0.09]) {
    const bottom = cab.height + 0.2;
    b.box([x + offset, (bottom + ELEVATOR_CORE.top) / 2, z], [0.022, ELEVATOR_CORE.top - bottom, 0.022], { color: "#1c1d20", cast: false });
  }
}

/** Trilhos, cabos e contrapeso: o que há num poço sem cabine neste andar. */
function shaftInside(b: KitBuilder, x: number, withCab: boolean) {
  const { front, back, top, pitch, partition } = ELEVATOR_CORE;
  const z = (front + back) / 2;
  const half = (pitch - partition) / 2 - 0.03;
  for (const side of [-1, 1]) b.box([x + side * half, top / 2, z], [0.07, top, 0.09], { color: "#6d7176", cast: false });
  if (withCab) return;
  for (const offset of [-0.14, 0, 0.14]) b.box([x + offset, top / 2, z + 0.25], [0.022, top, 0.022], { color: "#1c1d20", cast: false });
  b.box([x, 2.55, back + 0.16], [0.9, 1.1, 0.2], { color: "#494c50" });
  for (const y of [2.2, 2.45, 2.7, 2.95]) b.box([x, y, back + 0.27], [0.92, 0.03, 0.02], { color: "#2a2c30", cast: false });
}

/** Porta de pavimento, batente e soleira. `open` deixa à vista a cabine parada ali. */
function landingDoor(b: KitBuilder, x: number, stop: ElevatorStop, open: boolean, index: number) {
  const { wallFace, front, openingHead, doorHeight } = ELEVATOR_CORE;
  const z = wallFace - stop.recess;
  const inner = minZ + 0.02;
  const halfOpening = stop.opening / 2;
  const middle = (inner + z) / 2;
  const reveal = inner - z + 0.04;
  // Forro do recuo: batente dos dois lados, por baixo da verga e no chão.
  for (const side of [-1, 1]) b.box([x + side * (halfOpening - 0.015), openingHead / 2, middle + 0.02], [0.05, openingHead, reveal], { color: JAMB, cast: false });
  b.box([x, openingHead - 0.015, middle + 0.02], [stop.opening, 0.05, reveal], { color: JAMB, cast: false });
  b.box([x, 0.006, middle + 0.02], [stop.opening, 0.012, reveal], { color: "#7b7f83", cast: false });
  // Painel acima da porta, com o mostrador aceso de quem chega.
  b.box([x, (doorHeight + openingHead) / 2, z], [stop.opening, openingHead - doorHeight, 0.05], { color: "#23262a", cast: false });
  b.box([x + (index - 1) * 0.1, doorHeight + 0.07, z + 0.03], [0.09, 0.07, 0.01], { surface: "glow", color: "#ffcf7a", cast: false });
  for (const side of [-1, 1]) b.box([x + side * 0.28, doorHeight + 0.07, z + 0.03], [0.06, 0.03, 0.01], { surface: "glow", color: open ? "#8fe0a8" : "#5a4a2c", cast: false });
  if (open) {
    // Folhas recolhidas: sobra só a ponta delas, e o chão segue até a cabine.
    for (const side of [-1, 1]) b.box([x + side * (halfOpening - 0.07), doorHeight / 2, z], [0.09, doorHeight, 0.04], { color: STEEL, cast: false });
    b.box([x, 0.008, (z + front) / 2], [stop.opening, 0.016, z - front + 0.04], { color: "#7b7f83", cast: false });
    return;
  }
  const leaf = halfOpening - 0.02;
  for (const side of [-1, 1]) b.box([x + side * (leaf / 2 + 0.005), doorHeight / 2, z], [leaf, doorHeight, 0.04], { color: STEEL });
  b.box([x, doorHeight / 2, z + 0.022], [0.014, doorHeight, 0.008], { color: "#2c2e31", cast: false });
}

/**
 * A caixa dos elevadores, em coordenadas do andar. Abrir, chamar e subir não existem: quem muda
 * de andar é o seletor. Mas a porta leva a algum lugar: atrás dela há recuo, poço, cabine e
 * cabos, e a caixa é a mesma em todo andar, para o elevador nunca mudar de lugar na torre.
 */
export function elevatorCore(b: KitBuilder, stop: ElevatorStop) {
  const { bounds, wallFace, front, back, top, pitch, partition, openingHead } = ELEVATOR_CORE;
  const width = bounds.maxX - bounds.minX;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  // Laje e fundo do poço.
  b.box([centerX, -0.16, centerZ], [width + 0.2, 0.3, bounds.maxZ - bounds.minZ + 0.2], { color: "#61554a", cast: false });
  b.box([centerX, -0.012, (front + back) / 2], [width, 0.012, front - back], { color: "#1b1c1f", cast: false });
  // Paredes de fora: fundo e laterais, com o topo escuro da seção.
  const span = front - bounds.minZ;
  const shaftZ = (front + bounds.minZ) / 2;
  b.box([centerX, top / 2, (back + bounds.minZ) / 2], [width, top, back - bounds.minZ], { color: CORE_WALL });
  b.box([centerX, top + 0.005, (back + bounds.minZ) / 2], [width + 0.01, 0.015, back - bounds.minZ + 0.01], { color: CORE_CUT, cast: false });
  b.box([centerX, top / 2, back + 0.012], [width - 0.2, top, 0.02], { color: SHAFT_WALL, cast: false });
  for (const side of [-1, 1]) {
    const x = centerX + side * (width / 2 - partition / 2);
    b.box([x, top / 2, shaftZ], [partition, top, span], { color: CORE_WALL });
    b.box([x, top + 0.005, shaftZ], [partition + 0.01, 0.015, span + 0.01], { color: CORE_CUT, cast: false });
  }
  for (const [index, x] of ELEVATOR_XS.entries()) {
    if (index > 0) {
      const wall = x - pitch / 2;
      b.box([wall, top / 2, shaftZ], [partition, top, span], { color: SHAFT_WALL });
      b.box([wall, top + 0.005, shaftZ], [partition + 0.01, 0.015, span + 0.01], { color: CORE_CUT, cast: false });
    }
    // Frente do poço: maciça em volta da porta, atrás da parede do andar.
    const depth = wallFace - front;
    const z = (wallFace + front) / 2;
    const door = (stop.doors as readonly number[]).includes(index);
    const halfOpening = door ? stop.opening / 2 : 0;
    const from = door ? openingHead : 0;
    b.box([x, (from + top) / 2, z], [pitch, top - from, depth], { color: CORE_WALL });
    b.box([x, top + 0.005, z], [pitch + 0.01, 0.015, depth + 0.01], { color: CORE_CUT, cast: false });
    if (door) {
      const pier = (pitch - stop.opening) / 2;
      for (const side of [-1, 1]) b.box([x + side * (halfOpening + pier / 2), openingHead / 2, z], [pier, openingHead, depth], { color: CORE_WALL });
      landingDoor(b, x, stop, stop.openShaft === index, index);
    }
    shaftInside(b, x, stop.openShaft === index);
    if (stop.openShaft === index) elevatorCab(b, x);
    if (stop.panel && door) {
      b.box([x + halfOpening + 0.14, 1.1, minZ + 0.04], [0.13, 0.24, 0.04], { color: "#2a2d31", cast: false });
      b.box([x + halfOpening + 0.14, 1.1, minZ + 0.065], [0.05, 0.05, 0.01], { surface: "glow", color: "#ffcf7a", cast: false });
    }
    if (stop.machines) {
      // Último pavimento: a máquina de tração fica sobre o poço, numa viga de ponta a ponta.
      const machineZ = (front + back) / 2 - 0.1;
      b.box([x + 0.42, top + 0.2, machineZ], [0.5, 0.34, 0.5], { color: "#3d4044" });
      b.cylinder([x - 0.05, top + 0.22, machineZ], 0.2, 0.14, { color: "#6d7176" }, 16);
    }
  }
  if (stop.machines) b.box([centerX, top + 0.01, (front + back) / 2 - 0.1], [width, 0.06, 0.3], { color: "#55585c" });
  // Faixa de chegada no piso, em frente às portas.
  const doorsXs = stop.doors.map((index) => ELEVATOR_XS[index]!);
  const hallWidth = doorsXs.at(-1)! - doorsXs[0]! + stop.opening + (stop.panel ? 0.5 : 0);
  if (stop.doors.length > 1) b.box([(doorsXs[0]! + doorsXs.at(-1)!) / 2, 0.012, minZ + 0.72], [hallWidth, 0.012, 1.1], { color: "#8d8476", cast: false });
}

/** Vãos da parede do fundo: a parede abre de verdade, e a porta fica atrás dela. */
function elevatorOpenings(stop: ElevatorStop): Pick<WallPlan, "doors" | "head"> {
  return { doors: stop.doors.map((index) => ({ at: ELEVATOR_XS[index]!, width: stop.opening })), head: ELEVATOR_CORE.openingHead };
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
 * A caixa dos elevadores no fim do corredor do escritório, só na demonstração: o escritório da
 * frota real é o mesmo de sempre. A porta mora atrás da ponta do corredor, sem estreitá-lo.
 */
let operationCore: FloorBuild | null = null;
export function buildOperationCore(): FloorBuild {
  if (operationCore) return operationCore;
  const b = new KitBuilder();
  elevatorCore(b, ELEVATOR_STOPS.operacao);
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

const SHELF_ROWS = [0.12, 0.67, 1.22, 1.77, 2.38];

/** O que a estante esconde: batente aceso e degraus que somem na parede, sem furar a torre. */
function secretPassage(b: KitBuilder) {
  const { z, width, height } = SECRET_SHELF;
  const x = minX + 0.1;
  b.at([x, 0, z], 0, () => {
    b.box([0, height / 2, 0], [0.04, height, width], { color: "#07080b", cast: false });
    for (const side of [-1, 1]) b.box([0.03, height / 2, side * (width / 2 - 0.04)], [0.02, height, 0.04], { surface: "glow", color: "#e0a84f", cast: false });
    b.box([0.03, height - 0.03, 0], [0.02, 0.04, width], { surface: "glow", color: "#e0a84f", cast: false });
    for (let step = 0; step < 6; step += 1) {
      const inset = step * 0.075;
      b.box([0.024, 0.14 + step * 0.26, 0], [0.008, 0.032, width - 0.2 - inset * 2], { surface: "glow", color: step % 2 === 0 ? "#3d78c4" : "#2b5fa8", cast: false });
    }
  });
}

let secretShelf: Batch | null = null;
/** A seção que gira, com a origem nas dobradiças. Fechada, é igual às outras. */
export function buildSecretShelf(): { body: Batch } {
  if (!secretShelf) {
    const { width, hingeZ, z } = SECRET_SHELF;
    const body = new KitBuilder();
    // O fundo da estante fica na linha das dobradiças: é em volta dele que ela gira.
    body.at([0.22, 0, z - hingeZ], 0, () => bookshelf(body, 2.5, width, SHELF_ROWS));
    secretShelf = body.build();
  }
  return { body: secretShelf };
}

function wallClock(b: KitBuilder) {
  const { x, y, z, radius } = SECRET_CLOCK;
  b.at([x, y, z], 0, () => {
    const face = new CylinderGeometry(radius, radius, 0.05, 28);
    face.rotateX(Math.PI / 2);
    b.mesh(face, [0, 0, 0], { color: "#e2d8c4", cast: false });
    const rim = new CylinderGeometry(radius + 0.045, radius + 0.045, 0.04, 28);
    rim.rotateX(Math.PI / 2);
    b.mesh(rim, [0, 0, -0.015], { color: "#6e5140", cast: false });
    for (let hour = 0; hour < 12; hour += 1) {
      const angle = (hour / 12) * Math.PI * 2;
      b.box([Math.sin(angle) * radius * 0.84, Math.cos(angle) * radius * 0.84, 0.03], [0.018, 0.05, 0.01], { color: "#26292e", cast: false });
    }
  });
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
  // A estante tem três seções: a do meio é a porta, e mora em `buildSecretShelf`, para poder girar.
  for (const z of [-7.8, -5.4]) b.at([minX + 0.42, 0, z], 0, () => bookshelf(b, 2.5, 1.2, SHELF_ROWS));
  b.solid("estante", minX + 0.42, -6.6, 0.56, 1.2);
  secretPassage(b);
  b.prop("planta", [CHIEF_SEAT.x + 2.4, 0.02, minZ + 0.55], 0.95);
  wallClock(b);

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
  elevatorCore(b, ELEVATOR_STOPS.diretoria);
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
  backWall(b, "north", { windows: [[-9.6, -5.2]], ...elevatorOpenings(ELEVATOR_STOPS.diretoria) });
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
  backWall(b, "north", { windows: [[-10.8, -8.4], [9.15, 10.85]], ...elevatorOpenings(ELEVATOR_STOPS.terreo) });
  backWall(b, "west", { windows: [[-7.6, -2.8], [2.6, 7.4]] });
  frontWall(b, "south", [{ at: -ENTRANCE.x, width: 2.5 }]);
  frontWall(b, "east");
  doorway(b);
  receptionDesk(b);
  elevatorCore(b, ELEVATOR_STOPS.terreo);
  turnstiles(b);
  lounge(b);
  cafe(b);
  for (const [x, z] of [[-9.2, -1.2], [0.6, 0.2], [0.6, 7.2], [-9.2, 8.1]] as const) column(b, x, z);
  lobby = { fixed: b.build(), props: b.props, footprints: b.footprints };
  return lobby;
}

const CHAIR_TONE = "#4a4f57";

/** Lugar de um figurante: a cadeira fixa dá a vez à dele, e só esse lugar tem o que fazer na mesa. */
type TakenSeat = (x: number, z: number) => boolean;

/** Um móvel de andar reservado. Só quem tem figurante ganha laptop; o resto da mesa fica vazio. */
function expansionPiece(b: KitBuilder, piece: ExpansionPiece, taken: TakenSeat) {
  switch (piece.kind) {
    case "floor":
      woodFloor(b, piece.bounds, piece.color);
      break;
    case "partition": {
      const height = piece.height ?? BACK_WALL_CUT;
      const lowest = Math.min(piece.from, piece.to);
      const highest = Math.max(piece.from, piece.to);
      innerWall(b, piece.axis, piece.at, lowest, highest, height, piece.doors ?? []);
      break;
    }
    case "island":
      b.at([piece.x, 0, piece.z], 0, () => {
        deskTop(b, 0, 0, piece.width, piece.depth);
        for (const [index, offset] of piece.seats.entries()) {
          const north = -piece.depth / 2 - DESK_REACH;
          const south = piece.depth / 2 + DESK_REACH;
          if (taken(piece.x + offset, piece.z + north)) {
            if (!piece.bare) laptop(b, offset, -piece.depth / 2 + 0.28, index);
          } else b.at([offset, 0, north], FACING.south, () => chair(b, piece.color ?? CHAIR_TONE));
          // Do lado de trás, só a sala de reunião do cenário tem cadeira ocupável.
          if (!taken(piece.x + offset, piece.z + south)) b.at([offset, 0, south], FACING.north, () => chair(b, piece.color ?? CHAIR_TONE));
        }
      });
      break;
    case "round":
      b.at([piece.x, 0, piece.z], 0, () => {
        b.cylinder([0, DESK_TOP - 0.02, 0], piece.radius, 0.05, WOOD, 28);
        b.cylinder([0, (DESK_TOP - 0.04) / 2, 0], 0.05, DESK_TOP - 0.04, { color: "#282e35", cast: false }, 10);
        b.cylinder([0, 0.03, 0], 0.36, 0.04, { color: "#282e35", cast: false }, 18);
        b.solid("mesa redonda", 0, 0, piece.radius * 2, piece.radius * 2);
        const reach = piece.radius + 0.38;
        for (const [x, z, yaw] of [[-reach, 0, Math.PI / 2], [reach, 0, -Math.PI / 2], [0, -reach, 0], [0, reach, Math.PI]] as const) {
          if (taken(piece.x + x, piece.z + z)) b.box([x * 0.42, DESK_TOP + 0.012, z * 0.42], [0.24, 0.018, 0.32], { color: "#dcd8cf", cast: false });
          else b.at([x, 0, z], yaw, () => chair(b, piece.color ?? CHAIR_TONE));
        }
      });
      break;
    case "desk":
      b.at([piece.x, 0, piece.z], piece.yaw, () => {
        deskTop(b, 0, DESK_REACH + 0.4, piece.width, 0.8);
        // O monitor fica do lado oposto ao da câmera, como na mesa do chefe: o rosto continua livre.
        if (taken(piece.x, piece.z)) monitor(b, 0.45, DESK_REACH + 0.6, piece.z < 0 ? 1 : 2);
        else chair(b, piece.chair ?? CHAIR_TONE);
      });
      break;
    case "lounge": {
      rug(b, piece.x, piece.z, 5, 3.8, piece.rug);
      b.at([piece.x, 0, piece.z - 1.1], 0, () => sofa(b, piece.pillow));
      b.at([piece.x, 0, piece.z + 0.2], 0, () => lowTable(b, 1.3, 0.7));
      for (const [index, color] of piece.armchairs.entries()) {
        const side = index === 0 ? -1 : 1;
        b.at([piece.x + side * 1.9, 0, piece.z + 0.3], -side * (Math.PI / 2), () => armchair(b, color));
      }
      break;
    }
    case "cabinet":
      b.at([piece.x, 0, piece.z], piece.yaw, () => cabinet(b, piece.width));
      break;
    case "board":
      b.at([piece.x, 0, piece.z], piece.yaw, () => {
        b.box([0, 1.55, 0.02], [piece.width, 1.2, 0.04], { color: "#3a3d42", cast: false });
        b.box([0, 1.55, 0.045], [piece.width - 0.1, 1.1, 0.01], { color: "#e8e6df", cast: false });
        b.solid("quadro", 0, 0, piece.width, 0.1);
      });
      break;
    case "counter":
      b.at([piece.x, 0, piece.z], 0, () => {
        b.box([0, 0.45, 0], [0.8, 0.9, piece.length], WOOD);
        b.box([0, 0.925, 0], [0.92, 0.05, piece.length + 0.1], { color: "#e2d8c4" });
        b.solid("balcão", 0, 0, 0.92, piece.length + 0.1);
      });
      break;
    case "planter":
      b.box([piece.x, 0.2, piece.z], [piece.width, 0.4, piece.depth], { color: "#3b3e42" });
      b.box([piece.x, 0.42, piece.z], [piece.width - 0.2, 0.04, piece.depth - 0.2], { color: "#4f7a55", cast: false });
      b.solid("jardim", piece.x, piece.z, piece.width, piece.depth);
      for (const offset of [-piece.depth / 3, 0, piece.depth / 3]) b.prop("planta", [piece.x, 0.44, piece.z + offset], 0.9);
      break;
    case "plant":
      b.prop("planta", [piece.x, 0.02, piece.z], piece.width);
      break;
  }
}

const expansions = new Map<ExpansionFloor, FloorBuild>();

/** Um andar reservado: laje, paredes e núcleo iguais, a planta vem da tabela. Só monta quando alguém vai até lá. */
/** Por id, o andar da tabela em uso; o teste passa o andar em si, para montar a Tecnologia sem o cenário. */
export function buildExpansion(which: string | ExpansionFloor): FloorBuild {
  const floor: ExpansionFloor = typeof which === "string" ? expansionFloor(which)! : which;
  const cached = expansions.get(floor);
  if (cached) return cached;
  const stop = expansionStop(floor.openShaft);
  const b = new KitBuilder();
  floorSlab(b, floor.slab);
  backWall(b, "north", { windows: floor.northWindows, ...elevatorOpenings(stop) });
  backWall(b, "west", { windows: floor.westWindows });
  frontWall(b, "south");
  frontWall(b, "east");
  elevatorCore(b, stop);
  const seats = expansionSeats(floor);
  const taken: TakenSeat = (x, z) => seats.some((seat) => Math.abs(seat.x - x) < 0.01 && Math.abs(seat.z - z) < 0.01);
  for (const piece of floor.pieces) expansionPiece(b, piece, taken);
  for (const seat of seats) b.solid("cadeira", seat.x, seat.z, 0.62, 0.62);
  // O caminho dos elevadores até as zonas: passadeira, como a do térreo.
  const { minX: fromX, maxX: toX, minZ: fromZ, maxZ: toZ } = EXPANSION_CORRIDOR;
  b.box([(fromX + toX) / 2, 0.008, (fromZ + toZ) / 2], [toX - fromX, 0.012, toZ - fromZ], { surface: "fabric", color: "#6b6764", cast: false });
  const build = { fixed: b.build(), props: b.props, footprints: b.footprints };
  expansions.set(floor, build);
  return build;
}

/** A placa do andar, na parede do fundo: é dela que se lê que o espaço está reservado. */
export function expansionSigns(floor: ExpansionFloor): FloorSignSpec[] {
  return [
    { text: "ELEVADORES", at: [ELEVATOR_XS[1], 2.83, minZ + 0.05], width: 1.7, height: 0.28 },
    { text: floor.title.toLocaleUpperCase("pt-BR"), at: [-0.2, 1.75, minZ + 0.08], width: 3.4, height: 0.42 },
  ];
}

const CAVE_WALL = "#4a4d55";
const CAVE_METAL = "#23262c";
const CAVE_DARK = "#14161a";
const BLUE = "#5aa9ff";
const AMBER = "#e0a84f";

/** Parede de rocha escura, sem janela: nada da cidade entra aqui. */
function caveShell(b: KitBuilder) {
  floorSlab(b, "#1f2125");
  const half = { x: WIDTH / 2 + 0.16, z: DEPTH / 2 + 0.16 };
  b.box([0, WALL_HEIGHT / 2, minZ - INSET], [half.x * 2, WALL_HEIGHT, WALL_THICKNESS], { surface: "stone", color: CAVE_WALL, tile: [2.4, 1.6] });
  b.box([minX - INSET, WALL_HEIGHT / 2, 0], [WALL_THICKNESS, WALL_HEIGHT, half.z * 2], { surface: "stone", color: CAVE_WALL, tile: [2.4, 1.6] });
  b.box([0, FRONT_WALL_CUT / 2, maxZ + INSET], [half.x * 2, FRONT_WALL_CUT, WALL_THICKNESS], { color: "#17191d" });
  b.box([maxX + INSET, FRONT_WALL_CUT / 2, 0], [WALL_THICKNESS, FRONT_WALL_CUT, half.z * 2], { color: "#17191d" });
  // Fita baixa, a linha azul que dá a escala do lugar.
  b.box([0, 0.2, minZ + 0.03], [WIDTH - 0.2, 0.025, 0.01], { surface: "glow", color: "#2b5fa8", cast: false });
  b.box([minX + 0.03, 0.2, 0], [0.01, 0.025, DEPTH - 0.2], { surface: "glow", color: "#2b5fa8", cast: false });
}

/** A mesa em arco do terminal. Os monitores são outra malha, com a textura própria deles. */
function investigationDesk(b: KitBuilder) {
  const { x, z, width, depth } = BATTLE_CONSOLE;
  b.at([x, 0, z], 0, () => {
    b.box([0, 0.42, 0], [width, 0.84, depth], { color: CAVE_METAL });
    b.box([0, 0.875, 0.02], [width + 0.08, 0.06, depth + 0.1], { color: "#32363e" });
    b.box([0, 0.14, depth / 2 + 0.005], [width - 0.3, 0.02, 0.01], { surface: "glow", color: BLUE, cast: false });
    for (const [kx, kw] of [[-1.6, 1.1], [0, 1.5], [1.6, 1.1]] as const) {
      b.box([kx, 0.915, 0.18], [kw, 0.018, 0.34], { color: "#14161a", cast: false });
      for (let row = 0; row < 3; row += 1) b.box([kx, 0.927, 0.08 + row * 0.1], [kw - 0.14, 0.004, 0.03], { surface: "glow", color: row === 1 ? AMBER : BLUE, cast: false });
    }
    b.solid("terminal", 0, 0, width + 0.08, depth + 0.1);
  });
  // O rack atrás das telas: é ele que dá peso à parede de monitores.
  b.box([x, 1.72, minZ + 0.1], [6.5, 2.1, 0.12], { color: CAVE_DARK });
  b.box([x, 2.8, minZ + 0.14], [6.5, 0.05, 0.1], { surface: "glow", color: BLUE, cast: false });
}

const SCREEN_PANELS = [
  { x: -2.3, y: 1.72, width: 1.65, height: 1.1 },
  { x: 0, y: 1.72, width: 2.8, height: 1.8 },
  { x: 2.3, y: 1.72, width: 1.65, height: 1.1 },
] as const;

/** Os três painéis do terminal, com a textura deles dividida em três. A cena desenha nessa textura. */
export function buildTerminalScreens(): Batch {
  const b = new KitBuilder();
  const { x } = BATTLE_CONSOLE;
  SCREEN_PANELS.forEach((panel, index) => {
    const u0 = index / 3;
    b.plane([x + panel.x, panel.y, minZ + 0.17], panel.width, panel.height, [u0, 0, u0 + 1 / 3, 1], "screen");
  });
  return b.build();
}

/** A vitrine: base, vidro e o traje reserva, com capuz e capa do mesmo molde do que o morcego usa. */
function suitCase(b: KitBuilder) {
  const { x, z, width, depth, height } = SUIT_CASE;
  b.at([x, 0, z], 0, () => {
    b.box([0, 0.09, 0], [width, 0.18, depth], { color: CAVE_METAL });
    b.box([0, 0.19, 0], [width - 0.08, 0.02, depth - 0.08], { surface: "glow", color: "#8f6a2c", cast: false });
    // Sem tampa: de cima, ela esconderia justo o capuz. Só o aro de cima, com a luz.
    for (const side of [-1, 1]) {
      b.box([0, height, side * (depth / 2 - 0.04)], [width, 0.08, 0.08], { color: CAVE_METAL });
      b.box([side * (width / 2 - 0.04), height, 0], [0.08, 0.08, depth], { color: CAVE_METAL });
      b.box([0, height - 0.05, side * (depth / 2 - 0.09)], [width - 0.2, 0.02, 0.02], { surface: "glow", color: "#fff0d0", cast: false });
    }
    for (const side of [-1, 1]) for (const front of [-1, 1]) b.box([side * (width / 2 - 0.03), height / 2, front * (depth / 2 - 0.03)], [0.06, height, 0.06], { color: "#14161a" });
    for (const [px, pz, yaw, span] of [[0, depth / 2 - 0.02, 0, width], [width / 2 - 0.02, 0, Math.PI / 2, depth], [-width / 2 + 0.02, 0, Math.PI / 2, depth]] as const) {
      b.plane([px, height / 2 + 0.09, pz], span - 0.1, height - 0.2, [0, 0, 1, 1], "glass", yaw, "#bcd6e6");
    }
    // Manequim: pernas, tronco largo e braços afastados, proporção de herói de quadrinho.
    const suit = { color: "#1b1d23" };
    for (const side of [-1, 1]) {
      b.rounded([side * 0.16, 0.66, 0], [0.2, 0.92, 0.24], 0.07, suit);
      b.rounded([side * 0.16, 0.26, 0.05], [0.22, 0.14, 0.36], 0.05, { color: "#101116" });
      b.rounded([side * 0.44, 1.32, 0.02], [0.15, 0.72, 0.17], 0.06, suit);
      b.rounded([side * 0.45, 0.94, 0.02], [0.16, 0.2, 0.18], 0.05, { color: "#101116" });
    }
    b.rounded([0, 1.42, 0], [0.72, 0.82, 0.32], 0.1, suit);
    const belt = new CylinderGeometry(0.31, 0.31, 0.09, 14);
    belt.scale(1, 1, 0.58);
    b.mesh(belt, [0, 1.07, 0], { color: "#c7983d" });
    const emblem = batEmblemGeometry(0.52, 0.015);
    b.mesh(emblem, [0, 1.56, 0.163], { color: "#c7983d", cast: false });
    b.cylinder([0, 1.92, 0], 0.08, 0.14, { color: "#d4966e", cast: false }, 10);
    const dome = cowlGeometry(0.2);
    b.mesh(dome, [0, 2.09, 0], { color: "#14161a" });
    const cape = capeGeometry(0.98, 1.62);
    b.mesh(cape, [0, 1.84, -0.18], { color: "#101116" });
    b.solid("vitrine", 0, 0, width, depth);
  });
}

function signalLamp(b: KitBuilder) {
  const { x, z } = SIGNAL_LAMP;
  b.at([x, 0, z], -0.95, () => {
    b.cylinder([0, 0.06, 0], 0.46, 0.12, { color: CAVE_METAL }, 18);
    b.box([0, 0.5, 0], [0.12, 0.8, 0.12], { color: "#14161a" });
    const drum = new CylinderGeometry(0.34, 0.26, 0.56, 18);
    drum.rotateX(Math.PI / 2 - 0.32);
    b.mesh(drum, [0, 1.04, 0], { color: "#3a3e46" });
    const lens = new CylinderGeometry(0.3, 0.3, 0.03, 18);
    lens.rotateX(Math.PI / 2 - 0.32);
    b.mesh(lens, [0, 1.13, 0.28], { color: "#c6d6e6", cast: false });
    b.solid("holofote", 0, 0, 0.92, 0.92);
  });
}

/** Tatame, boneco de pancada e banco de pesos: treino que se reconhece de cima, sem peça de GLB. */
function trainingArea(b: KitBuilder) {
  const { x, z, width, depth } = TRAINING_MAT;
  b.box([x, 0.04, z], [width, 0.05, depth], { surface: "fabric", color: "#1c2c44", cast: false });
  b.box([x, 0.068, z], [width - 0.5, 0.008, depth - 0.5], { color: "#2b4166", cast: false });
  b.box([x, 0.074, z], [width - 0.7, 0.008, depth - 0.7], { surface: "fabric", color: "#1c2c44", cast: false });
  const emblem = batEmblemGeometry(2.4, 0.004);
  emblem.rotateX(-Math.PI / 2);
  b.mesh(emblem, [x, 0.082, z], { color: "#2b4166", cast: false });
  // Boneco de madeira: é a silhueta do treino.
  b.at([x - 1.4, 0, z - 1.3], 0.8, () => {
    b.cylinder([0, 0.8, 0], 0.17, 1.5, { ...WOOD, color: "#7a5a3c" }, 12);
    b.cylinder([0, 0.06, 0], 0.34, 0.1, { color: CAVE_DARK }, 14);
    for (const [y, yaw] of [[1.2, 0.5], [1.05, -0.5], [0.72, 0]] as const) {
      b.at([0, y, 0], yaw, () => b.box([0, 0, 0.26], [0.06, 0.06, 0.52], { ...WOOD, color: "#5f4530" }));
    }
    b.solid("boneco", 0, 0, 0.7, 0.7);
  });
  // Banco com barra: a barra atravessa, e os discos marcam as pontas.
  b.at([x + 1.5, 0, z + 1.5], 0.4, () => {
    b.box([0, 0.3, 0], [0.42, 0.1, 1.3], { surface: "fabric", color: "#2a2d33" });
    for (const end of [-0.45, 0.45]) b.box([0, 0.14, end], [0.5, 0.26, 0.08], { color: CAVE_DARK });
    b.box([0, 0.78, -0.45], [1.5, 0.03, 0.03], { color: "#9aa0a8" });
    for (const side of [-1, 1]) {
      b.box([side * 0.31, 0.45, -0.5], [0.05, 0.66, 0.05], { color: CAVE_DARK });
      const plate = new CylinderGeometry(0.19, 0.19, 0.05, 16);
      plate.rotateZ(Math.PI / 2);
      b.mesh(plate, [side * 0.68, 0.78, -0.45], { color: "#3a3e46" });
    }
    b.solid("banco de treino", 0, 0, 1.5, 1.3);
  });
}

/** Berço da moeda: a moeda em si gira, e fica em outra malha. */
function coinCradle(b: KitBuilder) {
  const { x, z, radius } = GIANT_COIN;
  b.at([x, 0, z], Math.PI / 4, () => {
    b.box([0, 0.1, 0], [radius * 1.5, 0.2, 0.7], { color: CAVE_METAL });
    b.box([0, 0.21, 0], [radius * 1.2, 0.02, 0.12], { surface: "glow", color: AMBER, cast: false });
    b.solid("moeda", 0, 0, radius * 1.5, 0.7);
  });
}

/** Marcas de garagem: faixa de manobra até a porta e o trilho do carro, no chão. */
function garageMarks(b: KitBuilder) {
  const { x, z } = TURNTABLE;
  b.box([x + 0.05, 0.03, z - 3.6], [0.1, 0.012, 1.4], { color: "#c7983d", cast: false });
  b.box([HIDEOUT_DOOR.x, 0.024, -6.2], [2.1, 0.008, 4.8], { color: "#292c32", cast: false });
  for (const side of [-1, 1]) b.box([HIDEOUT_DOOR.x + side * 1.05, 0.03, -6.2], [0.04, 0.01, 4.8], { surface: "glow", color: AMBER, cast: false });
}

let hideout: FloorBuild | null = null;
/** O esconderijo. Só o que é autoral fica aqui; o que veio do kit CC0 entra pela tabela `HIDEOUT_KIT`. */
export function buildHideout(): FloorBuild {
  if (hideout) return hideout;
  const b = new KitBuilder();
  caveShell(b);
  investigationDesk(b);
  suitCase(b);
  signalLamp(b);
  trainingArea(b);
  coinCradle(b);
  garageMarks(b);
  // O portal aceso: é a saída, e precisa ser achada sem ler nada.
  for (const side of [-1, 1]) b.box([HIDEOUT_DOOR.x + side * 1.5, 1.45, HIDEOUT_DOOR.z + 0.2], [0.05, 2.9, 0.03], { surface: "glow", color: AMBER, cast: false });
  b.box([HIDEOUT_DOOR.x, 2.92, HIDEOUT_DOOR.z + 0.2], [3.05, 0.05, 0.03], { surface: "glow", color: AMBER, cast: false });
  // Sem estes móveis no mapa, ninguém na cena saberia que estão ali.
  b.solid("plataforma", TURNTABLE.x, TURNTABLE.z, TURNTABLE.radius * 2, TURNTABLE.radius * 2);
  hideout = { fixed: b.build(), props: b.props, footprints: b.footprints };
  return hideout;
}

/** Extrusão de um perfil lateral (x é a frente, y é a altura), do lado de `from` até `to`. */
function sideProfile(points: ReadonlyArray<readonly [number, number]>, from: number, to: number): BufferGeometry {
  const shape = new Shape();
  points.forEach(([x, y], index) => (index === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  const geometry = new ExtrudeGeometry(shape, { depth: to - from, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
  geometry.translate(0, 0, from);
  // O carro olha para +z: o perfil desenhado em x vira o comprimento dele.
  geometry.rotateY(-Math.PI / 2);
  return geometry;
}

let car: Batch | null = null;
/**
 * O carro, autoral: nenhum modelo aberto tem esta silhueta e nenhum com ela tem licença que permita
 * redistribuir. Nariz longo e baixo, cabine recuada e aletas com recorte de asa. Fica centrado em
 * (0, 0), com a frente em +z; as rodas vêm do kit e a plataforma gira tudo junto.
 */
export function buildHideoutCar(): Batch {
  if (car) return car;
  const b = new KitBuilder();
  const body = "#22262e";
  const panel = "#30353f";
  // Corpo central, do nariz à traseira.
  b.mesh(sideProfile([[2.35, 0.3], [2.35, 0.42], [1.2, 0.68], [0.3, 0.74], [-1.5, 0.82], [-2.25, 0.72], [-2.25, 0.3]], -0.5, 0.5), [0, 0, 0], { color: body });
  // Paralamas largos, que seguem as rodas.
  for (const side of [-1, 1]) {
    const [from, to] = side < 0 ? [-0.98, -0.5] : [0.5, 0.98];
    b.mesh(sideProfile([[2.15, 0.26], [2.15, 0.46], [1.7, 0.72], [0.75, 0.74], [0.3, 0.56], [-0.5, 0.56], [-0.95, 0.8], [-2.1, 0.8], [-2.2, 0.26]], from, to), [0, 0, 0], { color: panel });
    // Aleta de asa: sobe atrás, com dois recortes na borda de fuga.
    b.mesh(sideProfile([[-0.45, 0.78], [-1.15, 1.2], [-2.05, 1.72], [-2.4, 1.52], [-2.1, 1.3], [-2.3, 1.1], [-2.05, 0.95], [-2.2, 0.78]], side * 0.86 - 0.025, side * 0.86 + 0.025), [0, 0, 0], { color: body });
  }
  // Cabine: uma bolha baixa, recuada, em vidro quase preto.
  b.mesh(sideProfile([[0.72, 0.72], [0.1, 1.14], [-0.72, 1.14], [-1.02, 0.8]], -0.42, 0.42), [0, 0, 0], { color: "#0d2740" });
  // Turbina na traseira e farol: os dois pontos que puxam o olho.
  const turbine = new CylinderGeometry(0.34, 0.27, 0.38, 18);
  turbine.rotateX(Math.PI / 2);
  b.mesh(turbine, [0, 0.62, -2.3], { color: "#2a2d33" });
  const fire = new CylinderGeometry(0.24, 0.24, 0.02, 18);
  fire.rotateX(Math.PI / 2);
  b.mesh(fire, [0, 0.62, -2.5], { surface: "glow", color: AMBER, cast: false });
  const emblem = batEmblemGeometry(0.62, 0.01);
  emblem.rotateX(-1.35);
  b.mesh(emblem, [0, 0.635, 1.72], { color: "#c7983d", cast: false });
  b.box([0, 0.36, 2.38], [1.1, 0.04, 0.02], { surface: "glow", color: "#3d78c4", cast: false });
  car = b.build();
  return car;
}

/** O que acende com o motor: farol e a linha de luz debaixo do carro. */
export function buildHideoutCarLights(): Batch {
  const b = new KitBuilder();
  for (const side of [-1, 1]) b.box([side * 0.68, 0.46, 2.26], [0.42, 0.07, 0.03], { surface: "glow", color: "#fff0d0", cast: false });
  for (const side of [-1, 1]) b.box([side * 0.99, 0.2, 0], [0.02, 0.02, 3.8], { surface: "glow", color: BLUE, cast: false });
  return b.build();
}
