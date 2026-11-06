import { newPreset } from "@/avatar/human/preset";
import { FACING, FLOOR_BOUNDS, type OfficeBounds } from "./officeLayout";
import { zone, type BuildingRoom, type FloorSignSpec, type SceneryHuman } from "./officeLobby";

/**
 * O esconderijo do morcego: um pavimento de fachada (o 6) que por dentro é outra coisa. Fica fora do
 * seletor, das teclas de andar, da fachada e da URL: só se chega pela estante da Diretoria. Tudo aqui
 * é cenário e dado puro, sem three: nada lê frota, nada fala com o Hermes e nada fica salvo.
 */
export const HIDEOUT_LEVEL = 6;

const { minX, maxX, minZ, maxZ } = FLOOR_BOUNDS;

export const HIDEOUT_ZONES = {
  investigacao: { minX, maxX: -1.5, minZ, maxZ: -1.5 },
  vitrine: { minX: -1.5, maxX: 4.6, minZ, maxZ: -2.6 },
  saida: { minX: 4.6, maxX, minZ, maxZ: -2.6 },
  treino: { minX, maxX: -1.5, minZ: -0.5, maxZ },
  garagem: { minX: 0.4, maxX, minZ: -2.4, maxZ },
} as const satisfies Record<string, OfficeBounds>;

export const HIDEOUT_ROOMS: BuildingRoom[] = [
  zone("esconderijo-investigacao", "Central de investigação", "#5aa9ff", "O terminal de vários monitores. Só cenário: os arquivos são de brincadeira.", HIDEOUT_ZONES.investigacao),
  zone("esconderijo-vitrine", "Vitrine do traje", "#e0a84f", "O traje reserva, atrás do vidro. Só cenário.", HIDEOUT_ZONES.vitrine),
  zone("esconderijo-saida", "Saída para a Diretoria", "#8fa3b8", "A porta leva de volta à estante da Diretoria.", HIDEOUT_ZONES.saida),
  zone("esconderijo-treino", "Treino", "#7f8fa8", "Tatame, boneco e a moeda gigante. Só cenário.", HIDEOUT_ZONES.treino),
  zone("esconderijo-garagem", "Garagem", "#5aa9ff", "O carro, na plataforma giratória. Só cenário: não vai a lugar nenhum.", HIDEOUT_ZONES.garagem),
];

/** Peça do kit CC0 (`public/esconderijo/kit.glb`): pé no chão, centrada em (x, z). */
export interface KitPlacement {
  node: string;
  x: number;
  z: number;
  /** Altura da base da peça. */
  y?: number;
  yaw?: number;
  /** Uniforme, ou [largura, altura, fundo] da peça. */
  scale?: number | readonly [number, number, number];
}

const TILE_X = (maxX - minX) / 6;
const TILE_Z = (maxZ - minZ) / 5;
const tileScale = [TILE_X / 4, 1, TILE_Z / 4] as const;

/** O piso é uma grade de placas: chão de cada zona, sem costura nova, em instâncias. */
function floorTiles(): KitPlacement[] {
  const tiles: KitPlacement[] = [];
  for (let column = 0; column < 6; column += 1) {
    for (let row = 0; row < 5; row += 1) {
      const x = minX + TILE_X * (column + 0.5);
      const z = minZ + TILE_Z * (row + 0.5);
      const node = x < -1.5 ? (z < -1 ? "Platform_DarkPlates" : "Platform_Squares") : "Platform_Metal";
      tiles.push({ node, x, z, y: 0.012, scale: tileScale });
    }
  }
  return tiles;
}

