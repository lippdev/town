import { describe, expect, it } from "vitest";
import { formatSquadStatus, matchesSquadPerson } from "@/tech/techRosterStatus";
import { EMAIL, SQUAD } from "@/activity/squad";
import { DEFAULT_SEED, simulatedStateAt } from "@/activity/simulation";
import { at } from "@/activity/time";

describe("techRosterStatus", () => {
  const seed = DEFAULT_SEED;

  it("às 09:35 formata os cinco do huddle como Em reunião e os convidados que não entraram como ainda não entrou", () => {
    const state = simulatedStateAt(seed, at(9, 35));
    for (const email of [EMAIL.marina, EMAIL.renata, EMAIL.diego, EMAIL.luana, EMAIL.rafael]) {
      const status = formatSquadStatus(state, email);
      expect(status.whereKind).toBe("reuniao");
      expect(status.label).toBe("Em reunião · Daily até 09:45");
      expect(status.daily).toBeNull();
    }
    const caio = formatSquadStatus(state, EMAIL.caio);
    expect(caio).toMatchObject({ whereKind: "mesa", label: "Daily · ainda não entrou", ariaLabel: "Daily · ainda não entrou (Na mesa)", daily: "ainda-nao-entrou" });
    expect(formatSquadStatus(state, EMAIL.tiago)).toMatchObject({ whereKind: "fora", label: "Daily · ainda não entrou", daily: "ainda-nao-entrou" });
    expect(formatSquadStatus(state, EMAIL.bianca)).toMatchObject({ whereKind: "fora", ariaLabel: "Daily · ainda não entrou (Férias)" });
  });

  it("às 09:40 o Caio entrou e está na sala; Bianca e Tiago ausentes; depois da daily, a Bianca volta a Férias", () => {
    const state = simulatedStateAt(seed, at(9, 40));
    expect(formatSquadStatus(state, EMAIL.caio)).toMatchObject({ whereKind: "reuniao", daily: null });
    expect(formatSquadStatus(state, EMAIL.bianca)).toMatchObject({ whereKind: "fora", label: "Daily · ausente", ariaLabel: "Daily · ausente (Férias)", daily: "ausente" });
    expect(formatSquadStatus(state, EMAIL.tiago)).toMatchObject({ label: "Daily · ausente", daily: "ausente" });
    expect(formatSquadStatus(simulatedStateAt(seed, at(9, 50)), EMAIL.bianca)).toMatchObject({ label: "Férias", daily: null });
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
