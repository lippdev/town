import { Color } from "three";
import { FORWARD, RIGHT } from "./officeCamera";

/**
 * Luzes do escritório: a cena as acende e o sprite usa as mesmas contas para a sombra.
 * Sem isto, mudar o sol deixaria a sombra do personagem apontando para outro lado.
 */
type Position = readonly [number, number, number];

export const SUN = { position: [9.6, 15, -15] as Position, intensity: 3.3, color: "#ffd5a0" };
export const FILL = { position: [3, 18, 24] as Position, intensity: 0.8, color: "#bccff2" };
export const HEMISPHERE = { sky: "#cad9f5", ground: "#5a4131", intensity: 0.55 };
export const ENVIRONMENT_INTENSITY = 0.45;
/** Quanto o ambiente entrega ao chão. Ele vem de textura: este valor é uma estimativa, não uma medida, e a sombra do personagem depende dele. */
export const ENVIRONMENT_ON_FLOOR: Position = [0.2, 0.2, 0.2];

export interface GroundVector {
  x: number;
  z: number;
}

/** Eixos da sombra no chão, e quantos metros de chão ela anda por metro de altura. */
export function shadowAxes(sun: Position = SUN.position) {
  const run = { x: -sun[0] / sun[1], z: -sun[2] / sun[1] };
  const length = Math.hypot(run.x, run.z);
  const along = { x: run.x / length, z: run.z / length };
  return { length, along, across: { x: along.z, z: -along.x } };
}

const lambertUp = (position: Position) => Math.max(0, position[1] / Math.hypot(position[0], position[1], position[2]));

/**
 * Quanto sobra da luz de um chão quando o sol é tapado, por canal: as outras luzes dividido
 * pelo total. A cor do chão não entra: ela aparece igual nos dois lados da divisão.
 */
export function floorShadowFactor(): [number, number, number] {
  const sun = new Color(SUN.color).multiplyScalar((SUN.intensity * lambertUp(SUN.position)) / Math.PI);
  const fill = new Color(FILL.color).multiplyScalar((FILL.intensity * lambertUp(FILL.position)) / Math.PI);
  const sky = new Color(HEMISPHERE.sky).multiplyScalar(HEMISPHERE.intensity / Math.PI);
  const channels = ["r", "g", "b"] as const;
  const [r, g, b] = channels.map((channel, index) => {
    const others = fill[channel] + sky[channel] + ENVIRONMENT_ON_FLOOR[index]!;
    return others / (others + sun[channel]);
  });
  return [r!, g!, b!];
}

/** Normal na beira do quadro do personagem, para o lado da tela: um cilindro bem aberto, de luz leve. */
export const CYLINDER_EDGE = 0.62;

/**
 * A luz difusa que a arte do personagem supõe: a média, ao longo da largura do quadro, do que
 * chega a uma superfície em pé virada para a câmera e curvada como um cilindro (a normal abre
 * até `CYLINDER_EDGE` nas bordas), com a sombra do sol fora. Em linear, já dividida por π,
 * como o material a soma. O ambiente vem de textura, então entra pela mesma medida do chão.
 */
export function cameraFacingLight(): [number, number, number] {
  const length = Math.hypot(FORWARD[0], FORWARD[2]);
  const front: Position = [-FORWARD[0] / length, 0, -FORWARD[2] / length];
  const front2 = Math.sqrt(1 - CYLINDER_EDGE * CYLINDER_EDGE);
  const total = new Color(0, 0, 0);
  const samples = 9;
  for (let i = 0; i < samples; i += 1) {
    const side = (i / (samples - 1)) * 2 - 1;
    const normal: Position = [front[0] * front2 + RIGHT[0] * side * CYLINDER_EDGE, 0, front[2] * front2 + RIGHT[2] * side * CYLINDER_EDGE];
    const norm = Math.hypot(normal[0], normal[2]);
    const facing = (position: Position) => Math.max(0, (normal[0] * position[0] + normal[2] * position[2]) / (norm * Math.hypot(position[0], position[1], position[2])));
    total.add(new Color(SUN.color).multiplyScalar((SUN.intensity * facing(SUN.position)) / Math.PI / samples));
    total.add(new Color(FILL.color).multiplyScalar((FILL.intensity * facing(FILL.position)) / Math.PI / samples));
  }
  // numa parede em pé, o hemisfério é a meia-soma do céu e do chão
  const hemisphere = new Color(HEMISPHERE.sky).lerp(new Color(HEMISPHERE.ground), 0.5).multiplyScalar(HEMISPHERE.intensity / Math.PI);
  const channels = ["r", "g", "b"] as const;
  const [r, g, b] = channels.map((channel, index) => total[channel] + hemisphere[channel] + ENVIRONMENT_ON_FLOOR[index]!);
  return [r!, g!, b!];
}

/**
 * Leva um objeto em direção à câmera sem mudá-lo de lugar na tela: na ortográfica, andar
 * sobre o eixo de visão só muda a profundidade.
 */
export function towardCamera(distance: number): [number, number, number] {
  return [-FORWARD[0] * distance, -FORWARD[1] * distance, -FORWARD[2] * distance];
}

/** Eixos da tela deitados no chão: para a direita e em direção à câmera. */
export function screenGroundAxes(): { right: GroundVector; toCamera: GroundVector } {
  const length = Math.hypot(FORWARD[0], FORWARD[2]);
  return { right: { x: RIGHT[0], z: RIGHT[2] }, toCamera: { x: -FORWARD[0] / length, z: -FORWARD[2] / length } };
}
