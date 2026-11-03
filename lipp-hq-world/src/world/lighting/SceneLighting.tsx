import { useEffect } from "react";
import { PMREMGenerator } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BASE_SLAB, PALETTE } from "@/config/constants";
import { ROOMS, roomCenter, roomSize } from "@/world/rooms/rooms";
import { backdropTexture } from "@/world/textures/floorTextures";
import { useThree } from "@react-three/fiber";

/** Meia diagonal da laje: o frustum da sombra cobre o prédio inteiro, sem sobra. */
const SHADOW_HALF = Math.ceil(Math.hypot(BASE_SLAB.maxX - BASE_SLAB.minX, BASE_SLAB.maxZ - BASE_SLAB.minZ) / 2);

/**
 * Iluminação do escritório.
 *
 * Um ambiente de estúdio pré-filtrado (PMREM) dá a luz de preenchimento e os
 * reflexos que materiais PBR e personagens GLB precisam para não parecerem
 * plástico chapado. Por cima vêm uma chave quente de fim de tarde com sombra
 * suave, um contra-luz frio que recorta silhuetas e a luminária de cada sala.
 * A luz ambiente fica baixa: sem ela, cantos e sob as mesas escurecem de
 * verdade, e é isso que dá volume.
 */
export function SceneLighting() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;
    scene.environmentIntensity = 0.28;
    scene.background = backdropTexture();
    return () => {
      scene.environment = null;
      scene.background = null;
      environment.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return (
    <>
      <hemisphereLight args={["#d6e4ff", "#4a3f33", 0.22]} />
      <directionalLight
        position={[26, 24, 12]}
        intensity={3.4}
        color="#ffe6c7"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
        shadow-radius={4}
        shadow-camera-near={4}
        shadow-camera-far={90}
        shadow-camera-left={-SHADOW_HALF}
        shadow-camera-right={SHADOW_HALF}
        shadow-camera-top={SHADOW_HALF}
        shadow-camera-bottom={-SHADOW_HALF}
      />
      <directionalLight position={[-24, 16, -20]} intensity={0.7} color="#8fb0ea" />
      {ROOMS.map((room) => {
        const center = roomCenter(room);
        const size = roomSize(room);
        return (
          <group key={room.id} position={[center[0], 0, center[2]]}>
            <pointLight
              position={[0, 2.45, 0]}
              intensity={size.width * 1.7}
              distance={size.width * 1.35}
              decay={2}
              color="#ffd6a0"
            />
            <mesh position={[0, 2.68, 0]}>
              <cylinderGeometry args={[0.34, 0.42, 0.16, 18]} />
              <meshStandardMaterial
                color="#ffe2b8"
                emissive="#ffbe6e"
                emissiveIntensity={1.4}
                roughness={0.5}
                toneMapped={false}
              />
            </mesh>
            <mesh position={[0, 2.78, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.12, 8]} />
              <meshStandardMaterial color={PALETTE.metal} roughness={0.4} metalness={0.6} />
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
