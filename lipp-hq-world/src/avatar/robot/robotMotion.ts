import type { RobotExpression } from "./robotLook";

/**
 * Jeito de cada robô se mexer na sidebar. É só personalidade visual: não diz nada sobre o
 * estado do bot. Cada nome tem as animações correspondentes em `office.css`.
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
