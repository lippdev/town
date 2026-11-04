import type { RoomSide } from "@/types/hq";
import { KitBuilder, FLOOR_TILE, type Batch, type Footprint, type PartOptions, type PropPlacement, type Vec3 } from "./officeKit";
import {
  BACK_WALL_CUT,
  BENCH,
  CORRIDOR,
  DESK_REACH,
  ENTRANCE,
  FLOOR_BOUNDS,
  FRONT_WALL_CUT,
  MEETING,
  OFFICE_ROOMS,
  OFFICE_SEATS,
  WALL_HEIGHT,
  WALL_THICKNESS,
  corridorBounds,
  isBackWall,
  isPerimeterWall,
  type OfficeDoor,
  type OfficeRoom,
  type OfficeSeat,
} from "./officeLayout";
import { screenUv, signUv } from "./officeTextures";

/**
 * A figura do estúdio tem pernas curtas: sentada em postura natural, o assento fica a
 * 0,28 m. A cena usa a figura em escala 1,15 e a mobília medida a partir dela, com a
 * mesa mais baixa que a do protótipo (lá o quadril flutuava por causa do bug do GLB).
 */
export const FIGURE_SCALE = 1.15;
export const SEAT_TOP = 0.33;
export const DESK_TOP = 0.72;

const WALL_WEST = "#8e8478";
const WALL_NORTH = "#9a9083";
const WALL_FRONT = "#a69b8d";
const FRAME = "#383a38";
const METAL = "#36302c";
const CHAIR = "#323943";

const WOOD: PartOptions = { surface: "wood" };

type Frame = (fn: () => void) => void;

function chair(b: KitBuilder, color = CHAIR) {
  b.box([0, SEAT_TOP - 0.06, 0], [0.54, 0.12, 0.55], { color });
  b.box([0, 0.72, -0.31], [0.54, 0.62, 0.095], { color: "#353c47" });
  b.box([0, 0.16, 0], [0.055, 0.24, 0.055], { color: "#565d63", cast: false });
  b.box([0, 0.07, 0], [0.62, 0.05, 0.06], { color: "#343943", cast: false });
  b.box([0, 0.07, 0], [0.06, 0.05, 0.62], { color: "#343943", cast: false });
  b.solid("cadeira", 0, 0, 0.62, 0.62);
}

function deskTop(b: KitBuilder, x: number, z: number, width: number, depth: number, pedestal: -1 | 0 | 1 = 0) {
  const legs = DESK_TOP - 0.09;
  b.box([x, DESK_TOP - 0.045, z], [width, 0.09, depth], WOOD);
  for (const side of [-1, 1]) b.box([x + side * (width / 2 - 0.16), legs / 2, z], [0.12, legs, depth - 0.14], { color: "#414141" });
  if (pedestal !== 0) {
    const cx = x + pedestal * (width / 2 - 0.42);
    b.box([cx, legs / 2 + 0.03, z], [0.48, legs - 0.06, depth - 0.2], WOOD);
    for (const y of [0.2, 0.36, 0.52]) b.box([cx, y, z - (depth - 0.2) / 2 - 0.012], [0.16, 0.02, 0.025], { color: "#272b31", cast: false });
  }
  b.solid("mesa", x, z, width, depth);
}

/** Monitor voltado para a cadeira (que olha para +Z neste referencial). */
function monitor(b: KitBuilder, x: number, z: number, variant: number, yaw = Math.PI) {
  b.at([x, DESK_TOP, z], yaw, () => {
    b.box([0, 0.02, 0], [0.32, 0.035, 0.21], { cast: false });
    b.box([0, 0.18, -0.03], [0.055, 0.32, 0.06], { cast: false });
    b.box([0, 0.47, 0], [0.94, 0.6, 0.055], { color: "#20252b" });
    b.plane([0, 0.47, 0.031], 0.88, 0.54, screenUv(variant), "screen");
  });
}

function keyboard(b: KitBuilder, x: number, z: number) {
  b.box([x, DESK_TOP + 0.018, z], [0.64, 0.035, 0.23], { color: "#30343b", cast: false });
  for (let row = 0; row < 4; row += 1) {
    b.box([x, DESK_TOP + 0.038, z - 0.08 + row * 0.05], [0.57, 0.004, 0.018], { color: "#696d72", cast: false });
  }
}

function laptop(b: KitBuilder, x: number, z: number, variant: number) {
  b.box([x, DESK_TOP + 0.012, z], [0.36, 0.022, 0.25], { color: "#4a4f57", cast: false });
  b.at([x, DESK_TOP + 0.13, z + 0.13], Math.PI, () => {
    b.box([0, 0, 0], [0.36, 0.23, 0.014], { color: "#3a3f46", cast: false });
    b.plane([0, 0, 0.009], 0.33, 0.2, screenUv(variant), "screen");
  });
}

