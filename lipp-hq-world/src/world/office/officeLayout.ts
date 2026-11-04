import type { RoomKind, RoomSide } from "@/types/hq";
import { ROOMS_BY_ID } from "@/world/rooms/rooms";

/**
 * Planta compacta do escritório completo. As salas são as mesmas de
 * `world/rooms/rooms.ts` (id, nome, cor, dono) e ficam na mesma posição relativa;
 * só as medidas mudam, e só neste modo: a cena antiga segue com a planta dela.
 */
export const CORRIDOR = 1.5;
/** A sala aprovada mede 6,1 × 4,8; o grid parte dela. */
const COLUMN_WIDTHS = [6.1, 7.2, 6.1] as const;
const ROW_DEPTHS = [4.8, 5.4, 4.8] as const;

export const WALL_HEIGHT = 3;
/** Até onde a parede interna do fundo sobe no andar: 1,3 m a 30° só cobre o corredor atrás dela. */
export const BACK_WALL_CUT = 1.3;
/** Mureta das paredes da frente, para nunca cobrir quem está dentro. */
export const FRONT_WALL_CUT = 0.32;
export const WALL_THICKNESS = 0.18;
export const DOOR_WIDTH = 1.15;

const FLOOR_WIDTH = COLUMN_WIDTHS.reduce((sum, value) => sum + value, 0) + CORRIDOR * 2;
const FLOOR_DEPTH = ROW_DEPTHS.reduce((sum, value) => sum + value, 0) + CORRIDOR * 2;

export const FLOOR_BOUNDS = {
  minX: -FLOOR_WIDTH / 2,
  maxX: FLOOR_WIDTH / 2,
  minZ: -FLOOR_DEPTH / 2,
  maxZ: FLOOR_DEPTH / 2,
} as const;

function band(sizes: readonly number[], start: number, index: number) {
  let min = start;
  for (let i = 0; i < index; i += 1) min += sizes[i]! + CORRIDOR;
  return { min, max: min + sizes[index]! };
}

export interface OfficeBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface OfficeDoor {
  side: RoomSide;
  /** Deslocamento do centro da porta a partir do centro da parede. */
  offset: number;
  width: number;
}

export interface OfficeRoom {
  id: string;
  name: string;
  kind: RoomKind;
  color: string;
  agentId?: string;
  /** O que acontece ali; aparece no painel da sala. */
  purpose: string;
  column: number;
  row: number;
  bounds: OfficeBounds;
  center: { x: number; z: number };
  doors: OfficeDoor[];
}

const door = (side: RoomSide, offset = 0, width = DOOR_WIDTH): OfficeDoor => ({ side, offset, width });

const PLAN: Array<{ id: string; column: number; row: number; purpose: string; doors: OfficeDoor[] }> = [
  { id: "engenharia", column: 0, row: 0, purpose: "Commits, pull requests, CI e releases.", doors: [door("east", 0.95), door("south", 1.45)] },
  { id: "comando", column: 1, row: 0, purpose: "Coordenação operacional e briefing executivo.", doors: [door("south"), door("west", 0.95)] },
  { id: "comunidade", column: 2, row: 0, purpose: "Feedback e audiência.", doors: [door("south", -1.2), door("west", 0.95)] },
  { id: "pesquisa", column: 0, row: 1, purpose: "Discovery, oportunidades e riscos.", doors: [door("east"), door("south", -1.1)] },
  { id: "hall", column: 1, row: 1, purpose: "Recepção, sala de espera e bancada compartilhada.", doors: [door("north", 0, 2.2), door("south", 0, 2.2), door("east", 1.2, 1.6), door("west", 0, 1.6)] },
  { id: "produto", column: 2, row: 1, purpose: "Backlog, PRDs e documentação de produto.", doors: [door("west"), door("south", 1.1)] },
  { id: "conteudo", column: 0, row: 2, purpose: "Editorial e comunicação.", doors: [door("east", -0.95), door("north", -1.1)] },
  { id: "operacoes", column: 1, row: 2, purpose: "Supervisão da operação e da infraestrutura.", doors: [door("north", -2.4), door("west", -0.95)] },
  { id: "reunioes", column: 2, row: 2, purpose: "Mesa de reunião da equipe.", doors: [door("west", -0.95, 1.5), door("north", -1.7)] },
];

export const OFFICE_ROOMS: OfficeRoom[] = PLAN.map((entry) => {
  const source = ROOMS_BY_ID[entry.id]!;
  const x = band(COLUMN_WIDTHS, FLOOR_BOUNDS.minX, entry.column);
  const z = band(ROW_DEPTHS, FLOOR_BOUNDS.minZ, entry.row);
  return {
    id: source.id,
    name: source.name,
    kind: source.kind,
    color: source.color,
    ...(source.agentId === undefined ? {} : { agentId: source.agentId }),
    purpose: entry.purpose,
    column: entry.column,
    row: entry.row,
    doors: entry.doors,
    bounds: { minX: x.min, maxX: x.max, minZ: z.min, maxZ: z.max },
    center: { x: (x.min + x.max) / 2, z: (z.min + z.max) / 2 },
  };
});

export const OFFICE_ROOMS_BY_ID: Record<string, OfficeRoom> = Object.fromEntries(OFFICE_ROOMS.map((room) => [room.id, room]));

