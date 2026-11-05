import type { Footprint, PropPlacement } from "./officeKit";
import { CORRIDOR, FLOOR_BOUNDS, OFFICE_ROOMS, OFFICE_ROOMS_BY_ID, corridorBounds, type OfficeBounds, type OfficeRoom, type OfficeSeat } from "./officeLayout";
import { pathLength, pathPose, type Point } from "./officeHumans";

/**
 * Voo demonstrativo dos robôs. Sem relógio do sistema nem sorteio: a mesma hora dá a mesma
 * posição. Não representa nada que o bot esteja fazendo: é só o desenho da demonstração.
 * Na frota real, o robô flutua no posto e não sai dali.
 */

/** Altura da ponta do pé: rente ao chão, para o robô nunca parecer estar em cima de um móvel. */
export const HOVER_Y = 0.12;
/** Em assento com cadeira (bancada e reunião, só com a frota cheia), o robô fica acima do encosto de 1,03 m. */
export const HOVER_OVER_CHAIR_Y = 1.08;
export const FLIGHT_SPEED = 0.9;
export const FLIGHT_HOLD = 2.5;
export const FLIGHT_PERIOD = 56;
/** Distância mínima de parede e móvel: o robô tem cerca de 0,6 m de lado a lado. */
export const FLIGHT_CLEARANCE = 0.3;
const CELL = 0.1;
const POST_HALF = 0.31;

export interface FlightPlan {
  botId: string;
  home: OfficeSeat;
  /** Do posto até o ponto do corredor; a volta é o mesmo caminho. */
  path: Point[];
  length: number;
  leg: number;
  /** Instante em que este robô decola, dentro do período. */
  start: number;
}

export interface FlightWorld {
  footprints: Record<string, Footprint[]>;
  props: readonly PropPlacement[];
}

const inside = (bounds: OfficeBounds, x: number, z: number, margin = 0) =>
  x >= bounds.minX - margin && x <= bounds.maxX + margin && z >= bounds.minZ - margin && z <= bounds.maxZ + margin;

/** O vão da porta, com folga dos dois lados, atravessando a parede até o corredor. */
export function doorPassage(room: OfficeRoom, door: OfficeRoom["doors"][number]): OfficeBounds {
  const half = door.width / 2 - FLIGHT_CLEARANCE * 0.8;
  const { minX, maxX, minZ, maxZ } = room.bounds;
  const { x, z } = room.center;
  const reach = FLIGHT_CLEARANCE + 0.2;
  switch (door.side) {
    case "north":
      return { minX: x + door.offset - half, maxX: x + door.offset + half, minZ: minZ - reach, maxZ: minZ + reach };
    case "south":
      return { minX: x + door.offset - half, maxX: x + door.offset + half, minZ: maxZ - reach, maxZ: maxZ + reach };
    case "west":
      return { minX: minX - reach, maxX: minX + reach, minZ: z + door.offset - half, maxZ: z + door.offset + half };
    case "east":
      return { minX: maxX - reach, maxX: maxX + reach, minZ: z + door.offset - half, maxZ: z + door.offset + half };
  }
}

/**
 * Corredor, longe das paredes e do limite do prédio. `slack` afrouxa a folga: a rota anda
 * na beirada exata da grade, e o teste que a confere não pode reprovar por arredondamento.
 */
export function inCorridorLane(x: number, z: number, slack = 0): boolean {
  const { minX, maxX, minZ, maxZ } = FLOOR_BOUNDS;
  const margin = FLIGHT_CLEARANCE - slack;
  if (x < minX + margin || x > maxX - margin || z < minZ + margin || z > maxZ - margin) return false;
  if (!corridorBounds().some((corridor) => inside(corridor, x, z))) return false;
  return !OFFICE_ROOMS.some((room) => inside(room.bounds, x, z, margin));
}

/** Pode voar aqui saindo desta sala: a própria sala, as portas dela e os corredores. */
export function flightAllowed(room: OfficeRoom, x: number, z: number, slack = 0): boolean {
  if (inside(room.bounds, x, z, slack - FLIGHT_CLEARANCE)) return true;
  if (room.doors.some((door) => inside(doorPassage(room, door), x, z, slack))) return true;
  return inCorridorLane(x, z, slack);
}

/** Móvel em que o robô bateria. Voando rente ao chão, ele contorna todos, cadeiras inclusive. */
export function solidsOf(world: FlightWorld): OfficeBounds[] {
  const solids: OfficeBounds[] = [];
  for (const items of Object.values(world.footprints)) {
    solids.push(...items);
  }
  for (const prop of world.props) {
    if (prop.kind !== "planta") continue;
    const half = prop.width / 2;
    solids.push({ minX: prop.at[0] - half, maxX: prop.at[0] + half, minZ: prop.at[2] - half, maxZ: prop.at[2] + half });
  }
  return solids;
}

