import { describe, expect, it } from "vitest";
import { demoSceneAgents, overflowCount, sceneAgentsFromFleet } from "@/world/characters/sceneAgents";
import type { FleetSnapshot } from "@/integrations/hq/types";

function fleetOf(bots: Array<{ id: string; name?: string; state?: "working" | "idle" }>): FleetSnapshot {
  return {
    source: "hermes",
    fetchedAt: 0,
    health: { api: "online", dashboard: "online" },
    bots: bots.map((bot) => ({
      id: bot.id,
      name: bot.name ?? bot.id,
      state: bot.state ?? "idle",
      sessionCount: 0,
      activeSessions: 0,
      routineCount: 0,
    })),
  };
}

describe("agentes da cena a partir da frota", () => {
  it("sem frota devolve lista vazia (a cena decide o fallback de demo)", () => {
    expect(sceneAgentsFromFleet(null)).toEqual([]);
    expect(sceneAgentsFromFleet(fleetOf([]))).toEqual([]);
  });

  it("bot conhecido herda sala, cor e papel do agente Lipp", () => {
    const [pulse] = sceneAgentsFromFleet(fleetOf([{ id: "pulse" }]));
    expect(pulse.roomId).toBe("engenharia");
    expect(pulse.color).toBe("#3b82f6");
    expect(pulse.live).toBe(true);
    expect(pulse.presetId).toBeTruthy();
  });

  it("bots desconhecidos recebem salas distintas e cor da paleta", () => {
    const agents = sceneAgentsFromFleet(fleetOf([{ id: "novo-a" }, { id: "novo-b" }, { id: "novo-c" }]));
    const rooms = agents.map((agent) => agent.roomId);
    expect(new Set(rooms).size).toBe(3);
    expect(agents.every((agent) => agent.live)).toBe(true);
  });

  it("bot que excede os postos vai para o hall e conta como excedente", () => {
    const agents = sceneAgentsFromFleet(
      fleetOf(Array.from({ length: 9 }, (_, index) => ({ id: `bot-${index}` }))),
    );
    expect(agents).toHaveLength(9);
    expect(overflowCount(agents)).toBe(2);
  });

  it("demo mantém exatamente os 7 agentes Lipp", () => {
    const demo = demoSceneAgents();
    expect(demo).toHaveLength(7);
    expect(demo.every((agent) => agent.live === false)).toBe(true);
  });
});