function bookshelf(b: KitBuilder, height: number, width: number, rowsAt: readonly number[]) {
  const colors = ["#384d61", "#a28b6a", "#745442", "#b7aa8d", "#313f48"];
  const half = width / 2;
  b.box([-0.22, height / 2, 0], [0.08, height, width - 0.11], WOOD);
  for (const z of [-half + 0.03, half - 0.03]) b.box([0, height / 2, z], [0.53, height, 0.07], { color: "#343637" });
  rowsAt.forEach((y, row) => {
    b.box([0, y, 0], [0.56, 0.06, width], WOOD);
    if (row === rowsAt.length - 1) return;
    const count = Math.floor((width - 0.32) / 0.16) - (row === 1 ? 3 : 0);
    for (let i = 0; i < count; i += 1) {
      b.box([0.04, y + 0.2, -half + 0.24 + i * 0.16], [0.3, 0.27 + (i % 3) * 0.065, 0.105], {
        color: colors[(row + i) % colors.length]!,
        cast: false,
      });
    }
  });
  b.solid("estante", 0, 0, 0.56, width);
}

function sofa(b: KitBuilder, pillow: string) {
  const fabric: PartOptions = { surface: "fabric", color: "#777a83" };
  for (const x of [-0.82, 0.82]) for (const z of [-0.32, 0.32]) b.box([x, 0.1, z], [0.06, 0.2, 0.06], { color: METAL, cast: false });
  b.rounded([0, 0.29, 0], [2.05, 0.32, 0.87], 0.08, fabric);
  for (const x of [-0.94, 0.94]) b.rounded([x, 0.51, 0], [0.2, 0.46, 0.9], 0.06, fabric);
  b.rounded([0, 0.66, -0.35], [1.7, 0.58, 0.21], 0.07, fabric);
  for (const x of [-0.43, 0.43]) b.rounded([x, 0.5, 0.06], [0.82, 0.15, 0.65], 0.05, fabric);
  b.rounded([-0.55, 0.73, -0.15], [0.35, 0.35, 0.14], 0.06, { color: pillow }, 0.2);
  b.solid("sofá", 0, 0, 2.2, 0.95);
}

function armchair(b: KitBuilder, color = "#777a83") {
  const fabric: PartOptions = { surface: "fabric", color };
  for (const x of [-0.3, 0.3]) for (const z of [-0.28, 0.28]) b.box([x, 0.08, z], [0.05, 0.16, 0.05], { color: METAL, cast: false });
  b.rounded([0, 0.26, 0], [0.8, 0.26, 0.78], 0.07, fabric);
  b.rounded([0, 0.56, -0.31], [0.78, 0.44, 0.18], 0.06, fabric);
  for (const x of [-0.34, 0.34]) b.rounded([x, 0.44, 0.03], [0.14, 0.24, 0.64], 0.05, fabric);
  b.solid("poltrona", 0, 0, 0.82, 0.8);
}

function rug(b: KitBuilder, x: number, z: number, width: number, depth: number, color = "#ffffff") {
  b.box([x, 0.035, z], [width, 0.025, depth], { surface: "fabric", color: multiplyGray(color), cast: false });
}

/** O tapete da sala aprovada é #777a83; tapetes coloridos ficam escurecidos como ele. */
function multiplyGray(color: string) {
  return color === "#ffffff" ? "#777a83" : color;
}

function lowTable(b: KitBuilder, width: number, depth: number, height = 0.42) {
  b.box([0, height, 0], [width, 0.075, depth], WOOD);
  for (const x of [-width / 2 + 0.1, width / 2 - 0.1]) {
    for (const z of [-depth / 2 + 0.09, depth / 2 - 0.09]) b.box([x, height / 2 - 0.02, z], [0.035, height - 0.02, 0.035], { color: "#282e35", cast: false });
  }
  b.solid("mesa baixa", 0, 0, width, depth);
}

function cabinet(b: KitBuilder, width: number, height = 0.86, depth = 0.45) {
  b.box([0, height / 2, 0], [width, height, depth], WOOD);
  const doors = Math.max(2, Math.round(width / 0.55));
  for (let i = 0; i < doors; i += 1) {
    b.box([-width / 2 + ((i + 0.5) * width) / doors, height * 0.56, depth / 2 + 0.01], [0.12, 0.02, 0.02], { color: "#272b31", cast: false });
  }
  b.solid("armário", 0, 0, width, depth);
}

/** Painel de vidro junto ao corredor, como o da sala aprovada: a entrada continua aberta. */
function glassPanel(b: KitBuilder, width: number) {
  for (const z of [-width / 2, width / 2]) b.box([0, 1.2, z], [0.045, 2.4, 0.045], { color: FRAME, cast: false });
  for (const y of [0.08, 1.2, 2.38]) b.box([0, y, 0], [0.045, 0.04, width + 0.05], { color: FRAME, cast: false });
  b.plane([0, 1.22, 0], width - 0.05, 2.32, [0, 0, 1, 1], "glass", Math.PI / 2, "#b8d6dd");
}

