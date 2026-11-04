/**
 * Passeio do Filipe no escritório, em pixels da imagem do cenário. Sem DOM, para ser
 * testado sozinho. Vai e volta pelo mesmo caminho, em diagonais 2:1 sobre o piso livre: pontos
 * à frente dos móveis, então ele nunca precisa ficar atrás de nada.
 */

export interface PixelStop {
  x: number;
  y: number;
  /** Segundos parado ao chegar. */
  pause: number;
}

const OUTWARD: readonly PixelStop[] = [
  { x: 800, y: 470, pause: 1.6 },
  { x: 850, y: 495, pause: 0 },
  { x: 770, y: 535, pause: 0.8 },
  { x: 940, y: 620, pause: 0 },
  { x: 1010, y: 585, pause: 1.6 },
];

export const PIXEL_ROUTE: readonly PixelStop[] = [...OUTWARD, ...OUTWARD.slice(1, -1).reverse()];

/** A caminhada avança 4,75 pixels na horizontal por quadro: é o que mantém o pé parado no chão. */
const METERS_PER_PIXEL = 0.1133 / 4.75 / Math.hypot(1, 0.5);
const SPEED_PIXELS = 1.2 / METERS_PER_PIXEL;

export interface PixelWalkState {
  leg: number;
  travelled: number;
  waiting: number;
  /** Metros andados, a medida que escolhe o quadro. */
  meters: number;
  /** Segundos de relógio, para o parado respirar. */
  time: number;
}

export const initialPixelWalk = (): PixelWalkState => ({ leg: 0, travelled: 0, waiting: PIXEL_ROUTE[0]!.pause, meters: 0, time: 0 });

function legOf(leg: number) {
  const from = PIXEL_ROUTE[leg]!;
  const to = PIXEL_ROUTE[(leg + 1) % PIXEL_ROUTE.length]!;
  return { from, to, length: Math.hypot(to.x - from.x, to.y - from.y) };
}

export function advancePixelWalk(state: PixelWalkState, delta: number): PixelWalkState {
  const next = { ...state, time: state.time + delta };
  let left = delta;
  while (left > 1e-9) {
    if (next.waiting > 0) {
      const spent = Math.min(next.waiting, left);
      next.waiting -= spent;
      left -= spent;
      continue;
    }
    const { to, length } = legOf(next.leg);
    const step = Math.min(length - next.travelled, left * SPEED_PIXELS);
    next.travelled += step;
    next.meters += step * METERS_PER_PIXEL;
    left -= step / SPEED_PIXELS;
    if (next.travelled >= length - 1e-6) {
      next.leg = (next.leg + 1) % PIXEL_ROUTE.length;
      next.travelled = 0;
      next.waiting = to.pause;
    }
  }
  return next;
}

export interface PixelPose {
  x: number;
  y: number;
  walking: boolean;
  /** A arte de frente desce à direita, e a de costas sobe à direita. */
  facing: "front" | "back";
  /** Para a esquerda, a mesma arte espelhada. */
  mirrored: boolean;
}

export function pixelPose(state: PixelWalkState): PixelPose {
  const { from, to, length } = legOf(state.leg);
  const walking = state.waiting <= 0;
  // parado, continua olhando para onde vinha andando
  const heading = walking ? { from, to } : legOf((state.leg + PIXEL_ROUTE.length - 1) % PIXEL_ROUTE.length);
  const k = state.travelled / length;
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    walking,
    facing: heading.to.y > heading.from.y ? "front" : "back",
    mirrored: heading.to.x < heading.from.x,
  };
}