class FlightGrid {
  readonly columns: number;
  readonly rows: number;
  readonly blocked: Uint8Array;

  constructor(solids: readonly OfficeBounds[]) {
    const { minX, maxX, minZ, maxZ } = FLOOR_BOUNDS;
    this.columns = Math.ceil((maxX - minX) / CELL) + 1;
    this.rows = Math.ceil((maxZ - minZ) / CELL) + 1;
    this.blocked = new Uint8Array(this.columns * this.rows);
    for (const solid of solids) {
      const fromColumn = Math.max(0, Math.floor((solid.minX - FLIGHT_CLEARANCE - minX) / CELL));
      const toColumn = Math.min(this.columns - 1, Math.ceil((solid.maxX + FLIGHT_CLEARANCE - minX) / CELL));
      const fromRow = Math.max(0, Math.floor((solid.minZ - FLIGHT_CLEARANCE - minZ) / CELL));
      const toRow = Math.min(this.rows - 1, Math.ceil((solid.maxZ + FLIGHT_CLEARANCE - minZ) / CELL));
      for (let row = fromRow; row <= toRow; row += 1) this.blocked.fill(1, row * this.columns + fromColumn, row * this.columns + toColumn + 1);
    }
  }

  x = (column: number) => FLOOR_BOUNDS.minX + column * CELL;
  z = (row: number) => FLOOR_BOUNDS.minZ + row * CELL;
  column = (x: number) => Math.round((x - FLOOR_BOUNDS.minX) / CELL);
  row = (z: number) => Math.round((z - FLOOR_BOUNDS.minZ) / CELL);
}

/** A* em 8 direções sobre a grade. Empates decididos pela ordem das células: sempre igual. */
function findPath(grid: FlightGrid, room: OfficeRoom, from: Point, to: Point): Point[] | null {
  const { columns, rows, blocked } = grid;
  // O posto é a saída: a folga da mesa, que fica colada nele, não pode prender o robô ali.
  const onOwnPost = (column: number, row: number) => Math.abs(grid.x(column) - from.x) <= POST_HALF && Math.abs(grid.z(row) - from.z) <= POST_HALF;
  const free = (column: number, row: number) =>
    column >= 0 && row >= 0 && column < columns && row < rows && (onOwnPost(column, row) || !blocked[row * columns + column]) && flightAllowed(room, grid.x(column), grid.z(row));
  const startColumn = grid.column(from.x);
  const startRow = grid.row(from.z);
  const endColumn = grid.column(to.x);
  const endRow = grid.row(to.z);
  const start = startRow * columns + startColumn;
  const end = endRow * columns + endColumn;
  const cost = new Float32Array(columns * rows).fill(Infinity);
  const parent = new Int32Array(columns * rows).fill(-1);
  const closed = new Uint8Array(columns * rows);
  const heuristic = (column: number, row: number) => {
    const dx = Math.abs(column - endColumn);
    const dz = Math.abs(row - endRow);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  cost[start] = 0;
  const open: number[] = [start];
  const priority = new Float32Array(columns * rows).fill(Infinity);
  priority[start] = heuristic(startColumn, startRow);
  while (open.length > 0) {
    let bestIndex = 0;
    for (let index = 1; index < open.length; index += 1) if (priority[open[index]!]! < priority[open[bestIndex]!]!) bestIndex = index;
    const current = open[bestIndex]!;
    open[bestIndex] = open[open.length - 1]!;
    open.pop();
    if (current === end) break;
    if (closed[current]) continue;
    closed[current] = 1;
    const row = Math.floor(current / columns);
    const column = current - row * columns;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if ((dx === 0 && dz === 0) || !free(column + dx, row + dz)) continue;
        // Em diagonal não raspa a quina: as duas laterais também precisam estar livres.
        if (dx !== 0 && dz !== 0 && (!free(column + dx, row) || !free(column, row + dz))) continue;
        const next = (row + dz) * columns + column + dx;
        const tentative = cost[current]! + (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1);
        if (tentative < cost[next]!) {
          cost[next] = tentative;
          parent[next] = current;
          priority[next] = tentative + heuristic(column + dx, row + dz);
          open.push(next);
        }
      }
    }
  }
  if (parent[end] === -1 && start !== end) return null;
  const cells: Point[] = [];
  for (let at = end; at !== -1; at = parent[at]!) {
    const row = Math.floor(at / columns);
    cells.push({ x: grid.x(at - row * columns), z: grid.z(row) });
  }
  cells.reverse();
  // Tira os degraus da grade: mantém só onde a linha reta deixaria de estar livre.
  const clear = (a: Point, b: Point) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL / 2));
    for (let step = 0; step <= steps; step += 1) {
      const t = steps === 0 ? 0 : step / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      if (!free(grid.column(x), grid.row(z))) return false;
    }
    return true;
  };
  const kept: Point[] = [cells[0]!];
  let anchor = 0;
  while (anchor < cells.length - 1) {
    let next = cells.length - 1;
    while (next > anchor + 1 && !clear(cells[anchor]!, cells[next]!)) next -= 1;
    kept.push(cells[next]!);
    anchor = next;
  }
  return kept;
}

