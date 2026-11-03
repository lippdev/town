import type { BotSnapshot, GatewayHealth, GatewayState, SessionSnapshot } from "@/integrations/hq/types";
import { detectBriefing } from "@/integrations/hermes/briefings";

/**
 * Mapeamento puro do que o Hermes expõe via gateway para a frota da cena.
 *
 * Fontes reais (ver docs/HERMES.md):
 * - `GET /api/profiles` → `{ profiles: [...] }` (metadados do bot)
 * - `GET /api/profiles/sessions?limit=…` → `{ sessions: [...], profile_totals }`
 *   onde cada linha traz `profile` (o bot dono da sessão)
 * - `GET /api/cron/jobs` → `{ jobs: [...] }` (rotinas de cada bot)
 *
 * Nada aqui inventa dado: campo ausente vira `undefined`, e a UI mostra
 * "sem sinal" em vez de preencher com valor fictício.
 */

export interface HermesProfile {
  name?: string;
  display_name?: string;
  bot_title?: string;
  description?: string;
  model?: string | null;
  provider?: string | null;
  is_default?: boolean;
  gateway_running?: boolean;
}

export interface HermesSessionRow {
  id?: string;
  profile?: string;
  source?: string | null;
  title?: string | null;
  preview?: string | null;
  started_at?: number | null;
  last_active?: number | null;
  ended_at?: number | null;
  message_count?: number | null;
  tool_call_count?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  estimated_cost_usd?: number | null;
  actual_cost_usd?: number | null;
  model?: string | null;
}

export interface HermesCronJob {
  id?: string;
  name?: string;
  schedule?: string | null;
  profile?: string | null;
  enabled?: boolean | null;
  next_run?: number | null;
  next_run_at?: number | null;
  paused?: boolean | null;
}

export interface HermesRawPayload {
  health: GatewayHealth;
  profiles: HermesProfile[];
  sessions: HermesSessionRow[];
  jobs: HermesCronJob[];
  now?: number;
}

/** Sessão "ativa" na definição do Hermes: aberta e vista nos últimos 5 min. */
export const ACTIVE_SESSION_WINDOW_MS = 5 * 60 * 1000;

/** Um bot é "trabalhando" quando escreveu nos últimos 90 s (regra do Bot Mode). */
export const WORKING_WINDOW_MS = 90 * 1000;

/**
 * Quantas sessões recentes cada bot carrega para o painel. O total continua em
 * `sessionCount`; isto é só a janela que a UI mostra.
 */
export const SESSION_PREVIEW_LIMIT = 6;

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function secondsToMs(value: number | null | undefined): number | undefined {
  const parsed = asNumber(value);
  return parsed === undefined ? undefined : parsed * 1000;
}

function normalizeName(value: string | undefined | null): string {
  return (value ?? "").trim();
}

/** Sessão do Hermes no contrato da cena, com a janela de atividade do Hermes. */
function toSessionSnapshot(session: HermesSessionRow, now: number, fallbackId: string): SessionSnapshot {
  const lastActiveAt = secondsToMs(session.last_active) ?? secondsToMs(session.started_at);
  const endedAt = secondsToMs(session.ended_at);
  const cost = asNumber(session.actual_cost_usd) ?? asNumber(session.estimated_cost_usd);
  return {
    id: normalizeName(session.id) || fallbackId,
    title: normalizeName(session.title ?? undefined) || undefined,
    preview: normalizeName(session.preview ?? undefined) || undefined,
    source: normalizeName(session.source ?? undefined) || undefined,
    model: normalizeName(session.model ?? undefined) || undefined,
    startedAt: secondsToMs(session.started_at),
    lastActiveAt,
    endedAt,
    messageCount: asNumber(session.message_count),
    toolCallCount: asNumber(session.tool_call_count),
    costUsd: cost,
    active: endedAt === undefined && lastActiveAt !== undefined && now - lastActiveAt < ACTIVE_SESSION_WINDOW_MS,
  };
}

function latestSession(sessions: HermesSessionRow[]): HermesSessionRow | undefined {
  let latest: HermesSessionRow | undefined;
  for (const session of sessions) {
    const at = secondsToMs(session.last_active) ?? secondsToMs(session.started_at) ?? 0;
    const latestAt = latest ? (secondsToMs(latest.last_active) ?? secondsToMs(latest.started_at) ?? 0) : -1;
    if (at > latestAt) latest = session;
  }
  return latest;
}

/** Texto de atividade real da sessão mais recente: título, senão prévia. */
function activityText(session: HermesSessionRow | undefined): string | undefined {
  if (!session) return undefined;
  const title = normalizeName(session.title);
  if (title) return title;
  const preview = normalizeName(session.preview);
  if (preview) return preview.length > 90 ? `${preview.slice(0, 87)}…` : preview;
  return undefined;
}

