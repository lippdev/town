import type { ActivityState } from "@/activity/events";
import { currentMeeting, epicHealth, meetingsOf, personOf, prOf, storyOf, whereIs, type HealthLevel } from "@/activity/selectors";
import { MINUTE } from "@/activity/time";
import { EPIC_STAGES, type BotTask, type Epic } from "@/activity/types";
import { EMAIL } from "@/activity/squad";
import { TECH_FLOOR, expansionSeats } from "@/world/office/officeExpansion";
import { FLOOR_BOUNDS, type OfficeSeat } from "@/world/office/officeLayout";
import { standPoint, type Point } from "@/world/office/officeHumans";

/**
 * Onde as coisas ficam no andar da Tecnologia e por onde se anda. Sem three e sem React: o teste
 * confere que nenhum caminho atravessa móvel.
 */
export const TECH_FLOOR_ID = "expansao-2" as const;
const SEATS = Object.fromEntries(expansionSeats(TECH_FLOOR).map((seat) => [seat.id.replace(`${TECH_FLOOR_ID}-`, ""), seat])) as Record<string, OfficeSeat>;
export const techSeat = (key: string) => SEATS[key]!;
export const roomId = (zone: string) => `${TECH_FLOOR_ID}-${zone}`;

/** A mesa de cada um. A da Bianca fica vazia enquanto ela está de férias. */
export const DESK_OF: Readonly<Record<string, string>> = {
  [EMAIL.marina]: "mesa-1",
  [EMAIL.caio]: "mesa-2",
  [EMAIL.renata]: "mesa-3",
  [EMAIL.rafael]: "mesa-4",
  [EMAIL.diego]: "mesa-5",
  [EMAIL.luana]: "mesa-6",
  [EMAIL.tiago]: "mesa-7",
  [EMAIL.bianca]: "mesa-8",
};

// ─── Rede de caminhos ────────────────────────────────────────────────────────

/** Faixas livres: atrás das ilhas, no corredor, na porta da sala e em volta da mesa de reunião. */
const AISLE_NORTH = -5.7;
const AISLE_MID = -1.0;
const MEETING_NORTH = 3.5;
const MEETING_SOUTH = 8.1;
const MEETING_WEST = 3.3;
const BOARD_AISLE = -7.4;

export const NODES = {
  ilhaNorte: { x: 1.6, z: AISLE_NORTH },
  ilhaMeio: { x: 1.6, z: AISLE_MID },
  hall: { x: 4.35, z: AISLE_NORTH },
  corredor: { x: 4.35, z: AISLE_MID },
  elevador: { x: 4.35, z: -8.1 },
  quadro: { x: 1.6, z: BOARD_AISLE },
  porta: { x: 4.35, z: 2.0 },
  salaNorte: { x: 4.35, z: MEETING_NORTH },
  salaOeste: { x: MEETING_WEST, z: MEETING_NORTH },
  salaSul: { x: MEETING_WEST, z: MEETING_SOUTH },
  huddle: { x: 6.4, z: AISLE_MID },
} as const satisfies Record<string, Point>;

export type NodeId = keyof typeof NODES;

export const EDGES: ReadonlyArray<readonly [NodeId, NodeId]> = [
  ["ilhaNorte", "hall"],
  ["ilhaMeio", "corredor"],
  ["ilhaNorte", "ilhaMeio"],
  ["ilhaNorte", "quadro"],
  ["hall", "corredor"],
  ["hall", "elevador"],
  ["quadro", "elevador"],
  ["corredor", "porta"],
  ["porta", "salaNorte"],
  ["salaNorte", "salaOeste"],
  ["salaOeste", "salaSul"],
  ["corredor", "huddle"],
];

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

function shortest(from: NodeId, to: NodeId): NodeId[] {
  const best = new Map<NodeId, number>([[from, 0]]);
  const previous = new Map<NodeId, NodeId>();
  const open = new Set<NodeId>(Object.keys(NODES) as NodeId[]);
  while (open.size > 0) {
    let current: NodeId | null = null;
    for (const node of open) if (best.has(node) && (current === null || best.get(node)! < best.get(current)!)) current = node;
    if (current === null || current === to) break;
    open.delete(current);
    for (const [a, b] of EDGES) {
      const next = a === current ? b : b === current ? a : null;
      if (!next || !open.has(next)) continue;
      const cost = best.get(current)! + distance(NODES[current], NODES[next]);
      if (cost < (best.get(next) ?? Infinity)) {
        best.set(next, cost);
        previous.set(next, current);
      }
    }
  }
  const path: NodeId[] = [to];
  while (path[0] !== from) {
    const step = previous.get(path[0]!);
    if (!step) return [from, to];
    path.unshift(step);
  }
  return path;
}

/** Um lugar do andar: onde se fica, e o trecho reto até o nó da rede. */
export interface Place {
  key: string;
  spot: Point;
  /** Do lugar até o nó, sem passar por móvel. */
  access: readonly Point[];
  node: NodeId;
  chair: OfficeSeat | null;
  route?: readonly Point[];
  restYaw?: number;
  zone: string;
}

