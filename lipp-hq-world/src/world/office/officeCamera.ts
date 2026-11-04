import { WALL_HEIGHT, type OfficeBounds } from "./officeLayout";

/**
 * Câmera do escritório como matemática pura: azimute fixo em 45° e elevação em 30°,
 * os mesmos da sala aprovada. Sem órbita, as paredes em corte nunca ficam na frente
 * de ninguém. O clique, os rótulos e o enquadramento usam estas funções, então o que
 * se vê e o que se clica não têm como divergir.
 */
export const ELEVATION = (30 * Math.PI) / 180;
export const AZIMUTH = Math.PI / 4;

const sinA = Math.sin(AZIMUTH);
const cosA = Math.cos(AZIMUTH);
const sinE = Math.sin(ELEVATION);
const cosE = Math.cos(ELEVATION);

type V3 = readonly [number, number, number];

/** Eixos da tela no mundo e direção para onde a câmera olha. */
export const RIGHT: V3 = [cosA, 0, -sinA];
export const UP: V3 = [-sinE * sinA, cosE, -sinE * cosA];
export const FORWARD: V3 = [-cosE * sinA, -sinE, -cosE * cosA];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Alvo no chão e pixels por metro. */
export interface OfficeView {
  x: number;
  z: number;
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Faixas da tela cobertas por painéis. */
export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const NO_INSETS: Insets = { left: 0, right: 0, top: 0, bottom: 0 };

/** Alvo no chão que cai nas coordenadas de tela `r` e `u` (metros ao longo de RIGHT e UP). */
function groundFromScreenAxes(r: number, u: number): { x: number; z: number } {
  // r = cosA·x − sinA·z ; u = −sinE·(sinA·x + cosA·z)
  const sum = -u / sinE;
  return { x: (r * cosA + sum * sinA), z: (-r * sinA + sum * cosA) };
}

/** Enquadra uma caixa (do chão até `top`) na área livre da tela. */
export function fitView(
  bounds: OfficeBounds,
  viewport: Viewport,
  insets: Insets = NO_INSETS,
  { top = WALL_HEIGHT, margin = 0.05, bottom = -0.3 }: { top?: number; margin?: number; bottom?: number } = {},
): OfficeView {
  let minR = Infinity;
  let maxR = -Infinity;
  let minU = Infinity;
  let maxU = -Infinity;
  for (const x of [bounds.minX, bounds.maxX]) {
    for (const z of [bounds.minZ, bounds.maxZ]) {
      for (const y of [bottom, top]) {
        const point: V3 = [x, y, z];
        const r = dot(point, RIGHT);
        const u = dot(point, UP);
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
      }
    }
  }
  const freeWidth = Math.max(80, viewport.width - insets.left - insets.right);
  const freeHeight = Math.max(80, viewport.height - insets.top - insets.bottom);
  const zoom = Math.min(freeWidth / (maxR - minR), freeHeight / (maxU - minU)) * (1 - margin * 2);
  // Quanto o centro da área livre está longe do centro da tela, em metros.
  const shiftR = (insets.left - insets.right) / 2 / zoom;
  const shiftU = (insets.bottom - insets.top) / 2 / zoom;
  return { ...groundFromScreenAxes((minR + maxR) / 2 - shiftR, (minU + maxU) / 2 - shiftU), zoom };
}

/** Ponto do mundo em pixels da tela. */
export function worldToScreen(point: V3, view: OfficeView, viewport: Viewport): { x: number; y: number } {
  const relative: V3 = [point[0] - view.x, point[1], point[2] - view.z];
  return {
    x: viewport.width / 2 + dot(relative, RIGHT) * view.zoom,
    y: viewport.height / 2 - dot(relative, UP) * view.zoom,
  };
}

/** Origem de um raio paralelo (projeção ortográfica) sob um pixel. */
export function screenRayOrigin(px: number, py: number, view: OfficeView, viewport: Viewport): [number, number, number] {
  const r = (px - viewport.width / 2) / view.zoom;
  const u = (viewport.height / 2 - py) / view.zoom;
  return [
    view.x + RIGHT[0] * r + UP[0] * u,
    UP[1] * u,
    view.z + RIGHT[2] * r + UP[2] * u,
  ];
}

/** Onde o raio de um pixel encontra um plano horizontal. */
export function screenToGround(px: number, py: number, view: OfficeView, viewport: Viewport, y = 0): { x: number; z: number } {
  const origin = screenRayOrigin(px, py, view, viewport);
  const t = (y - origin[1]) / FORWARD[1];
  return { x: origin[0] + FORWARD[0] * t, z: origin[2] + FORWARD[2] * t };
}

/** Contorno de uma caixa na tela (envoltória convexa), para destacar a sala em foco. */
export function boxSilhouette(bounds: OfficeBounds, view: OfficeView, viewport: Viewport, top = WALL_HEIGHT, grow = 0.18): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (const x of [bounds.minX - grow, bounds.maxX + grow]) {
    for (const z of [bounds.minZ - grow, bounds.maxZ + grow]) {
      for (const y of [-0.3, top]) points.push(worldToScreen([x, y, z], view, viewport));
    }
  }
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: typeof points) => {
    const out: typeof points = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, point) <= 0) out.pop();
      out.push(point);
    }
    out.pop();
    return out;
  };
  return [...half(points), ...half([...points].reverse())];
}

