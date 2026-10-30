import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { CAMERA } from "@/config/constants";
import { HQScene } from "@/world/scene/HQScene";
import { ReadySignal } from "@/app/ReadySignal";

export function App() {
  return (
    <div
      className="app-shell"
      onContextMenu={(event) => event.preventDefault()}
    >
      <Canvas
        className="world-canvas"
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{
          fov: CAMERA.fov,
          near: CAMERA.near,
          far: CAMERA.far,
          position: [CAMERA.position[0], CAMERA.position[1], CAMERA.position[2]],
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
          gl.outputColorSpace = SRGBColorSpace;
        }}
      >
        <Suspense fallback={null}>
          <HQScene />
        </Suspense>
      </Canvas>
      <ReadySignal />
    </div>
  );
}
