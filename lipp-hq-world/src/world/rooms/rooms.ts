import { DOOR_WIDTH } from "@/config/constants";
import type { DoorDefinition, RoomBounds, RoomDefinition, Vector3Tuple } from "@/types/hq";

/** Colunas e linhas da planta dos departamentos. Os vãos entre elas são corredores. */
export const COLUMN_BANDS = {
  west: { minX: -16.2, maxX: -6.6 },
  center: { minX: -4.2, maxX: 4.2 },
  east: { minX: 6.6, maxX: 16.2 },
} as const;

export const ROW_BANDS = {
  north: { minZ: -12.4, maxZ: -5.0 },
  middle: { minZ: -3.0, maxZ: 3.0 },
  south: { minZ: 5.0, maxZ: 12.4 },
} as const;

const SAMPLE_INSET = 1.1;

/**
 * Pontos de leitura por sala usados no cálculo de oclusão das paredes:
 * centro, quatro cantos internos e as bordas em cruz. Quanto mais amostras
 * ficam atrás de uma parede, mais forte é o sinal de cutaway.
 */
export function roomSamples(bounds: RoomBounds): Vector3Tuple[] {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const ix0 = bounds.minX + SAMPLE_INSET;
  const ix1 = bounds.maxX - SAMPLE_INSET;
  const iz0 = bounds.minZ + SAMPLE_INSET;
  const iz1 = bounds.maxZ - SAMPLE_INSET;

  return [
    [cx, 0, cz],
    [ix0, 0, iz0],
    [ix1, 0, iz0],
    [ix0, 0, iz1],
    [ix1, 0, iz1],
    [cx, 0, iz0],
    [cx, 0, iz1],
    [ix0, 0, cz],
    [ix1, 0, cz],
  ];
}

export function clusterBounds(
  column: keyof typeof COLUMN_BANDS,
  row: keyof typeof ROW_BANDS,
): RoomBounds {
  const band = COLUMN_BANDS[column];
  const level = ROW_BANDS[row];
  return { minX: band.minX, maxX: band.maxX, minZ: level.minZ, maxZ: level.maxZ };
}

function makeRoom(
  id: string,
  name: string,
  kind: RoomDefinition["kind"],
  bounds: RoomBounds,
  color: string,
  doors: DoorDefinition[],
  agentId?: string,
): RoomDefinition {
  return {
    id,
    name,
    kind,
    color,
    bounds,
    doors,
    samples: roomSamples(bounds),
    ...(agentId === undefined ? {} : { agentId }),
  };
}

export const ROOMS: RoomDefinition[] = [
  makeRoom(
    "engenharia",
    "Engenharia",
    "department",
    clusterBounds("west", "north"),
    "#3b82f6",
    [
      { side: "east", center: -8.7, width: DOOR_WIDTH },
      { side: "south", center: -11.4, width: DOOR_WIDTH },
    ],
    "pulse",
  ),
  makeRoom(
    "comando",
    "Comando",
    "department",
    clusterBounds("center", "north"),
    "#f97316",
    [
      { side: "west", center: -8.7, width: DOOR_WIDTH },
      { side: "south", center: 0, width: DOOR_WIDTH },
    ],
    "forge",
  ),
  makeRoom(
    "comunidade",
    "Comunidade",
    "department",
    clusterBounds("east", "north"),
    "#a855f7",
    [
      { side: "west", center: -8.7, width: DOOR_WIDTH },
      { side: "south", center: 11.4, width: DOOR_WIDTH },
    ],
    "echo",
  ),
  makeRoom(
    "pesquisa",
    "Pesquisa",
    "department",
    clusterBounds("west", "middle"),
    "#22c55e",
    [
      { side: "east", center: 0, width: DOOR_WIDTH },
      { side: "south", center: -11.4, width: DOOR_WIDTH },
    ],
    "scout",
  ),
  makeRoom(
    "hall",
    "Hall",
    "common",
    clusterBounds("center", "middle"),
    "#94a3b8",
    [
      { side: "north", center: 0, width: 2.2 },
      { side: "south", center: 0, width: 2.2 },
    ],
  ),
  makeRoom(
    "produto",
    "Produto",
    "department",
    clusterBounds("east", "middle"),
    "#f59e0b",
    [
      { side: "west", center: 0, width: DOOR_WIDTH },
      { side: "south", center: 11.4, width: DOOR_WIDTH },
    ],
    "atlas",
  ),
  makeRoom(
    "conteudo",
    "Conteúdo",
    "department",
    clusterBounds("west", "south"),
    "#ec4899",
    [
      { side: "east", center: 8.7, width: DOOR_WIDTH },
      { side: "north", center: -11.4, width: DOOR_WIDTH },
    ],
    "ink",
  ),
  makeRoom(
    "operacoes",
    "Operações",
    "department",
    clusterBounds("center", "south"),
    "#2563eb",
    [
      { side: "west", center: 8.7, width: DOOR_WIDTH },
      { side: "north", center: 0, width: DOOR_WIDTH },
    ],
    "argos",
  ),
  makeRoom(
    "reunioes",
    "Reuniões",
    "common",
    clusterBounds("east", "south"),
    "#64748b",
    [
      { side: "west", center: 8.7, width: 1.8 },
      { side: "north", center: 11.4, width: DOOR_WIDTH },
    ],
  ),
];

export const ROOMS_BY_ID: Record<string, RoomDefinition> = Object.fromEntries(
  ROOMS.map((item) => [item.id, item]),
);

export function roomCenter(room: RoomDefinition): Vector3Tuple {
  return [
    (room.bounds.minX + room.bounds.maxX) / 2,
    0,
    (room.bounds.minZ + room.bounds.maxZ) / 2,
  ];
}

export function roomSize(room: RoomDefinition): { width: number; depth: number } {
  return {
    width: room.bounds.maxX - room.bounds.minX,
    depth: room.bounds.maxZ - room.bounds.minZ,
  };
}
