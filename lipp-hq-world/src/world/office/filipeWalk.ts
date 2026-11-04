import type { SpriteFacing } from "./spriteAtlas";

/**
 * Passeio do Filipe no hall da demonstração: pontos de parada e para onde ele olha.
 * Os quadros vêm do JSON do atlas. Sem Three.js, para ser testado sozinho.
 */

export interface WalkStop {
  /** Coordenadas locais da sala; o caminho contorna recepção, sofá e bancada. */
  x: number;
  z: number;
  /** Segundos parado ao chegar. */
  pause: number;
}

export const WALK_ROUTE: readonly WalkStop[] = [
  { x: -0.6, z: 2.05, pause: 1.2 },
  { x: 1.8, z: 2.05, pause: 0 },
  { x: 1.8, z: 1.35, pause: 1.2 },
  { x: 0.1, z: 1.35, pause: 0 },
  { x: 0.1, z: -2.2, pause: 1.2 },
  { x: -0.6, z: -2.2, pause: 0 },
];

export const WALK_SPEED = 1.2;

export interface WalkState {
  /** Parada de onde ele saiu. */
  leg: number;
  /** Metros andados neste trecho. */
  travelled: number;
  /** Segundos de pausa que faltam. */
  waiting: number;
  /** Metros andados no total: de onde sai o quadro. */
  distance: number;
}

export const initialWalk = (): WalkState => ({ leg: 0, travelled: 0, waiting: WALK_ROUTE[0]!.pause, distance: 0 });

function legOf(state: WalkState) {
  const from = WALK_ROUTE[state.leg]!;
  const to = WALK_ROUTE[(state.leg + 1) % WALK_ROUTE.length]!;
  return { from, to, length: Math.hypot(to.x - from.x, to.z - from.z) };
}

/** Avança o passeio, gastando o tempo que sobrar de um trecho no seguinte. */
export function advanceWalk(state: WalkState, delta: number): WalkState {
  const next = { ...state };
  let time = delta;
  while (time > 0) {
    if (next.waiting > 0) {
      const spent = Math.min(next.waiting, time);
      next.waiting -= spent;
      time -= spent;
      continue;
    }
    const { to, length } = legOf(next);
    const step = Math.min(length - next.travelled, time * WALK_SPEED);
    next.travelled += step;
    next.distance += step;
    time -= step / WALK_SPEED;
    if (next.travelled >= length - 1e-6) {
      next.leg = (next.leg + 1) % WALK_ROUTE.length;
      next.travelled = 0;
      next.waiting = to.pause;
      if (to.pause === 0 && step === 0) break;
    }
  }
  return next;
}

export interface WalkPose {
  x: number;
  z: number;
  /** Qual arte mostrar; os quadros de cada uma vêm do JSON do atlas. */
  facing: SpriteFacing;
  /** A arte olha para a direita da tela; para a esquerda, ela é espelhada. */
  mirrored: boolean;
  walking: boolean;
}

/**
 * Com a câmera a 45 graus, cada eixo do andar vira uma diagonal da tela:
 * +x desce à direita, +z desce à esquerda, -z sobe à direita e -x sobe à esquerda.
 */
export function walkPose(state: WalkState): WalkPose {
  const { from, to, length } = legOf(state);
  const walking = state.waiting <= 0;
  // parado, ele continua olhando para onde vinha andando
  const heading = walking ? { from, to } : legOf({ ...state, leg: (state.leg + WALK_ROUTE.length - 1) % WALK_ROUTE.length });
  const dx = heading.to.x - heading.from.x;
  const dz = heading.to.z - heading.from.z;
  const alongX = Math.abs(dx) >= Math.abs(dz);
  const facing = (alongX ? dx > 0 : dz > 0) ? "front" : "back";
  const mirrored = alongX ? dx < 0 : dz > 0;
  const k = state.travelled / length;
  return {
    x: from.x + (to.x - from.x) * k,
    z: from.z + (to.z - from.z) * k,
    facing,
    mirrored,
    walking,
  };
}
