import type { Material, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Texture } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export const HUMAN_ROOT = "/avatares/humano";
export const ARMATURE_URL = `${HUMAN_ROOT}/armature.glb`;
export const POSES_URL = `${HUMAN_ROOT}/poses.glb`;
export const ROBOT_URL = "/avatares/robo/RobotExpressive.glb";

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const files = new Map<string, Promise<GLTF>>();

/** Um download por arquivo; se falhar, sai do cache para a próxima tentativa valer. */
export function loadGltf(url: string): Promise<GLTF> {
  const cached = files.get(url);
  if (cached) return cached;
  const request = loader.loadAsync(url);
  files.set(url, request);
  request.catch(() => files.delete(url));
  return request;
}

export interface PartAsset {
  file: string;
  scene: Object3D;
  /** Quantas figuras usam esta peça agora. */
  users: number;
}

const parts = new Map<string, Promise<PartAsset>>();

/**
 * O vidro dos óculos vem com transmissão, que faz o three renderizar a cena inteira mais
 * uma vez. Uma peça de 2 cm não vale isso: vira vidro comum, sem mexer no arquivo.
 */
function withoutTransmission(scene: Object3D) {
  scene.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as MeshPhysicalMaterial;
    if (material.transmission > 0) {
      material.transmission = 0;
      material.clearcoat = 0;
      material.transparent = true;
      material.opacity = Math.min(material.opacity, 0.3);
      material.depthWrite = false;
    }
  });
}

export function loadPart(file: string): Promise<PartAsset> {
  const cached = parts.get(file);
  if (cached) return cached;
  const request = loadGltf(`${HUMAN_ROOT}/pecas/${file}`).then((gltf) => {
    withoutTransmission(gltf.scene);
    return { file, scene: gltf.scene, users: 0 } satisfies PartAsset;
  });
  parts.set(file, request);
  request.catch(() => parts.delete(file));
  return request;
}

function textures(material: Material): Texture[] {
  const standard = material as MeshStandardMaterial;
  return [standard.map, standard.normalMap, standard.roughnessMap, standard.metalnessMap, standard.emissiveMap, standard.aoMap].filter((texture): texture is Texture => Boolean(texture));
}

/**
 * Nenhuma figura usa mais a peça: devolve a memória da placa de vídeo. Geometria e
 * textura seguem na RAM, e o three as envia de novo se a peça voltar.
 */
export function releasePart(asset: PartAsset) {
  asset.users -= 1;
  if (asset.users > 0) return;
  asset.scene.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of [mesh.material].flat()) {
      for (const texture of textures(material)) texture.dispose();
      material.dispose();
    }
  });
}
