import { useEffect } from "react";
import { PALETTE } from "@/config/constants";
import { ROOMS, roomCenter, roomSize } from "@/world/rooms/rooms";
import { skyGradientTexture } from "@/world/textures/floorTextures";
import { useThree } from "@react-three/fiber";

/**
 * Iluminação do diorama, com contraste de jogo moderno: chave quente forte,
 * ambiente frio baixo (sombras leem azulado) e poças de luz quentes por sala.
 * O fundo é um gradiente vertical, não uma cor chapada.
 */
export function SceneLighting() {
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const sky = skyGradientTexture();
    scene.background = sky;
    scene.backgroundIntensity = 0.9;
    return () => {
      scene.background = null;
    };
  }, [scene]);

  return (
    <>
      <ambientLight intensity={0.34} color="#b8c6e2" />
      <hemisphereLight args={["#bcd4ff", "#5e5240", 0.85]} />
      <directionalLight
        position={[26, 38, 14]}
        intensity={3.1}
        color="#ffe2b8"
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
      <directionalLight position={[-26, 18, -22]} intensity={0.55} color="#7ea4e0" />
      {ROOMS.map((room) => {
        const center = roomCenter(room);
        const size = roomSize(room);
        return (
          <group key={room.id} position={[center[0], 0, center[2]]}>
            <pointLight
              position={[0, 2.55, 0]}
              intensity={size.width * 2.2}
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
