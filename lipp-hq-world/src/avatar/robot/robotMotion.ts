import type { RobotExpression } from "./robotLook";

/**
 * Jeito de cada robô se mexer na sidebar. É só personalidade visual: não diz nada sobre o
 * estado do bot. Os movimentos são funções contínuas do tempo, sem quadros-chave: é isso que
 * permite começar e terminar suavemente, de qualquer ponto.
 */
export const ROBOT_MOTIONS = ["vigia", "impaciente", "batida", "balanco", "espiar", "aceno", "rabisco"] as const;
export type RobotMotion = (typeof ROBOT_MOTIONS)[number];

const MOTION_BY_BOT: Record<string, RobotMotion> = {
  argos: "vigia",
  forge: "impaciente",
  pulse: "batida",
  echo: "balanco",
  scout: "espiar",
  atlas: "aceno",
  ink: "rabisco",
};

const REACTION_BY_MOTION: Record<RobotMotion, RobotExpression> = {
  vigia: "Angry",
  impaciente: "Angry",
  batida: "Surprised",
  balanco: "Surprised",
  espiar: "Surprised",
  aceno: "Surprised",
  rabisco: "Sad",
};

/** Bots da frota real com outros nomes ganham um jeito estável, derivado do id. */
export function robotMotionFor(botId: string): RobotMotion {
  const known = MOTION_BY_BOT[botId];
  if (known) return known;
  let hash = 0;
  for (const char of botId) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return ROBOT_MOTIONS[hash % ROBOT_MOTIONS.length]!;
}

/** A expressão do clique sempre muda o rosto, mesmo em quem já tem aquela expressão salva. */
export function robotReactionFor(botId: string, saved: RobotExpression): RobotExpression {
  const reaction = REACTION_BY_MOTION[robotMotionFor(botId)];
  if (reaction !== saved) return reaction;
  return saved === "Surprised" ? "Angry" : "Surprised";
}

/** Quadros da tira: a cabeça virando de um lado ao outro, depois o rosto mudando para a reação. */
export const YAW_FRAMES = 9;
export const REACTION_FRAMES = 4;
export const PORTRAIT_FRAMES = YAW_FRAMES + REACTION_FRAMES;
export const REST_FRAME = (YAW_FRAMES - 1) / 2;

/** Quadro da tira para uma virada (-1 a 1) e um rosto (0 é o normal, 1 é a reação completa). */
export function portraitFrame(yaw: number, face: number): number {
  if (face > 0.08) return YAW_FRAMES + Math.min(REACTION_FRAMES - 1, Math.floor(face * REACTION_FRAMES));
  const clamped = Math.max(-1, Math.min(1, yaw));
  return Math.round(((clamped + 1) / 2) * (YAW_FRAMES - 1));
}

export interface RobotPose {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  yaw: number;
  face: number;
}

export const REST_POSE: RobotPose = { x: 0, y: 0, rotate: 0, scale: 1, yaw: 0, face: 0 };

const TAU = Math.PI * 2;
const wave = (seconds: number, period: number) => Math.sin((TAU * seconds) / period);
const bump = (value: number, center: number, width: number) => Math.exp(-(((value - center) / width) ** 2));