function botState(lastActiveAt: number | undefined, activeSessions: number, now: number): BotSnapshot["state"] {
  if (!lastActiveAt) return activeSessions > 0 ? "working" : "idle";
  const age = now - lastActiveAt;
  if (age <= WORKING_WINDOW_MS) return "working";
  if (activeSessions > 0) return "waiting";
  if (age > 24 * 60 * 60 * 1000) return "idle";
  return "idle";
}

/**
 * Constrói a frota. Perfis são a lista canônica de bots; sessões trazem a
 * atividade de cada um; rotinas trazem agendamentos. Um profile sem sessão
 * aparece como `idle`, nunca desaparece da cena (o bot existe mesmo parado).
 */
export function botsFromHermes(raw: HermesRawPayload): BotSnapshot[] {
  const now = raw.now ?? Date.now();
  const sessionsByProfile = new Map<string, HermesSessionRow[]>();

  for (const session of raw.sessions) {
    const profile = normalizeName(session.profile) || "default";
    const bucket = sessionsByProfile.get(profile);
    if (bucket) bucket.push(session);
    else sessionsByProfile.set(profile, [session]);
  }

  const jobsByProfile = new Map<string, HermesCronJob[]>();
  for (const job of raw.jobs) {
    const profile = normalizeName(job.profile) || "default";
    const bucket = jobsByProfile.get(profile);
    if (bucket) bucket.push(job);
    else jobsByProfile.set(profile, [job]);
  }

  const profiles: HermesProfile[] =
    raw.profiles.length > 0
      ? raw.profiles
      : // Sem dashboard, ainda conseguimos nomear os bots que têm sessão.
        [...sessionsByProfile.keys()].map((name) => ({ name }));

  const seen = new Set<string>();
  const bots: BotSnapshot[] = [];

  for (const profile of profiles) {
    const id = normalizeName(profile.name) || "default";
    if (seen.has(id)) continue;
    seen.add(id);

    const sessions = sessionsByProfile.get(id) ?? [];
    const jobs = jobsByProfile.get(id) ?? [];
    const latest = latestSession(sessions);
    const lastActiveAt = sessions.reduce<number | undefined>((max, session) => {
      const at = secondsToMs(session.last_active) ?? secondsToMs(session.started_at);
      if (at === undefined) return max;
      return max === undefined ? at : Math.max(max, at);
    }, undefined);

    const activeSessions = sessions.filter((session) => {
      if (session.ended_at) return false;
      const at = secondsToMs(session.last_active) ?? secondsToMs(session.started_at);
      return at !== undefined && now - at < ACTIVE_SESSION_WINDOW_MS;
    }).length;

    const nextRoutineAt = jobs.reduce<number | undefined>((min, job) => {
      if (job.enabled === false || job.paused === true) return min;
      const next = secondsToMs(job.next_run) ?? secondsToMs(job.next_run_at);
      if (next === undefined) return min;
      return min === undefined ? next : Math.min(min, next);
    }, undefined);

    const recentSessions = [...sessions]
      .sort((a, b) => (secondsToMs(b.last_active) ?? secondsToMs(b.started_at) ?? 0) - (secondsToMs(a.last_active) ?? secondsToMs(a.started_at) ?? 0))
      .slice(0, SESSION_PREVIEW_LIMIT)
      .map((session, position) => toSessionSnapshot(session, now, `${id}-session-${position}`));

    const model = normalizeName(profile.model ?? latest?.model ?? undefined);
    const jobNames = jobs.map((job) => normalizeName(job.name)).filter(Boolean);
    const briefing = detectBriefing(latest, jobNames, now) ?? undefined;

    const routines = jobs.map((job, position) => ({
      id: normalizeName(job.id) || `${id}-routine-${position}`,
      name: normalizeName(job.name) || "Rotina",
      schedule: normalizeName(job.schedule ?? undefined) || undefined,
      nextAt: secondsToMs(job.next_run) ?? secondsToMs(job.next_run_at),
    }));

    bots.push({
      id,
      name: normalizeName(profile.display_name) || normalizeName(profile.bot_title) || id,
      title: normalizeName(profile.bot_title) || undefined,
      description: normalizeName(profile.description) || undefined,
      model: model || undefined,
      provider: normalizeName(profile.provider ?? undefined) || undefined,
      state: briefing ? "meeting" : botState(lastActiveAt, activeSessions, now),
      activity: activityText(latest),
      lastActiveAt,
      sessionCount: sessions.length,
      activeSessions,
      routineCount: jobs.length,
      nextRoutineAt,
      briefing,
      routines,
      sessions: recentSessions,
      isDefault: profile.is_default === true,
      gatewayRunning: profile.gateway_running === true,
    });
  }

  // Ordem estável: quem trabalhou mais recentemente primeiro; empate por nome.
  return bots.sort((a, b) => {
    const diff = (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

export function gatewayStateOf(reachable: boolean, hasData: boolean): GatewayState {
  if (!reachable) return "offline";
  return hasData ? "online" : "degraded";
}
