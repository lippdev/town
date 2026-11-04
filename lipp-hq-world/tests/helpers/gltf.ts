import { readFileSync } from "node:fs";
import { Texture } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/** Lê um GLB do disco. Sem navegador não há como decodificar imagem: a textura vem vazia. */
export function parseGlb(path: string): Promise<GLTF> {
  const bytes = readFileSync(path);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.register((parser) => {
    parser.loadTextureImage = async () => new Texture();
    return { name: "sem-imagem" };
  });
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "");
}
