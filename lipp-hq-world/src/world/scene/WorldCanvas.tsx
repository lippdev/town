import { Canvas } from "@react-three/fiber";
import { lazy, Suspense } from "react";
import { NeutralToneMapping, SRGBColorSpace } from "three";
import { CAMERA } from "@/config/constants";
import { HQScene } from "@/world/scene/HQScene";
import { ReadySignal } from "@/app/ReadySignal";
import { useHQStore } from "@/state/useHQStore";
import { effectiveQuality, pixelRatioFor } from "@/world/quality";

const EngineeringPrototype = lazy(() => import("@/world/prototype/EngineeringPrototype").then((m) => ({ default: m.EngineeringPrototype })));

/**
 * Canvas WebGL completo — isolado num chunk próprio para que a casca da
 * aplicação (HUD, boot, estados de erro) pinte sem esperar o three.js.
 */
export function WorldCanvas() {
  const prototype = new URLSearchParams(window.location.search).get("prototipo") === "engenharia";
  const quality = useHQStore((state) => effectiveQuality(state.graphicsMode, state.autoQuality));
  const dpr = pixelRatioFor(quality, typeof window === "undefined" ? 1 : window.devicePixelRatio);
  return (
    <Canvas
      className="world-canvas"
      orthographic={prototype}
      shadows="soft"
      dpr={dpr}
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
        {prototype ? <EngineeringPrototype /> : <HQScene />}
      </Suspense>
      <ReadySignal />
    </Canvas>
  );
}