/** Arrastar `dx`, `dy` pixels leva junto o chão que está sob o ponteiro. */
export function panView(view: OfficeView, dx: number, dy: number): OfficeView {
  const moved = groundFromScreenAxes(dot([view.x, 0, view.z], RIGHT) - dx / view.zoom, dot([view.x, 0, view.z], UP) + dy / view.zoom);
  return { ...moved, zoom: view.zoom };
}

/** Zoom mantendo parado o ponto sob o ponteiro. */
export function zoomViewAt(view: OfficeView, nextZoom: number, px: number, py: number, viewport: Viewport): OfficeView {
  const before = screenToGround(px, py, view, viewport);
  const scaled = { ...view, zoom: nextZoom };
  const after = screenToGround(px, py, scaled, viewport);
  return { x: view.x + before.x - after.x, z: view.z + before.z - after.z, zoom: nextZoom };
}

/** Mantém o alvo sobre o prédio: o andar nunca some da tela por arrastar demais. */
export function clampView(view: OfficeView, floor: OfficeBounds, min: number, max: number): OfficeView {
  return {
    x: Math.min(floor.maxX + 2, Math.max(floor.minX - 2, view.x)),
    z: Math.min(floor.maxZ + 2, Math.max(floor.minZ - 2, view.z)),
    zoom: Math.min(max, Math.max(min, view.zoom)),
  };
}

/** Faixa de zoom: do andar com folga até uma pessoa ocupar boa parte da tela. */
export function zoomLimits(floorZoom: number): { min: number; max: number } {
  return { min: floorZoom * 0.7, max: Math.max(floorZoom * 7, 170) };
}

/** Caixa alinhada aos eixos que o clique testa contra o raio da tela. */
export interface PickBox {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** A caixa mais perto da câmera sob o pixel, ou null. Método das fatias. */
export function pickBoxAt(px: number, py: number, view: OfficeView, viewport: Viewport, boxes: readonly PickBox[]): string | null {
  const origin = screenRayOrigin(px, py, view, viewport);
  let best: { id: string; t: number } | null = null;
  for (const box of boxes) {
    let near = -Infinity;
    let far = Infinity;
    const slabs: Array<[number, number, number, number]> = [
      [origin[0], FORWARD[0], box.minX, box.maxX],
      [origin[1], FORWARD[1], box.minY, box.maxY],
      [origin[2], FORWARD[2], box.minZ, box.maxZ],
    ];
    for (const [start, direction, low, high] of slabs) {
      const a = (low - start) / direction;
      const b = (high - start) / direction;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
    }
    if (near <= far && (!best || near < best.t)) best = { id: box.id, t: near };
  }
  return best?.id ?? null;
}