/** As peças fixas do kit. As rochas fecham os cantos do fundo, onde a câmera não precisa ver chão. */
export const HIDEOUT_KIT: readonly KitPlacement[] = [
  ...floorTiles(),
  // Central de investigação.
  { node: "Prop_Computer", x: -9.9, z: -8.1, scale: 1.05 },
  { node: "Prop_Computer", x: -2.7, z: -8.1, scale: 1.05 },
  { node: "Prop_PipeHolder", x: -6.3, z: -8.7, y: 2.92, scale: 0.6 },
  { node: "Chest_Armature", x: -10.3, z: -5.1, yaw: FACING.east, scale: 0.9 },
  { node: "Prop_Crate4", x: -10.45, z: -3, yaw: 0.35, scale: 0.8 },
  { node: "Prop_Barrel_Large", x: -9.3, z: -2.6, scale: 0.85 },
  { node: "Column_Hollow", x: -1.5, z: -8.5, scale: 0.6 },
  // Vitrine.
  { node: "Column_Hollow", x: 4.6, z: -8.5, scale: 0.6 },
  { node: "Prop_Light_Floor", x: 1.8, z: -4.75, yaw: 0, scale: 0.9 },
  // Saída: portal e duas folhas, com as luzes do chão levando até ele.
  { node: "Door_Frame_Square", x: 7.8, z: -8.72, scale: 0.6 },
  { node: "Door_DarkMetal", x: 7.17, z: -8.72, scale: 0.6 },
  { node: "Door_DarkMetal", x: 8.43, z: -8.72, yaw: Math.PI, scale: 0.6 },
  { node: "Prop_Light_Floor", x: 6.7, z: -6.4, yaw: FACING.east, scale: 0.8 },
  { node: "Prop_Light_Floor", x: 8.9, z: -6.4, yaw: FACING.east, scale: 0.8 },
  // Treino.
  { node: "Prop_Crate4", x: -2.5, z: 0.7, yaw: 0.6, scale: 0.9 },
  { node: "Prop_Barrel_Large", x: -3.6, z: 0.4, scale: 0.8 },
  { node: "Fan_Armature", x: -10.1, z: 7.9, scale: 0.8 },
  // Garagem.
  { node: "Chest_Armature", x: 10.3, z: -1.1, yaw: -FACING.east, scale: 0.95 },
  { node: "Prop_Crate4", x: 10.45, z: 0.8, yaw: 0.2, scale: 0.75 },
  { node: "Fan_Armature", x: 2.1, z: 7.6, scale: 0.8 },
  { node: "Column_Hollow", x: 0.4, z: -2.5, scale: 0.6 },
  { node: "Column_Hollow", x: 11, z: -2.7, scale: 0.6 },
  // Rocha nas duas paredes do fundo: quase teto, sem roubar a tela dos monitores.
  { node: "rock_largeA", x: -10.5, z: -8.3, scale: [3.4, 3.3, 3.2] },
  { node: "rock_largeB", x: -10.9, z: -0.9, yaw: 1.2, scale: [2.6, 3.4, 2.8] },
  { node: "rock_largeA", x: -10.9, z: 3.6, yaw: 2.4, scale: [2.2, 2.1, 2.4] },
  { node: "rock", x: -10.8, z: 8.3, yaw: 0.8, scale: [2.4, 1.4, 2.2] },
  { node: "rock_largeB", x: 2.4, z: -9.1, yaw: 0.4, scale: [3.6, 2.4, 1.8] },
  { node: "rock_largeA", x: 5.7, z: -9, yaw: 1.6, scale: [2.2, 3, 1.6] },
  { node: "rock_largeB", x: 10.5, z: -8.3, yaw: 3, scale: [3, 3.2, 3] },
  { node: "rock", x: 10.8, z: 8.2, yaw: 2, scale: [1.8, 0.8, 1.8] },
];

/** A plataforma giratória e o carro em cima: giram juntos. */
export const TURNTABLE = { x: 6.5, z: 3.2, radius: 3, carYaw: 1.8 } as const;
/** Rodas do carro em relação ao centro dele, com a frente em +z. */
export const CAR_WHEELS: ReadonlyArray<readonly [number, number]> = [[-0.86, 1.25], [0.86, 1.25], [-0.86, -1.4], [0.86, -1.4]];

export const BATTLE_CONSOLE = { x: -6.3, z: -8.05, width: 5.4, depth: 0.85 } as const;
export const SUIT_CASE = { x: 1.8, z: -7, width: 2, depth: 2, height: 2.55 } as const;
export const SIGNAL_LAMP = { x: -4.1, z: -0.95 } as const;
export const SIGNAL_TARGET = { x: minX + 0.11, y: 2.05, z: 4.3 } as const;
export const GIANT_COIN = { x: -2.7, z: 7.2, radius: 1.15 } as const;
export const TRAINING_MAT = { x: -7, z: 4.6, width: 5.4, depth: 5.2 } as const;
export const HIDEOUT_DOOR = { x: 7.8, z: minZ + 0.2 } as const;

