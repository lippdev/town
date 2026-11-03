import { describe, expect, it } from "vitest";
import { matchesQuery, nextIndex, visibleBots } from "@/components/hud/fleetFilter";
import type { BotSnapshot } from "@/integrations/hq/types";

const bot = (over: Partial<BotSnapshot> & Pick<BotSnapshot, "id" | "name" | "state">): BotSnapshot => ({
  sessionCount: 0,
  activeSessions: 0,
  routineCount: 0,
  ...over,
});

const FLEET: BotSnapshot[] = [
  bot({ id: "argos", name: "Argos", title: "Direção geral", state: "meeting", briefing: { kind: "diario", title: "Briefing diário" }, lastActiveAt: 100 }),
  bot({ id: "pulse", name: "Pulse", title: "GitHub Intelligence", model: "hermes-4.1-mini", state: "working", lastActiveAt: 300 }),
  bot({ id: "echo", name: "Echo", title: "Comunidade", state: "waiting", lastActiveAt: 200 }),
  bot({ id: "ink", name: "Ink", title: "Conteúdo", state: "idle", lastActiveAt: 50 }),
];

describe("busca e filtro da frota", () => {
  it("busca ignora caixa e acento, e olha nome, título, modelo e id", () => {
    expect(matchesQuery(FLEET[0], "ARGOS")).toBe(true);
    expect(matchesQuery(FLEET[0], "direcao")).toBe(true);
    expect(matchesQuery(FLEET[1], "4.1-mini")).toBe(true);
    expect(matchesQuery(FLEET[1], "echo")).toBe(false);
    expect(matchesQuery(FLEET[1], "   ")).toBe(true);
  });

  it("filtros de estado respeitam briefing e ociosidade", () => {
    expect(visibleBots(FLEET, "", "briefing").map((b) => b.id)).toEqual(["argos"]);
    expect(visibleBots(FLEET, "", "trabalhando").map((b) => b.id)).toEqual(["pulse"]);
    expect(visibleBots(FLEET, "", "ociosos").map((b) => b.id)).toEqual(["ink"]);
    expect(visibleBots(FLEET, "", "todos")).toHaveLength(4);
  });

  it("ordena por urgência: briefing, trabalhando, aguardando, ocioso", () => {
    expect(visibleBots(FLEET, "", "todos").map((b) => b.id)).toEqual(["argos", "pulse", "echo", "ink"]);
  });

  it("combina busca com filtro", () => {
    expect(visibleBots(FLEET, "hermes", "todos").map((b) => b.id)).toEqual(["pulse"]);
    expect(visibleBots(FLEET, "hermes", "ociosos")).toEqual([]);
  });

  it("navegação por teclado dá a volta nas duas pontas", () => {
    expect(nextIndex(-1, 1, 4)).toBe(0);
    expect(nextIndex(3, 1, 4)).toBe(0);
    expect(nextIndex(0, -1, 4)).toBe(3);
    expect(nextIndex(-1, -1, 4)).toBe(3);
    expect(nextIndex(0, 1, 0)).toBe(-1);
  });
});
