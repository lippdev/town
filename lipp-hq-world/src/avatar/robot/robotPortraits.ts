import { AmbientLight, DirectionalLight, OrthographicCamera, Scene, Vector3, WebGLRenderer, NeutralToneMapping, SRGBColorSpace } from "three";
import { loadGltf, ROBOT_URL } from "@/avatar/human/humanAssets";
import { portraitStorage, readPortrait, savePortrait } from "./portraitCache";
import { sharedCrop, solidBounds, type PixelBounds } from "./portraitFrame";
import { REACTION_FRAMES, REST_FRAME, YAW_FRAMES, robotReactionFor } from "./robotMotion";
import { RobotRig } from "./RobotRig";
import type { RobotLook } from "./robotLook";

/**
 * Resolução da arte: o quadro é desenhado no tamanho em que aparece. Assim, numa tela de
 * densidade 2, cada pixel da arte vira exatamente dois, sem linhas perdidas na redução.
 */
const STILL_ART = { size: 32, margin: 2 };
const SPRITE_ART = { size: 24, margin: 1 };
const OUTPUT_SCALE = 2;
const RENDER_SIZE = 128;
/** Folga do enquadramento 3D. O centro exato sai do recorte, em pixels. */
const HEAD_FRAME_PADDING = 1.4;
/** Quanto a cabeça vira para cada lado ao olhar em volta, em radianos. */
const LOOK_YAW = 0.42;
const UP = new Vector3(0, 1, 0);
/** Sobrancelhas e olhos pretos sumiriam contra o fundo escuro da sidebar. */
const PORTRAIT_MIN_LEVEL = 64;

export interface RobotPortrait {
  /** O retrato parado, igual ao primeiro quadro da tira. */
  still: string;
  /** Tira horizontal: a cabeça virando de um lado ao outro, depois o rosto mudando. */
  sheet: string;
}

/** Cópia 2D do que o WebGL acabou de desenhar, com a área ocupada pelo robô. */
function captureFrame(source: HTMLCanvasElement): { canvas: HTMLCanvasElement; bounds: PixelBounds } {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = source.width;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(source, 0, 0);
  const bounds = solidBounds(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
    ?? { x: 0, y: 0, width: canvas.width, height: canvas.height };
  return { canvas, bounds };
}

/** Pixel art com dithering ordenado, a partir do recorte comum aos quadros. */
function pixelFrame(source: HTMLCanvasElement, crop: PixelBounds, { size, margin }: { size: number; margin: number }): HTMLCanvasElement {
  const room = size - margin * 2;
  const sample = document.createElement("canvas");
  sample.width = sample.height = size;
  const context = sample.getContext("2d")!;
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, margin, margin, room, room);
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
  return sample;
}

/** Amplia os quadros lado a lado, sem suavizar, numa imagem só. */
function stripImage(frames: readonly HTMLCanvasElement[]): string {
  const side = frames[0]!.width * OUTPUT_SCALE;
  const output = document.createElement("canvas");
  output.width = side * frames.length;
  output.height = side;
  const ink = output.getContext("2d")!;
  ink.imageSmoothingEnabled = false;
  frames.forEach((frame, index) => ink.drawImage(frame, index * side, 0, side, side));
  return output.toDataURL("image/png");
}

/** Retratos do mesmo GLB da cena. Um renderer temporário para o lote, sem animação. */
export async function robotPortraits(looks: Record<string, RobotLook>): Promise<Record<string, RobotPortrait>> {
  const storage = portraitStorage();
  const result: Record<string, RobotPortrait> = {};
  const missing: Array<[string, RobotLook]> = [];
  for (const [id, look] of Object.entries(looks)) {
    const saved = readPortrait(storage, id, look);
    if (saved) result[id] = saved;
    else missing.push([id, look]);
  }
  // Tudo guardado: nem o modelo do robô nem um segundo contexto WebGL entram na abertura.
  if (missing.length === 0) return result;
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
  try {
    for (const [id, look] of missing) {
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
        const shoot = (yaw: number) => {
          // De frente para o rosto: a simetria é o que faz a cabeça parecer centrada.
          const view = forward.clone().applyAxisAngle(UP, yaw);
          camera.position.copy(center).addScaledVector(view, 3);
          camera.lookAt(center);
          renderer.render(scene, camera);
          return captureFrame(renderer.domElement);
        };
        const shots = Array.from({ length: YAW_FRAMES }, (_, index) => shoot(((index - REST_FRAME) / REST_FRAME) * LOOK_YAW));
        const reaction = robotReactionFor(id, look.expression);
        for (let index = 1; index <= REACTION_FRAMES; index++) {
          rig.mixExpression(look.expression, reaction, index / REACTION_FRAMES);
          shots.push(shoot(0));
        }
        const crop = sharedCrop(shots[REST_FRAME]!.bounds, shots.map((shot) => shot.bounds));
        result[id] = {
          still: stripImage([pixelFrame(shots[REST_FRAME]!.canvas, crop, STILL_ART)]),
          sheet: stripImage(shots.map((shot) => pixelFrame(shot.canvas, crop, SPRITE_ART))),
        };
        savePortrait(storage, id, look, result[id]!);
      } finally {
        scene.remove(rig.root);
        rig.dispose();
      }
      // Devolve o controle entre um robô e outro: o lote não pode travar a cena.
      await new Promise((resolve) => window.setTimeout(resolve));
    }
    return result;
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
