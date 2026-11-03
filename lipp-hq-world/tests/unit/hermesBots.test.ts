import { describe, expect, it } from "vitest";
import { fleetCounts, gatewayNotice, relativeTime } from "@/components/hud/fleetView";
import {
  ACTIVE_SESSION_WINDOW_MS,
  SESSION_PREVIEW_LIMIT,
  WORKING_WINDOW_MS,
  botsFromHermes,
  gatewayStateOf,
} from "@/integrations/hermes/botsFromHermes";

const NOW = 1_790_000_000_000;
const seconds = (ms: number) => ms / 1000;

describe("mapeamento frota Hermes", () => {
  it("agrupa sessões por profile e calcula atividade real", () => {
    const bots = botsFromHermes({
      now: NOW,
      health: { api: "online", dashboard: "online" },
      profiles: [
        { name: "argos", display_name: "Argos", bot_title: "Direção", model: "hermes-4.1" },
        { name: "pulse", display_name: "Pulse", model: "hermes-4.1-mini" },
      ],
      sessions: [
        { id: "s1", profile: "argos", title: "Revisar roadmap", last_active: seconds(NOW - 30_000), ended_at: null },
        { id: "s2", profile: "argos", title: "Sessão antiga", last_active: seconds(NOW - 3 * 60 * 60 * 1000), ended_at: null },
        { id: "s3", profile: "pulse", title: "Triagem de PRs", last_active: seconds(NOW - 2 * 60 * 60 * 1000), ended_at: null },
      ],
      jobs: [{ id: "j1", name: "Rotina", profile: "pulse", enabled: true, next_run: seconds(NOW + 60_000) }],
    });

    expect(bots.map((bot) => bot.id)).toEqual(["argos", "pulse"]);
    const argos = bots[0];
    expect(argos.name).toBe("Argos");
    expect(argos.state).toBe("working");
    expect(argos.activity).toBe("Revisar roadmap");
    expect(argos.sessionCount).toBe(2);
    expect(argos.activeSessions).toBe(1);

    const pulse = bots[1];
    expect(pulse.state).toBe("idle");
    expect(pulse.routineCount).toBe(1);
    expect(pulse.nextRoutineAt).toBe(NOW + 60_000);
  });

  it("bot sem sessão continua na frota como idle, sem atividade inventada", () => {
    const [bot] = botsFromHermes({
      now: NOW,
      health: { api: "online", dashboard: "online" },
      profiles: [{ name: "ink", display_name: "Ink" }],
      sessions: [],
      jobs: [],
    });
    expect(bot.id).toBe("ink");
    expect(bot.state).toBe("idle");
    expect(bot.activity).toBeUndefined();
    expect(bot.lastActiveAt).toBeUndefined();
    expect(bot.sessionCount).toBe(0);
  });

  it("sessão aberta e recente que não escreveu agora conta como waiting", () => {
    const [bot] = botsFromHermes({
      now: NOW,
      health: { api: "online", dashboard: "online" },
      profiles: [{ name: "forge" }],
      sessions: [
        {
          id: "s1",
          profile: "forge",
          last_active: seconds(NOW - WORKING_WINDOW_MS - 1_000),
          ended_at: null,
        },
      ],
      jobs: [],
    });
    expect(bot.state).toBe("waiting");
    expect(ACTIVE_SESSION_WINDOW_MS).toBeGreaterThan(WORKING_WINDOW_MS);
  });

  it("sem dashboard, nomeia bots a partir das sessões em vez de sumir", () => {
    const bots = botsFromHermes({
      now: NOW,
      health: { api: "online", dashboard: "offline" },
      profiles: [],
      sessions: [
        { id: "s1", profile: "scout", title: "Varrer oportunidades", last_active: seconds(NOW - 5_000), ended_at: null },
      ],
      jobs: [],
    });
    expect(bots).toHaveLength(1);
    expect(bots[0].id).toBe("scout");
    expect(bots[0].name).toBe("scout");
  });

  it("rotina pausada/desabilitada não conta como próxima execução", () => {
    const [bot] = botsFromHermes({
      now: NOW,
      health: { api: "online", dashboard: "online" },
      profiles: [{ name: "atlas" }],
      sessions: [],
      jobs: [
        { id: "j1", profile: "atlas", enabled: false, next_run: seconds(NOW + 1000) },
        { id: "j2", profile: "atlas", enabled: true, paused: true, next_run: seconds(NOW + 2000) },
        { id: "j3", profile: "atlas", enabled: true, next_run: seconds(NOW + 9000) },
      ],
    });
    expect(bot.routineCount).toBe(3);
    expect(bot.nextRoutineAt).toBe(NOW + 9_000);
  });

  it("gatewayStateOf distingue alcance de dados", () => {
    expect(gatewayStateOf(false, false)).toBe("offline");
    expect(gatewayStateOf(true, false)).toBe("degraded");
    expect(gatewayStateOf(true, true)).toBe("online");
  });
});