/** Movimento contínuo enquanto o mouse está em cima. Todos saem do repouso já em movimento. */
const HOVER: Record<RobotMotion, (t: number) => Partial<RobotPose>> = {
  // Argos varre a sala devagar.
  vigia: (t) => ({ yaw: wave(t, 2.8), x: wave(t, 2.8) * 1.6, rotate: wave(t, 2.8) * 2.5, y: wave(t, 1.4) * -0.8 }),
  // Forge tremelica com pressa, em ondas.
  impaciente: (t) => {
    const strength = 0.65 + 0.35 * Math.cos((TAU * t) / 1.4);
    return { x: wave(t, 0.34) * 1.8 * strength, yaw: wave(t, 0.34) * 0.4 * strength };
  },
  // Pulse bate como um coração, em duas pancadas.
  batida: (t) => {
    const beat = t % 1;
    return { scale: 1 + 0.17 * bump(beat, 0.1, 0.075) + 0.1 * bump(beat, 0.34, 0.075) };
  },
  // Echo balança a cabeça.
  balanco: (t) => ({ rotate: wave(t, 1.7) * 11, yaw: wave(t, 1.7) * 0.7, y: Math.abs(wave(t, 1.7)) * -1 }),
  // Scout se inclina para espiar cada lado.
  espiar: (t) => ({ x: wave(t, 2.2) * 4, yaw: wave(t, 2.2), rotate: wave(t, 2.2) * 3 }),
  // Atlas confirma com a cabeça.
  aceno: (t) => ({ y: Math.abs(wave(t, 1.3)) * 3.5, scale: 1 - Math.abs(wave(t, 1.3)) * 0.03 }),
  // Ink se agita em zigue-zague.
  rabisco: (t) => ({
    x: wave(t, 0.8) * 1.8 + wave(t, 0.37) * 0.7,
    y: Math.cos((TAU * t) / 0.55) * 1 - 1,
    rotate: wave(t, 0.65) * 6,
    yaw: wave(t, 0.5) * 0.7,
  }),
};

/** Duração da reação ao clique, em milissegundos. */
export const REACTION_MS: Record<RobotMotion, number> = {
  vigia: 620,
  impaciente: 620,
  batida: 700,
  balanco: 820,
  espiar: 720,
  aceno: 760,
  rabisco: 860,
};

const easeInOut = (value: number) => (value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2);

/** Sobe rápido e volta aos poucos: o rosto muda logo, sem cortar no fim. */
export function reactionStrength(progress: number): number {
  const rise = Math.min(1, progress / 0.14);
  const fall = Math.min(1, (1 - progress) / 0.3);
  return easeInOut(Math.max(0, Math.min(rise, fall)));
}

/** Reação ao clique. `progress` vai de 0 a 1 e começa e termina no repouso. */
const REACTION: Record<RobotMotion, (p: number) => Partial<RobotPose>> = {
  vigia: (p) => ({ y: Math.sin(p * Math.PI * 3) * 2.4 * (1 - p) }),
  impaciente: (p) => ({ x: Math.sin(p * Math.PI * 5) * 3.2 * (1 - p) }),
  batida: (p) => ({ y: Math.sin(p * Math.PI) * -9, scale: 1 + Math.sin(p * Math.PI * 2) * 0.05 }),
  balanco: (p) => ({ rotate: easeInOut(p) * 360 }),
  espiar: (p) => ({ scale: 1 + Math.sin(p * Math.PI) * 0.28 }),
  aceno: (p) => ({ y: Math.abs(Math.sin(p * Math.PI * 2)) * -6 * (1 - p * 0.4) }),
  rabisco: (p) => ({ y: Math.sin(p * Math.PI) * 4.5, scale: 1 - Math.sin(p * Math.PI) * 0.14 }),
};

/**
 * A pose do robô neste instante. `hover` (0 a 1) é o quanto o movimento contínuo está ligado e
 * `reaction` é o progresso do clique, ou null. Durante a reação, o movimento contínuo cede lugar.
 */
export function robotPose(motion: RobotMotion, seconds: number, hover: number, reaction: number | null): RobotPose {
  const strength = reaction === null ? 0 : reactionStrength(reaction);
  const continuous = HOVER[motion](seconds);
  const pop = reaction === null ? {} : REACTION[motion](reaction);
  const weight = hover * (1 - strength);
  return {
    x: (continuous.x ?? 0) * weight + (pop.x ?? 0),
    y: (continuous.y ?? 0) * weight + (pop.y ?? 0),
    rotate: (continuous.rotate ?? 0) * weight + (pop.rotate ?? 0),
    scale: 1 + ((continuous.scale ?? 1) - 1) * weight + ((pop.scale ?? 1) - 1),
    yaw: (continuous.yaw ?? 0) * weight,
    face: strength,
  };
}
