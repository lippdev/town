import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { NeutralToneMapping, SRGBColorSpace } from "three";
import { CAMERA } from "@/config/constants";
import { HQScene } from "@/world/scene/HQScene";
import { ReadySignal } from "@/app/ReadySignal";

/**
 * Canvas WebGL completo — isolado num chunk próprio para que a casca da
 * aplicação (HUD, boot, estados de erro) pinte sem esperar o three.js.
 */
export function WorldCanvas() {
  return (
    <Canvas
      className="world-canvas"
      shadows="soft"
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{
        fov: CAMERA.fov,
        near: CAMERA.near,
        far: CAMERA.far,
        position: [CAMERA.position[0], CAMERA.position[1], CAMERA.position[2]],
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = NeutralToneMapping;
        gl.toneMappingExposure = 1.0;
        gl.outputColorSpace = SRGBColorSpace;
      }}
    >
      <Suspense fallback={null}>
        <HQScene />
      </Suspense>
      <ReadySignal />
    </Canvas>
  );
}
