import { useTexture } from "@react-three/drei";

import { useEffect, useMemo } from "react";
import { NearestFilter, SRGBColorSpace } from "three";
import { OFFICE_ROOMS_BY_ID } from "./officeLayout";

export function FilipeDemoSprite() {
  const texture = useTexture("/characters/filipe/demo-isometric.png");

  const prepared = useMemo(() => {
    const copy = texture.clone();
    copy.colorSpace = SRGBColorSpace;
    copy.magFilter = NearestFilter;
    copy.minFilter = NearestFilter;
    copy.generateMipmaps = false;
    copy.needsUpdate = true;
    return copy;
  }, [texture]);
  const hall = OFFICE_ROOMS_BY_ID.hall!;
  useEffect(() => () => prepared.dispose(), [prepared]);
  // The artwork is drawn for the office camera's 30-degree elevation.
  // Alpha >= 128 bounds: x 390..743, y 191..1182 in a 1168x1346 canvas.
  // Account for vertical foreshortening; anchor the visible soles, not canvas center.
  const height = 1.8 * Math.cos(Math.PI / 6) * 1346 / 992;
  const width = height * 1168 / 1346;
  return <group position={[hall.center.x + 0.1, 0, hall.center.z + 1.65]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
      <circleGeometry args={[0.25, 32]} />
      <meshBasicMaterial color="#252525" transparent opacity={0.16} depthWrite={false} />
    </mesh>
    <sprite position={[0, 0.045, 0]} center={[566.5 / 1168, (1346 - 1183) / 1346]} scale={[width, height, 1]}>
      <spriteMaterial map={prepared} alphaTest={0.5} transparent depthWrite toneMapped={false} />
    </sprite>
  </group>;
}
