import { PALETTE } from "@/config/constants";
import { ROOMS, roomCenter, roomSize } from "@/world/rooms/rooms";

/**
 * Iluminação base do diorama: ambiente neutro, preenchimento hemisférico e uma
 * direcional principal com sombra suave. Sem post-processing para manter o
 * custo de render baixo.
 */
export function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.72} color="#dfe8f6" />
      <hemisphereLight args={["#cfe3ff", "#1b2436", 0.55]} />
      <directionalLight
        position={[24, 34, 20]}
        intensity={2.35}
        color="#fff4e2"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        shadow-camera-near={1}
        shadow-camera-far={110}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
      />
      <directionalLight position={[-22, 16, -18]} intensity={0.42} color="#8fb6e8" />
      {ROOMS.map((room) => {
        const center = roomCenter(room);
        const size = roomSize(room);
        return (
          <group key={room.id} position={[center[0], 0, center[2]]}>
            <pointLight
              position={[0, 2.55, 0]}
              intensity={size.width * 2.6}
              distance={size.width * 1.5}
              decay={1.8}
              color="#ffd9a3"
            />
            <mesh position={[0, 2.68, 0]}>
              <cylinderGeometry args={[0.34, 0.42, 0.16, 14]} />
              <meshStandardMaterial
                color="#ffe2b8"
                emissive="#ffbe6e"
                emissiveIntensity={1.6}
                roughness={0.5}
                toneMapped={false}
              />
            </mesh>
            <mesh position={[0, 2.78, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.12, 8]} />
              <meshStandardMaterial color={PALETTE.metal} roughness={0.5} metalness={0.3} />
            </mesh>
          </group>
        );
      })}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.62, 0]} receiveShadow>
        <planeGeometry args={[220, 220]} />
        <meshStandardMaterial color={PALETTE.backgroundDeep} roughness={0.95} metalness={0} />
      </mesh>
    </>
  );
}