/** Caminho de um lugar a outro pela rede: sempre pelas faixas livres. */
export function pathBetween(from: Place, to: Place): Point[] {
  const nodes = shortest(from.node, to.node).map((id) => NODES[id]);
  const points = [from.spot, ...from.access, ...nodes, ...[...to.access].reverse(), to.spot];
  return points.filter((point, index) => index === 0 || distance(point, points[index - 1]!) > 1e-3);
}

/** Lugar de sentar: em pé atrás da cadeira, na faixa, e o caminho curto até a frente dela. */
function seatPlace(key: string, zone: string, aisle: number, node: NodeId): Place {
  const seat = techSeat(key);
  const stand = standPoint(seat);
  // Atrás da cadeira, do lado da faixa: é dali que se vem e para lá que se volta.
  const side = Math.sign(aisle - seat.z);
  const spot = { x: seat.x, z: stand.z + side * 0.45 };
  return { key, spot, access: [{ x: spot.x, z: aisle }], node, chair: seat, route: [spot, stand], zone };
}

const deskAisle = (key: string) => (techSeat(key).z < 0 && techSeat(key).z < -2 ? { aisle: AISLE_NORTH, node: "ilhaNorte" as const } : { aisle: AISLE_MID, node: "ilhaMeio" as const });

export function deskPlace(email: string): Place {
  const key = DESK_OF[email] ?? "mesa-8";
  const { aisle, node } = deskAisle(key);
  return seatPlace(key, "squad", aisle, node);
}

/** Lugar `index` da sala: os quatro primeiros de frente para a câmera. */
export function meetingPlace(index: number): Place {
  const key = `sala-${Math.min(8, index + 1)}`;
  return index < 4 ? seatPlace(key, "sala", MEETING_NORTH, "salaNorte") : seatPlace(key, "sala", MEETING_SOUTH, "salaSul");
}

/** Em pé no canto do huddle, em arco, todos de frente para o meio e para a câmera. */
const HUDDLE_CENTER = { x: 8.9, z: -1.1 };
const HUDDLE_ANGLES = [0, 0.55, 1.1, 1.6, 2.1];
export function huddlePlace(index: number): Place {
  const angle = HUDDLE_ANGLES[Math.min(index, HUDDLE_ANGLES.length - 1)]!;
  const spot = { x: HUDDLE_CENTER.x - 1.1 * Math.sin(angle), z: HUDDLE_CENTER.z - 1.1 * Math.cos(angle) };
  return { key: `huddle-${index}`, spot, access: [], node: "huddle", chair: null, restYaw: angle, zone: "huddle" };
}

/** Fora do andar: a porta do elevador, onde a pessoa some e de onde reaparece. */
export const ELEVATOR_PLACE: Place = { key: "fora", spot: { x: 4.35, z: -8.5 }, access: [], node: "elevador", chair: null, zone: "hall" };

// ─── Plano da cena ───────────────────────────────────────────────────────────

/** Com a reunião começando em menos que isto, a pessoa já se levanta e vai. */
export const MEETING_LEAD_MS = 8 * MINUTE;

export interface PersonPlan {
  email: string;
  place: Place;
  /** O que a etiqueta diz quando ela já está indo e o estado ainda não mudou. */
  heading: string | null;
}

/**
 * Para onde cada um vai agora, a partir do estado. Sala de reunião pela agenda (com uns minutos de
 * antecedência), huddle pelo Slack, fora pela presença; o resto fica na mesa, inclusive foco e
 * chamada remota.
 */
export function personPlans(state: ActivityState): PersonPlan[] {
  const meetingSeats = new Map<string, number>();
  const huddleSpots = new Map<string, number>();
  const plans: PersonPlan[] = [];
  for (const person of state.people) {
    const where = whereIs(state, person.email);
    let place: Place = deskPlace(person.email);
    let heading: string | null = null;
    let meetingId: string | null = null;
    if (where.kind === "fora") place = ELEVATOR_PLACE;
    else if (where.kind === "reuniao") meetingId = where.meeting!.id;
    else if (where.kind === "huddle") {
      const huddle = where.huddle!;
      const index = huddle.participants.indexOf(person.email);
      huddleSpots.set(huddle.id, Math.max(huddleSpots.get(huddle.id) ?? 0, index + 1));
      place = huddlePlace(index);
    } else if (where.kind === "mesa") {
      const next = meetingsOf(state, person.email).find((entry) => entry.place === "sala" && entry.start > state.at && entry.start - state.at <= MEETING_LEAD_MS);
      if (next && !currentMeeting(state, person.email)) {
        meetingId = next.id;
        heading = `indo para ${next.title}`;
      }
    }
    if (meetingId) {
      const meeting = state.calendar.find((entry) => entry.id === meetingId)!;
      // A ordem da agenda decide os lugares: ninguém troca de cadeira no meio da reunião.
      const present = meeting.attendees.filter((email) => (state.presence[email] ?? "offline") !== "offline");
      const index = Math.max(0, present.indexOf(person.email));
      meetingSeats.set(meeting.id, index);
      place = meetingPlace(index);
    }
    plans.push({ email: person.email, place, heading });
  }
  return plans;
}

