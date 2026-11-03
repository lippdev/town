import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  MIN_SAMPLES_TO_DRAW,
  pushSample,
  sampleFromBots,
  sparklinePath,
  trend,
  type FleetSample,
} from "@/integrations/hermes/fleetHistory";
import type { BotSnapshot } from "@/integrations/hq/types";

const bot = (over: Partial<BotSnapshot> & Pick<BotSnapshot, "id" | "state">): BotSnapshot => ({
  name: over.id,
  sessionCount: 0,
  activeSessions: 0,
  routineCount: 0,
  ...over,
});

describe("histórico da frota", () => {
  it("conta cada estado e trata briefing como reunião", () => {
    const sample = sampleFromBots(
      [
        bot({ id: "a", state: "working" }),
        bot({ id: "b", state: "waiting" }),
        bot({ id: "c", state: "meeting", briefing: { kind: "diario", title: "Briefing diário" } }),
        bot({ id: "d", state: "idle" }),
      ],
      1000,
    );
    expect(sample).toEqual({ at: 1000, working: 1, waiting: 1, briefing: 1, idle: 1 });
  });

  it("mantém só as amostras mais recentes", () => {
    let history: FleetSample[] = [];
    for (let index = 0; index < HISTORY_LIMIT + 10; index += 1) {
      history = pushSample(history, { at: index, working: 0, waiting: 0, briefing: 0, idle: 0 });
    }
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[history.length - 1].at).toBe(HISTORY_LIMIT + 9);
  });

  it("não desenha linha com menos de três amostras", () => {
    const two: FleetSample[] = [
      { at: 1, working: 1, waiting: 0, briefing: 0, idle: 0 },
      { at: 2, working: 2, waiting: 0, briefing: 0, idle: 0 },
    ];
    expect(sparklinePath(two, (s) => s.working, 100, 20)).toBe("");
    expect(MIN_SAMPLES_TO_DRAW).toBe(3);
  });

  it("gera caminho normalizado pela maior amostra", () => {
    const samples: FleetSample[] = [
      { at: 1, working: 0, waiting: 0, briefing: 0, idle: 0 },
      { at: 2, working: 2, waiting: 0, briefing: 0, idle: 0 },
      { at: 3, working: 4, waiting: 0, briefing: 0, idle: 0 },
    ];
    const path = sparklinePath(samples, (s) => s.working, 100, 20);
    expect(path.startsWith("M0,20")).toBe(true);
    expect(path).toContain("L50,10");
    expect(path.endsWith("L100,0")).toBe(true);
  });

  it("calcula a variação do período", () => {
    const samples: FleetSample[] = [
      { at: 1, working: 1, waiting: 0, briefing: 0, idle: 0 },
      { at: 2, working: 3, waiting: 0, briefing: 0, idle: 0 },
    ];
    expect(trend(samples, (s) => s.working)).toBe(2);
    expect(trend([], (s) => s.working)).toBe(0);
  });
});
