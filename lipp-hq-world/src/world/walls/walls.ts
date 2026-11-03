import { BUILDING, WALL_HEIGHT, WALL_THICKNESS } from "@/config/constants";
import { COLUMN_BANDS, ROW_BANDS, ROOMS } from "@/world/rooms/rooms";
import type { Axis, RoomSide, Vector3Tuple, WallDefinition, WallDoorGap } from "@/types/hq";

interface SideSpec {
  side: RoomSide;
  axis: Axis;
  outward: Vector3Tuple;
}

const SIDES: SideSpec[] = [
  { side: "north", axis: "x", outward: [0, 0, -1] },
  { side: "south", axis: "x", outward: [0, 0, 1] },
  { side: "west", axis: "z", outward: [-1, 0, 0] },
  { side: "east", axis: "z", outward: [1, 0, 0] },
];

/** Vãos verticais entre colunas: viram corredores norte-sul. */
const VERTICAL_GAPS: Array<[number, number]> = [
  [COLUMN_BANDS.west.maxX, COLUMN_BANDS.center.minX],
  [COLUMN_BANDS.center.maxX, COLUMN_BANDS.east.minX],
];

/** Vãos horizontais entre linhas: viram corredores leste-oeste. */
const HORIZONTAL_GAPS: Array<[number, number]> = [
  [ROW_BANDS.north.maxZ, ROW_BANDS.middle.minZ],
  [ROW_BANDS.middle.maxZ, ROW_BANDS.south.minZ],
];

export const CORRIDOR_BANDS = {
  vertical: VERTICAL_GAPS,
  horizontal: HORIZONTAL_GAPS,
};

function roomWalls(): WallDefinition[] {
  const walls: WallDefinition[] = [];

  for (const room of ROOMS) {
    for (const spec of SIDES) {
      const { bounds } = room;
      let fixed: number;
      let start: number;
      let end: number;

      if (spec.axis === "x") {
        fixed = spec.side === "north" ? bounds.minZ : bounds.maxZ;
        start = bounds.minX;
        end = bounds.maxX;
      } else {
        fixed = spec.side === "west" ? bounds.minX : bounds.maxX;
        start = bounds.minZ;
        end = bounds.maxZ;
      }

      const doors: WallDoorGap[] = room.doors
        .filter((door) => door.side === spec.side)
        .map((door) => ({ center: door.center, width: door.width }));

      walls.push({
        id: `${room.id}-${spec.side}`,
        roomId: room.id,
        axis: spec.axis,
        fixed,
        start,
        end,
        height: WALL_HEIGHT,
        thickness: WALL_THICKNESS,
        outward: spec.outward,
        doors,
      });
    }
  }

  return walls;
}

/** Muros que fecham os corredores no perímetro do prédio. */
function perimeterCaps(): WallDefinition[] {
  const caps: WallDefinition[] = [];

  VERTICAL_GAPS.forEach(([minX, maxX], index) => {
    caps.push({
      id: `cap-v${index}-north`,
      roomId: null,
      axis: "x",
      fixed: BUILDING.minZ,
      start: minX,
      end: maxX,
      height: WALL_HEIGHT,
      thickness: WALL_THICKNESS,
      outward: [0, 0, -1],
      doors: [],
    });
    caps.push({
      id: `cap-v${index}-south`,
      roomId: null,
      axis: "x",
      fixed: BUILDING.maxZ,
      start: minX,
      end: maxX,
      height: WALL_HEIGHT,
      thickness: WALL_THICKNESS,
      outward: [0, 0, 1],
      doors: [],
    });
  });

  HORIZONTAL_GAPS.forEach(([minZ, maxZ], index) => {
    caps.push({
      id: `cap-h${index}-west`,
      roomId: null,
      axis: "z",
      fixed: BUILDING.minX,
      start: minZ,
      end: maxZ,
      height: WALL_HEIGHT,
      thickness: WALL_THICKNESS,
      outward: [-1, 0, 0],
      doors: [],
    });
    caps.push({
      id: `cap-h${index}-east`,
      roomId: null,
      axis: "z",
      fixed: BUILDING.maxX,
      start: minZ,
      end: maxZ,
      height: WALL_HEIGHT,
      thickness: WALL_THICKNESS,
      outward: [1, 0, 0],
      doors: [],
    });
  });

  return caps;
}

export const WALLS: WallDefinition[] = [...roomWalls(), ...perimeterCaps()];

/** Retângulos de piso de corredor, sem sobreposição nas interseções. */
export interface FloorRect {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const CORRIDOR_FLOORS: FloorRect[] = (() => {
  const rects: FloorRect[] = [];

  // Faixas horizontais cobrem a largura inteira do prédio.
  HORIZONTAL_GAPS.forEach(([minZ, maxZ], index) => {
    rects.push({
      id: `corridor-h${index}`,
      minX: BUILDING.minX,
      maxX: BUILDING.maxX,
      minZ,
      maxZ,
    });
  });

  // Faixas verticais ficam só nos trechos fora das horizontais, evitando z-fighting.
  const segmentsZ: Array<[number, number]> = [
    [BUILDING.minZ, HORIZONTAL_GAPS[0]?.[0] ?? BUILDING.minZ],
    [HORIZONTAL_GAPS[0]?.[1] ?? BUILDING.minZ, HORIZONTAL_GAPS[1]?.[0] ?? BUILDING.maxZ],
    [HORIZONTAL_GAPS[1]?.[1] ?? BUILDING.maxZ, BUILDING.maxZ],
  ];

  VERTICAL_GAPS.forEach(([minX, maxX], index) => {
    segmentsZ.forEach(([minZ, maxZ], segmentIndex) => {
      if (maxZ - minZ <= 0.001) return;
      rects.push({
        id: `corridor-v${index}-${segmentIndex}`,
        minX,
        maxX,
        minZ,
        maxZ,
      });
    });
  });

  return rects;
})();
