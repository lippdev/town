import { describe, expect, it } from "vitest";
import { simulatedStateAt } from "@/activity/simulation";
import { EMAIL } from "@/activity/squad";
import { at } from "@/activity/time";
import { buildExpansion } from "@/world/office/buildingInteriors";
import { EXPANSION_FLOORS, TECH_FLOOR, expansionRooms, expansionSeats } from "@/world/office/officeExpansion";
import { FLOOR_BOUNDS } from "@/world/office/officeLayout";
import { parseScenario } from "@/world/office/officeRoute";
import type { Point } from "@/world/office/officeHumans";
import { BOARD, DESK_OF, EDGES, ELEVATOR_PLACE, NODES, boardCards, botVisits, deskPlace, huddlePlace, meetingPlace, pathBetween, personPlans } from "@/tech/techPlaces";

const { footprints } = buildExpansion(TECH_FLOOR);
/** Móvel que o segmento atravessa, com 15 cm de folga. Cadeira ocupável não conta: ela gira e sai. */
function crossing(a: Point, b: Point, margin = 0.15) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05);
  for (let index = 0; index <= steps; index += 1) {
    const t = steps === 0 ? 0 : index / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const hit = footprints.find((item) => item.label !== "cadeira" && x > item.minX - margin && x < item.maxX + margin && z > item.minZ - margin && z < item.maxZ + margin);
    if (hit) return `${hit.label} em (${x.toFixed(2)}, ${z.toFixed(2)})`;
  }
  return null;
}
const segments = (path: readonly Point[]) => path.slice(1).map((point, index) => [path[index]!, point] as const);

describe("cenário na rota", () => {
  it("só a demonstração aceita cenário, e sem ele a tabela é a de sempre", () => {
    expect(parseScenario("?escritorio=completo&modo=demonstracao&cenario=tecnologia")).toBe("tecnologia");
    expect(parseScenario("?escritorio=completo&cenario=tecnologia")).toBeNull();
    expect(parseScenario("?escritorio=completo&modo=demonstracao&cenario=outro")).toBeNull();
    expect(EXPANSION_FLOORS[0]!.title).toBe("Expansão · andar 2");
    expect(EXPANSION_FLOORS.some((floor) => floor.team)).toBe(false);
  });
});

describe("andar da Tecnologia", () => {
  it("tem as salas do cenário, sem figurante, e cadeiras ocupáveis para o squad e a reunião", () => {
    expect(expansionRooms(TECH_FLOOR).map((room) => room.id)).toEqual(["expansao-2-hall", "expansao-2-fluxo", "expansao-2-squad", "expansao-2-huddle", "expansao-2-sala", "expansao-2-apoio"]);
    expect(TECH_FLOOR.figures).toEqual([]);
    expect(expansionSeats(TECH_FLOOR)).toHaveLength(16);
    expect(new Set(Object.values(DESK_OF)).size).toBe(8);
  });

  it("as zonas ficam dentro do andar e não se sobrepõem", () => {
    const rooms = expansionRooms(TECH_FLOOR);
    for (const room of rooms) {
      expect(room.bounds.minX).toBeGreaterThanOrEqual(FLOOR_BOUNDS.minX);
      expect(room.bounds.maxZ).toBeLessThanOrEqual(FLOOR_BOUNDS.maxZ);
    }
    for (const [index, a] of rooms.entries()) {
      for (const b of rooms.slice(index + 1)) {
        const overlap = a.bounds.minX < b.bounds.maxX && b.bounds.minX < a.bounds.maxX && a.bounds.minZ < b.bounds.maxZ && b.bounds.minZ < a.bounds.maxZ;
        expect(overlap, `${a.id} × ${b.id}`).toBe(false);
      }
    }
  });

  it("nenhum trecho da rede de caminhos atravessa móvel", () => {
    for (const [a, b] of EDGES) expect(crossing(NODES[a], NODES[b]), `${a}–${b}`).toBeNull();
  });

  it("de qualquer lugar a qualquer lugar, sem atravessar móvel", () => {
    const places = [...Object.keys(DESK_OF).map(deskPlace), ...Array.from({ length: 8 }, (_, index) => meetingPlace(index)), ...Array.from({ length: 4 }, (_, index) => huddlePlace(index)), ELEVATOR_PLACE];
    for (const from of places) {
      for (const to of places) {
        if (from === to) continue;
        const path = pathBetween(from, to);
        // O último trecho, de pé atrás da cadeira, é o mesmo caminho curto que a pessoa já faz para sentar.
        for (const [a, b] of segments(path)) expect(crossing(a, b, 0.1), `${from.key} → ${to.key}`).toBeNull();
      }
    }
  });

  it("o quadro cabe na parede e põe um cartão por épico na etapa dele", () => {
    const state = simulatedStateAt(7, at(9, 5));
    const cards = boardCards(state);
    expect(cards).toHaveLength(6);
    for (const card of cards) {
      expect(card.x - card.width / 2).toBeGreaterThanOrEqual(BOARD.minX);
      expect(card.x + card.width / 2).toBeLessThanOrEqual(BOARD.maxX);
      expect(card.y - card.height / 2).toBeGreaterThan(BOARD.bottom);
    }
    expect(cards.find((card) => card.epicId === "E-1")).toMatchObject({ stage: 3, health: "travado" });
  });
});

describe("plano da cena", () => {
  const placeOf = (state: ReturnType<typeof simulatedStateAt>, email: string) => personPlans(state).find((plan) => plan.email === email)!;

  it("vai para a sala alguns minutos antes da reunião e senta em lugares distintos", () => {
    const before = simulatedStateAt(7, at(9, 25));
    expect(placeOf(before, EMAIL.renata).place.zone).toBe("sala");
    expect(placeOf(before, EMAIL.renata).heading).toBe("indo para Daily");
    const during = simulatedStateAt(7, at(9, 35));
    const seats = personPlans(during).filter((plan) => plan.place.zone === "sala").map((plan) => plan.place.key);
    expect(seats).toHaveLength(6);
    expect(new Set(seats).size).toBe(6);
  });

  it("chamada remota e foco ficam na mesa; huddle junta; quem saiu vai para o elevador", () => {
    expect(placeOf(simulatedStateAt(7, at(10, 20)), EMAIL.marina).place.zone).toBe("squad");
    expect(placeOf(simulatedStateAt(7, at(10, 20)), EMAIL.luana).place.zone).toBe("squad");
    const huddle = simulatedStateAt(7, at(11, 26));
    expect(personPlans(huddle).filter((plan) => plan.place.zone === "huddle").map((plan) => plan.email).sort()).toEqual([EMAIL.diego, EMAIL.rafael, EMAIL.renata].sort());
    expect(placeOf(simulatedStateAt(7, at(12, 30)), EMAIL.marina).place).toBe(ELEVATOR_PLACE);
    expect(placeOf(simulatedStateAt(7, at(9, 5)), EMAIL.bianca).place).toBe(ELEVATOR_PLACE);
  });

  it("o bot visita o lugar do trabalho dele", () => {
    const pauta = botVisits(simulatedStateAt(7, at(9, 15)));
    expect(pauta).toHaveLength(1);
    expect(pauta[0]).toMatchObject({ botId: "forge", done: false });
    expect(pauta[0]!.place.zone).toBe("sala");
    const epic = botVisits(simulatedStateAt(7, at(9, 45)));
    expect(epic.find((visit) => visit.botId === "atlas")?.place.zone).toBe("fluxo");
  });
});
