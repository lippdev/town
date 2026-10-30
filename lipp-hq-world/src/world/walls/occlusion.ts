import { WALL_VISIBILITY } from "@/config/constants";
import type { WallDefinition } from "@/types/hq";

export interface Point2 {
  x: number;
  z: number;
}

export interface CameraView {
  x: number;
  y: number;
  z: number;
}

export interface WallOcclusion {
  facingScore: number;
  blockingSampleCount: number;
  totalSamples: number;
  occlusionRatio: number;
}

function cross(o: Point2, a: Point2, b: Point2): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

/**
 * Interseção própria entre dois segmentos no plano XZ. Segmentos que apenas se
 * tocam nas pontas não contam: uma parede encostada na borda da amostra não
 * deve entrar em cutaway.
 */
export function segmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);

  const opposite = (p: number, q: number) => (p > 0 && q < 0) || (p < 0 && q > 0);
  return opposite(d1, d2) && opposite(d3, d4);
}

/** Extremos do segmento da parede no plano XZ. */
export function wallEndpoints(wall: WallDefinition): [Point2, Point2] {
  return wall.axis === "x"
    ? [
        { x: wall.start, z: wall.fixed },
        { x: wall.end, z: wall.fixed },
      ]
    : [
        { x: wall.fixed, z: wall.start },
        { x: wall.fixed, z: wall.end },
      ];
}

export function wallMidpoint(wall: WallDefinition): Point2 {
  const [a, b] = wallEndpoints(wall);
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

/**
 * Mede o quanto uma parede bloqueia a visão da sala a partir da câmera.
 *
 * `facingScore` fica em [-1, 1]: positivo significa que a câmera está do lado
 * externo da parede, ou seja, entre a câmera e o interior.
 * `occlusionRatio` é a fração das amostras da sala cujo segmento câmera→amostra
 * cruza o segmento da parede.
 */
export function computeWallOcclusion(
  wall: WallDefinition,
  samples: ReadonlyArray<readonly [number, number, number]>,
  camera: CameraView,
): WallOcclusion {
  const midpoint = wallMidpoint(wall);
  const toCamera = { x: camera.x - midpoint.x, z: camera.z - midpoint.z };
  const length = Math.hypot(toCamera.x, toCamera.z) || 1;
  const facingScore =
    (toCamera.x / length) * wall.outward[0] + (toCamera.z / length) * wall.outward[2];

  const [start, end] = wallEndpoints(wall);
  const cameraPoint: Point2 = { x: camera.x, z: camera.z };

  let blocking = 0;
  for (const sample of samples) {
    const point: Point2 = { x: sample[0], z: sample[2] };
    if (segmentsIntersect(cameraPoint, point, start, end)) blocking += 1;
  }

  return {
    facingScore,
    blockingSampleCount: blocking,
    totalSamples: samples.length,
    occlusionRatio: samples.length === 0 ? 0 : blocking / samples.length,
  };
}

/**
 * Decide se a parede deve entrar em cutaway, com histerese. Uma parede já em
 * cutaway só sai quando cai abaixo dos limiares mais baixos, o que impede
 * piscar quando a câmera passa raspando por um ângulo de 45 graus.
 */
export function shouldCutaway(occlusion: WallOcclusion, wasCutaway: boolean): boolean {
  const facingThreshold = wasCutaway
    ? WALL_VISIBILITY.facingExit
    : WALL_VISIBILITY.facingEnter;
  const occlusionThreshold = wasCutaway
    ? WALL_VISIBILITY.occlusionExit
    : WALL_VISIBILITY.occlusionEnter;

  return (
    occlusion.facingScore > facingThreshold && occlusion.occlusionRatio > occlusionThreshold
  );
}

/** Altura-alvo do painel superior para o estado atual. */
export function targetPanelScale(isCutaway: boolean, mode: "auto" | "low" | "full"): number {
  if (mode === "full") return 1;
  if (mode === "low") return 0.18;
  return isCutaway ? 0.04 : 1;
}
