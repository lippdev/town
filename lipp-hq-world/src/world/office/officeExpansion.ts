import { FLOOR_BOUNDS, type OfficeBounds } from "./officeLayout";
import { zone, type BuildingRoom } from "./officeLobby";

/**
 * Os andares reservados para as próximas equipes, só na demonstração. Tudo aqui é dado: para uma
 * equipe ocupar um deles, basta trocar o nome das zonas e a mobília desta tabela. Não há nome de
 * equipe, gente, bot nem atividade: são salas prontas e vazias, e a etiqueta diz isso.
 */
export type ExpansionFloorId = "expansao-2" | "expansao-3" | "expansao-4" | "expansao-5";

/** Peça de mobília, em metros do andar. `kit` em `buildingInteriors.ts` sabe desenhar cada uma. */
export type ExpansionPiece =
  /** Piso de uma zona. */
  | { kind: "floor"; bounds: OfficeBounds; color: string }
  /** Divisória baixa, com vãos medidos no eixo dela. */
  | { kind: "partition"; axis: "x" | "z"; at: number; from: number; to: number; height?: number; doors?: ReadonlyArray<{ at: number; width: number }> }
  /** Mesa comprida com cadeiras dos dois lados, ao longo de x. */
  | { kind: "island"; x: number; z: number; width: number; depth: number; seats: readonly number[]; color?: string }
  /** Mesa redonda com quatro cadeiras. */
  | { kind: "round"; x: number; z: number; radius: number; color?: string }
  /** Posto individual: mesa e cadeira, olhando para +z (yaw 0) ou girado. */
  | { kind: "desk"; x: number; z: number; yaw: number; width: number; chair?: string }
  /** Sofá de frente para o sul, poltronas dos lados e mesinha. */
  | { kind: "lounge"; x: number; z: number; pillow: string; armchairs: readonly string[]; rug: string }
  /** Armário baixo; `yaw` em radianos. */
  | { kind: "cabinet"; x: number; z: number; width: number; yaw: number }
  /** Quadro branco sem nada escrito, numa parede alta. */
  | { kind: "board"; x: number; z: number; width: number; yaw: number }
  /** Balcão de apoio, ao longo de z. */
  | { kind: "counter"; x: number; z: number; length: number }
  /** Jardim baixo. */
  | { kind: "planter"; x: number; z: number; width: number; depth: number }
  | { kind: "plant"; x: number; z: number; width: number };

export interface ExpansionZoneSpec {
  /** Parte do id: o id final leva o andar na frente, e nenhuma zona repete entre andares. */
  key: string;
  name: string;
  color: string;
  bounds: OfficeBounds;
}

export interface ExpansionFloor {
  id: ExpansionFloorId;
  level: number;
  title: string;
  slab: string;
  /** Qual poço tem a cabine parada aqui: cada elevador para num andar diferente. */
  openShaft: number;
  northWindows: ReadonlyArray<readonly [number, number]>;
  westWindows: ReadonlyArray<readonly [number, number]>;
  zones: readonly ExpansionZoneSpec[];
  pieces: readonly ExpansionPiece[];
}

const { minX, maxX, minZ, maxZ } = FLOOR_BOUNDS;

/** Hall igual em todos: a mesma planta da caixa dos elevadores, e o corredor de 1,5 m que desce dela. */
const HALL: OfficeBounds = { minX: 0.8, maxX: 7.9, minZ, maxZ: -5.9 };
export const EXPANSION_CORRIDOR: OfficeBounds = { minX: 3.6, maxX: 5.1, minZ, maxZ: 1 };
const hall = (color: string): ExpansionZoneSpec => ({ key: "hall", name: "Hall dos elevadores", color, bounds: HALL });
const SUPPORT_COLOR = "#8fa3b8";

const quarterTurn = Math.PI / 2;

