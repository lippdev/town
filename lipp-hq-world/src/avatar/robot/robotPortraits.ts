import { AmbientLight, DirectionalLight, OrthographicCamera, Scene, Vector3, WebGLRenderer, NeutralToneMapping, SRGBColorSpace } from "three";
import { loadGltf, ROBOT_URL } from "@/avatar/human/humanAssets";
import { centeredFit, solidBounds } from "./portraitFrame";
import { RobotRig } from "./RobotRig";
import type { RobotLook } from "./robotLook";

/** Lado do retrato em pixels de arte, com folga para a cabeça não encostar na borda. */
const PORTRAIT_SIZE = 32;
const PORTRAIT_MARGIN = 2;
/** Dobro da arte: fica nítido em 32 px de CSS numa tela de densidade 2. */
const PORTRAIT_OUTPUT = PORTRAIT_SIZE * 2;
const RENDER_SIZE = 256;
/** Folga do enquadramento 3D. O centro exato sai do recorte, em pixels. */
const HEAD_FRAME_PADDING = 1.2;
/** Sobrancelhas e olhos pretos sumiriam contra o fundo escuro da sidebar. */
const PORTRAIT_MIN_LEVEL = 64;

/** Pixel art com dithering ordenado: recorta o que foi desenhado e centra nos dois eixos. */
function pixelPortrait(source: HTMLCanvasElement): string {
  const size = PORTRAIT_SIZE;
  const full = document.createElement("canvas");
  full.width = full.height = source.width;
  const fullContext = full.getContext("2d", { willReadFrequently: true })!;
  fullContext.drawImage(source, 0, 0);
  const bounds = solidBounds(fullContext.getImageData(0, 0, full.width, full.height).data, full.width, full.height)
    ?? { x: 0, y: 0, width: full.width, height: full.height };
  const fit = centeredFit(bounds, size, PORTRAIT_MARGIN);
  const sample = document.createElement("canvas");
  sample.width = sample.height = size;
  const context = sample.getContext("2d")!;
  context.drawImage(full, bounds.x, bounds.y, bounds.width, bounds.height, fit.x, fit.y, fit.width, fit.height);
  const pixels = context.getImageData(0, 0, size, size);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (pixels.data[i + 3]! < 128) {
        pixels.data[i + 3] = 0;
        continue;
      }
      pixels.data[i + 3] = 255;
      const threshold = (bayer[(y % 4) * 4 + x % 4]! / 16 - 0.5) * 36;
      for (let channel = 0; channel < 3; channel++) {
        const value = pixels.data[i + channel]!;
        const level = Math.round(Math.max(0, Math.min(255, value * 1.08 + threshold)) / 32) * 32;
        pixels.data[i + channel] = Math.max(PORTRAIT_MIN_LEVEL, level);
      }
    }
  }
  context.putImageData(pixels, 0, 0);
  const output = document.createElement("canvas");
  output.width = output.height = PORTRAIT_OUTPUT;
  const ink = output.getContext("2d")!;
  ink.imageSmoothingEnabled = false;
  ink.drawImage(sample, 0, 0, PORTRAIT_OUTPUT, PORTRAIT_OUTPUT);
  return output.toDataURL("image/png");
}

/** Retratos do mesmo GLB da cena. Um renderer temporário para o lote, sem animação. */
export async function robotPortraits(looks: Record<string, RobotLook>): Promise<Record<string, string>> {
  const gltf = await loadGltf(ROBOT_URL);
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(RENDER_SIZE, RENDER_SIZE);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1.7));
  const key = new DirectionalLight(0xffffff, 2.4);
  key.position.set(2, 4, 4);
  scene.add(key);
  const fill = new DirectionalLight(0xb9d7ff, 1.2);
  fill.position.set(-3, 2, 1);
  scene.add(fill);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  const result: Record<string, string> = {};
  try {
    for (const [id, look] of Object.entries(looks)) {
      const rig = new RobotRig(gltf.scene, gltf.animations, { reduced: true });
      try {
        rig.apply(look);
        scene.add(rig.root);
        const { box, forward } = rig.isolateHead();
        const center = box.getCenter(new Vector3());
        const extent = box.getSize(new Vector3());
        const half = (Math.max(extent.x, extent.y) / 2) * HEAD_FRAME_PADDING;
        camera.left = camera.bottom = -half;
        camera.right = camera.top = half;
        camera.updateProjectionMatrix();
        // De frente para o rosto: a simetria é o que faz a cabeça parecer centrada.
        camera.position.copy(center).addScaledVector(forward, 3);
        camera.lookAt(center);
        renderer.render(scene, camera);
        result[id] = pixelPortrait(renderer.domElement);
      } finally {
        scene.remove(rig.root);
        rig.dispose();
      }
    }
    return result;
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
