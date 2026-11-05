import { AmbientLight, DirectionalLight, OrthographicCamera, Scene, WebGLRenderer, NeutralToneMapping, SRGBColorSpace } from "three";
import { loadGltf, ROBOT_URL } from "@/avatar/human/humanAssets";
import { RobotRig } from "./RobotRig";
import type { RobotLook } from "./robotLook";

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
        result[id] = renderer.domElement.toDataURL("image/png");
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