const FLOORS: readonly ExpansionFloor[] = [
  {
    // Bancadas abertas: um salão só, com duas ilhas e um lounge.
    id: "expansao-2",
    level: 2,
    title: "Expansão · andar 2",
    slab: "#d6cfc2",
    openShaft: 0,
    northWindows: [[-10.4, -6.4], [-5, -1]],
    westWindows: [[-7.4, -3.4], [3.4, 7.4]],
    zones: [
      hall("#9fb3c8"),
      { key: "bancadas", name: "Bancadas disponíveis", color: "#c9a66b", bounds: { minX, maxX: 0.6, minZ, maxZ } },
      { key: "lounge", name: "Lounge disponível", color: "#7f9f83", bounds: { minX: 2.4, maxX, minZ: 1.6, maxZ } },
      { key: "apoio", name: "Apoio", color: SUPPORT_COLOR, bounds: { minX: 8.1, maxX, minZ, maxZ: 1.2 } },
    ],
    pieces: [
      { kind: "floor", bounds: { minX, maxX: 0.6, minZ, maxZ }, color: "#b08a64" },
      { kind: "floor", bounds: { minX: 2.4, maxX, minZ: 1.6, maxZ }, color: "#c7b49c" },
      { kind: "island", x: -5.6, z: -3.9, width: 4.8, depth: 1.2, seats: [-1.7, 0, 1.7] },
      { kind: "island", x: -5.6, z: 3.9, width: 4.8, depth: 1.2, seats: [-1.2, 1.2] },
      { kind: "lounge", x: 6.8, z: 5.4, pillow: "#c2a26a", armchairs: ["#6e7076", "#6e7076"], rug: "#7b7671" },
      { kind: "cabinet", x: 10.7, z: -4, width: 3.4, yaw: -quarterTurn },
      { kind: "plant", x: 0, z: 8.2, width: 0.9 },
      { kind: "plant", x: 10.5, z: 0.4, width: 0.85 },
      { kind: "plant", x: -10.4, z: 0, width: 0.95 },
    ],
  },
  {
    // Células: duas baias de quatro postos a oeste e uma sala de reunião a sudeste.
    id: "expansao-3",
    level: 3,
    title: "Expansão · andar 3",
    slab: "#cfd2d3",
    openShaft: 1,
    northWindows: [[-10, -3.4]],
    westWindows: [[-7.8, -2.2], [2.2, 7.8]],
    zones: [
      hall("#9fb3c8"),
      { key: "baia-norte", name: "Baia disponível · norte", color: "#8fa8c9", bounds: { minX, maxX: -1.2, minZ, maxZ: -0.4 } },
      { key: "baia-sul", name: "Baia disponível · sul", color: "#a39ac9", bounds: { minX, maxX: -1.2, minZ: 0.4, maxZ } },
      { key: "reuniao", name: "Sala de reunião disponível", color: "#7f8fa8", bounds: { minX: 2.4, maxX, minZ: 2, maxZ } },
      { key: "apoio", name: "Apoio", color: SUPPORT_COLOR, bounds: { minX: 8.1, maxX, minZ, maxZ: 1.2 } },
    ],
    pieces: [
      { kind: "floor", bounds: { minX, maxX: -1.2, minZ, maxZ: -0.4 }, color: "#9fa6ad" },
      { kind: "floor", bounds: { minX, maxX: -1.2, minZ: 0.4, maxZ }, color: "#a39fa9" },
      { kind: "floor", bounds: { minX: 2.4, maxX, minZ: 2, maxZ }, color: "#b6a593" },
      { kind: "partition", axis: "z", at: -1.2, from: minZ, to: -0.4, doors: [{ at: -4.6, width: 1.5 }] },
      { kind: "partition", axis: "z", at: -1.2, from: 0.4, to: maxZ, doors: [{ at: 4.6, width: 1.5 }] },
      { kind: "partition", axis: "x", at: -0.4, from: minX, to: -1.2 },
      { kind: "partition", axis: "x", at: 0.4, from: minX, to: -1.2 },
      { kind: "partition", axis: "z", at: 2.4, from: 2, to: maxZ },
      { kind: "partition", axis: "x", at: 2, from: 2.4, to: maxX, doors: [{ at: 4.35, width: 1.5 }] },
      // Divisória baixa em cruz dentro de cada baia: quatro postos que dá para ver de cima.
      { kind: "partition", axis: "z", at: -6.2, from: -8.2, to: -1.2, height: 0.75 },
      { kind: "partition", axis: "z", at: -6.2, from: 1.2, to: 8.2, height: 0.75 },
      { kind: "desk", x: -8.4, z: -6.8, yaw: Math.PI / 2, width: 1.7 },
      { kind: "desk", x: -8.4, z: -3, yaw: Math.PI / 2, width: 1.7 },
      { kind: "desk", x: -4, z: -6.8, yaw: -Math.PI / 2, width: 1.7 },
      { kind: "desk", x: -4, z: -3, yaw: -Math.PI / 2, width: 1.7 },
      { kind: "desk", x: -8.4, z: 3, yaw: Math.PI / 2, width: 1.7 },
      { kind: "desk", x: -8.4, z: 6.8, yaw: Math.PI / 2, width: 1.7 },
      { kind: "desk", x: -4, z: 3, yaw: -Math.PI / 2, width: 1.7 },
      { kind: "desk", x: -4, z: 6.8, yaw: -Math.PI / 2, width: 1.7 },
      { kind: "island", x: 6.8, z: 5.6, width: 4.2, depth: 1.2, seats: [-1.4, 0, 1.4], color: "#6d5240" },
      { kind: "cabinet", x: 10.7, z: -4, width: 3.4, yaw: -quarterTurn },
      { kind: "plant", x: 10.4, z: 8.2, width: 0.85 },
      { kind: "plant", x: 0.4, z: 8.2, width: 0.9 },
    ],
  },
  {
    // Colaboração: oficina com lounge a oeste, duas mesas redondas ao sul e apoio a leste.
    id: "expansao-4",
    level: 4,
    title: "Expansão · andar 4",
    slab: "#d9cdb9",
    openShaft: 2,
    northWindows: [[-10.6, -6.6]],
    westWindows: [[1, 7.6]],
    zones: [
      hall("#9fb3c8"),
      { key: "oficina", name: "Oficina disponível", color: "#c98f6b", bounds: { minX, maxX: -0.6, minZ, maxZ: 1.8 } },
      { key: "mesas", name: "Mesas de trabalho disponíveis", color: "#a9b27a", bounds: { minX, maxX: 7.4, minZ: 2.4, maxZ } },
      { key: "apoio", name: "Apoio", color: SUPPORT_COLOR, bounds: { minX: 7.6, maxX, minZ: -5.4, maxZ } },
    ],
    pieces: [
      { kind: "floor", bounds: { minX, maxX: -0.6, minZ, maxZ: 1.8 }, color: "#a9765a" },
      { kind: "floor", bounds: { minX: 7.6, maxX, minZ: -5.4, maxZ }, color: "#b9b2a3" },
      { kind: "partition", axis: "x", at: 1.8, from: minX, to: -0.6, doors: [{ at: -3.2, width: 2 }] },
      { kind: "board", x: -4.4, z: minZ + 0.1, width: 2.8, yaw: 0 },
      { kind: "lounge", x: -6.6, z: -3.4, pillow: "#b65b3f", armchairs: ["#7c5a44", "#6e7076"], rug: "#7e6a5e" },
      { kind: "round", x: -6.4, z: 5.8, radius: 0.72 },
      { kind: "round", x: 0.4, z: 5.8, radius: 0.72 },
      { kind: "counter", x: 10.2, z: 2, length: 8 },
      { kind: "plant", x: 7.2, z: 8.3, width: 0.9 },
      { kind: "plant", x: -10.5, z: 8.3, width: 0.95 },
    ],
  },
  {
    // Foco: quatro cabines baixas a oeste, bancada central e jardim com lounge a sudeste.
    id: "expansao-5",
    level: 5,
    title: "Expansão · andar 5",
    slab: "#cdd3cb",
    openShaft: 0,
    northWindows: [[-5.4, -0.8]],
    westWindows: [],
    zones: [
      hall("#9fb3c8"),
      { key: "cabines", name: "Cabines de foco disponíveis", color: "#8fb3a3", bounds: { minX, maxX: -6.2, minZ, maxZ } },
      { key: "bancada", name: "Bancada disponível", color: "#c9a66b", bounds: { minX: -6, maxX: 3.4, minZ: -5, maxZ: 3 } },
      { key: "jardim", name: "Lounge e jardim", color: "#7f9f83", bounds: { minX: 3, maxX, minZ: 3.2, maxZ } },
    ],
    pieces: [
      { kind: "floor", bounds: { minX, maxX: -6.2, minZ, maxZ }, color: "#8a9a92" },
      { kind: "floor", bounds: { minX: 3, maxX, minZ: 3.2, maxZ }, color: "#c4b89f" },
      { kind: "partition", axis: "z", at: -6.2, from: minZ, to: maxZ, doors: [{ at: -6.75, width: 1.1 }, { at: -2.25, width: 1.1 }, { at: 2.25, width: 1.1 }, { at: 6.75, width: 1.1 }] },
      { kind: "partition", axis: "x", at: -4.5, from: minX, to: -6.2 },
      { kind: "partition", axis: "x", at: 0, from: minX, to: -6.2 },
      { kind: "partition", axis: "x", at: 4.5, from: minX, to: -6.2 },
      { kind: "desk", x: -9.6, z: -6.75, yaw: Math.PI / 2, width: 1.7 },
      { kind: "desk", x: -9.6, z: -2.25, yaw: Math.PI / 2, width: 1.7 },
      { kind: "desk", x: -9.6, z: 2.25, yaw: Math.PI / 2, width: 1.7 },
      { kind: "desk", x: -9.6, z: 6.75, yaw: Math.PI / 2, width: 1.7 },
      { kind: "island", x: -1.2, z: -1, width: 4.4, depth: 1, seats: [-1.4, 0, 1.4] },
      { kind: "lounge", x: 8, z: 5.4, pillow: "#8fb3a3", armchairs: ["#6e7076"], rug: "#6f7870" },
      { kind: "planter", x: 4.4, z: 6.2, width: 1.6, depth: 4.6 },
      { kind: "plant", x: 10.5, z: 0, width: 0.9 },
    ],
  },
];

export const EXPANSION_FLOORS = FLOORS;

export function expansionFloor(id: string): ExpansionFloor | undefined {
  return FLOORS.find((floor) => floor.id === id);
}

const PURPOSE = "Espaço reservado para uma equipe futura. Só cenário: sem gente, sem atividade.";

/** As zonas viram salas com o id do andar na frente: `expansao-3-apoio`, sem repetição no prédio. */
export function expansionRooms(floor: ExpansionFloor): BuildingRoom[] {
  return floor.zones.map((spec) => zone(`${floor.id}-${spec.key}`, spec.name, spec.color, PURPOSE, spec.bounds));
}