function whiteboard(b: KitBuilder, width: number, height: number, columnColors: readonly string[]) {
  b.box([0, 0, 0], [width + 0.08, height + 0.08, 0.04], { color: "#3a3d42", cast: false });
  b.box([0, 0, 0.024], [width, height, 0.012], { color: "#dcd8cf", cast: false });
  const columns = columnColors.length;
  columnColors.forEach((color, column) => {
    const x = -width / 2 + ((column + 0.5) * width) / columns;
    for (let card = 0; card < 3 + (column % 2); card += 1) {
      b.box([x, height / 2 - 0.2 - card * 0.26, 0.034], [width / columns - 0.14, 0.2, 0.006], { color, cast: false });
    }
  });
}

function rack(b: KitBuilder, height: number) {
  b.box([0, height / 2, 0], [0.6, height, 0.65], { color: "#262a31" });
  for (let i = 0; i < 6; i += 1) {
    b.box([0.31, 0.2 + i * ((height - 0.32) / 5), 0], [0.012, 0.09, 0.5], { color: "#454c56", cast: false });
    b.box([0.32, 0.2 + i * ((height - 0.32) / 5), 0.18], [0.008, 0.03, 0.05], { color: i % 3 === 0 ? "#6aa58a" : "#7a93b8", cast: false });
  }
  b.solid("rack", 0, 0, 0.6, 0.65);
}

/** Um posto completo: cadeira, mesa e o que estiver sobre ela. */
function workstation(
  b: KitBuilder,
  seat: OfficeSeat,
  options: { width?: number; depth?: number; x?: number; pedestal?: -1 | 0 | 1; monitors?: readonly (readonly [number, number])[]; lamp?: number },
) {
  const { width = 2.2, depth = 0.95, x = 0, pedestal = 0, monitors = [[0, 0]], lamp } = options;
  const center = DESK_REACH + depth / 2;
  b.at([seat.x, 0, seat.z], seat.yaw, () => {
    chair(b);
    deskTop(b, x, center, width, depth, pedestal);
    for (const [mx, variant] of monitors) monitor(b, mx, center + 0.25, variant);
    keyboard(b, 0, DESK_REACH + 0.13);
    if (lamp !== undefined) b.prop("luminaria", [lamp, DESK_TOP, center], 0.45, -Math.PI / 2);
  });
}

function seatOfRoom(roomId: string, index = 0): OfficeSeat {
  return OFFICE_SEATS.find((seat) => seat.id === `${roomId}-${index}`)!;
}

/**
 * Referencial da parede: +X corre ao longo dela e +Z aponta para dentro da sala. A
 * origem fica no centro da parede, na linha dela.
 */
function wallFrame(b: KitBuilder, room: OfficeRoom, side: RoomSide): Frame {
  const { bounds, center } = room;
  const inset = 0.07;
  switch (side) {
    case "north":
      return (fn) => b.at([center.x, 0, bounds.minZ - inset], 0, fn);
    case "south":
      return (fn) => b.at([center.x, 0, bounds.maxZ + inset], Math.PI, fn);
    case "west":
      return (fn) => b.at([bounds.minX - inset, 0, center.z], Math.PI / 2, fn);
    case "east":
      return (fn) => b.at([bounds.maxX + inset, 0, center.z], -Math.PI / 2, fn);
  }
}

/** Metade do comprimento da parede, contando o canto com a parede vizinha. */
function wallHalfLength(room: OfficeRoom, side: RoomSide) {
  const { minX, maxX, minZ, maxZ } = room.bounds;
  return (side === "north" || side === "south" ? maxX - minX : maxZ - minZ) / 2 + 0.16;
}

/**
 * Centro da porta no eixo do referencial. Portas são medidas em X e Z do andar; o
 * referencial oeste corre ao contrário e o sul também.
 */
function doorInFrame(door: OfficeDoor) {
  return door.side === "west" || door.side === "south" ? -door.offset : door.offset;
}

/** Trechos de parede entre as portas. */
export function wallRuns(halfLength: number, doors: readonly { at: number; width: number }[]) {
  const sorted = [...doors].sort((a, b) => a.at - b.at);
  const runs: Array<[number, number]> = [];
  let start = -halfLength;
  for (const door of sorted) {
    runs.push([start, door.at - door.width / 2]);
    start = door.at + door.width / 2;
  }
  runs.push([start, halfLength]);
  return runs.filter(([from, to]) => to - from > 0.01);
}

function wallColor(side: RoomSide) {
  return side === "west" ? WALL_WEST : side === "north" ? WALL_NORTH : WALL_FRONT;
}

function buildWallBand(b: KitBuilder, runs: readonly [number, number][], y0: number, y1: number, color: string, cast = true) {
  for (const [from, to] of runs) {
    b.box([(from + to) / 2, (y0 + y1) / 2, 0], [to - from, y1 - y0, WALL_THICKNESS], { color, cast });
  }
}

