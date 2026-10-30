import { PALETTE } from "@/config/constants";
import { QaBridge } from "@/app/QaBridge";
import { SceneLighting } from "@/world/lighting/SceneLighting";
import { BaseSlab } from "@/world/scene/BaseSlab";
import { FloorPlates } from "@/world/rooms/FloorPlates";
import { RoomSigns } from "@/world/rooms/RoomSigns";
import { Furniture } from "@/world/furniture/Furnishing";
import { DynamicWalls } from "@/world/walls/DynamicWalls";
import { CameraRig } from "@/world/camera/CameraRig";
import { Picking } from "@/world/scene/Picking";

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
      <Furniture />
      <RoomSigns />
      <CameraRig />
      <Picking />
      <QaBridge />
    </>
  );
}
