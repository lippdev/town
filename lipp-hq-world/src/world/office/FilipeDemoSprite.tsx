import { useTexture } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { LinearMipmapLinearFilter, NearestFilter, SRGBColorSpace } from "three";
import { OFFICE_ROOMS_BY_ID } from "./officeLayout";

/** Medidas do PNG na grade real, impressas por scripts/characters/pixelize-sprite.py. */
const CANVAS = { width: 53, height: 132 };
const VISIBLE_ROWS = 124;
const SOLE_ROW = 128;
const FEET_COLUMN = 26;

const STANDING_HEIGHT = 1.8;
/** A arte foi desenhada para a câmera do escritório, elevada 30 graus: ela já vem encurtada. */
const CAMERA_FORESHORTENING = Math.cos(Math.PI / 6);

/** Filipe parado no hall da demonstração, em pixel art, com a sola no chão. */
export function FilipeDemoSprite() {
  const texture = useTexture("/characters/filipe/demo-isometric.png");

  const prepared = useMemo(() => {
    const copy = texture.clone();
    copy.colorSpace = SRGBColorSpace;
    copy.magFilter = NearestFilter;
    // de perto o pixel fica duro; de longe os mipmaps evitam que os blocos pisquem
    copy.minFilter = LinearMipmapLinearFilter;
    copy.generateMipmaps = true;
    copy.needsUpdate = true;
    return copy;
  }, [texture]);
  useEffect(() => () => prepared.dispose(), [prepared]);

  const hall = OFFICE_ROOMS_BY_ID.hall!;
  const height = (STANDING_HEIGHT * CAMERA_FORESHORTENING * CANVAS.height) / VISIBLE_ROWS;
  const width = (height * CANVAS.width) / CANVAS.height;
  return (
    <group position={[hall.center.x + 0.1, 0, hall.center.z + 1.65]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <circleGeometry args={[0.25, 32]} />
        <meshBasicMaterial color="#252525" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <sprite
        position={[0, 0.045, 0]}
        center={[FEET_COLUMN / CANVAS.width, (CANVAS.height - SOLE_ROW) / CANVAS.height]}
        scale={[width, height, 1]}
      >
        <spriteMaterial map={prepared} alphaTest={0.5} transparent depthWrite toneMapped={false} />
      </sprite>
    </group>
  );
}