/** Janelas nas paredes de limite: de `from` a `to` no eixo do referencial. */
const WINDOWS: Record<string, { side: RoomSide; from: number; to: number } | undefined> = {
  engenharia: { side: "north", from: -0.45, to: 3.05 },
  comando: { side: "north", from: 0.2, to: 3.2 },
  comunidade: { side: "north", from: -1.0, to: 2.6 },
  pesquisa: { side: "west", from: -0.8, to: 1.6 },
  conteudo: { side: "west", from: -1.05, to: 1.35 },
};

const SILL = 1.04;
const HEAD = 2.72;

/** A janela da sala aprovada, em qualquer largura: vão real, peitoril e venezianas. */
function windowUnit(b: KitBuilder, from: number, to: number, color: string) {
  const width = to - from;
  const center = (from + to) / 2;
  b.box([center, SILL / 2, 0], [width, SILL, WALL_THICKNESS], { color });
  b.box([center, (HEAD + WALL_HEIGHT) / 2, 0], [width, WALL_HEIGHT - HEAD, WALL_THICKNESS], { color });
  b.box([from + 0.02, 1.9, 0], [0.12, HEAD - SILL, WALL_THICKNESS], { color: "#665a4d" });
  b.box([to - 0.05, 1.9, 0], [0.2, HEAD - SILL, WALL_THICKNESS], { color });
  b.box([center, SILL, 0.12], [width, 0.1, 0.36], WOOD);
  const posts = Math.max(2, Math.round(width / 1.25));
  for (let i = 0; i <= posts; i += 1) {
    b.box([from + 0.45 + (i * (width - 0.8)) / posts, 1.9, 0.04], [0.055, HEAD - SILL - 0.05, 0.1], { color: "#554a3c", cast: false });
  }
  for (let i = 0; i < 8; i += 1) {
    b.box([center, 1.6 + i * 0.15, 0.07], [width - 0.2, 0.035, 0.15], { ...WOOD, tilt: 0.16 });
  }
  b.plane([center, 1.9, -0.05], width - 0.2, HEAD - SILL - 0.02, [0, 0, 1, 1], "glow", 0, "#d6b288");
}

function buildBackWall(b: KitBuilder, raised: KitBuilder, room: OfficeRoom, side: RoomSide) {
  const halfLength = wallHalfLength(room, side);
  const color = wallColor(side);
  const doors = room.doors.filter((door) => door.side === side).map((door) => ({ at: doorInFrame(door), width: door.width }));
  const window = WINDOWS[room.id]?.side === side ? WINDOWS[room.id] : undefined;
  const skirt = (builder: KitBuilder) =>
    wallRuns(halfLength - 0.2, doors).forEach(([from, to]) =>
      builder.box([(from + to) / 2, 0.12, 0.12], [to - from, 0.2, 0.06], { ...WOOD, cast: false }),
    );

  if (isPerimeterWall(room, side)) {
    wallFrame(b, room, side)(() => {
      const runs = window
        ? wallRuns(halfLength, [{ at: (window.from + window.to) / 2, width: window.to - window.from }])
        : [[-halfLength, halfLength] as [number, number]];
      buildWallBand(b, runs, 0, WALL_HEIGHT, color);
      if (window) windowUnit(b, window.from, window.to, color);
      skirt(b);
    });
    return;
  }

  const runs = wallRuns(halfLength, doors);
  wallFrame(b, room, side)(() => {
    buildWallBand(b, runs, 0, BACK_WALL_CUT, color);
    skirt(b);
    for (const door of doors) {
      for (const edge of [-1, 1]) b.box([door.at + edge * (door.width / 2 + 0.03), BACK_WALL_CUT / 2, 0], [0.06, BACK_WALL_CUT + 0.02, WALL_THICKNESS + 0.04], { color: FRAME, cast: false });
    }
  });
  // A parte de cima só existe com a sala em foco: não projeta sombra, senão a luz da
  // sala mudaria ao entrar nela.
  wallFrame(raised, room, side)(() => {
    buildWallBand(raised, runs, BACK_WALL_CUT, WALL_HEIGHT, color, false);
    for (const door of doors) {
      raised.box([door.at, (2.25 + WALL_HEIGHT) / 2, 0], [door.width, WALL_HEIGHT - 2.25, WALL_THICKNESS], { color, cast: false });
      for (const edge of [-1, 1]) raised.box([door.at + edge * (door.width / 2 + 0.03), (BACK_WALL_CUT + 2.25) / 2, 0], [0.06, 2.25 - BACK_WALL_CUT, WALL_THICKNESS + 0.04], { color: FRAME, cast: false });
    }
  });
}

function buildFrontWall(b: KitBuilder, room: OfficeRoom, side: RoomSide) {
  const doors = room.doors.filter((door) => door.side === side).map((door) => ({ at: doorInFrame(door), width: door.width }));
  wallFrame(b, room, side)(() => {
    buildWallBand(b, wallRuns(wallHalfLength(room, side), doors), 0, FRONT_WALL_CUT, WALL_FRONT);
    for (const door of doors) {
      for (const edge of [-1, 1]) b.box([door.at + edge * (door.width / 2 + 0.03), FRONT_WALL_CUT / 2, 0], [0.06, FRONT_WALL_CUT + 0.02, WALL_THICKNESS + 0.04], { color: FRAME, cast: false });
    }
  });
}

