import { HELIPAD } from "./officeBuilding";
import { CLIMB_SECONDS, type ChiefStatus } from "./officeChief";
import { pathLength, pathPose, type Point } from "./officeHumans";

/**
 * O helicóptero do chefe, como matemática pura: sem cena e sem relógio próprio. O roteiro leva o
 * tempo, e daqui sai onde o helicóptero e o chefe estão. Tudo depende só do tempo decorrido: com o
 * corte aberto ninguém vê, mas a cena segue o mesmo relógio, e voltar ao exterior cai no ponto certo.
 * É cena de demonstração, como o resto do roteiro: nenhum dado vem daqui nem vai daqui.
 */
export type ArrivalVia = "carro" | "helicoptero";

/** A abertura é de helicóptero em cerca de uma a cada três vezes; a URL fixa, e o que não existe sorteia. */
export function arrivalVia(search: string, roll: () => number = Math.random): ArrivalVia {
  const asked = new URLSearchParams(search).get("chegada");
  if (asked === "carro" || asked === "helicoptero") return asked;
  return roll() < 1 / 3 ? "helicoptero" : "carro";
}

export type FlightStep = "inbound" | "spinDown" | "disembark" | "descending" | "settled" | "pickup" | "leaving" | "boarding" | "spinUp" | "outbound" | "away";

export interface Flight {
  step: FlightStep;
  time: number;
  /** Veio só buscar: pousa e espera com o rotor girando, em vez de desligar. */
  running: boolean;
}

export interface HelicopterPose {
  x: number;
  y: number;
  z: number;
  /** Para onde o nariz aponta: zero é +z, como no carro. */
  yaw: number;
  /** Positivo baixa o nariz. */
  pitch: number;
  /** Positivo levanta o lado +x. */
  roll: number;
}

export interface DeckFigurePose {
  x: number;
  z: number;
  yaw: number;
  /** Metros andados: é o que mexe as pernas. */
  stride: number;
}

export interface FlightFrame {
  status: ChiefStatus;
  helicopter: HelicopterPose | null;
  /** Rotação do rotor, de 0 (parado) a 1 (cheio). */
  rotor: number;
  figure: DeckFigurePose | null;
}

const { x: PAD_X, z: PAD_Z, top: PAD_Y, kiosk: KIOSK } = HELIPAD;

/** Pousado, de nariz para +z: a câmera vê o lado +x inteiro, e a cauda fica longe da escada. */
export const PARKED_POSE: HelicopterPose = { x: PAD_X, y: PAD_Y, z: PAD_Z, yaw: 0, pitch: 0, roll: 0 };

const FLY_SECONDS = 9;
const DESCENT_SECONDS = 3.5;
const HOVER_HEIGHT = 6.5;
const LIFT_SECONDS = 3;
const AWAY_SECONDS = 8;
const WALK_SPEED = 1.15;
/** O rotor perde o embalo antes de o chefe descer: ninguém anda sob as pás em cheio. */
const SPIN_DOWN_SECONDS = 3;
const SPIN_UP_SECONDS = 2.6;
const SPIN_UP_RUNNING_SECONDS = 0.6;

export const INBOUND_SECONDS = FLY_SECONDS + DESCENT_SECONDS;
export const OUTBOUND_SECONDS = LIFT_SECONDS + AWAY_SECONDS;

/** Da porta do helicóptero até a porta da casinha da escada, sem cortar a cauda. */
export const DECK_WALK: readonly Point[] = [
  { x: PAD_X + 1.15, z: PAD_Z + 0.55 },
  { x: PAD_X + 2.9, z: PAD_Z - 0.4 },
  { x: PAD_X + KIOSK.x, z: PAD_Z - 2.2 },
  { x: PAD_X + KIOSK.x, z: PAD_Z + KIOSK.z + KIOSK.size / 2 + 0.14 },
];
const DECK_BOARD = [...DECK_WALK].reverse();
export const WALK_SECONDS = pathLength(DECK_WALK) / WALK_SPEED;

/** Curva de três pontos de apoio, em metros relativos ao pouso. */
type Vec = readonly [number, number, number];
type Curve = readonly [Vec, Vec, Vec, Vec];

