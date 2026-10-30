import { OrbitControls } from "@react-three/drei";
import { BASE_SLAB, CAMERA, PALETTE } from "@/config/constants";
import { SceneLighting } from "@/world/lighting/SceneLighting";
import { BaseSlab } from "@/world/scene/BaseSlab";

/**
 * Cena raiz do Lipp HQ World. No Stage 0 monta apenas a laje e a iluminação,
 * provando o pipeline WebGL de ponta a ponta antes da geometria do prédio.
 */
export function HQScene() {
  return (
    <>
      <color attach="background" args={[PALETTE.background]} />
      <SceneLighting />
      <BaseSlab />
      <mesh
        position={[0, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry
          args={[BASE_SLAB.maxX - BASE_SLAB.minX - 1.2, BASE_SLAB.maxZ - BASE_SLAB.minZ - 1.2]}
        />
        <meshStandardMaterial color={PALETTE.corridorFloor} roughness={0.95} metalness={0} />
      </mesh>
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
    </>
  );
}