/** Faixa no chão da porta: é onde a cor da sala aparece na arquitetura. */
function doorThreshold(b: KitBuilder, room: OfficeRoom, door: OfficeDoor) {
  wallFrame(b, room, door.side)(() => {
    b.box([doorInFrame(door), 0.03, 0.02], [door.width - 0.06, 0.012, 0.1], { color: room.color, cast: false });
  });
}

const FLOOR_TINT: Record<string, string> = {
  reunioes: "#b6a593",
  comando: "#e2cfb8",
  comunidade: "#f1e3d2",
};

function buildFloor(b: KitBuilder, room: OfficeRoom) {
  const { minX, maxX, minZ, maxZ } = room.bounds;
  const size: Vec3 = [maxX - minX, 0.06, maxZ - minZ];
  const at: Vec3 = [room.center.x, -0.015, room.center.z];
  if (room.id === "hall") b.box(at, size, { surface: "stone", color: "#e4ddd2", cast: false });
  else b.box(at, size, { surface: "wood", tile: FLOOR_TILE, color: FLOOR_TINT[room.id] ?? "#ffffff", cast: false });
}

function buildShell(b: KitBuilder) {
  const { minX, maxX, minZ, maxZ } = FLOOR_BOUNDS;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  b.box([0, -0.16, 0], [width + 0.7, 0.3, depth + 0.7], { color: "#61554a", cast: false });
  for (const corridor of corridorBounds()) {
    b.box(
      [(corridor.minX + corridor.maxX) / 2, -0.01, (corridor.minZ + corridor.maxZ) / 2],
      [corridor.maxX - corridor.minX, 0.07, corridor.maxZ - corridor.minZ],
      { surface: "stone", cast: false },
    );
  }
  // Pontas de corredor no fundo do prédio.
  const inset = 0.07;
  for (const corridor of corridorBounds()) {
    const vertical = corridor.minZ === minZ && corridor.maxZ === maxZ;
    if (vertical) {
      b.box([(corridor.minX + corridor.maxX) / 2, WALL_HEIGHT / 2, minZ - inset], [CORRIDOR + 0.02, WALL_HEIGHT, WALL_THICKNESS], { color: WALL_NORTH });
    } else if (corridor.minX === minX) {
      b.box([minX - inset, WALL_HEIGHT / 2, (corridor.minZ + corridor.maxZ) / 2], [WALL_THICKNESS, WALL_HEIGHT, CORRIDOR + 0.02], { color: WALL_WEST });
    }
  }
  // Entrada do prédio: capacho e dois batentes baixos.
  b.box([ENTRANCE.x, 0.035, ENTRANCE.z - 0.5], [CORRIDOR - 0.3, 0.018, 0.85], { color: "#2c2d30", cast: false });
  for (const side of [-1, 1]) b.box([ENTRANCE.x + side * (CORRIDOR / 2 - 0.05), 0.5, ENTRANCE.z + 0.04], [0.1, 1.0, 0.16], { color: FRAME });
}

/** Quadro, tela ou placa que só faz sentido com a parede inteira. */
function signOn(builder: KitBuilder, room: OfficeRoom, x: number) {
  wallFrame(builder, room, "north")(() => {
    builder.plane([x, 2.35, 0.11], 2.05, 0.53, signUv(room.id), "sign");
  });
}

function furnishEngenharia(b: KitBuilder, room: OfficeRoom) {
  workstation(b, seatOfRoom(room.id), { width: 2.8, depth: 0.97, x: -0.15, pedestal: -1, monitors: [[0.53, 0], [-0.49, 1]], lamp: -1.35 });
  b.at([room.center.x, 0, room.center.z], 0, () => {
    b.at([-2.64, 0, -1.12], 0, () => bookshelf(b, 2.5, 1.76, [0.12, 0.67, 1.22, 1.77, 2.38]));
    b.prop("planta", [-2.56, 2.43, -1.35], 0.88);
    b.prop("planta", [2.5, 0.025, -1.85], 1.0);
    b.prop("planta", [3.4, 0.03, -1.55], 0.75);
    b.at([-2.14, 0, 1.05], Math.PI / 2, () => sofa(b, "#345c92"));
    rug(b, 0.4, 0.4, 3.1, 2.6);
    b.at([-0.2, 0, 1.5], 0, () => {
      lowTable(b, 1.2, 0.65);
      b.box([0, 0.49, 0], [0.32, 0.06, 0.23], { color: "#3b82f6", cast: false });
    });
    b.at([3, 0, -1.5], 0, () => glassPanel(b, 1.3));
  });
}

