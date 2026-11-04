import { EVENT_MEETING_SEATS, OFFICE_SEATS_BY_ID, type OfficeSeat } from "./officeLayout";
import { VisitPath, turnAngle, type Point } from "./visitPath";
import type { ActorPose } from "./officeVisit";

export type DemoScenario = "visit" | "trio" | "briefing";
export const SCENARIOS: Record<DemoScenario, { title: string; detail: string; participants: string[] }> = {
  visit: { title: "Visita · Pulse → Scout", detail: "Duas pessoas: conversa na sala de quem recebe.", participants: ["pulse", "scout"] },
  trio: { title: "Conversa a três", detail: "Pulse, Scout e Atlas se encontram na sala de reunião.", participants: ["pulse", "scout", "atlas"] },
  briefing: { title: "Briefing · equipe completa", detail: "Os sete bots se reúnem. Ensaio do briefing das 17h30.", participants: ["pulse", "scout", "atlas", "echo", "ink", "argos", "forge"] },
};

const homeRoom: Record<string, string> = { pulse: "engenharia", scout: "pesquisa", atlas: "produto", echo: "comunidade", ink: "conteudo", argos: "operacoes", forge: "comando" };
// Saídas autorais pelos vãos da planta. Todos alcançam o corredor a oeste da reunião.
const routes: Record<string, Point[]> = {
  pulse: [[-6.7,-6.855],[-6.7,-3.45],[-4.35,-3.45],[-4.35,3.45],[4.35,3.45],[4.35,5.65]],
  scout: [[-8.95,0.35],[-8.5,1.35],[-5.65,1.35],[-5.65,0],[-4.35,0],[-4.35,3.45],[4.35,3.45],[4.35,5.65]],
  atlas: [[9.55,-0.25],[9.55,2.0],[9.25,2.0],[9.25,3.45],[4.35,3.45],[4.35,5.65]],
  echo: [[7.35,-7.5],[7.35,-5.25],[6.95,-5.25],[6.95,-3.45],[4.35,-3.45],[4.35,5.65]],
  ink: [[-8.95,6.4],[-8.95,5.05],[-9.25,5.05],[-9.25,3.45],[4.35,3.45],[4.35,5.65]],
  argos: [[0.9,6.55],[-2.4,6.55],[-2.4,3.45],[4.35,3.45],[4.35,5.65]],
  forge: [[-1.45,-7.75],[-2.65,-7.75],[-2.65,-4.85],[0,-4.85],[0,-3.45],[4.35,-3.45],[4.35,5.65]],
};
const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const seated = (seat: OfficeSeat): ActorPose => ({ x: seat.x, z: seat.z, yaw: seat.yaw, standing: 0, walk: 0, talk: 0 });
const blend = (a: ActorPose, b: ActorPose, t: number): ActorPose => ({
  ...a, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
  yaw: a.yaw + turnAngle(a.yaw, b.yaw) * t, standing: a.standing + (b.standing - a.standing) * t,
});
interface Journey { from: OfficeSeat; to: OfficeSeat; path: VisitPath; duration: number; delay: number }
interface Meeting { ids: string[]; outbound: Journey[]; inbound: Journey[]; gather: number; finish: number; duration: number }
function journey(from: OfficeSeat, to: OfficeSeat, points: Point[]): Journey {
  const path = new VisitPath(points);
  return { from, to, path, duration: 3.2 + path.length / 0.85, delay: 0 };
}
function sampleJourney(trip: Journey, time: number): ActorPose {
  const t = time - trip.delay;
  if (t <= 0) return seated(trip.from);
  const start = { ...seated(trip.from), ...trip.path.at(0), standing: 1 };
  const end = { ...seated(trip.to), ...trip.path.at(trip.path.length), standing: 1 };
  if (t < 1.6) return blend(seated(trip.from), start, ease(t / 1.6));
  if (t < trip.duration - 1.6) {
    const distance = (t - 1.6) * 0.85;
    return { ...start, ...trip.path.at(distance), walk: 1, distance,
      gaitPhase: distance / trip.path.stride * Math.PI * 2,
      feet: { L: trip.path.foot(distance, "L"), R: trip.path.foot(distance, "R") } };
  }
  return blend(end, seated(trip.to), ease((t - trip.duration + 1.6) / 1.6));
}

