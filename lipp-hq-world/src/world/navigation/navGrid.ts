import { BUILDING } from "@/config/constants";
import { ROOMS } from "@/world/rooms/rooms";
import { WALLS } from "@/world/walls/walls";
import { solidPieces } from "@/world/walls/WallSegment";

export interface NavPoint {
  x: number;
  z: number;
}

const CELL = 0.5;

const GRID_W = Math.ceil((BUILDING.maxX - BUILDING.minX) / CELL);
const GRID_H = Math.ceil((BUILDING.maxZ - BUILDING.minZ) / CELL);

/** Raio de folga do personagem: metade da espessura da parede + corpo. */
const WALL_MARGIN = 0.1 + 0.22;

/** Pegadas de mobiliário por sala, em coordenadas de mundo. */
function furnitureFootprints(): Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> {
  const rects: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];

  for (const room of ROOMS) {
    const { bounds } = room;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;

    if (room.id === "reunioes") {
      rects.push({ minX: cx - 1.9, maxX: cx + 1.9, minZ: cz - 0.95, maxZ: cz + 0.95 });
      continue;
    }
    if (room.kind === "common") {
      // plantas do hall
      rects.push(
        { minX: -3.0, maxX: -2.2, minZ: -1.8, maxZ: -1.0 },
        { minX: 2.2, maxX: 3.0, minZ: 1.0, maxZ: 1.8 },
        { minX: -3.0, maxX: -2.2, minZ: 1.4, maxZ: 2.2 },
        { minX: 2.2, maxX: 3.0, minZ: -2.2, maxZ: -1.4 },
      );
      continue;
    }

    // mesa encostada na parede norte + plantas nos cantos opostos
    rects.push({ minX: cx - 1.35, maxX: cx + 1.35, minZ: bounds.minZ + 0.5, maxZ: bounds.minZ + 1.8 });
    if (room.agentId === "scout" || room.agentId === "atlas") {
      // estantes ocupam mais profundidade
      const shelfX = room.agentId === "scout" ? bounds.minX : bounds.maxX;
      rects.push({
        minX: Math.min(shelfX, shelfX + (room.agentId === "scout" ? 1.2 : -1.2)),
        maxX: Math.max(shelfX, shelfX + (room.agentId === "scout" ? 1.2 : -1.2)),
        minZ: cz - 0.95,
        maxZ: cz + 0.95,
      });
    }
  }

  return rects;
}

const FOOTPRINTS = furnitureFootprints();

/** Segmentos sólidos de parede (respeitando os vãos de porta), no plano XZ. */
const WALL_SEGMENTS = WALLS.flatMap((wall) =>
  solidPieces(wall).map((piece) => ({
    axis: wall.axis,
    fixed: wall.fixed,
    start: piece.center - piece.length / 2 - 0.09,
    end: piece.center + piece.length / 2 + 0.09,
  })),
);

function blockedByWall(x: number, z: number): boolean {
  for (const segment of WALL_SEGMENTS) {
    if (segment.axis === "x") {
      if (x >= segment.start && x <= segment.end && Math.abs(z - segment.fixed) < WALL_MARGIN) {
        return true;
      }
    } else {
      if (z >= segment.start && z <= segment.end && Math.abs(x - segment.fixed) < WALL_MARGIN) {
        return true;
      }
    }
  }
  return false;
}

function blockedByFurniture(x: number, z: number): boolean {
  for (const rect of FOOTPRINTS) {
    if (x > rect.minX - 0.18 && x < rect.maxX + 0.18 && z > rect.minZ - 0.18 && z < rect.maxZ + 0.18) {
      return true;
    }
  }
  return false;
}

function buildWalkable(): Uint8Array {
  const grid = new Uint8Array(GRID_W * GRID_H);
  for (let gx = 0; gx < GRID_W; gx += 1) {
    for (let gz = 0; gz < GRID_H; gz += 1) {
      const x = BUILDING.minX + gx * CELL + CELL / 2;
      const z = BUILDING.minZ + gz * CELL + CELL / 2;
      grid[gz * GRID_W + gx] =
        blockedByWall(x, z) || blockedByFurniture(x, z) ? 0 : 1;
    }
  }
  return grid;
}

const WALKABLE = buildWalkable();

function toCell(x: number, z: number): NavPoint {
  return {
    x: Math.max(0, Math.min(GRID_W - 1, Math.round((x - BUILDING.minX - CELL / 2) / CELL))),
    z: Math.max(0, Math.min(GRID_H - 1, Math.round((z - BUILDING.minZ - CELL / 2) / CELL))),
  };
}