function furnishComando(b: KitBuilder, room: OfficeRoom) {
  // Mesa de direção no meio da sala: quem senta olha para a porta, de frente para a câmera.
  workstation(b, seatOfRoom(room.id), { width: 2.5, depth: 1.0, pedestal: 1, monitors: [[0.72, 2]] });
  b.at([room.center.x, 0, room.center.z], 0, () => {
    rug(b, -0.7, 0.2, 3.4, 2.4, "#6e6a6b");
    for (const x of [-1.25, -0.15]) b.at([x, 0, 0.92], Math.PI, () => chair(b, "#4a4038"));
    b.at([-3.32, 0, -1.2], 0, () => bookshelf(b, 1.65, 1.3, [0.12, 0.67, 1.22, 1.62]));
    b.at([1.85, 0, 0.75], Math.PI, () => cabinet(b, 2.0));
    for (const [x, variant] of [[1.3, 3], [2.4, 2]] as const) {
      b.box([x, 0.88, 0.75], [0.3, 0.04, 0.22], { color: "#c9b89a", cast: false });
      b.box([x + 0.02, 0.92, 0.75], [0.24, 0.05, 0.3], { color: variant === 3 ? "#7a6d5c" : "#a28b6a", cast: false });
    }
    b.prop("planta", [3.15, 0.02, -1.95], 0.8);
    b.at([3.6, 0, -1.5], 0, () => glassPanel(b, 1.2));
  });
  wallFrame(b, room, "north")(() => {
    b.at([-1.55, 1.42, 0.13], 0, () => whiteboard(b, 2.6, 1.1, ["#c58a5e", "#8f9aa8", "#b7aa8d", "#7a8f7f"]));
  });
}

function furnishComunidade(b: KitBuilder, room: OfficeRoom) {
  workstation(b, seatOfRoom(room.id), { width: 2.2, depth: 0.85, x: -0.1, monitors: [[0, 3]], lamp: -0.85 });
  b.at([room.center.x, 0, room.center.z], 0, () => {
    rug(b, 1.3, 0.75, 2.7, 2.3, "#807a80");
    b.at([0.5, 0, 0.25], Math.PI / 2 + 0.3, () => armchair(b));
    b.at([2.1, 0, 0.25], -Math.PI / 2 - 0.3, () => armchair(b, "#6e7076"));
    b.at([1.3, 0, 1.35], 0, () => {
      b.cylinder([0, 0.42, 0], 0.42, 0.05, WOOD);
      b.cylinder([0, 0.2, 0], 0.03, 0.4, { color: "#282e35", cast: false });
      b.solid("mesa redonda", 0, 0, 0.84, 0.84);
    });
    b.box([1.3, 0.47, 1.35], [0.3, 0.04, 0.22], { color: "#a855f7", cast: false });
    b.prop("planta", [2.5, 0.02, -1.85], 0.85);
    b.at([3.05, 0, -1.5], 0, () => glassPanel(b, 1.2));
  });
}

function furnishPesquisa(b: KitBuilder, room: OfficeRoom) {
  workstation(b, seatOfRoom(room.id), { width: 2.2, depth: 0.85, monitors: [[-0.45, 2], [0.45, 3]], lamp: 0.95 });
  b.at([room.center.x, 0, room.center.z], 0, () => {
    b.at([-2.78, 0, -1.75], 0, () => bookshelf(b, 2.3, 1.55, [0.12, 0.67, 1.22, 1.77, 2.27]));
    b.at([1.2, 0, -0.1], 0, () => {
      // Mesa de mapas: papéis em cima, em volta dela se trabalha em pé.
      b.box([0, DESK_TOP - 0.045, 0], [2.0, 0.09, 1.25], WOOD);
      for (const x of [-0.85, 0.85]) b.box([x, (DESK_TOP - 0.09) / 2, 0], [0.1, DESK_TOP - 0.09, 1.05], { color: "#414141" });
      b.solid("mesa de mapas", 0, 0, 2.0, 1.25);
      b.box([-0.25, DESK_TOP + 0.006, 0.08], [1.1, 0.008, 0.82], { color: "#d9d2c0", cast: false });
      b.box([-0.25, DESK_TOP + 0.012, 0.08], [0.7, 0.004, 0.02], { color: "#3f7a58", cast: false });
      b.box([-0.05, DESK_TOP + 0.012, 0.2], [0.02, 0.004, 0.55], { color: "#3f7a58", cast: false });
      b.box([0.62, DESK_TOP + 0.02, -0.25], [0.3, 0.04, 0.22], { color: "#a28b6a", cast: false });
    });
    b.at([1.75, 0, -2.42], Math.PI, () => cabinet(b, 1.9));
    rug(b, 1.2, 0.0, 3.0, 2.3, "#777870");
    b.prop("planta", [2.6, 0.02, 2.2], 0.8);
    b.at([3.05, 0, -1.8], 0, () => glassPanel(b, 1.2));
  });
}

