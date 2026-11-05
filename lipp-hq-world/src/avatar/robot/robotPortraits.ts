import { AmbientLight, DirectionalLight, OrthographicCamera, Scene, WebGLRenderer, NeutralToneMapping, SRGBColorSpace } from "three";
import { loadGltf, ROBOT_URL } from "@/avatar/human/humanAssets";
import { RobotRig } from "./RobotRig";
import type { RobotLook } from "./robotLook";

/** Amostra o retrato real em células e desenha apenas caracteres, sem fundo. */
function asciiPortrait(source: HTMLCanvasElement): string {
  const columns = 18;
  const rows = 16;
  const sample = document.createElement("canvas");
  sample.width = columns;
  sample.height = rows;
  const context = sample.getContext("2d")!;
  context.drawImage(source, 0, 0, columns, rows);
  const { data } = context.getImageData(0, 0, columns, rows);
  const output = document.createElement("canvas");
  output.width = columns * 10;
  output.height = rows * 12;
  const ink = output.getContext("2d")!;
  ink.font = "bold 12px monospace";
  ink.textAlign = "center";
  ink.textBaseline = "middle";
  const ramp = ".:+=*#%@";
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const i = (y * columns + x) * 4;
      if (data[i + 3]! < 90) continue;
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      const light = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
      ink.fillStyle = `rgb(${Math.min(255, r + 45)}, ${Math.min(255, g + 45)}, ${Math.min(255, b + 45)})`;
      ink.fillText(ramp[Math.min(ramp.length - 1, Math.floor(light * ramp.length))]!, x * 10 + 5, y * 12 + 6);
    }
  }
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
        result[id] = asciiPortrait(renderer.domElement);
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
