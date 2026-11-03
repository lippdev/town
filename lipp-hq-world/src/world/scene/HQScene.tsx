import { PALETTE } from "@/config/constants";
import { QaBridge } from "@/app/QaBridge";
import { SceneLighting } from "@/world/lighting/SceneLighting";
import { BaseSlab } from "@/world/scene/BaseSlab";
import { FloorPlates } from "@/world/rooms/FloorPlates";
import { RoomSigns } from "@/world/rooms/RoomSigns";
import { Furniture } from "@/world/furniture/Furnishing";
import { BriefingBoard } from "@/world/furniture/BriefingBoard";
import { Agents } from "@/world/characters/Agents";
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
      <fog attach="fog" args={[PALETTE.backgroundDeep, 70, 170]} />
      <SceneLighting />
      <BaseSlab />
      <FloorPlates />
      <DynamicWalls />
      <Furniture />
      <BriefingBoard />
      <Agents />
      <RoomSigns />
      <CameraRig />
      <Picking />
      <QaBridge />
    </>
  );
}