function toWorld(gx: number, gz: number): NavPoint {
  return {
    x: BUILDING.minX + gx * CELL + CELL / 2,
    z: BUILDING.minZ + gz * CELL + CELL / 2,
  };
}

function isWalkable(gx: number, gz: number): boolean {
  return gx >= 0 && gz >= 0 && gx < GRID_W && gz < GRID_H && WALKABLE[gz * GRID_W + gx] === 1;
}

/** Linha de visão caminhável entre duas células (para suavizar o caminho). */
function lineWalkable(from: NavPoint, to: NavPoint): boolean {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.z - from.z));
  for (let step = 1; step < steps; step += 1) {
    const gx = Math.round(from.x + ((to.x - from.x) * step) / steps);
    const gz = Math.round(from.z + ((to.z - from.z) * step) / steps);
    if (!isWalkable(gx, gz)) return false;
  }
  return true;
}

/**
 * A* em grade 4-direções com suavização por linha de visão. Retorna pontos em
 * coordenadas de mundo, do ponto inicial ao destino (exclusivos).
 */
export function findPath(startX: number, startZ: number, endX: number, endZ: number): NavPoint[] {
  const start = toCell(startX, startZ);
  const goal = toCell(endX, endZ);

  if (!isWalkable(goal.x, goal.z)) {
    // procura a célula caminhável mais próxima do destino
    let best: NavPoint | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let radius = 1; radius < 8 && !best; radius += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          if (isWalkable(goal.x + dx, goal.z + dz)) {
            const dist = dx * dx + dz * dz;
            if (dist < bestDist) {
              bestDist = dist;
              best = { x: goal.x + dx, z: goal.z + dz };
            }
          }
        }
      }
    }
    if (!best) return [];
    goal.x = best.x;
    goal.z = best.z;
  }

  const open: Array<{ index: number; f: number }> = [];
  const gScore = new Float32Array(GRID_W * GRID_H).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(GRID_W * GRID_H).fill(-1);
  const closed = new Uint8Array(GRID_W * GRID_H);
  const heuristic = (gx: number, gz: number) => Math.abs(gx - goal.x) + Math.abs(gz - goal.z);

  const startIndex = start.z * GRID_W + start.x;
  gScore[startIndex] = 0;
  open.push({ index: startIndex, f: heuristic(start.x, start.z) });

  while (open.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i += 1) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open.splice(bestIdx, 1)[0];
    if (closed[current.index]) continue;
    closed[current.index] = 1;

    const cx = current.index % GRID_W;
    const cz = Math.floor(current.index / GRID_W);
    if (cx === goal.x && cz === goal.z) break;

    const neighbors: Array<[number, number, number]> = [
      [cx + 1, cz, 1],
      [cx - 1, cz, 1],
      [cx, cz + 1, 1],
      [cx, cz - 1, 1],
    ];
    for (const [nx, nz, cost] of neighbors) {
      if (!isWalkable(nx, nz)) continue;
      const nextIndex = nz * GRID_W + nx;
      const tentative = gScore[current.index] + cost;
      if (tentative < gScore[nextIndex]) {
        gScore[nextIndex] = tentative;
        cameFrom[nextIndex] = current.index;
        open.push({ index: nextIndex, f: tentative + heuristic(nx, nz) });
      }
    }
  }

  const goalIndex = goal.z * GRID_W + goal.x;
  if (!Number.isFinite(gScore[goalIndex])) return [];

  // reconstrói e suaviza
  const cells: NavPoint[] = [];
  let cursor = goalIndex;
  while (cursor !== startIndex && cursor >= 0) {
    cells.push({ x: cursor % GRID_W, z: Math.floor(cursor / GRID_W) });
    cursor = cameFrom[cursor];
  }
  cells.reverse();
  if (cells.length === 0) return [];

  const smoothed: NavPoint[] = [];
  let anchor: NavPoint = { x: start.x, z: start.z };
  let i = 0;
  while (i < cells.length) {
    let jump = cells.length - 1;
    while (jump > i && !lineWalkable(anchor, cells[jump])) jump -= 1;
    smoothed.push(toWorld(cells[jump].x, cells[jump].z));
    anchor = cells[jump];
    i = jump + 1;
  }

  return smoothed;
}