describe("helpers de visão da frota", () => {
  it("relativeTime cobre agora, minutos, horas e dias", () => {
    const now = 1_000_000_000_000;
    expect(relativeTime(now - 10_000, now)).toBe("agora");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 min");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3 h");
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe("2 d");
    expect(relativeTime(undefined, now)).toBe("sem sinal");
  });

  it("gatewayNotice distingue offline, dashboard fora e degradado", () => {
    const base = { source: "hermes" as const, fetchedAt: 0, bots: [] };
    expect(gatewayNotice(null)).toContain("Lendo");
    expect(
      gatewayNotice({ ...base, health: { api: "offline", dashboard: "offline", detail: "ECONNREFUSED" } }),
    ).toContain("ECONNREFUSED");
    expect(gatewayNotice({ ...base, health: { api: "online", dashboard: "offline" } })).toContain("Dashboard");
    expect(gatewayNotice({ ...base, health: { api: "online", dashboard: "degraded" } })).toContain("parcial");
    expect(gatewayNotice({ ...base, health: { api: "online", dashboard: "online" } })).toBeNull();
  });

  it("fleetCounts soma estados e totais reais", () => {
    const counts = fleetCounts({
      source: "hermes",
      fetchedAt: 0,
      health: { api: "online", dashboard: "online" },
      bots: [
        { id: "a", name: "A", state: "working", sessionCount: 2, activeSessions: 1, routineCount: 1 },
        { id: "b", name: "B", state: "waiting", sessionCount: 3, activeSessions: 1, routineCount: 0 },
        { id: "c", name: "C", state: "idle", sessionCount: 1, activeSessions: 0, routineCount: 2 },
      ],
    });
    expect(counts).toEqual({ total: 3, working: 1, waiting: 1, idle: 1, sessions: 6, routines: 3 });
  });
});

describe("sessões no contrato da cena", () => {
  const build = (sessions: Array<Record<string, unknown>>) =>
    botsFromHermes({
      now: NOW,
      health: { api: "online", dashboard: "online" },
      profiles: [{ name: "argos", display_name: "Argos" }],
      sessions: sessions as never,
      jobs: [],
    })[0];

  it("mapeia id, título, origem e janela de atividade", () => {
    const argos = build([
      { id: "s1", profile: "argos", title: "Revisar roadmap", source: "cli", last_active: seconds(NOW - 20_000), message_count: 9 },
      { id: "s2", profile: "argos", title: "Briefing diário", source: "cron", last_active: seconds(NOW - 6 * 60 * 1000), message_count: 4 },
    ]);

    const [recent, older] = argos.sessions ?? [];
    expect(recent).toMatchObject({ id: "s1", title: "Revisar roadmap", source: "cli", messageCount: 9, active: true });
    expect(older).toMatchObject({ source: "cron", active: false });
    expect(argos.sessionCount).toBe(2);
  });

  it("sessão encerrada nunca conta como ativa, mesmo com last_active agora", () => {
    const argos = build([
      { id: "s1", profile: "argos", ended_at: seconds(NOW - 1000), last_active: seconds(NOW - 10_000) },
    ]);
    expect(argos.sessions?.[0].active).toBe(false);
    expect(argos.activeSessions).toBe(0);
  });

  it("ordena por recência e corta a janela sem perder o total", () => {
    const many = Array.from({ length: SESSION_PREVIEW_LIMIT + 4 }, (_, index) => ({
      id: `s${index}`,
      profile: "argos",
      last_active: seconds(NOW - index * 60_000),
    }));
    const argos = build([...many].reverse());
    expect(argos.sessions).toHaveLength(SESSION_PREVIEW_LIMIT);
    expect(argos.sessions?.[0].id).toBe("s0");
    expect(argos.sessionCount).toBe(SESSION_PREVIEW_LIMIT + 4);
  });

  it("campo ausente fica indefinido em vez de virar número inventado", () => {
    const argos = build([{ id: "s1", profile: "argos" }]);
    const session = argos.sessions?.[0];
    expect(session?.title).toBeUndefined();
    expect(session?.source).toBeUndefined();
    expect(session?.messageCount).toBeUndefined();
    expect(session?.active).toBe(false);
  });
});
