import { BUILDING_HEIGHT, CROWN_HEIGHT, CROWN_STEPS, FACADE_BOUNDS, FLOOR_LEVEL, STORY, viewElevation, type BuildingView, type FloorId } from "./officeBuilding";
import type { OfficeBounds } from "./officeLayout";

/**
 * O caminho entre duas vistas do prédio, como matemática pura.
 *
 * O prédio é um só e fica parado: quem anda é a altura do corte (`cut`). Acima dela a fachada não
 * é desenhada, e uma laje tampa o que ficou embaixo. Sair de um andar é erguer a fachada em volta
 * dele até a laje fechá-lo; chegar é o inverso, em cima do andar novo. Só existe um andar à mostra
 * de cada vez, e a troca acontece com a laje fechada: nenhum andar flutua, atravessa outro ou é
 * cortado no meio dos móveis.
 */
export const TOWER_TOP = BUILDING_HEIGHT + CROWN_HEIGHT + 0.5;

const MIN_MS = 480;
const MAX_MS = 650;
/** Quanto do caminho vale a duração máxima, em metros: a torre inteira. */
const FULL_TRIP = BUILDING_HEIGHT;

export const restCut = (view: BuildingView) => (view === "exterior" ? TOWER_TOP : FLOOR_LEVEL[view] * STORY);
const ceilingOf = (floor: FloorId) => (FLOOR_LEVEL[floor] + 1) * STORY;

export interface TravelPlan {
  target: BuildingView;
  /** Alturas por onde o corte passa, em ordem. */
  points: number[];
  /** Comprimento total do caminho do corte. */
  length: number;
  /** Até este tanto do caminho o andar de saída ainda está à mostra. */
  coverEnd: number;
  /** A partir deste tanto do caminho o andar de chegada já está à mostra. */
  revealStart: number;
  departing: FloorId | null;
  arriving: FloorId | null;
  duration: number;
  /** Veio de outra viagem: começa em movimento, sem a parada do início suave. */
  redirected: boolean;
}

/** Monta o caminho de onde o corte está agora; serve tanto de parado quanto no meio de outra viagem. */
export function planTravel(from: { cut: number; shown: FloorId | null; moving: boolean; elevation: number }, target: BuildingView): TravelPlan {
  const arriving = target === "exterior" ? null : target;
  // Voltar para o andar que ainda está à mostra é só desfazer o que já andou.
  const same = from.shown !== null && from.shown === arriving;
  const departing = same ? null : from.shown;
  const points = [from.cut];
  if (departing) points.push(ceilingOf(departing));
  const coverIndex = points.length - 1;
  if (arriving && !same) points.push(ceilingOf(arriving));
  const revealIndex = points.length - 1;
  points.push(restCut(target));
  let length = 0;
  const reach = points.map((point, index) => {
    if (index > 0) length += Math.abs(point - points[index - 1]!);
    return length;
  });
  const span = Math.max(length, Math.abs(viewElevation(target) - from.elevation));
  return {
    target,
    points,
    length,
    coverEnd: length > 0 ? reach[coverIndex]! / length : 0,
    revealStart: length > 0 ? reach[revealIndex]! / length : 0,
    departing,
    arriving,
    duration: MIN_MS + (MAX_MS - MIN_MS) * Math.min(1, span / FULL_TRIP),
    redirected: from.moving,
  };
}

/** Sai devagar e chega devagar; depois de um redirecionamento já sai andando. */
export function travelProgress(plan: Pick<TravelPlan, "duration" | "redirected">, elapsed: number): number {
  const t = Math.min(1, Math.max(0, elapsed / plan.duration));
  if (plan.redirected) return 1 - (1 - t) ** 3;
  return t < 0.5 ? 4 * t ** 3 : 1 - (2 * (1 - t)) ** 3 / 2;
}

export function cutAt(plan: TravelPlan, progress: number): number {
  if (plan.length === 0) return plan.points.at(-1)!;
  let left = progress * plan.length;
  for (let index = 1; index < plan.points.length; index += 1) {
    const start = plan.points[index - 1]!;
    const end = plan.points[index]!;
    const leg = Math.abs(end - start);
    if (left <= leg && leg > 0) return start + Math.sign(end - start) * left;
    left -= leg;
  }
  return plan.points.at(-1)!;
}

/** O único andar à mostra neste ponto do caminho. */
export function shownAt(plan: TravelPlan, progress: number): FloorId | null {
  if (plan.departing && progress < plan.coverEnd) return plan.departing;
  if (plan.arriving && progress >= plan.revealStart) return plan.arriving;
  return null;
}

/** Laje do corte: transparente colada no andar à mostra, fechada a um pavimento dele. */
export function plateOpacity(cut: number, shown: FloorId | null): number {
  if (shown === null) return 1;
  const t = Math.min(1, Math.max(0, (cut - FLOOR_LEVEL[shown] * STORY) / STORY));
  return t * t * (3 - 2 * t);
}

const SPIRE_BASE = 2.2;

/** A seção do prédio nesta altura: a coroa recua em degraus. Acima da base da agulha, não há o que tampar. */
export function sectionAt(cut: number): OfficeBounds | null {
  const { minX, maxX, minZ, maxZ } = FACADE_BOUNDS;
  let inset = 0;
  let bottom = BUILDING_HEIGHT;
  if (cut > bottom) {
    for (const step of CROWN_STEPS) {
      inset = step.inset;
      bottom += step.height;
      if (cut <= bottom) break;
    }
    if (cut > bottom) {
      if (cut > bottom + 0.7) return null;
      const x = (minX + maxX) / 2;
      const z = (minZ + maxZ) / 2;
      return { minX: x - SPIRE_BASE / 2, maxX: x + SPIRE_BASE / 2, minZ: z - SPIRE_BASE / 2, maxZ: z + SPIRE_BASE / 2 };
    }
  }
  // Até o beiral da laje real: a borda da seção é a mesma do piso que ela esconde.
  const lip = inset === 0 ? 0.25 : 0;
  return { minX: minX + inset - lip, maxX: maxX - inset + lip, minZ: minZ + inset - lip, maxZ: maxZ - inset + lip };
}

export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
