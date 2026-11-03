import { describe, expect, it } from "vitest";
import { routineHealth, routineStatusText, routineTotals, routinesByBot } from "@/components/hud/routines";
import { botsFromHermes } from "@/integrations/hermes/botsFromHermes";
import type { BotSnapshot, RoutineSnapshot } from "@/integrations/hq/types";

const routine = (patch: Partial<RoutineSnapshot>): RoutineSnapshot => ({
  id: patch.id ?? "r1",
  name: patch.name ?? "Rotina",
  ...patch,
});

const bot = (id: string, routines: RoutineSnapshot[]): BotSnapshot => ({
  id,
  name: id,
  state: "working",
  sessionCount: 0,
  activeSessions: 0,
  routineCount: routines.length,
  routines,
});

describe("saúde das rotinas", () => {
  it("traduz os status crus do Hermes sem inventar", () => {
    expect(routineHealth(routine({ lastStatus: "ok" }))).toBe("ok");
    expect(routineHealth(routine({ lastStatus: "error" }))).toBe("failed");
    expect(routineHealth(routine({ lastStatus: "delivery_failed" }))).toBe("delivery");
    expect(routineHealth(routine({ lastStatus: "cancelled" }))).toBe("cancelled");
    expect(routineHealth(routine({ lastStatus: "delivery_queued" }))).toBe("running");
    expect(routineHealth(routine({}))).toBe("unknown");
  });

  it("status desconhecido aparece cru em vez de virar 'ok'", () => {
    const weird = routine({ lastStatus: "quota_exceeded" });
    expect(routineHealth(weird)).toBe("unknown");
    expect(routineStatusText(weird)).toBe("quota_exceeded");
    expect(routineStatusText(routine({}))).toBe("sem execução");
  });

  it("bot com falha vem antes e a falha vem antes do resto", () => {
    const groups = routinesByBot(
      [
        bot("ok-bot", [routine({ id: "a", lastStatus: "ok", nextAt: 10 })]),
        bot("failed-bot", [
          routine({ id: "b", lastStatus: "ok", nextAt: 5 }),
          routine({ id: "c", lastStatus: "error", nextAt: 99 }),
        ]),
      ],
      { "failed-bot": "#f97316" },
    );

    expect(groups.map((group) => group.botId)).toEqual(["failed-bot", "ok-bot"]);
    expect(groups[0].routines[0].id).toBe("c");
    expect(groups[0].botColor).toBe("#f97316");
  });

  it("soma total, falhas e pausadas com honestidade", () => {
    const totals = routineTotals([
      bot("a", [routine({ id: "1", lastStatus: "ok" }), routine({ id: "2", lastStatus: "delivery_failed" })]),
      bot("b", [routine({ id: "3", paused: true }), routine({ id: "4", enabled: false })]),
    ]);
    expect(totals).toEqual({ total: 4, failed: 1, paused: 2 });
  });

  it("bot sem rotinas não aparece na agenda", () => {
    expect(routinesByBot([bot("a", [])])).toEqual([]);
  });
});

describe("campos de rotina vindos do Hermes", () => {
  const build = (job: Record<string, unknown>) =>
    botsFromHermes({
      now: Date.now(),
      health: { api: "online", dashboard: "online" },
      profiles: [{ name: "argos", display_name: "Argos" }],
      sessions: [],
      jobs: [{ id: "j1", name: "Briefing diário", profile: "argos", ...job }] as never,
    })[0].routines?.[0];

  it("aceita next_run_at em ISO, que é como o Hermes grava", () => {
    const nextIso = new Date("2026-11-04T09:00:00.000Z").toISOString();
    const mapped = build({ next_run_at: nextIso, schedule_display: "0 9 * * *" });
    expect(mapped?.nextAt).toBe(Date.parse(nextIso));
    expect(mapped?.schedule).toBe("0 9 * * *");
  });

  it("aceita schedule como objeto, usando o display", () => {
    const mapped = build({ schedule: { kind: "cron", display: "todo dia às 9h" } });
    expect(mapped?.schedule).toBe("todo dia às 9h");
  });

  it("carrega status, erro e sequência de falhas", () => {
    const mapped = build({
      last_run_at: new Date("2026-11-03T10:00:00.000Z").toISOString(),
      last_status: "error",
      last_error: "timeout",
      failure_streak: 2,
      state: "paused",
    });
    expect(mapped).toMatchObject({
      lastAt: Date.parse("2026-11-03T10:00:00.000Z"),
      lastStatus: "error",
      lastError: "timeout",
      failureStreak: 2,
      paused: true,
    });
  });

  it("rotina pausada não conta como próxima execução", () => {
    const bots = botsFromHermes({
      now: Date.now(),
      health: { api: "online", dashboard: "online" },
      profiles: [{ name: "argos", display_name: "Argos" }],
      sessions: [],
      jobs: [
        { id: "j1", name: "Pausada", profile: "argos", paused: true, next_run_at: new Date().toISOString() },
      ] as never,
    });
    expect(bots[0].nextRoutineAt).toBeUndefined();
    expect(bots[0].routineCount).toBe(1);
  });
});
