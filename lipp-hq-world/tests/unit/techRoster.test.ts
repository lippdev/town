import { describe, expect, it } from "vitest";
import { formatSquadStatus, matchesSquadPerson } from "@/tech/techRosterStatus";
import { EMAIL, SQUAD } from "@/activity/squad";
import { DEFAULT_SEED, simulatedStateAt } from "@/activity/simulation";
import { at } from "@/activity/time";

describe("techRosterStatus", () => {
  const seed = DEFAULT_SEED;

  it("às 09:35 formata os seis da daily como Em reunião e Bianca/Tiago como Fora/Férias", () => {
    const state = simulatedStateAt(seed, at(9, 35));
    const dailyEmails = [
      EMAIL.marina,
      EMAIL.caio,
      EMAIL.renata,
      EMAIL.diego,
      EMAIL.luana,
      EMAIL.rafael,
    ];

    for (const email of dailyEmails) {
      const status = formatSquadStatus(state, email);
      expect(status.whereKind).toBe("reuniao");
      expect(status.label).toBe("Em reunião · Daily até 09:45");
      expect(status.ariaLabel).toBe("Em reunião · Daily até 09:45");
    }

    const tiago = formatSquadStatus(state, EMAIL.tiago);
    expect(tiago.whereKind).toBe("fora");
    expect(tiago.label).toBe("Fora");

    const bianca = formatSquadStatus(state, EMAIL.bianca);
    expect(bianca.whereKind).toBe("fora");
    expect(bianca.label).toBe("Férias");
  });

  it("às 11:21 formata quem está em huddle com Em huddle", () => {
    const state = simulatedStateAt(seed, at(11, 21));
    // Confere quem está em huddle pelo seletor de presença
    const inHuddle = state.people
      .map((p) => p.email)
      .filter((email) => formatSquadStatus(state, email).whereKind === "huddle");
    expect(inHuddle).toHaveLength(3);

    for (const email of inHuddle) {
      const status = formatSquadStatus(state, email);
      expect(status.whereKind).toBe("huddle");
      expect(status.label).toBe("Em huddle");
      expect(status.ariaLabel).toBe("Em huddle");
    }
  });

  it("formata foco com lua e aviso legível não perturbe", () => {
    // Luana entra em foco pela manhã na simulação
    const state = simulatedStateAt(seed, at(10, 20));
    const status = formatSquadStatus(state, EMAIL.luana);
    expect(status.whereKind).toBe("foco");
    expect(status.label).toContain("Em foco");
    expect(status.label).toContain("🌙");
    expect(status.ariaLabel).toBe("Em foco (não perturbe)");
  });

  it("formata quem está na mesa com Na mesa", () => {
    const state = simulatedStateAt(seed, at(10, 20));
    const status = formatSquadStatus(state, EMAIL.renata);
    expect(status.whereKind).toBe("mesa");
    expect(status.label).toBe("Na mesa");
  });

  it("filtra por nome e papel (inclusive 'QA' deixando apenas Rafael)", () => {
    const normalize = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
    const createMatcher = (query: string) => (text: string) =>
      normalize(text).includes(normalize(query).trim());

    const qaMatcher = createMatcher("QA");
    const matchedQa = SQUAD.filter((p) => matchesSquadPerson(p, qaMatcher));
    expect(matchedQa.map((p) => p.name)).toEqual(["Rafael Coutinho"]);

    const leadMatcher = createMatcher("Tech Lead");
    const matchedLead = SQUAD.filter((p) => matchesSquadPerson(p, leadMatcher));
    expect(matchedLead.map((p) => p.name)).toEqual(["Renata Okabe"]);

    const devMatcher = createMatcher("Dev");
    const matchedDev = SQUAD.filter((p) => matchesSquadPerson(p, devMatcher));
    expect(matchedDev.map((p) => p.name)).toEqual([
      "Diego Martins",
      "Luana Ferraz",
      "Tiago Nunes",
      "Bianca Sales",
    ]);

    const allMatcher = createMatcher("");
    expect(SQUAD.filter((p) => matchesSquadPerson(p, allMatcher))).toHaveLength(8);
  });
});