function furnishProduto(b: KitBuilder, room: OfficeRoom) {
  workstation(b, seatOfRoom(room.id), { width: 2.4, depth: 0.95, pedestal: 1, monitors: [[0.25, 1]] });
  b.at([room.center.x, 0, room.center.z], 0, () => {
    b.at([-1.85, 0, -2.42], 0, () => cabinet(b, 1.9));
    rug(b, -0.6, 1.15, 3.2, 2.2, "#7a7468");
    b.at([-0.6, 0, 1.15], 0, () => {
      b.cylinder([0, DESK_TOP - 0.02, 0], 0.58, 0.05, WOOD);
      b.cylinder([0, (DESK_TOP - 0.04) / 2, 0], 0.04, DESK_TOP - 0.04, { color: "#282e35", cast: false });
      b.cylinder([0, 0.03, 0], 0.3, 0.04, { color: "#282e35", cast: false });
      b.solid("mesa redonda", 0, 0, 1.16, 1.16);
      b.box([0.1, DESK_TOP + 0.015, -0.1], [0.3, 0.02, 0.22], { color: "#f59e0b", cast: false });
    });
    for (const [x, z, yaw] of [[-1.55, 1.15, Math.PI / 2], [0.35, 1.15, -Math.PI / 2], [-0.6, 2.05, Math.PI]] as const) {
      b.at([x, 0, z], yaw, () => chair(b, "#4a4038"));
    }
    b.prop("planta", [2.6, 0.02, 2.15], 0.8);
    b.at([3.05, 0, -1.8], 0, () => glassPanel(b, 1.2));
  });
}

function furnishConteudo(b: KitBuilder, room: OfficeRoom) {
  workstation(b, seatOfRoom(room.id), { width: 2.2, depth: 0.85, monitors: [[0, 0]], lamp: 0.85 });
  b.at([room.center.x, 0, room.center.z], 0, () => {
    b.at([-2.78, 0, 1.65], 0, () => bookshelf(b, 2.3, 1.3, [0.12, 0.67, 1.22, 1.77, 2.27]));
    rug(b, 1.25, 0.75, 2.8, 2.5, "#80756f");
    b.at([1.75, 0, 0.1], Math.PI + 0.35, () => armchair(b));
    b.at([0.65, 0, 0.75], 0, () => {
      lowTable(b, 0.9, 0.6);
      b.box([0, 0.47, 0], [0.34, 0.03, 0.24], { color: "#ec4899", cast: false });
      b.box([0.05, 0.495, 0.02], [0.3, 0.02, 0.22], { color: "#d9d2c0", cast: false });
    });
    b.at([1.85, 0, -2.17], 0, () => cabinet(b, 1.9));
    b.prop("planta", [2.6, 0.02, 1.9], 0.85);
    b.at([3.05, 0, 1.3], 0, () => glassPanel(b, 1.2));
  });
}

function furnishOperacoes(b: KitBuilder, room: OfficeRoom) {
  workstation(b, seatOfRoom(room.id), { width: 3.6, depth: 0.95, monitors: [[-0.98, 2], [0, 0], [0.98, 1]] });
  b.at([room.center.x, 0, room.center.z], 0, () => {
    for (const z of [0.55, 1.25, 1.95]) b.at([-3.25, 0, z], 0, () => rack(b, 1.55));
    rug(b, 0.7, 0.75, 3.8, 2.2, "#6f7176");
    b.at([1.9, 0, 1.3], 0, () => {
      lowTable(b, 1.1, 0.6);
      b.box([0.15, 0.47, 0], [0.3, 0.03, 0.22], { color: "#2563eb", cast: false });
    });
    b.prop("planta", [3.15, 0.02, -2.0], 0.8);
    b.at([3.6, 0, 1.2], 0, () => glassPanel(b, 1.2));
  });
}

function furnishHall(b: KitBuilder, room: OfficeRoom) {
  b.at([room.center.x, 0, room.center.z], 0, () => {
    // Recepção virada para a porta sul.
    b.at([-2.25, 0, 1.75], 0, () => {
      b.box([0, 0.5, 0], [1.9, 1.0, 0.55], WOOD);
      b.box([0, 1.02, 0.02], [2.0, 0.05, 0.68], { color: "#d8cdb8" });
      b.solid("recepção", 0, 0, 2.0, 0.68);
    });
    b.at([-2.25, 0, 0.95], 0, () => {
      monitor(b, 0.5, 0.45, 3, Math.PI);
    });
    // Espera: sofá, poltrona e mesa baixa num tapete.
    rug(b, -1.95, -1.35, 3.0, 2.2, "#7b7671");
    b.at([-2.15, 0, -2.15], 0, () => sofa(b, "#94a3b8"));
    b.at([-1.95, 0, -1.2], 0, () => {
      lowTable(b, 1.1, 0.55);
      b.box([0, 0.47, 0], [0.32, 0.03, 0.24], { color: "#b7aa8d", cast: false });
    });
    // Bancada compartilhada: postos de bots além dos sete departamentos.
    b.at([BENCH.x, 0, BENCH.z], 0, () => deskTop(b, 0, 0, BENCH.width, BENCH.depth));
    b.prop("planta", [3.2, 0.02, 2.3], 0.85);
    b.prop("planta", [-3.2, 0.02, 0.95], 0.75);
  });
  OFFICE_SEATS.filter((seat) => seat.roomId === room.id).forEach((seat, index) => {
    b.at([seat.x, 0, seat.z], seat.yaw, () => {
      chair(b, "#4d5159");
      laptop(b, 0, DESK_REACH + 0.17, index % 4);
    });
  });
}

