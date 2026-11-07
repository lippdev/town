import { newPreset, type HumanPreset } from "@/avatar/human/preset";
import { FLOOR_BOUNDS, type OfficeBounds, type OfficeSeat } from "./officeLayout";
import { zone, type BuildingRoom, type SceneryHuman } from "./officeLobby";
import { OFFICE_SCENARIO } from "./officeRoute";

/**
 * Os andares reservados para as próximas equipes, só na demonstração. Tudo aqui é dado: para uma
 * equipe ocupar um deles, basta trocar o nome das zonas, a mobília e os figurantes desta tabela.
 * Não há nome de equipe, bot, sessão nem atividade: quem aparece é figurante de cenário, e a
 * etiqueta diz isso.
 */
export type ExpansionFloorId = "expansao-2" | "expansao-3" | "expansao-4" | "expansao-5";

/** Peça de mobília, em metros do andar. `kit` em `buildingInteriors.ts` sabe desenhar cada uma. */
export type ExpansionPiece =
  /** Piso de uma zona. */
  | { kind: "floor"; bounds: OfficeBounds; color: string }
  /** Divisória baixa, com vãos medidos no eixo dela. */
  | { kind: "partition"; axis: "x" | "z"; at: number; from: number; to: number; height?: number; doors?: ReadonlyArray<{ at: number; width: number }> }
  /** Mesa comprida com cadeiras dos dois lados, ao longo de x. `bare` não põe laptop em quem senta. */
  | { kind: "island"; x: number; z: number; width: number; depth: number; seats: readonly number[]; color?: string; bare?: boolean }
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
  /** O que a sala é, quando não é a frase dos andares reservados. */
  purpose?: string;
}

/** Cadeira que alguém pode ocupar, sem figurante: a mobília não a desenha, `HumanChairs` desenha. */
export interface ExpansionSeat {
  key: string;
  zone: string;
  x: number;
  z: number;
  yaw: number;
}

/**
 * Figurante: só compõe a cena. Sentado, ocupa o lugar exato de uma cadeira da mobília, que dá vez à
 * cadeira da pessoa. Só há lugares de frente para a câmera: de costas, ninguém veria o rosto.
 */
