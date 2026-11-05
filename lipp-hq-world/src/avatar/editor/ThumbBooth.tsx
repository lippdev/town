import { useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { NeutralToneMapping, type PerspectiveCamera } from "three";
import { ITEMS_BY_ID, type CategoryId } from "@/avatar/human/catalog";
import { HumanFigure, loadHumanBase } from "@/avatar/human/HumanFigure";
import { newPreset, resolveHuman, withPart } from "@/avatar/human/preset";

declare global {
  interface Window {
    /** Usado só por scripts/avatar/thumbs.mjs para fotografar as peças. */
    __HQ_THUMBS__?: { shot: (itemId: string) => Promise<string>; ready: boolean };
  }
}

/** Altura e distância da câmera por categoria: cada foto mostra a peça, não a pessoa inteira. */
const FRAME: Record<CategoryId, { y: number; distance: number; yaw: number }> = {
  head: { y: 1.62, distance: 3.1, yaw: 0.45 },
  hair: { y: 1.72, distance: 3.2, yaw: 0.6 },
  eyes: { y: 1.62, distance: 1.7, yaw: 0.2 },
  eyebrow: { y: 1.72, distance: 1.7, yaw: 0.2 },
  nose: { y: 1.5, distance: 1.7, yaw: 0.65 },
  face: { y: 1.55, distance: 2.2, yaw: 0.3 },
  facialHair: { y: 1.42, distance: 2.1, yaw: 0.4 },
  glasses: { y: 1.62, distance: 2.1, yaw: 0.4 },
  hat: { y: 1.9, distance: 3.6, yaw: 0.6 },
  bow: { y: 1.8, distance: 3.2, yaw: 2.4 },
  earring: { y: 1.5, distance: 1.9, yaw: 1 },
  top: { y: 0.9, distance: 3.0, yaw: 0.35 },
  bottom: { y: 0.42, distance: 2.9, yaw: 0.35 },
  shoes: { y: 0.13, distance: 1.7, yaw: 0.6 },
  outfit: { y: 1, distance: 5, yaw: 0.35 },
};

function Booth() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const figure = useRef<HumanFigure | null>(null);

  useEffect(() => {
    let alive = true;
    void loadHumanBase().then((base) => {
      if (!alive) return;
      const person = new HumanFigure(base);
      figure.current = person;
      scene.add(person.root);
      window.__HQ_THUMBS__ = {
        ready: true,
        shot: async (itemId) => {
          const item = ITEMS_BY_ID[itemId]!;
          const keepsHair = item.category === "hat" || item.category === "hair" || item.category === "bow";
          let preset = newPreset("foto", "Foto", "");
          if (!keepsHair) preset = withPart(preset, "hair", null);
          preset = withPart(preset, item.category, itemId);
          await person.wear(resolveHuman(preset));
          const frame = FRAME[item.category];
          camera.position.set(Math.sin(frame.yaw) * frame.distance, frame.y, Math.cos(frame.yaw) * frame.distance);
          camera.lookAt(0, frame.y, 0);
          camera.updateProjectionMatrix();
          person.update(0, { blink: false });
          gl.render(scene, camera);
          return gl.domElement.toDataURL("image/png");
        },
      };
    });
    return () => {
      alive = false;
      figure.current?.dispose();
      delete window.__HQ_THUMBS__;
    };
  }, [camera, gl, scene]);

  return (
    <>
      <hemisphereLight args={["#ffffff", "#d6d1c7", 1.7]} />
      <directionalLight position={[2.4, 4.4, 3.4]} intensity={1.9} />
      <directionalLight position={[-3, 2, 2]} intensity={0.55} />
    </>
  );
}

/** Estúdio fotográfico das miniaturas. Sem interface: só o script usa. */
export function ThumbBooth() {
  return (
    <div style={{ width: 192, height: 192 }}>
      <Canvas
        frameloop="never"
        dpr={1}
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        camera={{ fov: 24, near: 0.1, far: 30 }}
        onCreated={({ gl }) => {
          gl.toneMapping = NeutralToneMapping;
          gl.setClearColor(0x000000, 0);
        }}
      >
        <Booth />
      </Canvas>
    </div>
  );
}
