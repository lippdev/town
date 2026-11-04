import { PALETTE } from "@/config/constants";
import { QaBridge } from "@/app/QaBridge";
import { SceneLighting } from "@/world/lighting/SceneLighting";
import { PostEffects } from "@/world/lighting/PostEffects";
import { QualityController } from "@/world/scene/QualityController";
import { useHQStore } from "@/state/useHQStore";
import { effectiveQuality } from "@/world/quality";
import { BaseSlab } from "@/world/scene/BaseSlab";
import { FloorPlates } from "@/world/rooms/FloorPlates";
import { RoomIndicator } from "@/world/rooms/RoomIndicator";
import { Furniture } from "@/world/furniture/Furnishing";
import { BriefingBoard } from "@/world/furniture/BriefingBoard";
import { Agents } from "@/world/characters/Agents";
import { DynamicWalls } from "@/world/walls/DynamicWalls";
import { CameraRig } from "@/world/camera/CameraRig";
import { ViewportInset } from "@/world/camera/ViewportInset";
import { Picking } from "@/world/scene/Picking";

/**
 * Cena raiz do Lipp HQ World: laje, pisos, paredes dinâmicas e letreiros.
 * O prédio é montado a partir da planta declarativa em `world/rooms/rooms.ts`.
 */
export function HQScene() {
  // leve: sem composer — o tone mapping do renderer e o MSAA nativo bastam
  const quality = useHQStore((state) => effectiveQuality(state.graphicsMode, state.autoQuality));
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
      <RoomIndicator />
      <CameraRig />
      <ViewportInset />
      <Picking />
      <QaBridge />
      <QualityController />
      {quality === "alta" && <PostEffects />}
    </>
  );
}
