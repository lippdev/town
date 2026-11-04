import type {
  BufferGeometry} from "three";
import {
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  Matrix4,
  PlaneGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * O kit do escritório: toda peça fixa vira uma das poucas malhas por material.
 * O andar inteiro custa uma dúzia de chamadas de desenho, em vez de uma por móvel.
 */
export type SurfaceKey = "wood" | "stone" | "fabric" | "matte" | "glass" | "screen" | "sign" | "glow";

export const SURFACE_KEYS: readonly SurfaceKey[] = ["wood", "stone", "fabric", "matte", "glass", "screen", "sign", "glow"];

export type Vec3 = readonly [number, number, number];

export interface PartOptions {
  /** Material; sem nada é o fosco com a cor pedida. */
  surface?: SurfaceKey;
  color?: string;
  /** Peça miúda não projeta sombra: de cima ela não aparece. */
  cast?: boolean;
  /** Metros por repetição da textura. */
  tile?: readonly [number, number];
  /** Inclinação em X, em torno do próprio centro (venezianas). */
  tilt?: number;
}

export type PropKind = "planta" | "luminaria";

/** Peça de GLB: fica de fora da fusão e entra como instância. */
export interface PropPlacement {
  kind: PropKind;
  at: Vec3;
  yaw: number;
  width: number;
}

/** Área de chão ocupada por um móvel, em coordenadas do andar. */
export interface Footprint {
  label: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Metros por repetição, vindos dos ajustes da sala aprovada. */
export const FLOOR_TILE = [3.05, 2.4] as const;
export const FURNITURE_TILE = [4, 1.9] as const;
const STONE_TILE = [2.3, 2.3] as const;
const FABRIC_TILE = [0.3, 0.3] as const;

const DEFAULT_TILE: Record<SurfaceKey, readonly [number, number]> = {
  wood: FURNITURE_TILE,
  stone: STONE_TILE,
  fabric: FABRIC_TILE,
  matte: [1, 1],
  glass: [1, 1],
  screen: [1, 1],
  sign: [1, 1],
  glow: [1, 1],
};

const scratch = new Color();

/** Grupo de peças por material e por projetar sombra. */
export type Batch = Map<string, BufferGeometry>;

export function batchKey(surface: SurfaceKey, cast: boolean) {
  return `${surface}:${cast ? "cast" : "still"}`;
}

export class KitBuilder {
  private readonly parts = new Map<string, BufferGeometry[]>();
  private matrix = new Matrix4();
  private seed = 0;
  private yaw = 0;
  triangles = 0;
  readonly props: PropPlacement[] = [];
  readonly footprints: Footprint[] = [];

  /** Peças dentro de `fn` ficam no referencial deslocado e girado em Y. */
  at(position: Vec3, yaw: number, fn: () => void) {
    const saved = this.matrix;
    const savedYaw = this.yaw;
    this.matrix = saved.clone().multiply(new Matrix4().makeRotationY(yaw).setPosition(position[0], position[1], position[2]));
    this.yaw += yaw;
    fn();
    this.matrix = saved;
    this.yaw = savedYaw;
  }

  prop(kind: PropKind, at: Vec3, width: number, yaw = 0) {
    const world = new Vector3(at[0], at[1], at[2]).applyMatrix4(this.matrix);
    this.props.push({ kind, at: [world.x, world.y, world.z], yaw: this.yaw + yaw, width });
  }

  /** Registra o móvel que ocupa `width` × `depth` em volta de (x, z) neste referencial. */
  solid(label: string, x: number, z: number, width: number, depth: number) {
    const corners = [
      [x - width / 2, z - depth / 2],
      [x + width / 2, z - depth / 2],
      [x - width / 2, z + depth / 2],
      [x + width / 2, z + depth / 2],
    ].map(([cx, cz]) => new Vector3(cx, 0, cz).applyMatrix4(this.matrix));
    this.footprints.push({
      label,
      minX: Math.min(...corners.map((corner) => corner.x)),
      maxX: Math.max(...corners.map((corner) => corner.x)),
      minZ: Math.min(...corners.map((corner) => corner.z)),
      maxZ: Math.max(...corners.map((corner) => corner.z)),
    });
  }

  box(at: Vec3, size: Vec3, options: PartOptions = {}) {
    this.add(new BoxGeometry(size[0], size[1], size[2]), at, options);
  }

  rounded(at: Vec3, size: Vec3, radius: number, options: PartOptions = {}, rotationZ = 0) {
    const geometry = new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius);
    if (rotationZ !== 0) geometry.rotateZ(rotationZ);
    this.add(geometry, at, options);
  }

  cylinder(at: Vec3, radius: number, height: number, options: PartOptions = {}, segments = 20, radiusBottom = radius) {
    this.add(new CylinderGeometry(radius, radiusBottom, height, segments), at, options);
  }

  /**
   * Plano voltado para +Z, com pedaço do atlas em `uv` (u0, v0, u1, v1). `rotationY`
   * gira o plano em torno do próprio centro.
   */
  plane(at: Vec3, width: number, height: number, uv: readonly [number, number, number, number], surface: SurfaceKey, rotationY = 0, color?: string) {
    const geometry = new PlaneGeometry(width, height);
    const attribute = geometry.attributes.uv!;
    for (let index = 0; index < attribute.count; index += 1) {
      attribute.setXY(index, attribute.getX(index) === 0 ? uv[0] : uv[2], attribute.getY(index) === 0 ? uv[1] : uv[3]);
    }
    if (rotationY !== 0) geometry.rotateY(rotationY);
    this.push(geometry, at, { surface, cast: false, ...(color ? { color } : {}) }, false);
  }

  private add(geometry: BufferGeometry, at: Vec3, options: PartOptions) {
    this.push(geometry, at, options, true);
  }

  private push(source: BufferGeometry, at: Vec3, options: PartOptions, worldUv: boolean) {
    const surface = options.surface ?? "matte";
    const cast = options.cast ?? true;
    const geometry = source.index ? source.toNonIndexed() : source;
    const count = geometry.attributes.position!.count;

    if (worldUv) {
      // Mesma densidade de textura em qualquer peça; cada uma começa num ponto
      // diferente, para duas tábuas vizinhas não repetirem o desenho.
      const [tileU, tileV] = options.tile ?? DEFAULT_TILE[surface];
      this.seed += 1;
      const offsetU = (this.seed * 0.37) % 1;
      const offsetV = (this.seed * 0.61) % 1;
      const position = geometry.attributes.position!;
      const normal = geometry.attributes.normal!;
      const uv = geometry.attributes.uv!;
      for (let index = 0; index < count; index += 1) {
        const nx = Math.abs(normal.getX(index));
        const ny = Math.abs(normal.getY(index));
        const px = position.getX(index);
        const py = position.getY(index);
        const pz = position.getZ(index);
        const [u, v] = ny > 0.5 ? [px, pz] : nx > 0.5 ? [pz, py] : [px, py];
        uv.setXY(index, u / tileU + offsetU, v / tileV + offsetV);
      }
    }

    scratch.set(options.color ?? "#ffffff");
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      colors[index * 3] = scratch.r;
      colors[index * 3 + 1] = scratch.g;
      colors[index * 3 + 2] = scratch.b;
    }
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    if (options.tilt) geometry.rotateX(options.tilt);
    geometry.applyMatrix4(this.matrix.clone().multiply(new Matrix4().setPosition(new Vector3(at[0], at[1], at[2]))));

    this.triangles += count / 3;
    const key = batchKey(surface, cast);
    const list = this.parts.get(key);
    if (list) list.push(geometry);
    else this.parts.set(key, [geometry]);
  }

  build(): Batch {
    const merged: Batch = new Map();
    for (const [key, list] of this.parts) {
      const geometry = mergeGeometries(list, false);
      if (!geometry) throw new Error(`Não consegui juntar as peças de ${key}.`);
      geometry.computeBoundingSphere();
      merged.set(key, geometry);
      for (const part of list) part.dispose();
    }
    this.parts.clear();
    return merged;
  }
}
