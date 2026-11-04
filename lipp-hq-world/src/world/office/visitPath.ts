/** Caminho com cantos arredondados, parametrizado pela distância (metros). */
export type Point = readonly [number, number];
export interface PathFrame { x: number; z: number; yaw: number }
export interface Footstep extends PathFrame { lift: number; planted: boolean }
interface Sample extends PathFrame { distance: number }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: Point, b: Point, t: number): Point => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const turnAngle = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const ease = (t: number) => t * t * (3 - 2 * t);
export const STRIDE_LENGTH = 0.48;

export class VisitPath {
  private readonly samples: Sample[] = [];
  readonly length: number;
  readonly stride: number;

  constructor(points: readonly Point[]) {
    const add = (point: Point, tangent: Point) => {
      const previous = this.samples.at(-1);
      const gap = previous ? Math.hypot(point[0] - previous.x, point[1] - previous.z) : 0;
      this.samples.push({ x: point[0], z: point[1], yaw: Math.atan2(tangent[0], tangent[1]), distance: (previous?.distance ?? 0) + gap });
    };
    let cursor = points[0]!;
    const line = (end: Point) => {
      const start = cursor;
      const tangent: Point = [end[0] - start[0], end[1] - start[1]];
      const steps = Math.max(1, Math.ceil(distance(start, end) / 0.025));
      for (let i = this.samples.length ? 1 : 0; i <= steps; i++) add(mix(start, end, i / steps), tangent);
      cursor = end;
    };
    for (let i = 1; i < points.length - 1; i++) {
      const before = points[i - 1]!, corner = points[i]!, after = points[i + 1]!;
      // Raio pequeno e limitado pelos segmentos: não corta a quina de uma parede.
      const trim = Math.min(0.18, distance(before, corner) / 3, distance(corner, after) / 3);
      const entry = mix(corner, before, trim / distance(before, corner));
      const exit = mix(corner, after, trim / distance(corner, after));
      line(entry);
      for (let j = 1; j <= 24; j++) {
        const t = j / 24;
        const a = mix(entry, corner, t), b = mix(corner, exit, t);
        add(mix(a, b, t), [b[0] - a[0], b[1] - a[1]]);
      }
      cursor = exit;
    }
    line(points.at(-1)!);
    this.length = this.samples.at(-1)!.distance;
    this.stride = this.length / Math.ceil(this.length / STRIDE_LENGTH);
  }

  at(distance: number): PathFrame {
    const d = Math.max(0, Math.min(this.length, distance));
    let low = 0, high = this.samples.length - 1;
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (this.samples[mid]!.distance < d) low = mid;
      else high = mid;
    }
    const a = this.samples[low]!, b = this.samples[high]!;
    const t = (d - a.distance) / Math.max(1e-9, b.distance - a.distance);
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), yaw: a.yaw + turnAngle(a.yaw, b.yaw) * t };
  }

  /** A pegada depende da distância no caminho, nunca da posição atual do corpo.
   * Durante o apoio, posição E orientação ficam constantes no mundo, inclusive nas curvas. */
  foot(distance: number, side: "L" | "R"): Footstep {
    const offset = side === "L" ? 0 : 0.5;
    const cycle = distance / this.stride + offset;
    const step = Math.floor(cycle);
    const phase = cycle - step;
    const contact = (step - offset) * this.stride;
    const footprint = (d: number) => this.at(d <= 0 ? 0 : d >= this.length - this.stride / 2 - 1e-8 ? this.length : d + this.stride / 4);
    const from = footprint(contact);
    if (phase <= 0.5) return { ...from, lift: 0, planted: true };
    const to = footprint(contact + this.stride);
    const swing = (phase - 0.5) * 2;
    const t = ease(swing);
    // No começo/fim, as duas pegadas convergem para a postura de repouso.
    const travel = Math.hypot(to.x - from.x, to.z - from.z);
    return {
      x: lerp(from.x, to.x, t), z: lerp(from.z, to.z, t),
      yaw: from.yaw + turnAngle(from.yaw, to.yaw) * t,
      lift: Math.sin(Math.PI * swing) * Math.min(0.08, travel * 0.3), planted: false,
    };
  }
}
