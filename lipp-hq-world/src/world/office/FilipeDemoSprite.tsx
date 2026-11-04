import { useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { NearestFilter, SRGBColorSpace } from "three";
import { OFFICE_ROOMS_BY_ID } from "./officeLayout";

export function FilipeDemoSprite() {
  const texture = useTexture("/characters/filipe/demo.png");
  const camera = useThree((state) => state.camera);
  const prepared = useMemo(() => {
    const copy = texture.clone();
    copy.colorSpace = SRGBColorSpace;
    copy.magFilter = NearestFilter;
    copy.minFilter = NearestFilter;
    copy.needsUpdate = true;
    return copy;
  }, [texture]);
  const hall = OFFICE_ROOMS_BY_ID.hall!;
  // Alpha >= 128 occupies rows 19..1507 of the 1536px image.
  const height = 1.7 * 1536 / 1489;
  const width = height * 1024 / 1536;
  const bottom = height * 28 / 1536;
  return <group position={[hall.center.x + 0.1, 0, hall.center.z + 1.65]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
      <circleGeometry args={[0.34, 32]} />
      <meshBasicMaterial color="#252525" transparent opacity={0.25} depthWrite={false} />
    </mesh>
    <sprite position={[0, height / 2 - bottom, 0]} scale={[width, height, 1]} quaternion={camera.quaternion}>
      <spriteMaterial map={prepared} alphaTest={0.5} transparent depthWrite toneMapped={false} />
    </sprite>
  </group>;
}