/**
 * O deque fica no alto do quadro, quase sem céu acima dele: quem vem por trás da torre passa o voo
 * inteiro fora da tela. A chegada vem da direita, na altura da coroa, passando pela frente dela (no
 * mundo, é mais perto da câmera, que na tela é mais para baixo), e sobe até o deque numa curva.
 */
const INBOUND_CURVE: Curve = [
  [190, 26, -95],
  [120, 14, 25],
  [42, 10, 8],
  [0, HOVER_HEIGHT, 0],
];

/** Sai pela frente, de nariz para +z, e faz a curva para a esquerda da tela até sair de cena. */
const OUTBOUND_CURVE: Curve = [
  [0, HOVER_HEIGHT, 0],
  [0, 9, 24],
  [-30, 18, 80],
  [-120, 40, 180],
];

function curveAt(curve: Curve, t: number): Vec {
  const m = 1 - t;
  const a = m * m * m;
  const b = 3 * m * m * t;
  const c = 3 * m * t * t;
  const d = t * t * t;
  const axis = (i: 0 | 1 | 2) => a * curve[0][i] + b * curve[1][i] + c * curve[2][i] + d * curve[3][i];
  return [axis(0), axis(1), axis(2)];
}

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Para onde a curva aponta neste ponto. Mede na curva, não no tempo: parar não embaralha a direção. */
function headingAt(curve: Curve, u: number): number {
  const from = curveAt(curve, Math.max(0, u - 0.002));
  const to = curveAt(curve, Math.min(1, u + 0.002));
  return Math.atan2(to[0] - from[0], to[2] - from[2]);
}

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Pose ao longo de uma curva: inclina para a frente com a velocidade e deita na curva. */
function poseOnCurve(curve: Curve, seconds: number, duration: number, ease: (s: number) => number, flare: (s: number) => number): HelicopterPose {
  const s = Math.min(1, Math.max(0, seconds / duration));
  const u = ease(s);
  const [x, y, z] = curveAt(curve, u);
  const delta = 0.05 / duration;
  const uBefore = ease(Math.max(0, s - delta));
  const uAfter = ease(Math.min(1, s + delta));
  const before = curveAt(curve, uBefore);
  const after = curveAt(curve, uAfter);
  const speed = Math.hypot(after[0] - before[0], after[2] - before[2]) / 0.1;
  const turnRate = wrap(headingAt(curve, uAfter) - headingAt(curve, uBefore)) / 0.1;
  return {
    x: PAD_X + x,
    y: PAD_Y + y,
    z: PAD_Z + z,
    yaw: headingAt(curve, u),
    pitch: 0.2 * Math.min(1, speed / 22) - flare(s),
    roll: Math.max(-0.35, Math.min(0.35, -turnRate * 1.1)),
  };
}

const INBOUND_END_YAW = headingAt(INBOUND_CURVE, 1);

/** A chegada: curva de longe, freia, vira no ar para o rumo do pouso e desce até os esquis tocarem. */
export function inboundPose(seconds: number): HelicopterPose {
  if (seconds >= FLY_SECONDS) {
    const descent = (seconds - FLY_SECONDS) / DESCENT_SECONDS;
    const y = PAD_Y + HOVER_HEIGHT * (1 - smooth(descent));
    return { x: PAD_X, y, z: PAD_Z, yaw: INBOUND_END_YAW * (1 - smooth(descent / 0.7)), pitch: 0, roll: 0 };
  }
  return poseOnCurve(INBOUND_CURVE, seconds, FLY_SECONDS, (s) => 1 - (1 - s) ** 2.2, (s) => 0.12 * Math.sin(Math.PI * Math.min(1, Math.max(0, (s - 0.72) / 0.28))));
}

/** A saída: sobe na vertical, embala e faz a curva até sair de cena. */
export function outboundPose(seconds: number): HelicopterPose {
  if (seconds < LIFT_SECONDS) {
    const y = PAD_Y + HOVER_HEIGHT * smooth(seconds / LIFT_SECONDS);
    return { x: PAD_X, y, z: PAD_Z, yaw: 0, pitch: 0, roll: 0 };
  }
  return poseOnCurve(OUTBOUND_CURVE, seconds - LIFT_SECONDS, AWAY_SECONDS, (s) => s * s, () => 0);
}