/** Poças de luz falsa, sem nenhuma luz a mais na cena: azul e âmbar, somadas ao que está embaixo. */
export interface GlowPool {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  color: string;
  /** Em qual superfície: chão, parede do norte ou do oeste. */
  on: "floor" | "north" | "west";
}

export const HIDEOUT_GLOWS: readonly GlowPool[] = [
  { on: "floor", x: -6.3, y: 0.05, z: -6.6, width: 8.6, height: 5.2, color: "#2f7fe0" },
  { on: "north", x: -6.3, y: 1.7, z: minZ + 0.03, width: 10, height: 4.2, color: "#2f7fe0" },
  { on: "floor", x: 1.8, y: 0.05, z: -6.6, width: 4.6, height: 4.6, color: "#e09a3a" },
  { on: "north", x: 1.8, y: 1.6, z: minZ + 0.03, width: 5, height: 3.8, color: "#e09a3a" },
  { on: "floor", x: 7.8, y: 0.05, z: -6.9, width: 5.6, height: 5, color: "#e09a3a" },
  { on: "north", x: 7.8, y: 1.6, z: minZ + 0.03, width: 6, height: 3.8, color: "#e09a3a" },
  { on: "floor", x: TURNTABLE.x, y: 0.26, z: TURNTABLE.z, width: 7.4, height: 7.4, color: "#2f7fe0" },
  { on: "floor", x: TRAINING_MAT.x, y: 0.05, z: TRAINING_MAT.z, width: 7.4, height: 7, color: "#e09a3a" },
  { on: "west", x: minX + 0.03, y: 1.7, z: 4.4, width: 7, height: 3.4, color: "#2b5fa8" },
];

const FIGURE_DATE = "2026-11-06T00:00:00.000Z";

/** O vigia da caverna, de costas para a câmera, olhando os monitores: a capa e as orelhas é que contam. */
export const HIDEOUT_SCENERY: readonly SceneryHuman[] = [(() => {
  const base = newPreset("morcego-cenografico", "Morcego", FIGURE_DATE);
  return {
    id: base.id,
    tag: "O morcego · cenário",
    floor: "esconderijo",
    roomId: "esconderijo-investigacao",
    restYaw: Math.PI - 0.32,
    gear: "morcego",
    preset: {
      ...base,
      parts: { ...base.parts, hair: null, eyebrow: null, top: "Top.001", bottom: "Bottom.001", shoes: "Shoes.003" },
      colors: { ...base.colors, head: "#d4966e", nose: "#d4966e", top: "#2a2d33", bottom: "#23262c", shoes: "#17181b" },
    },
    spot: { x: -6.3, z: -6.75 },
    chair: null,
  };
})()];

export const HIDEOUT_SIGNS: readonly FloorSignSpec[] = [{ text: "DIRETORIA", at: [HIDEOUT_DOOR.x, 3.12, minZ + 0.46], width: 1.6, height: 0.28 }];

/** Metade direita do morcego, do alto ao rabo; a outra metade é o espelho. x de 0 a 1, y de -0,5 a 0,5. */
const BAT_HALF: ReadonlyArray<readonly [number, number]> = [
  [0, 0.17], [0.045, 0.2], [0.09, 0.4], [0.135, 0.17], [0.27, 0.17], [0.42, 0.36], [0.72, 0.32], [1, 0.02],
  [0.86, 0.06], [0.75, -0.06], [0.68, -0.02], [0.55, -0.18], [0.45, -0.09], [0.31, -0.25], [0.2, -0.15], [0.09, -0.3], [0, -0.5],
];

/** O desenho do morcego, para virar geometria e canvas sem repetir medida. */
export const BAT_OUTLINE: ReadonlyArray<readonly [number, number]> = [...BAT_HALF, ...BAT_HALF.slice(1, -1).reverse().map(([x, y]) => [-x, y] as const)];
