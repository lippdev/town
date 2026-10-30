import { PALETTE } from "@/config/constants";

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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.62, 0]} receiveShadow>
        <planeGeometry args={[220, 220]} />
        <meshStandardMaterial color={PALETTE.backgroundDeep} roughness={0.95} metalness={0} />
      </mesh>
    </>
  );
}
