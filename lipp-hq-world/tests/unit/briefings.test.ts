import { describe, expect, it } from "vitest";
import {
  BRIEFING_WINDOW_MS,
  briefingLabel,
  briefingState,
  classifyBriefing,
  detectBriefing,
} from "@/integrations/hermes/briefings";
import { botsFromHermes } from "@/integrations/hermes/botsFromHermes";

const NOW = 1_790_000_000_000;
const seconds = (ms: number) => ms / 1000;

describe("detecção de briefing", () => {
  it("classifica diário, semanal, mensal e briefing genérico", () => {
    expect(classifyBriefing("Briefing diário")).toBe("diario");
    expect(classifyBriefing("Resumo semanal do time")).toBe("semanal");
    expect(classifyBriefing("Fechamento mensal")).toBe("mensal");
    expect(classifyBriefing("Briefing da operação")).toBe("briefing");
    expect(classifyBriefing("Triagem de pull requests")).toBeNull();
    expect(classifyBriefing(null)).toBeNull();
  });

  it("só detecta com sessão de cron, recente e com cara de briefing", () => {
    const recent = { source: "cron", title: "Briefing diário", last_active: seconds(NOW - 60_000) };
    expect(detectBriefing(recent, [], NOW)?.kind).toBe("diario");

    expect(detectBriefing({ ...recent, source: "telegram" }, [], NOW)).toBeNull();
    expect(
      detectBriefing({ ...recent, last_active: seconds(NOW - BRIEFING_WINDOW_MS - 1000) }, [], NOW),
    ).toBeNull();
    expect(detectBriefing({ ...recent, title: "Triagem de PRs" }, [], NOW)).toBeNull();
  });

  it("rotina de briefing classifica a sessão quando o título não diz o tipo", () => {
    const info = detectBriefing(
      { source: "cron", title: "Rotina de Argos", last_active: seconds(NOW - 30_000) },
      ["Briefing semanal"],
      NOW,
    );
    expect(info?.kind).toBe("semanal");
  });

  it("rótulos e estado de cena", () => {
    expect(briefingLabel("diario")).toBe("Briefing diário");
    expect(briefingLabel("mensal")).toBe("Briefing mensal");
    expect(briefingState({ kind: "diario", title: "x" })).toBe("meeting");
    expect(briefingState(null)).toBeNull();
  });
});

describe("frota leva briefing para a reunião", () => {
  it("bot em briefing fica em 'meeting' e carrega rotinas para o HUD", () => {
    const bots = botsFromHermes({
      now: NOW,
      health: { api: "online", dashboard: "online" },
      profiles: [{ name: "argos", display_name: "Argos" }],
      sessions: [
        {
          id: "s1",
          profile: "argos",
          source: "cron",
          title: "Briefing diário",
          last_active: seconds(NOW - 20_000),
          ended_at: null,
        },
      ],
      jobs: [{ id: "j1", profile: "argos", name: "Briefing diário", schedule: "0 9 * * *", enabled: true }],
    });

    expect(bots[0].state).toBe("meeting");
    expect(bots[0].briefing?.kind).toBe("diario");
    expect(bots[0].routines).toHaveLength(1);
    expect(bots[0].routines?.[0].name).toBe("Briefing diário");
  });

  it("sessão comum não vira reunião", () => {
    const bots = botsFromHermes({
      now: NOW,
      health: { api: "online", dashboard: "online" },
      profiles: [{ name: "pulse" }],
      sessions: [
        { id: "s2", profile: "pulse", source: "local", title: "Triagem de pull requests", last_active: seconds(NOW - 10_000), ended_at: null },
      ],
      jobs: [],
    });
    expect(bots[0].state).toBe("working");
    expect(bots[0].briefing).toBeUndefined();
  });
});
