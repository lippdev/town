import { buildExpansion } from "./buildingInteriors";
import { expansionFloor, expansionPosts, type ExpansionFloor } from "./officeExpansion";
import { FLIGHT_CLEARANCE, FLIGHT_SPEED, flightAllowed, routeBetween, solidsOf, type FlightPlan, type FlightWorld } from "./officeFlights";
import { pathLength } from "./officeHumans";
import { FLOOR_BOUNDS, OFFICE_ROOMS_BY_ID, type OfficeBounds } from "./officeLayout";
import { seatPlace } from "./officeRoster";
import type { OfficeScenario } from "./officeScenario";

const PARTITION_HALF = 0.06;

/** As divisórias do andar como móveis, sem o vão das portas: no andar de equipe não há sala com porta. */
function partitionSolids(floor: ExpansionFloor): OfficeBounds[] {
  const solids: OfficeBounds[] = [];
  for (const piece of floor.pieces) {
    if (piece.kind !== "partition") continue;
    const from = Math.min(piece.from, piece.to);
    const to = Math.max(piece.from, piece.to);
    const gaps = [...(piece.doors ?? [])].sort((a, b) => a.at - b.at);
    let start = from;
    for (const span of [...gaps.map((door) => [door.at - door.width / 2, door.at + door.width / 2] as const), [to, to] as const]) {
      if (span[0] > start) {
        solids.push(
          piece.axis === "z"
            ? { minX: piece.at - PARTITION_HALF, maxX: piece.at + PARTITION_HALF, minZ: start, maxZ: span[0] }
            : { minX: start, maxX: span[0], minZ: piece.at - PARTITION_HALF, maxZ: piece.at + PARTITION_HALF },
        );
      }
      start = span[1];
    }
  }
  return solids;
}

const insideFloor = (x: number, z: number) =>
  x >= FLOOR_BOUNDS.minX + FLIGHT_CLEARANCE && x <= FLOOR_BOUNDS.maxX - FLIGHT_CLEARANCE && z >= FLOOR_BOUNDS.minZ + FLIGHT_CLEARANCE && z <= FLOOR_BOUNDS.maxZ - FLIGHT_CLEARANCE;

/**
 * O caminho de cada bot do posto até o lugar dele na reunião da equipe, contornando móveis e
 * divisórias. Quem não tem caminho fica sem rota e simplesmente não sai do posto.
 */
export function meetingRoutes(scenario: OfficeScenario, seats: Readonly<Record<string, string>>, operation: FlightWorld): Map<string, FlightPlan> {
  const routes = new Map<string, FlightPlan>();
  const solidsByFloor = new Map<string, OfficeBounds[]>();
  const solidsFor = (floor: string) => {
    let solids = solidsByFloor.get(floor);
    if (!solids) {
      const spec = floor === "operacao" ? null : expansionFloor(floor);
      // O posto não tem cadeira (o robô flutua ali), mas a mobília marca o lugar como cadeira: com a folga,
      // ele prenderia o próprio robô. Os postos saem dos obstáculos; os robôs saem juntos para a reunião.
      const posts = spec ? expansionPosts(spec) : [];
      const onPost = (solid: OfficeBounds) => posts.some((post) => Math.abs((solid.minX + solid.maxX) / 2 - post.x) < 0.01 && Math.abs((solid.minZ + solid.maxZ) / 2 - post.z) < 0.01);
      solids = spec ? [...buildExpansion(floor).footprints.filter((solid) => !onPost(solid)), ...partitionSolids(spec)] : solidsOf(operation);
      solidsByFloor.set(floor, solids);
    }
    return solids;
  };
  for (const team of scenario.teams) {
    const members = scenario.bots.filter((bot) => bot.team === team.id);
    members.forEach((bot, index) => {
      const place = seatPlace(seats[bot.id]);
      const spot = team.spots[index];
      if (!place || !spot || place.floor !== team.floor) return;
      const home = OFFICE_ROOMS_BY_ID[place.seat.roomId];
      const meeting = OFFICE_ROOMS_BY_ID[team.meetingRoom];
      // Na Operação, as salas têm porta: passa só pela sala de casa, pela de reunião e pelos corredores.
      const allowed =
        place.floor === "operacao" ? (x: number, z: number) => Boolean(home && meeting) && (flightAllowed(home!, x, z) || flightAllowed(meeting!, x, z)) : insideFloor;
      const path = routeBetween(solidsFor(place.floor), allowed, place.seat, spot);
      if (!path) return;
      const length = pathLength(path);
      routes.set(bot.id, { botId: bot.id, home: place.seat, path, length, leg: length / FLIGHT_SPEED, start: 0, endYaw: spot.yaw });
    });
  }
  return routes;
}
