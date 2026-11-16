import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** O prédio lê o cenário ao ser importado: cada teste instala primeiro e importa depois. */
async function withScenario() {
  vi.resetModules();
  const registry = await import("@/world/office/officeScenario");
  const { ALYXMED } = await import("@/alyxmed/scenario");
  registry.installScenario(ALYXMED);
  const [building, expansion, roster, organization, layout] = await Promise.all([
    import("@/world/office/officeBuilding"),
    import("@/world/office/officeExpansion"),
    import("@/world/office/officeRoster"),
    import("@/agents/organization"),
    import("@/world/office/officeLayout"),
  ]);
  return { ALYXMED, registry, building, expansion, roster, organization, layout };
}

describe("cenário Alyx Med", () => {
  beforeEach(() => vi.resetModules());

  it("o arquivo do cenário só importa tipos: ele chega antes do prédio", () => {
    const source = readFileSync("src/alyxmed/scenario.ts", "utf8");
    const imports = source.split("\n").filter((line) => line.startsWith("import "));
    expect(imports.length).toBeGreaterThan(0);
    for (const line of imports) expect(line).toMatch(/^import type /);
  });

  it("instalar depois de o prédio ler o cenário falha alto", async () => {
    const registry = await import("@/world/office/officeScenario");
    const { ALYXMED } = await import("@/alyxmed/scenario");
    expect(registry.activeScenario()).toBeNull();
    expect(() => registry.installScenario(ALYXMED)).toThrow(/depois do prédio/);
  });

  it("seis equipes de três bots, cada uma no seu andar, e a direção acima", async () => {
    const { ALYXMED, organization, roster } = await withScenario();
    const bots = roster.demoBots();
    expect(bots).toHaveLength(19);
    const chart = organization.buildOrgChart(bots);
    expect(chart.leadership.map((bot) => bot.name)).toEqual(["Alyx"]);
    expect(chart.teams.map((team) => [team.name, team.size])).toEqual([
      ["Leads", 3],
      ["Tarefas", 3],
      ["Social Media", 3],
      ["Desenvolvimento", 3],
      ["Performance", 3],
      ["Processos", 3],
    ]);
    expect(chart.unassigned).toEqual([]);
    expect(organization.orgOwner().name).toBe("Filipe");
    expect(new Set(ALYXMED.teams.map((team) => team.floor)).size).toBe(6);
    expect(new Set(bots.map((bot) => bot.name)).size).toBe(19);
  });

  it("cada bot senta no andar da própria equipe, sem dividir lugar", async () => {
    const { ALYXMED, roster } = await withScenario();
    const ids = ALYXMED.bots.map((bot) => bot.id);
    const seating = roster.demoSeating(ids);
    expect(seating.unseated).toEqual([]);
    expect(new Set(Object.values(seating.seats)).size).toBe(ids.length);
    for (const bot of ALYXMED.bots) {
      const place = roster.seatPlace(seating.seats[bot.id]);
      const floor = ALYXMED.teams.find((team) => team.id === bot.team)?.floor ?? "operacao";
      expect(place?.floor, bot.name).toBe(floor);
    }
  });

  it("os andares das equipes entram no seletor com o nome delas, sem figurantes", async () => {
    const { ALYXMED, building, expansion } = await withScenario();
    for (const team of ALYXMED.teams) {
      expect(building.FLOOR_ORDER).toContain(team.floor);
      expect(building.FLOOR_LABEL[team.floor as keyof typeof building.FLOOR_LABEL].name).toBe(team.name);
    }
    // O sétimo pavimento deixa de ser só fachada; o esconderijo continua no sexto.
    expect(building.decorativeLevels()).not.toContain(7);
    expect(building.floorAtLevel(6)).toBeNull();
    for (const floor of expansion.EXPANSION_FLOORS) {
      expect(floor.team, floor.id).toBeTruthy();
      expect(expansion.expansionScenery(floor.id)).toEqual([]);
      expect(expansion.isReservedFloor(floor)).toBe(false);
    }
  });

  it("cada posto fica dentro da zona dele, com folga de um robô para o vizinho", async () => {
    const { building, expansion } = await withScenario();
    for (const floor of expansion.EXPANSION_FLOORS) {
      const posts = expansion.expansionPosts(floor);
      expect(posts, floor.id).toHaveLength(3);
      for (const post of posts) {
        const room = building.BUILDING_ROOMS_BY_ID[post.roomId];
        expect(room, post.id).toBeDefined();
        expect(post.x).toBeGreaterThanOrEqual(room!.bounds.minX);
        expect(post.x).toBeLessThanOrEqual(room!.bounds.maxX);
        expect(post.z).toBeGreaterThanOrEqual(room!.bounds.minZ);
        expect(post.z).toBeLessThanOrEqual(room!.bounds.maxZ);
        for (const other of posts) {
          if (other !== post) expect(Math.hypot(other.x - post.x, other.z - post.z), `${post.id} × ${other.id}`).toBeGreaterThan(0.8);
        }
      }
    }
  });

  it("a Operação vira o andar de Processos, com as salas renomeadas", async () => {
    const { layout, building } = await withScenario();
    expect(building.FLOOR_LABEL.operacao.name).toBe("Processos");
    expect(layout.OFFICE_ROOMS_BY_ID.engenharia?.name).toBe("Onboarding");
    expect(layout.OFFICE_ROOMS_BY_ID.comando?.name).toBe("Direção geral");
  });

  it("sem cenário, o prédio é o de sempre", async () => {
    const [expansion, roster, organization] = await Promise.all([import("@/world/office/officeExpansion"), import("@/world/office/officeRoster"), import("@/agents/organization")]);
    expect(expansion.EXPANSION_FLOORS.map((floor) => floor.id)).toEqual(["expansao-2", "expansao-3", "expansao-4", "expansao-5"]);
    expect(expansion.EXPANSION_FLOORS.every(expansion.isReservedFloor)).toBe(true);
    expect(roster.demoBots().map((bot) => bot.id)).not.toContain("alyx-alyx");
    expect(organization.orgOwner().role).toBe("Responsável pela equipe");
  });
});