function furnishReunioes(b: KitBuilder, room: OfficeRoom) {
  b.at([room.center.x, 0, room.center.z], 0, () => {
    rug(b, 0, MEETING.z, 4.4, 3.2, "#6f6d70");
    b.at([MEETING.x, 0, MEETING.z], 0, () => deskTop(b, 0, 0, MEETING.width, MEETING.depth));
    b.at([1.85, 0, -2.0], 0, () => cabinet(b, 1.8));
    b.prop("planta", [2.6, 0.02, 2.0], 0.85);
    b.at([3.05, 0, 1.3], 0, () => glassPanel(b, 1.2));
  });
  OFFICE_SEATS.filter((seat) => seat.roomId === room.id).forEach((seat) => {
    b.at([seat.x, 0, seat.z], seat.yaw, () => chair(b, "#3b3f46"));
  });
}

const FURNISH: Record<string, (b: KitBuilder, room: OfficeRoom) => void> = {
  engenharia: furnishEngenharia,
  comando: furnishComando,
  comunidade: furnishComunidade,
  pesquisa: furnishPesquisa,
  produto: furnishProduto,
  conteudo: furnishConteudo,
  operacoes: furnishOperacoes,
  hall: furnishHall,
  reunioes: furnishReunioes,
};

/** O que a parede de trás mostra com a sala em foco. */
function decorateRaised(raised: KitBuilder, room: OfficeRoom) {
  if (room.row !== 0) signOn(raised, room, room.id === "operacoes" ? 1.2 : -1.0);
  if (room.id === "produto") {
    wallFrame(raised, room, "north")(() => raised.at([1.1, 1.85, 0.12], 0, () => whiteboard(raised, 2.4, 1.3, ["#c9b48e", "#d3a860", "#a39b8c", "#8a9b8a"])));
  } else if (room.id === "reunioes") {
    wallFrame(raised, room, "north")(() => raised.at([-0.8, 1.75, 0.12], 0, () => {
      raised.box([0, 0, 0], [2.3, 1.3, 0.05], { color: "#1f2329", cast: false });
      raised.plane([0, 0, 0.03], 2.2, 1.2, screenUv(1), "screen");
    }));
  } else if (room.id === "operacoes") {
    wallFrame(raised, room, "north")(() => raised.at([-1.0, 1.85, 0.12], 0, () => {
      for (const [x, variant] of [[-0.75, 2], [0.75, 0]] as const) {
        raised.box([x, 0, 0], [1.4, 0.82, 0.05], { color: "#1f2329", cast: false });
        raised.plane([x, 0, 0.03], 1.32, 0.74, screenUv(variant + 3), "screen");
      }
    }));
  } else if (room.id === "pesquisa" || room.id === "conteudo") {
    wallFrame(raised, room, "north")(() => raised.at([1.5, 1.8, 0.12], 0, () => whiteboard(raised, 1.8, 1.0, ["#a9b89a", "#c7b693", "#b49f90"])));
  }
}

export interface OfficeBuild {
  /** Tudo que fica sempre na tela. */
  fixed: Batch;
  /** A parte alta das paredes internas de cada sala, só com ela em foco. */
  raised: Record<string, Batch>;
  props: PropPlacement[];
  footprints: Record<string, Footprint[]>;
  triangles: { fixed: number; raised: number };
}

export function buildOffice(): OfficeBuild {
  const b = new KitBuilder();
  buildShell(b);
  const raised: Record<string, Batch> = {};
  const footprints: Record<string, Footprint[]> = {};
  let raisedTriangles = 0;

  for (const room of OFFICE_ROOMS) {
    const upper = new KitBuilder();
    buildFloor(b, room);
    for (const side of ["north", "west", "south", "east"] as const) {
      if (isBackWall(side)) buildBackWall(b, upper, room, side);
      else buildFrontWall(b, room, side);
    }
    for (const door of room.doors) doorThreshold(b, room, door);
    if (room.row === 0) signOn(b, room, room.id === "comando" ? -1.55 : -1.7);
    const before = b.footprints.length;
    FURNISH[room.id]!(b, room);
    footprints[room.id] = b.footprints.slice(before);
    decorateRaised(upper, room);
    raised[room.id] = upper.build();
    raisedTriangles += upper.triangles;
  }

  return {
    fixed: b.build(),
    raised,
    props: b.props,
    footprints,
    triangles: { fixed: b.triangles, raised: raisedTriangles },
  };
}
