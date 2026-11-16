import { beforeEach, describe, expect, it, vi } from "vitest";

/** Como em `alyxmed.test.ts`: o cenário entra antes de qualquer módulo do prédio. */
async function withScenario() {
  vi.resetModules();
  const registry = await import("@/world/office/officeScenario");
  const { ALYXMED } = await import("@/alyxmed/scenario");
  registry.installScenario(ALYXMED);
  const [activity, routes, roster, building, interiors, kanban] = await Promise.all([
    import("@/world/office/officeActivity"),
    import("@/world/office/meetingRoutes"),
    import("@/world/office/officeRoster"),
    import("@/world/office/officeBuilding"),
    import("@/world/office/officeRooms"),
    import("@/components/office/kanbanModel"),
  ]);
  return { ALYXMED, activity, routes, roster, building, interiors, kanban };
}

describe("atividade simulada da Alyx Med", () => {
  beforeEach(() => vi.resetModules());

  it("a mesma semente dá o mesmo dia; outra semente, outro dia", async () => {
    const { ALYXMED, activity } = await withScenario();
    const day = (seed: number) => ALYXMED.bots.flatMap((bot) => Array.from({ length: 48 }, (_, slot) => activity.activityAt(ALYXMED, bot.id, slot * 30 + 5, seed).state));
    expect(day(ALYXMED.activity.seed)).toEqual(day(ALYXMED.activity.seed));
    expect(day(ALYXMED.activity.seed + 1)).not.toEqual(day(ALYXMED.activity.seed));
  });

  it("ao longo do expediente, cada bot de equipe passa pelos quatro estados", async () => {
    const { ALYXMED, activity } = await withScenario();
    for (const bot of ALYXMED.bots.filter((candidate) => candidate.team)) {
      const states = new Set(Array.from({ length: 600 }, (_, minute) => activity.activityAt(ALYXMED, bot.id, activity.WORKDAY.start + minute).state));
      expect([...states].sort(), bot.name).toEqual(["aprovacao", "ocioso", "reuniao", "trabalhando"]);
    }
  });

  it("na reunião da equipe, todos da equipe estão em reunião; fora do expediente, ninguém trabalha", async () => {
    const { ALYXMED, activity } = await withScenario();
    for (const team of ALYXMED.teams) {
      const at = activity.clockMinutes(team.meetings[0]!.start) + 5;
      for (const bot of ALYXMED.bots.filter((candidate) => candidate.team === team.id)) {
        expect(activity.activityAt(ALYXMED, bot.id, at)).toEqual({ state: "reuniao", detail: team.meetings[0]!.title });
      }
    }
    for (const bot of ALYXMED.bots) expect(activity.activityAt(ALYXMED, bot.id, 22 * 60).state).toBe("ocioso");
  });

  it("estado com tarefa aponta para um cartão do próprio bot", async () => {
    const { ALYXMED, activity } = await withScenario();
    const tasks = new Map(ALYXMED.activity.tasks.map((task) => [task.id, task]));
    for (const bot of ALYXMED.bots) {
      for (let minute = activity.WORKDAY.start; minute < activity.WORKDAY.end; minute += 30) {
        const now = activity.activityAt(ALYXMED, bot.id, minute);
        if (now.taskId) expect(tasks.get(now.taskId)?.owner).toBe(bot.id);
        if (now.state === "aprovacao") expect(tasks.get(now.taskId!)?.column).toBe("revisao");
      }
    }
  });

  it("cada equipe tem cartões no quadro, e cada bot tem conversa", async () => {
    const { ALYXMED, kanban } = await withScenario();
    const cards = kanban.scenarioCards(ALYXMED);
    for (const team of ALYXMED.teams) {
      const owners = new Set(ALYXMED.bots.filter((bot) => bot.team === team.id).map((bot) => bot.id));
      expect(cards.filter((card) => owners.has(card.owner)).length, team.name).toBeGreaterThanOrEqual(5);
    }
    for (const bot of ALYXMED.bots) expect(ALYXMED.activity.talks[bot.id]?.length, bot.name).toBeGreaterThan(0);
  });

  it("todo bot de equipe tem caminho até a reunião, sem atravessar móvel, e chega dentro da sala", async () => {
    const { ALYXMED, routes, roster, building, interiors } = await withScenario();
    const seating = roster.demoSeating(ALYXMED.bots.map((bot) => bot.id));
    const plans = routes.meetingRoutes(ALYXMED, seating.seats, interiors.buildOffice({ elevatorOpening: true }));
    for (const team of ALYXMED.teams) {
      const room = building.BUILDING_ROOMS_BY_ID[team.meetingRoom];
      expect(room, team.meetingRoom).toBeDefined();
      for (const bot of ALYXMED.bots.filter((candidate) => candidate.team === team.id)) {
        const plan = plans.get(bot.id);
        expect(plan, bot.name).toBeDefined();
        const end = plan!.path.at(-1)!;
        expect(end.x).toBeGreaterThan(room!.bounds.minX);
        expect(end.x).toBeLessThan(room!.bounds.maxX);
        expect(end.z).toBeGreaterThan(room!.bounds.minZ);
        expect(end.z).toBeLessThan(room!.bounds.maxZ);
      }
    }
  });

  it("a distância da reunião sai do relógio: ida, reunião, volta", async () => {
    const { activity } = await withScenario();
    const windows = [{ from: 600, to: 630 }];
    expect(activity.meetingDistanceAt(windows, 599, 5, 10)).toBe(0);
    expect(activity.meetingDistanceAt(windows, 602.5, 5, 10)).toBeCloseTo(5);
    expect(activity.meetingDistanceAt(windows, 620, 5, 10)).toBe(10);
    expect(activity.meetingDistanceAt(windows, 632.5, 5, 10)).toBeCloseTo(5);
    expect(activity.meetingDistanceAt(windows, 636, 5, 10)).toBe(0);
  });
});
