import { OrbitControls } from "@react-three/drei";
import { CAMERA, PALETTE } from "@/config/constants";
import { QaBridge } from "@/app/QaBridge";
import { SceneLighting } from "@/world/lighting/SceneLighting";
import { BaseSlab } from "@/world/scene/BaseSlab";
import { FloorPlates } from "@/world/rooms/FloorPlates";
import { RoomSigns } from "@/world/rooms/RoomSigns";
import { DynamicWalls } from "@/world/walls/DynamicWalls";

/**
 * Cena raiz do Lipp HQ World: laje, pisos, paredes dinâmicas e letreiros.
 * O prédio é montado a partir da planta declarativa em `world/rooms/rooms.ts`.
 */
export function HQScene() {
  return (
    <>
      <color attach="background" args={[PALETTE.background]} />
      <fog attach="fog" args={[PALETTE.background, 62, 168]} />
      <SceneLighting />
      <BaseSlab />
      <FloorPlates />
      <DynamicWalls />
      <RoomSigns />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={CAMERA.dampingFactor}
        target={[CAMERA.target[0], CAMERA.target[1], CAMERA.target[2]]}
        minDistance={CAMERA.minDistance}
        maxDistance={CAMERA.maxDistance}
        minPolarAngle={CAMERA.minPolarAngle}
        maxPolarAngle={CAMERA.maxPolarAngle}
      />
      <QaBridge />
    </>
  );
}
