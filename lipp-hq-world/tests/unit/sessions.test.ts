import { describe, expect, it } from "vitest";
import { activeSessionTotal, fleetSessions, sourceLabel } from "@/components/hud/sessions";
import type { BotSnapshot } from "@/integrations/hq/types";

const bot = (id: string, name: string, sessions: NonNullable<BotSnapshot["sessions"]>): BotSnapshot => ({
  id,
  name,
  state: "working",
  sessionCount: sessions.length,
  activeSessions: sessions.filter((session) => session.active).length,
  routineCount: 0,
  sessions,
});

describe("lista de sessões da frota", () => {
  it("traduz só as origens que ganham sentido em português", () => {
    expect(sourceLabel("cron")).toBe("rotina");
    expect(sourceLabel("cli")).toBe("terminal");
    expect(sourceLabel("subagent")).toBe("subagente");
    expect(sourceLabel("telegram")).toBe("telegram");
    expect(sourceLabel(undefined)).toBe("sem origem");
  });

  it("junta a frota inteira da mais recente para a mais antiga", () => {
    const rows = fleetSessions(
      [
        bot("argos", "Argos", [{ id: "a1", source: "cli", lastActiveAt: 1000, active: true }]),
        bot("pulse", "Pulse", [
          { id: "p1", source: "telegram", lastActiveAt: 3000, active: true },
          { id: "p2", source: "cron", lastActiveAt: 2000, active: false },
        ]),
      ],
      { pulse: "#f97316" },
    );

    expect(rows.map((row) => row.session.id)).toEqual(["p1", "p2", "a1"]);
    expect(rows[0].botColor).toBe("#f97316");
    expect(rows[2].botColor).toBe("#2563eb");
  });

  it("sessão sem data vai para o fim em vez de fingir recência", () => {
    const rows = fleetSessions([
      bot("argos", "Argos", [
        { id: "sem-data", active: false },
        { id: "antiga", lastActiveAt: 10, active: false },
      ]),
    ]);
    expect(rows.map((row) => row.session.id)).toEqual(["antiga", "sem-data"]);
  });

  it("respeita o limite da lista e conta ativas pelo número do Hermes", () => {
    const bots = [
      bot(
        "a",
        "A",
        Array.from({ length: 10 }, (_, index) => ({ id: `a${index}`, lastActiveAt: index, active: false })),
      ),
      bot("b", "B", [{ id: "b1", lastActiveAt: 99, active: true }]),
    ];
    expect(fleetSessions(bots, {}, 3)).toHaveLength(3);
    expect(activeSessionTotal(bots)).toBe(1);
  });

  it("bot sem sessões não quebra a lista", () => {
    expect(fleetSessions([bot("a", "A", [])])).toEqual([]);
  });
});