/** Reserva o percurso no tempo: espera acontece na cadeira, nunca no meio da curva. */
function schedule(trips: Journey[]) {
  const scheduled: Journey[] = [];
  for (const trip of trips) {
    for (let attempt = 0; attempt < 400; attempt++) {
      trip.delay = attempt * 0.6;
      let conflict = false;
      const horizon = Math.max(trip.delay + trip.duration, ...scheduled.map((other) => other.delay + other.duration));
      for (let t = 0; t < horizon + 1; t += 0.08) {
        const actor = sampleJourney(trip, t);
        if (scheduled.some((other) => {
          const peer = sampleJourney(other, t);
          return Math.hypot(actor.x - peer.x, actor.z - peer.z) < 0.67;
        })) { conflict = true; break; }
      }
      if (!conflict) break;
      if (attempt === 399) throw new Error("Não foi possível reservar o trajeto da reunião.");
    }
    scheduled.push(trip);
  }
}

const meetings = new Map<string, Meeting>();
function meeting(scenario: "trio" | "briefing"): Meeting {
  const existing = meetings.get(scenario);
  if (existing) return existing;
  const ids = SCENARIOS[scenario].participants;
  // Mais distantes primeiro; a cabeceira é ocupada por último e liberada primeiro.
  const seats = [4, 5, 2, 3, 0, 1, 6];
  const outbound = ids.map((id, index) => {
    const home = OFFICE_SEATS_BY_ID[`${homeRoom[id]}-0`]!;
    const seat = EVENT_MEETING_SEATS[seats[index]!]!;
    const north = seat.z < 6.55;
    const aisle = north ? 5.12 : 8.05;
    const approach: Point[] = index === 6
      ? [[5.55,5.65],[5.55,6.55]]
      : [[5.55,5.65],[5.55,aisle],[seat.x,aisle]];
    return journey(home, seat, [...routes[id]!, ...approach]);
  });
  schedule(outbound);
  const gather = Math.max(...outbound.map((trip) => trip.delay + trip.duration));
  const finish = gather + (scenario === "trio" ? 16 : 24);
  const inbound = outbound.map((trip, i) => {
    const north = trip.to.z < 6.55;
    const approach: Point[] = i === 6 ? [[5.55,5.65],[5.55,6.55]] : [[5.55,5.65],[5.55,north ? 5.12 : 8.05],[trip.to.x,north ? 5.12 : 8.05]];
    return journey(trip.to, trip.from, [...routes[ids[i]!]!, ...approach].reverse());
  });
  schedule([...inbound].reverse());
  const duration = finish + Math.max(...inbound.map((trip) => trip.delay + trip.duration));
  const result = { ids, outbound, inbound, gather, finish, duration };
  meetings.set(scenario, result);
  return result;
}
export function meetingDuration(scenario: "trio" | "briefing") { return meeting(scenario).duration; }
export function sampleMeeting(scenario: "trio" | "briefing", time: number) {
  const plan = meeting(scenario);
  const talking = time >= plan.gather && time < plan.finish;
  const speaker = Math.floor((time - plan.gather) / 2.5) % plan.ids.length;
  const poses: Record<string, ActorPose> = {};
  plan.ids.forEach((id, index) => {
    const pose = time < plan.finish ? sampleJourney(plan.outbound[index]!, time) : sampleJourney(plan.inbound[index]!, time - plan.finish);
    poses[id] = { ...pose, talk: talking ? (index === speaker ? 1 : 0.2) : 0 };
  });
  const label = time >= plan.duration ? "Todos voltaram aos postos" : talking ? "Equipe reunida · troca de ideias" : time < plan.gather ? "A caminho da sala de reunião" : "Voltando aos postos";
  return { poses, label, duration: plan.duration, gather: plan.gather, finish: plan.finish };
}
