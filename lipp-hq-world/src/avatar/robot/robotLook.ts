/**
 * Aparência dos robôs: cor do corpo e expressão, por bot. O id, o nome e o estado do bot
 * continuam vindo da frota; aqui só o que é visual. Não importa three.
 */

export const ROBOT_EXPRESSIONS = ["neutral", "Surprised", "Sad", "Angry"] as const;
export type RobotExpression = (typeof ROBOT_EXPRESSIONS)[number];

/** Só os três morphs que o arquivo tem; "neutral" é nenhum deles ligado. */
export const ROBOT_EXPRESSION_LABEL: Record<RobotExpression, string> = {
  neutral: "Neutra",
  Surprised: "Surpresa",
  Sad: "Triste",
  Angry: "Brava",
};

export const ROBOT_BODY_PALETTE = ["#ca9337", "#2563eb", "#f97316", "#22c55e", "#a855f7", "#ec4899", "#f59e0b", "#7a8087", "#a83232"] as const;

export interface RobotLook {
  body: string;
  expression: RobotExpression;
}

export const ROBOT_STORAGE_KEY = "hq.robos.v1";
const SCHEMA = 1;
const HEX = /^#[0-9a-f]{6}$/;

export type RobotLooks = Record<string, Partial<RobotLook>>;
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** A cor do bot é a identidade dele nas etiquetas e nos painéis: é o padrão do corpo. */
export function lookFor(botColor: string, saved?: Partial<RobotLook>): RobotLook {
  return {
    body: saved?.body && HEX.test(saved.body) ? saved.body : botColor,
    expression: saved?.expression && ROBOT_EXPRESSIONS.includes(saved.expression) ? saved.expression : "neutral",
  };
}

/** Dado ruim volta ao padrão, sem aviso: é só a cor de um robô, e o padrão é seguro. */
export function loadRobotLooks(storage: StorageLike | null): RobotLooks {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(ROBOT_STORAGE_KEY) ?? "null") as { schema?: unknown; looks?: unknown } | null;
    if (parsed?.schema !== SCHEMA || typeof parsed.looks !== "object" || parsed.looks === null) return {};
    const looks: RobotLooks = {};
    for (const [id, value] of Object.entries(parsed.looks as Record<string, unknown>)) {
      if (typeof value !== "object" || value === null) continue;
      const { body, expression } = value as Partial<RobotLook>;
      const look: Partial<RobotLook> = {};
      if (typeof body === "string" && HEX.test(body)) look.body = body;
      if (expression && ROBOT_EXPRESSIONS.includes(expression)) look.expression = expression;
      looks[id] = look;
    }
    return looks;
  } catch {
    return {};
  }
}

export function saveRobotLooks(storage: StorageLike | null, looks: RobotLooks): boolean {
  if (!storage) return false;
  try {
    storage.setItem(ROBOT_STORAGE_KEY, JSON.stringify({ schema: SCHEMA, looks }));
    return true;
  } catch {
    return false;
  }
}