const DURATION: Record<Exclude<FlightStep, "settled" | "away">, (flight: Flight) => number> = {
  inbound: () => INBOUND_SECONDS,
  spinDown: () => SPIN_DOWN_SECONDS,
  disembark: () => WALK_SECONDS,
  descending: () => CLIMB_SECONDS,
  pickup: () => INBOUND_SECONDS,
  leaving: () => CLIMB_SECONDS,
  boarding: () => WALK_SECONDS,
  spinUp: (flight) => (flight.running ? SPIN_UP_RUNNING_SECONDS : SPIN_UP_SECONDS),
  outbound: () => OUTBOUND_SECONDS,
};

const NEXT: Record<Exclude<FlightStep, "settled" | "away">, FlightStep> = {
  inbound: "spinDown",
  spinDown: "disembark",
  disembark: "descending",
  descending: "settled",
  pickup: "leaving",
  leaving: "boarding",
  boarding: "spinUp",
  spinUp: "outbound",
  outbound: "away",
};

const STATUS: Record<FlightStep, ChiefStatus> = {
  inbound: "chegandoHeli",
  spinDown: "chegandoHeli",
  disembark: "chegandoHeli",
  descending: "descendo",
  settled: "mesa",
  pickup: "aguardando",
  leaving: "saindo",
  boarding: "embarcando",
  spinUp: "decolando",
  outbound: "decolando",
  away: "fora",
};

export const startArrival = (): Flight => ({ step: "inbound", time: 0, running: false });

/** Sair: se o helicóptero está no deque, o chefe vai até ele; se não, ele vem buscar antes. */
export const startDeparture = (parked: boolean): Flight => (parked ? { step: "leaving", time: 0, running: false } : { step: "pickup", time: 0, running: true });

export const awayFlight = (): Flight => ({ step: "away", time: 0, running: false });

/** Anda o roteiro do voo. Um quadro longo atravessa quantos passos couberem. */
export function advanceFlight(flight: Flight, seconds: number): Flight {
  let { step, time } = flight;
  time += seconds;
  while (step !== "settled" && step !== "away") {
    const duration = DURATION[step](flight);
    if (time < duration) break;
    time -= duration;
    step = NEXT[step];
  }
  return { ...flight, step, time };
}

function rotorAt(flight: Flight): number {
  const { step, time, running } = flight;
  switch (step) {
    case "inbound":
    case "pickup":
    case "outbound":
      return 1;
    case "spinDown":
      return (1 - Math.min(1, time / SPIN_DOWN_SECONDS)) ** 2;
    case "spinUp":
      return running ? 1 : Math.min(1, time / SPIN_UP_SECONDS) ** 2;
    case "leaving":
    case "boarding":
      return running ? 1 : 0;
    default:
      return 0;
  }
}

function figureOnPath(path: readonly Point[], seconds: number): DeckFigurePose {
  const stride = seconds * WALK_SPEED;
  const { x, z, yaw } = pathPose(path, stride);
  return { x, z, yaw, stride };
}

/** O que o roteiro desenha neste instante do voo. */
export function flightFrame(flight: Flight): FlightFrame {
  const { step, time } = flight;
  let helicopter: HelicopterPose | null = PARKED_POSE;
  if (step === "inbound" || step === "pickup") helicopter = inboundPose(time);
  else if (step === "outbound") helicopter = outboundPose(time);
  // Depois de subir para a mesa ele fica pousado; depois de sair, já não há o que desenhar.
  else if (step === "away") helicopter = null;
  let figure: DeckFigurePose | null = null;
  if (step === "disembark") figure = figureOnPath(DECK_WALK, time);
  else if (step === "boarding") figure = figureOnPath(DECK_BOARD, time);
  return { status: STATUS[step], helicopter, rotor: rotorAt(flight), figure };
}

/** O que os outros componentes leem do roteiro, fora do React: muda a cada quadro. */
export const helipadRuntime = {
  step: null as FlightStep | null,
  parked: false,
  helicopter: null as HelicopterPose | null,
  rotor: 0,
  figure: null as DeckFigurePose | null,
};