/** Para onde cada sala voa. Pontos diferentes para os robôs se encontrarem pouco. */
function destinations(): Record<string, Point> {
  const west = OFFICE_ROOMS_BY_ID.engenharia!.bounds.maxX + CORRIDOR / 2;
  const east = OFFICE_ROOMS_BY_ID.comando!.bounds.maxX + CORRIDOR / 2;
  const north = OFFICE_ROOMS_BY_ID.engenharia!.bounds.maxZ + CORRIDOR / 2;
  const south = OFFICE_ROOMS_BY_ID.pesquisa!.bounds.maxZ + CORRIDOR / 2;
  const { minZ, maxZ, maxX } = FLOOR_BOUNDS;
  return {
    engenharia: { x: west, z: north },
    comando: { x: east, z: north },
    comunidade: { x: east, z: minZ + 0.9 },
    pesquisa: { x: west, z: south },
    produto: { x: maxX - 1.2, z: south },
    conteudo: { x: west, z: maxZ - 1 },
    operacoes: { x: east, z: south },
  };
}

/**
 * Um plano por robô em posto de departamento. Quem não tem caminho fica sem plano e
 * simplesmente flutua no posto: nunca atravessa nada para chegar lá.
 */
export function buildFlightPlans(seated: readonly { botId: string; seat: OfficeSeat }[], world: FlightWorld): FlightPlan[] {
  const grid = new FlightGrid(solidsOf(world));
  const goals = destinations();
  const flyers = seated.filter(({ seat }) => goals[seat.roomId]).sort((a, b) => a.botId.localeCompare(b.botId));
  const plans: FlightPlan[] = [];
  flyers.forEach(({ botId, seat }, index) => {
    const room = OFFICE_ROOMS_BY_ID[seat.roomId]!;
    const path = findPath(grid, room, seat, goals[seat.roomId]!);
    if (!path) return;
    const route = [{ x: seat.x, z: seat.z }, ...path.slice(1)];
    const length = pathLength(route);
    plans.push({ botId, home: seat, path: route, length, leg: length / FLIGHT_SPEED, start: (index * FLIGHT_PERIOD) / flyers.length });
  });
  return plans;
}

function ease(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Quantos metros do posto, ao longo do caminho, neste instante. */
export function flightDistanceAt(plan: FlightPlan, seconds: number): number {
  const local = (((seconds - plan.start) % FLIGHT_PERIOD) + FLIGHT_PERIOD) % FLIGHT_PERIOD;
  if (local < plan.leg) return plan.length * ease(local / plan.leg);
  if (local < plan.leg + FLIGHT_HOLD) return plan.length;
  if (local < plan.leg * 2 + FLIGHT_HOLD) return plan.length * ease(1 - (local - plan.leg - FLIGHT_HOLD) / plan.leg);
  return 0;
}

export function flightPointAt(plan: FlightPlan, seconds: number): Point {
  const { x, z } = pathPose(plan.path, flightDistanceAt(plan, seconds));
  return { x, z };
}

/** Flutuação de quem está no ar. O mesmo instante dá a mesma altura. */
export function bobAt(seconds: number, phase: number): number {
  return Math.sin(seconds * 1.7 + phase) * 0.03 + Math.sin(seconds * 0.73 + phase * 1.7) * 0.012;
}

export function botPhase(botId: string): number {
  return [...botId].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.73;
}

/**
 * Selecionar traz o robô de volta pelo mesmo caminho, sem cortar parede. Ao soltar, ele
 * espera o voo agendado alcançá-lo em vez de saltar até onde estaria.
 */
export const SELECTED_RETURN_SPEED = 2.4;

export function nextFlightCap(cap: number, scheduled: number, selected: boolean, delta: number): number {
  if (selected) return Math.max(0, Math.min(cap, scheduled) - SELECTED_RETURN_SPEED * delta);
  return scheduled <= cap ? Infinity : cap;
}
