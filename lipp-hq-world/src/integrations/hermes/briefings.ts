import type { AgentAnimationState } from "@/types/hq";

/**
 * Briefings: quando um bot está fazendo o briefing (diário, semanal ou
 * mensal) ele vai para a sala de reuniões.
 *
 * A detecção usa só evidência do Hermes: a sessão mais recente do bot precisa
 * (a) ter sido disparada por rotina (`source: "cron"`), (b) estar ativa agora,
 * e (c) ter título ou rotina que diga que é um briefing. Sem esses três, o bot
 * não vai para a reunião — nada de fingir reunião.
 */

export type BriefingKind = "diario" | "semanal" | "mensal" | "briefing";

export interface BriefingInfo {
  kind: BriefingKind;
  title: string;
  since?: number;
}

/** Janela em que uma sessão de briefing ainda conta como "acontecendo". */
export const BRIEFING_WINDOW_MS = 20 * 60 * 1000;

const KIND_PATTERNS: Array<{ kind: BriefingKind; pattern: RegExp }> = [
  { kind: "diario", pattern: /\b(di[áa]rio|diaria|di[áa]ria|daily)\b/i },
  { kind: "semanal", pattern: /\b(semanal|semana|weekly)\b/i },
  { kind: "mensal", pattern: /\b(mensal|m[êe]s|monthly)\b/i },
];

const BRIEFING_PATTERN = /\b(briefing|resumo|standup|alinhamento|sync)\b/i;

/** Classifica um texto (título de sessão ou nome de rotina) em tipo de briefing. */
export function classifyBriefing(text: string | null | undefined): BriefingKind | null {
  const value = (text ?? "").trim();
  if (!value) return null;
  const kind = KIND_PATTERNS.find((entry) => entry.pattern.test(value));
  if (kind) return kind.kind;
  if (BRIEFING_PATTERN.test(value)) return "briefing";
  return null;
}

export interface BriefingSessionLike {
  title?: string | null;
  preview?: string | null;
  source?: string | null;
  last_active?: number | null;
  started_at?: number | null;
}

export interface BriefingJobLike {
  name?: string | null;
}

/**
 * Decide se a sessão mais recente do bot é um briefing em andamento.
 * `jobNames` são as rotinas do bot: se a sessão for de cron mas o título não
 * disser o tipo, uma rotina de briefing do bot fecha a classificação.
 */
export function detectBriefing(
  latestSession: BriefingSessionLike | undefined,
  jobNames: string[],
  now: number,
): BriefingInfo | null {
  if (!latestSession) return null;
  if ((latestSession.source ?? "").toLowerCase() !== "cron") return null;

  const lastActivity = (latestSession.last_active ?? latestSession.started_at) ?? 0;
  const startedAt = (latestSession.started_at ?? latestSession.last_active) ?? 0;
  if (!lastActivity || !startedAt) return null;
  if (now - lastActivity * 1000 > BRIEFING_WINDOW_MS) return null;
  const startedAtMs = startedAt * 1000;

  const fromSession =
    classifyBriefing(latestSession.title) ?? classifyBriefing(latestSession.preview);
  const fromJobs = jobNames.map((name) => classifyBriefing(name)).find((kind) => kind !== null) ?? null;
  const kind = fromSession ?? fromJobs;
  if (!kind) return null;

  const title = (latestSession.title ?? "").trim() || `Briefing ${kind}`;
  return { kind, title, since: startedAtMs };
}

/** Rótulo humano do tipo de briefing (usado na cena e no HUD). */
export function briefingLabel(kind: BriefingKind): string {
  switch (kind) {
    case "diario":
      return "Briefing diário";
    case "semanal":
      return "Briefing semanal";
    case "mensal":
      return "Briefing mensal";
    default:
      return "Briefing";
  }
}

/** Estado de cena: em briefing o bot está em reunião. */
export function briefingState(info: BriefingInfo | null): AgentAnimationState | null {
  return info ? "meeting" : null;
}