export interface ExpansionFigure {
  key: string;
  /** Zona do andar: a etiqueta só aparece com ela apontada ou em foco. */
  zone: string;
  x: number;
  z: number;
  /** Para onde olha, em radianos: 0 é o sul e π/2 é o leste, os dois lados da câmera. */
  yaw: number;
  seated: boolean;
  parts: Partial<HumanPreset["parts"]>;
  colors: Partial<HumanPreset["colors"]>;
  expression?: HumanPreset["expression"];
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
  figures: readonly ExpansionFigure[];
  /** Cadeiras ocupáveis por quem não é figurante: o squad de um cenário. */
  seats?: readonly ExpansionSeat[];
  /**
   * Andar ocupado por uma equipe de cenário: entra no seletor com nome próprio, fora da linha da
   * Expansão, e a etiqueta diz o que ele é.
   */
  team?: { tag: string };
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
      { key: "bancadas", name: "Bancadas", color: "#c9a66b", bounds: { minX, maxX: 0.6, minZ, maxZ } },
      { key: "lounge", name: "Lounge", color: "#7f9f83", bounds: { minX: 2.4, maxX, minZ: 1.6, maxZ } },
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
    figures: [
      { key: "bancada-a", zone: "bancadas", x: -7.3, z: -4.83, yaw: 0, seated: true, parts: { hair: "Hair.003", top: "Top.002", glasses: "Glasses.001" }, colors: { hair: "#17120f", eyebrow: "#17120f", head: "#d4966e", nose: "#d4966e", top: "#2f4256", bottom: "#23262c" } },
      { key: "bancada-b", zone: "bancadas", x: -3.9, z: -4.83, yaw: 0, seated: true, parts: { hair: "Hair.006" }, colors: { hair: "#a8703a", eyebrow: "#a8703a", head: "#f5c6a5", nose: "#f5c6a5", top: "#f2efe8", bottom: "#2f4256" } },
      { key: "bancada-c", zone: "bancadas", x: -6.8, z: 2.97, yaw: 0, seated: true, parts: { hair: "Hair.008", facialHair: "FacialHair.002" }, colors: { hair: "#3b2417", eyebrow: "#3b2417", facialHair: "#3b2417", head: "#8d5a3c", nose: "#8d5a3c", top: "#a83232", bottom: "#7a8087" } },
      { key: "conversa-a", zone: "lounge", x: 3.3, z: 5.1, yaw: 1.83, seated: false, expression: "smile", parts: { hair: "Hair.004", bottom: "Bottom.003", shoes: "Shoes.002" }, colors: { hair: "#6b4426", eyebrow: "#6b4426", head: "#eab08c", nose: "#eab08c", top: "#7a8087", bottom: "#23262c", shoes: "#f2efe8" } },
      { key: "conversa-b", zone: "lounge", x: 4, z: 4.4, yaw: -0.26, seated: false, parts: { hair: "Hair.001", top: "Top.002" }, colors: { hair: "#17120f", eyebrow: "#17120f", head: "#5f3b28", nose: "#5f3b28", top: "#f59e0b", bottom: "#2f4256" } },
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
      { key: "baia-norte", name: "Baia norte", color: "#8fa8c9", bounds: { minX, maxX: -1.2, minZ, maxZ: -0.4 } },
      { key: "baia-sul", name: "Baia sul", color: "#a39ac9", bounds: { minX, maxX: -1.2, minZ: 0.4, maxZ } },
      { key: "reuniao", name: "Sala de reunião", color: "#7f8fa8", bounds: { minX: 2.4, maxX, minZ: 2, maxZ } },
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
    figures: [
      { key: "posto-norte", zone: "baia-norte", x: -8.4, z: -3, yaw: Math.PI / 2, seated: true, parts: { hair: "Hair.005", hat: "Hat.007" }, colors: { hair: "#3b2417", eyebrow: "#3b2417", head: "#eab08c", nose: "#eab08c", top: "#22c55e", bottom: "#23262c" } },
      { key: "posto-sul", zone: "baia-sul", x: -8.4, z: 3, yaw: Math.PI / 2, seated: true, parts: { hair: "Hair.009" }, colors: { hair: "#d9b26a", eyebrow: "#a8703a", head: "#f5c6a5", nose: "#f5c6a5", top: "#2563eb", bottom: "#7a8087" } },
      { key: "reuniao-a", zone: "reuniao", x: 5.4, z: 4.67, yaw: 0, seated: true, parts: { hair: "Hair.002", glasses: "Glasses.003" }, colors: { hair: "#8e8e93", eyebrow: "#8e8e93", head: "#d4966e", nose: "#d4966e", top: "#23262c", bottom: "#23262c" } },
      { key: "reuniao-b", zone: "reuniao", x: 8.2, z: 4.67, yaw: 0, seated: true, expression: "smile", parts: { hair: "Hair.007", top: "Top.003" }, colors: { hair: "#17120f", eyebrow: "#17120f", head: "#b97a52", nose: "#b97a52", top: "#a855f7", bottom: "#2f4256" } },
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
      { key: "oficina", name: "Oficina", color: "#c98f6b", bounds: { minX, maxX: -0.6, minZ, maxZ: 1.8 } },
      { key: "mesas", name: "Mesas de trabalho", color: "#a9b27a", bounds: { minX, maxX: 7.4, minZ: 2.4, maxZ } },
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
    figures: [
      { key: "quadro", zone: "oficina", x: -2.4, z: -7.3, yaw: -0.3, seated: false, expression: "smile", parts: { hair: "Hair.010" }, colors: { hair: "#b0413e", eyebrow: "#6b4426", head: "#f5c6a5", nose: "#f5c6a5", top: "#f2efe8", bottom: "#23262c" } },
      { key: "mesa-a", zone: "mesas", x: -6.4, z: 4.7, yaw: 0, seated: true, parts: { hair: "Hair.003", facialHair: "FacialHair.005" }, colors: { hair: "#6b4426", eyebrow: "#6b4426", facialHair: "#6b4426", head: "#eab08c", nose: "#eab08c", top: "#2f4256", bottom: "#7a8087" } },
      { key: "mesa-b", zone: "mesas", x: -7.5, z: 5.8, yaw: Math.PI / 2, seated: true, parts: { hair: "Hair.011", bow: "Bow.001" }, colors: { hair: "#17120f", eyebrow: "#17120f", head: "#8d5a3c", nose: "#8d5a3c", bow: "#f59e0b", top: "#f59e0b", bottom: "#23262c" } },
      { key: "mesa-c", zone: "mesas", x: 0.4, z: 4.7, yaw: 0, seated: true, parts: { hair: "Hair.001", glasses: "Glasses.001" }, colors: { hair: "#3b2417", eyebrow: "#3b2417", head: "#d4966e", nose: "#d4966e", top: "#a83232", bottom: "#2f4256" } },
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
      { key: "cabines", name: "Cabines de foco", color: "#8fb3a3", bounds: { minX, maxX: -6.2, minZ, maxZ } },
      { key: "bancada", name: "Bancada", color: "#c9a66b", bounds: { minX: -6, maxX: 3.4, minZ: -5, maxZ: 3 } },
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
    figures: [
      { key: "cabine", zone: "cabines", x: -9.6, z: -2.25, yaw: Math.PI / 2, seated: true, parts: { hair: "Hair.004", hat: "Hat.007" }, colors: { hair: "#a8703a", eyebrow: "#a8703a", head: "#f5c6a5", nose: "#f5c6a5", top: "#7a8087", bottom: "#23262c" } },
      { key: "bancada-a", zone: "bancada", x: -2.6, z: -1.83, yaw: 0, seated: true, parts: { hair: "Hair.006", glasses: "Glasses.003" }, colors: { hair: "#8e8e93", eyebrow: "#8e8e93", head: "#b97a52", nose: "#b97a52", top: "#2f4256", bottom: "#2f4256" } },
      { key: "bancada-b", zone: "bancada", x: 0.2, z: -1.83, yaw: 0, seated: true, parts: { hair: "Hair.002", top: "Top.002" }, colors: { hair: "#17120f", eyebrow: "#17120f", head: "#eab08c", nose: "#eab08c", top: "#22c55e", bottom: "#23262c" } },
      { key: "jardim", zone: "jardim", x: 5.9, z: 3.9, yaw: 0.55, seated: false, expression: "smile", parts: { hair: "Hair.008", top: "Top.003", bottom: "Bottom.002" }, colors: { hair: "#3b2417", eyebrow: "#3b2417", head: "#5f3b28", nose: "#5f3b28", top: "#ec4899", bottom: "#23262c" } },
    ],
  },
];

/** Os quatro lugares da mesa de cada ilha do squad, a partir do meio dela. */
const TECH_DESK_OFFSETS = [-2.1, -0.7, 0.7, 2.1] as const;
/** As duas ilhas do squad e a mesa da sala de reunião. */
export const TECH_ISLANDS = { a: { x: -5.6, z: -3.4 }, b: { x: -5.6, z: 1.6 } } as const;
export const TECH_MEETING_TABLE = { x: 6.8, z: 5.8, width: 5.2, offsets: [-1.95, -0.65, 0.65, 1.95] } as const;
/** Do meio da mesa até o eixo da cadeira, nos dois lados: o mesmo das ilhas das expansões. */
const SEAT_REACH = 0.93;
const TECH_PURPOSE = "Simulação: squad fictício, sem dado real de ninguém.";

/**
 * O andar da Tecnologia, que toma o lugar da expansão 2 no cenário de tecnologia. Planta própria:
 * o quadro dos épicos na parede do fundo, duas ilhas com as mesas do squad, a sala de reunião com
 * oito lugares e o canto do huddle. Ninguém é figurante: quem senta aqui é o squad simulado.
 */
const TECH_FLOOR: ExpansionFloor = {
  id: "expansao-2",
  level: 2,
  title: "Tecnologia",
  slab: "#d6cfc2",
  openShaft: 0,
  // O fundo norte fica sem janela onde está o quadro dos épicos.
  northWindows: [],
  westWindows: [[-7.4, -3.4], [3.4, 7.4]],
  team: { tag: "simulação" },
  zones: [
    hall("#9fb3c8"),
    { key: "fluxo", name: "Fluxo dos épicos", color: "#c9a66b", bounds: { minX, maxX: 0.6, minZ, maxZ: -6.3 }, purpose: "Discovery à esquerda, delivery à direita. Cada épico é um cartão na cor da saúde dele. Simulação." },
    { key: "squad", name: "Mesas do squad", color: "#8fa8c9", bounds: { minX, maxX: 0.6, minZ: -6.3, maxZ: 4.2 }, purpose: TECH_PURPOSE },
    { key: "huddle", name: "Canto do huddle", color: "#7f9f83", bounds: { minX: 5.4, maxX, minZ: -5.6, maxZ: 2.4 }, purpose: "Quem entra num huddle do Slack vem para cá. Só se sabe quem entrou e saiu, nunca o que se falou." },
    { key: "sala", name: "Sala de reunião", color: "#7f8fa8", bounds: { minX: 2.4, maxX, minZ: 2.6, maxZ }, purpose: "Reunião presencial na agenda do Outlook traz a pessoa para cá. Simulação." },
    { key: "apoio", name: "Apoio", color: SUPPORT_COLOR, bounds: { minX, maxX: 2.2, minZ: 4.4, maxZ }, purpose: TECH_PURPOSE },
  ],
  pieces: [
    { kind: "floor", bounds: { minX, maxX: 2.2, minZ: -6.3, maxZ: 4.2 }, color: "#b08a64" },
    { kind: "floor", bounds: { minX, maxX: 0.6, minZ, maxZ: -6.3 }, color: "#c7b49c" },
    { kind: "floor", bounds: { minX: 2.4, maxX, minZ: 2.6, maxZ }, color: "#b6a593" },
    { kind: "partition", axis: "z", at: 2.4, from: 2.6, to: maxZ },
    { kind: "partition", axis: "x", at: 2.6, from: 2.4, to: maxX, doors: [{ at: 4.35, width: 1.5 }] },
    { kind: "island", x: TECH_ISLANDS.a.x, z: TECH_ISLANDS.a.z, width: 5.6, depth: 1.2, seats: TECH_DESK_OFFSETS },
    { kind: "island", x: TECH_ISLANDS.b.x, z: TECH_ISLANDS.b.z, width: 5.6, depth: 1.2, seats: TECH_DESK_OFFSETS },
    { kind: "island", x: TECH_MEETING_TABLE.x, z: TECH_MEETING_TABLE.z, width: TECH_MEETING_TABLE.width, depth: 1.2, seats: TECH_MEETING_TABLE.offsets, color: "#6d5240", bare: true },
    { kind: "lounge", x: 8.6, z: -4.2, pillow: "#8fb3a3", armchairs: [], rug: "#7b7671" },
    { kind: "cabinet", x: -10.7, z: 6.6, width: 3.4, yaw: quarterTurn },
    { kind: "plant", x: 1.6, z: 8.2, width: 0.9 },
    { kind: "plant", x: 10.5, z: 1.6, width: 0.85 },
    { kind: "plant", x: -10.4, z: -5.8, width: 0.9 },
  ],
  figures: [],
  seats: [
    ...[TECH_ISLANDS.a, TECH_ISLANDS.b].flatMap((island, row) => TECH_DESK_OFFSETS.map((offset, index) => ({ key: `mesa-${row * 4 + index + 1}`, zone: "squad", x: island.x + offset, z: island.z - SEAT_REACH, yaw: 0 }))),
    // Primeiro os quatro de frente para a câmera; depois os de costas.
    ...TECH_MEETING_TABLE.offsets.map((offset, index) => ({ key: `sala-${index + 1}`, zone: "sala", x: TECH_MEETING_TABLE.x + offset, z: TECH_MEETING_TABLE.z - SEAT_REACH, yaw: 0 })),
    ...TECH_MEETING_TABLE.offsets.map((offset, index) => ({ key: `sala-${index + 5}`, zone: "sala", x: TECH_MEETING_TABLE.x + offset, z: TECH_MEETING_TABLE.z + SEAT_REACH, yaw: Math.PI })),
  ],
};

/** No cenário de tecnologia, o andar 2 é o do squad; sem cenário, a tabela é a de sempre. */
export const EXPANSION_FLOORS: readonly ExpansionFloor[] = OFFICE_SCENARIO === "tecnologia" ? [TECH_FLOOR, ...FLOORS.slice(1)] : FLOORS;
export { TECH_FLOOR };

export function expansionFloor(id: string): ExpansionFloor | undefined {
  return EXPANSION_FLOORS.find((floor) => floor.id === id);
}

/** Andar reservado de verdade: sem equipe, nem de cenário. É o que entra na linha da Expansão. */
export const isReservedFloor = (floor: ExpansionFloor) => !floor.team;

const PURPOSE = "Espaço reservado para uma equipe futura. As figuras são cenário: sem equipe, sessão nem atividade real.";

/** As zonas viram salas com o id do andar na frente: `expansao-3-apoio`, sem repetição no prédio. */
export function expansionRooms(floor: ExpansionFloor): BuildingRoom[] {
  return floor.zones.map((spec) => zone(`${floor.id}-${spec.key}`, spec.name, spec.color, spec.purpose ?? PURPOSE, spec.bounds));
}

const FIGURE_DATE = "2026-11-06T00:00:00.000Z";

const figureSeat = (floor: ExpansionFloor, figure: ExpansionFigure): OfficeSeat => ({ id: `${floor.id}-${figure.key}`, roomId: `${floor.id}-${figure.zone}`, kind: "reuniao", x: figure.x, z: figure.z, yaw: figure.yaw });

/** As cadeiras em que alguém senta: a mobília não desenha a fixa, e `HumanChairs` desenha esta. */
export function expansionSeats(floor: ExpansionFloor): OfficeSeat[] {
  const extra = (floor.seats ?? []).map((seat): OfficeSeat => ({ id: `${floor.id}-${seat.key}`, roomId: `${floor.id}-${seat.zone}`, kind: "reuniao", x: seat.x, z: seat.z, yaw: seat.yaw }));
  return [...floor.figures.filter((figure) => figure.seated).map((figure) => figureSeat(floor, figure)), ...extra];
}

function figureHuman(floor: ExpansionFloor, figure: ExpansionFigure): SceneryHuman {
  const id = `${floor.id}-${figure.key}`;
  const base = newPreset(id, "Figurante", FIGURE_DATE);
  return {
    id,
    tag: "Figurante · cenário",
    floor: floor.id,
    roomId: `${floor.id}-${figure.zone}`,
    restYaw: figure.yaw,
    preset: { ...base, expression: figure.expression ?? "neutral", parts: { ...base.parts, ...figure.parts }, colors: { ...base.colors, ...figure.colors } },
    spot: { x: figure.x, z: figure.z },
    chair: figure.seated ? figureSeat(floor, figure) : null,
  };
}

const FIGURES = Object.fromEntries(EXPANSION_FLOORS.map((floor) => [floor.id, floor.figures.map((figure) => figureHuman(floor, figure))])) as Record<ExpansionFloorId, SceneryHuman[]>;

/** Figurantes de um andar: uma lista só por página, para a cena não refazer ninguém a cada leitura. */
export function expansionScenery(id: ExpansionFloorId): readonly SceneryHuman[] {
  return FIGURES[id];
}
