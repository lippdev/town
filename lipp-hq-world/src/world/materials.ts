import { MeshStandardMaterial } from "three";

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
