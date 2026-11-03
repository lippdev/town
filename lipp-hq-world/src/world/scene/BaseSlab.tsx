import { BASE_SLAB, PALETTE } from "@/config/constants";

const width = BASE_SLAB.maxX - BASE_SLAB.minX;
const depth = BASE_SLAB.maxZ - BASE_SLAB.minZ;
const centerX = (BASE_SLAB.minX + BASE_SLAB.maxX) / 2;
const centerZ = (BASE_SLAB.minZ + BASE_SLAB.maxZ) / 2;

/** Laje do diorama: a base sobre a qual o prédio é montado. */
export function BaseSlab() {
  return (
    <group position={[centerX, -BASE_SLAB.thickness / 2, centerZ]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, BASE_SLAB.thickness, depth]} />
        <meshStandardMaterial color={PALETTE.slabSide} roughness={0.9} metalness={0.05} />
      </mesh>
      <mesh position={[0, BASE_SLAB.thickness / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width - 0.5, depth - 0.5]} />
        <meshStandardMaterial color={PALETTE.slabTop} roughness={0.88} metalness={0.04} />
      </mesh>
    </group>
  );
}
