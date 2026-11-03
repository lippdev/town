import { BoxGeometry, BufferGeometry, CapsuleGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry } from "three";

/**
 * Cache de materiais padrão por chave visual. Paredes, móveis e detalhes
 * repetidos compartilham o mesmo material: menos compilações e menos troca de
 * estado na GPU a cada frame.
 */
const cache = new Map<string, MeshStandardMaterial>();

export interface SharedMaterialOptions {
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
}

export function sharedMaterial(
  color: string,
  roughness: number,
  metalness = 0,
  options: SharedMaterialOptions = {},
): MeshStandardMaterial {
  const key = [
    color,
    roughness,
    metalness,
    options.emissive ?? "",
    options.emissiveIntensity ?? "",
    options.opacity ?? "",
  ].join("|");

  let material = cache.get(key);
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness, metalness });
    if (options.emissive) {
      material.emissive.set(options.emissive);
      if (options.emissiveIntensity !== undefined) {
        material.emissiveIntensity = options.emissiveIntensity;
      }
    }
    if (options.opacity !== undefined && options.opacity < 1) {
      material.transparent = true;
      material.opacity = options.opacity;
      material.depthWrite = false;
    }
    cache.set(key, material);
  }
  return material;
}

/** Número de materiais vivos no cache (para diagnóstico). */
export function materialCacheSize(): number {
  return cache.size;
}

/** Cache de geometrias repetidas: mesma assinatura, mesmo BufferGeometry. */
const geometryCache = new Map<string, BufferGeometry>();

export function sharedBox(width: number, height: number, depth: number): BufferGeometry {
  const key = `box:${width}:${height}:${depth}`;
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = new BoxGeometry(width, height, depth);
    geometryCache.set(key, geometry);
  }
  return geometry;
}

export function sharedCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments = 12,
): BufferGeometry {
  const key = `cyl:${radiusTop}:${radiusBottom}:${height}:${segments}`;
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = new CylinderGeometry(radiusTop, radiusBottom, height, segments);
    geometryCache.set(key, geometry);
  }
  return geometry;
}

export function sharedSphere(
  radius: number,
  widthSegments = 12,
  heightSegments = 10,
  phiStart = 0,
  phiLength = Math.PI * 2,
  thetaStart = 0,
  thetaLength = Math.PI,
): BufferGeometry {
  const key = `sph:${radius}:${widthSegments}:${heightSegments}:${phiStart}:${phiLength}:${thetaStart}:${thetaLength}`;
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = new SphereGeometry(radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength);
    geometryCache.set(key, geometry);
  }
  return geometry;
}

export function sharedCapsule(radius: number, length: number, capSegments = 6, radialSegments = 12): BufferGeometry {
  const key = `cap:${radius}:${length}:${capSegments}:${radialSegments}`;
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = new CapsuleGeometry(radius, length, capSegments, radialSegments);
    geometryCache.set(key, geometry);
  }
  return geometry;
}

/** Número de geometrias vivas no cache (para diagnóstico). */
export function geometryCacheSize(): number {
  return geometryCache.size;
}
