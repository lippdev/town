import { AmbientLight, DirectionalLight, OrthographicCamera, Scene, WebGLRenderer, NeutralToneMapping, SRGBColorSpace } from "three";
import { loadGltf, ROBOT_URL } from "@/avatar/human/humanAssets";
import { RobotRig } from "./RobotRig";
import type { RobotLook } from "./robotLook";

/** Pixel art com dithering ordenado: volumes preenchidos e silhueta do nosso GLB. */
function pixelPortrait(source: HTMLCanvasElement): string {
  const size = 32;
  const sample = document.createElement("canvas");
  sample.width = sample.height = size;
  const context = sample.getContext("2d")!;
  context.drawImage(source, 0, 0, size, size);
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
        pixels.data[i + channel] = Math.round(Math.max(0, Math.min(255, value * 1.08 + threshold)) / 32) * 32;
      }
    }
  }
  context.putImageData(pixels, 0, 0);
  const output = document.createElement("canvas");
  output.width = output.height = 160;
  const ink = output.getContext("2d")!;
  ink.imageSmoothingEnabled = false;
  ink.drawImage(sample, 0, 0, 160, 160);
  return output.toDataURL("image/png");
}

/** Retratos do mesmo GLB da cena. Um renderer temporário para o lote, sem animação. */
export async function robotPortraits(looks: Record<string, RobotLook>): Promise<Record<string, string>> {
  const gltf = await loadGltf(ROBOT_URL);
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(160, 160);
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
  const camera = new OrthographicCamera(-0.32, 0.32, 0.32, -0.32, 0.01, 10);
  const result: Record<string, string> = {};
  try {
    for (const [id, look] of Object.entries(looks)) {
      const rig = new RobotRig(gltf.scene, gltf.animations, { reduced: true });
      try {
        rig.apply(look);
        scene.add(rig.root);
        const targetY = rig.height * 0.78;
        camera.position.set(0.25, targetY + 0.08, 3);
        camera.lookAt(0, targetY, 0);
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
