import type { Vector3Tuple } from "@/types/hq";

/** Pé-direito das salas. */
export const WALL_HEIGHT = 2.8;

/** Espessura das paredes divisórias e externas. */
export const WALL_THICKNESS = 0.2;

/** Altura do rodapé que permanece visível quando a parede entra em cutaway. */
export const PLINTH_HEIGHT = 0.38;

/** Altura do vão livre das portas. */
export const DOOR_HEIGHT = 2.1;

/** Largura padrão de uma porta. */
export const DOOR_WIDTH = 1.5;

/** Largura mínima de circulação em corredores. */
export const CORRIDOR_WIDTH = 2.0;

/** Pegada do prédio, sem a laje externa. */
export const BUILDING = {
  minX: -16.2,
  maxX: 16.2,
  minZ: -12.4,
  maxZ: 12.4,
} as const;

/** Laje do diorama, ligeiramente maior que o prédio. */
export const BASE_SLAB = {
  minX: -17.4,
  maxX: 17.4,
  minZ: -13.6,
  maxZ: 13.6,
  thickness: 0.6,
} as const;

export const PALETTE = {
  background: "#0b1220",
  backgroundDeep: "#070c16",
  slabTop: "#2a3346",
  slabSide: "#1a2130",
  floorWood: "#c8a882",
  floorWoodAlt: "#b8956e",
  corridorFloor: "#9aa3ae",
  hallFloor: "#b6bfc9",
  wall: "#dfe3e8",
  wallPlinth: "#c3c9d1",
  wallTrim: "#aeb6c0",
  desk: "#8a6242",
  deskDark: "#6f4d34",
  chair: "#38404f",
  screenGlow: "#63c9f2",
  plant: "#4c8b5a",
  plantDark: "#376843",
  metal: "#8f98a5",
  paper: "#f2f4f7",
} as const;

/** Câmera inicial: perspectiva quase isométrica sobre o prédio inteiro. */
export const CAMERA = {
  fov: 38,
  near: 0.1,
  far: 400,
  position: [28, 33, 33] as Vector3Tuple,
  target: [0, 0, 0] as Vector3Tuple,
  minDistance: 14,
  maxDistance: 78,
  minPolarAngle: 0.42,
  maxPolarAngle: 1.32,
  dampingFactor: 0.08,
} as const;

/** Parâmetros do sistema de paredes dinâmicas. */
export const WALL_VISIBILITY = {
  /** Fração de amostras bloqueadas que caracteriza oclusão relevante. */
  occlusionEnter: 0.34,
  /** Limiar mais baixo para sair do cutaway e evitar oscilação. */
  occlusionExit: 0.16,
  /** Normal mínima para considerar que a câmera está do lado externo da parede. */
  facingEnter: 0.05,
  facingExit: -0.08,
  /** Velocidade de interpolação de opacidade e altura. */
  transitionSpeed: 6.5,
} as const;