// ─── Quadro dos épicos ───────────────────────────────────────────────────────

/** O quadro na parede do fundo: discovery à esquerda, delivery à direita. */
export const BOARD = {
  minX: -10.9,
  maxX: -2.1,
  bottom: 0.72,
  top: 2.46,
  z: FLOOR_BOUNDS.minZ + 0.075,
  header: 0.36,
  gap: 0.28,
  margin: 0.08,
  cardHeight: 0.3,
  cardGap: 0.06,
} as const;

export const HEALTH_COLOR: Record<HealthLevel, string> = { "no-prazo": "#4f9d69", "em-risco": "#d9a43b", travado: "#c4553d" };

const COLUMN_WIDTH = (BOARD.maxX - BOARD.minX - BOARD.gap - BOARD.margin * 2) / EPIC_STAGES.length;

/** O meio da coluna de cada etapa, em x do andar. */
export function stageX(index: number): number {
  const delivery = EPIC_STAGES[index]!.track === "delivery";
  return BOARD.minX + BOARD.margin + COLUMN_WIDTH * (index + 0.5) + (delivery ? BOARD.gap : 0);
}

export interface BoardCard {
  epicId: string;
  stage: number;
  slot: number;
  /** Meio do cartão, em metros do andar. */
  x: number;
  y: number;
  width: number;
  height: number;
  health: HealthLevel;
}

export const BOARD_COLUMN_WIDTH = COLUMN_WIDTH;

export function boardCards(state: ActivityState): BoardCard[] {
  const slots = new Map<number, number>();
  return state.epics.map((epic: Epic) => {
    const stage = EPIC_STAGES.findIndex((item) => item.id === epic.status);
    const slot = slots.get(stage) ?? 0;
    slots.set(stage, slot + 1);
    return {
      epicId: epic.id,
      stage,
      slot,
      x: stageX(stage),
      y: BOARD.top - BOARD.header - BOARD.cardGap - (slot + 0.5) * (BOARD.cardHeight + BOARD.cardGap),
      width: COLUMN_WIDTH - 0.1,
      height: BOARD.cardHeight,
      health: epicHealth(state, epic.id).level,
    };
  });
}

/** Na frente do cartão, para quem vem até o quadro. */
const boardPlace = (x: number): Place => ({ key: `quadro-${x.toFixed(2)}`, spot: { x, z: BOARD_AISLE }, access: [], node: "quadro", chair: null, zone: "fluxo" });

// ─── Bots ────────────────────────────────────────────────────────────────────

export interface BotVisit {
  taskId: string;
  botId: string;
  place: Place;
  done: boolean;
}

/** Depois de terminar, o robô ainda leva este tempo do relógio do dia para sair. */
export const VISIT_LINGER_MS = 4 * MINUTE;

/** Para onde o bot vai: o quadro do épico, a mesa de quem é o PR, ou a sala da daily. */
export function botPlace(state: ActivityState, task: BotTask): Place {
  const target = task.target;
  if (target.kind === "meeting") return { key: "bot-sala", spot: { x: MEETING_WEST, z: 2.9 + 1.5 }, access: [{ x: MEETING_WEST, z: MEETING_NORTH }], node: "salaOeste", chair: null, zone: "sala" };
  const cards = boardCards(state);
  if (target.kind === "epic") return boardPlace(cards.find((card) => card.epicId === target.id)?.x ?? stageX(4));
  if (target.kind === "story") {
    const epicId = storyOf(state, target.id)?.epicId;
    return boardPlace(cards.find((card) => card.epicId === epicId)?.x ?? stageX(4));
  }
  if (target.kind === "pr") {
    const pr = prOf(state, target.number);
    const author = pr ? state.people.find((person) => person.github === pr.author) : null;
    if (author && whereIs(state, author.email).kind !== "fora") {
      const desk = deskPlace(author.email);
      // Ao lado de quem abriu o PR, na faixa: nunca em cima da cadeira.
      const spot = { x: desk.spot.x + 0.7, z: desk.access[0]!.z };
      return { key: `bot-mesa-${author.email}`, spot, access: [], node: desk.node, chair: null, zone: "squad" };
    }
    const story = pr?.storyId ? storyOf(state, pr.storyId) : null;
    return boardPlace(cards.find((card) => card.epicId === story?.epicId)?.x ?? stageX(4));
  }
  return boardPlace((BOARD.minX + BOARD.maxX) / 2);
}

export function botVisits(state: ActivityState): BotVisit[] {
  return state.botTasks
    .filter((task) => task.doneAt === null || state.at - task.doneAt < VISIT_LINGER_MS)
    .map((task) => ({ taskId: task.id, botId: task.botId, place: botPlace(state, task), done: task.doneAt !== null }));
}

export const nameOf = (state: ActivityState, email: string) => personOf(state, email)?.name ?? email;