/** Corredores: duas faixas verticais e duas horizontais, cruzadas em #. */
export function corridorBounds(): OfficeBounds[] {
  const { minX, maxX, minZ, maxZ } = FLOOR_BOUNDS;
  const west = band(COLUMN_WIDTHS, minX, 0).max;
  const east = band(COLUMN_WIDTHS, minX, 1).max;
  const north = band(ROW_DEPTHS, minZ, 0).max;
  const south = band(ROW_DEPTHS, minZ, 1).max;
  return [
    { minX: west, maxX: west + CORRIDOR, minZ, maxZ },
    { minX: east, maxX: east + CORRIDOR, minZ, maxZ },
    { minX, maxX: west, minZ: north, maxZ: north + CORRIDOR },
    { minX: west + CORRIDOR, maxX: east, minZ: north, maxZ: north + CORRIDOR },
    { minX: east + CORRIDOR, maxX, minZ: north, maxZ: north + CORRIDOR },
    { minX, maxX: west, minZ: south, maxZ: south + CORRIDOR },
    { minX: west + CORRIDOR, maxX: east, minZ: south, maxZ: south + CORRIDOR },
    { minX: east + CORRIDOR, maxX, minZ: south, maxZ: south + CORRIDOR },
  ];
}

/** Entrada do prédio: o fim do corredor sul entre Conteúdo e Operações. */
export const ENTRANCE = { x: band(COLUMN_WIDTHS, FLOOR_BOUNDS.minX, 0).max + CORRIDOR / 2, z: FLOOR_BOUNDS.maxZ };

/** Parede no limite do prédio: fica sempre inteira, porque não há nada atrás dela. */
export function isPerimeterWall(room: OfficeRoom, side: RoomSide): boolean {
  return (side === "north" && room.row === 0) || (side === "west" && room.column === 0);
}

export function isBackWall(side: RoomSide): boolean {
  return side === "north" || side === "west";
}

export function roomAt(x: number, z: number): OfficeRoom | null {
  return (
    OFFICE_ROOMS.find(({ bounds }) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ) ?? null
  );
}

/** Para onde a figura olha. A figura do GLB olha para +Z com rotação zero. */
export const FACING = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 } as const;

export type SeatKind = "posto" | "compartilhado" | "reuniao";

export interface OfficeSeat {
  id: string;
  roomId: string;
  kind: SeatKind;
  /** Quadril da figura, em coordenadas do andar. */
  x: number;
  z: number;
  yaw: number;
}

function seat(roomId: string, kind: SeatKind, index: number, localX: number, localZ: number, yaw: number): OfficeSeat {
  const { center } = OFFICE_ROOMS_BY_ID[roomId]!;
  return { id: `${roomId}-${index}`, roomId, kind, x: center.x + localX, z: center.z + localZ, yaw };
}

/** Distância do quadril à borda da mesa: o joelho entra embaixo dela. */
export const DESK_REACH = 0.33;

/** Tampos compartilhados, em coordenadas locais da sala. */
export const BENCH = { x: 2.15, z: -0.7, width: 2.85, depth: 0.9 } as const;
export const BENCH_XS = [1.15, 2.15, 3.15] as const;
export const MEETING = { x: 0, z: -0.05, width: 3.5, depth: 1.0 } as const;
export const MEETING_XS = [-1.1, 0, 1.1] as const;

/**
 * Postos em ordem de preenchimento: primeiro o posto de cada departamento, depois a
 * bancada do hall, depois a mesa de reunião. Acrescentar posto é acrescentar linha.
 */
export const OFFICE_SEATS: OfficeSeat[] = [
  // O posto da Engenharia fica onde estava na sala aprovada.
  seat("engenharia", "posto", 0, 0.65, -0.605, FACING.north),
  seat("comando", "posto", 0, -0.7, -1.15, FACING.south),
  seat("comunidade", "posto", 0, -1.55, -0.9, FACING.west),
  seat("pesquisa", "posto", 0, -1.55, 0.35, FACING.west),
  seat("produto", "posto", 0, 0.75, -0.9, FACING.north),
  seat("conteudo", "posto", 0, -1.55, -0.2, FACING.west),
  seat("operacoes", "posto", 0, 0.9, -0.75, FACING.north),
  // Bancada do hall: três de cada lado, um de frente para o outro.
  ...BENCH_XS.flatMap((x, index) => [
    seat("hall", "compartilhado", index * 2, x, BENCH.z + BENCH.depth / 2 + DESK_REACH, FACING.north),
    seat("hall", "compartilhado", index * 2 + 1, x, BENCH.z - BENCH.depth / 2 - DESK_REACH, FACING.south),
  ]),
  // Mesa de reunião: três de cada lado.
  ...MEETING_XS.flatMap((x, index) => [
    seat("reunioes", "reuniao", index * 2, x, MEETING.z + MEETING.depth / 2 + DESK_REACH, FACING.north),
    seat("reunioes", "reuniao", index * 2 + 1, x, MEETING.z - MEETING.depth / 2 - DESK_REACH, FACING.south),
  ]),
];

export const OFFICE_SEATS_BY_ID: Record<string, OfficeSeat> = Object.fromEntries(OFFICE_SEATS.map((entry) => [entry.id, entry]));

export const SEAT_CAPACITY = OFFICE_SEATS.length;

export const SEAT_KIND_LABEL: Record<SeatKind, string> = {
  posto: "Posto do departamento",
  compartilhado: "Bancada compartilhada",
  reuniao: "Mesa de reunião (posto provisório)",
};

/** Cadeira de cabeceira para o briefing dos sete; não é um posto extra da frota. */
export const MEETING_HEAD_SEAT = seat("reunioes", "reuniao", 6, -MEETING.width / 2 - DESK_REACH, MEETING.z, FACING.east);
export const EVENT_MEETING_SEATS = [...OFFICE_SEATS.filter((entry) => entry.roomId === "reunioes"), MEETING_HEAD_SEAT];
