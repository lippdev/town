import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { PALETTE } from "@/config/constants";
import type { RoomDefinition } from "@/types/hq";
import { doorInward, doorPoint, roomSize } from "@/world/rooms/rooms";
import { createLabelTexture } from "@/world/textures/labelTexture";
import { AGENTS_BY_ID } from "@/agents/agents";

interface RoomSignProps {
  room: RoomDefinition;
}

/**
 * Totem de identificação na entrada da sala: placa única que gira para a
 * câmera (legível de qualquer ângulo de órbita), sem as faces cruzadas que
 * liam como um "X" escuro na vista de cima.
 */
export function RoomSign({ room }: RoomSignProps) {
  const door = room.doors[0];
  const agent = room.agentId ? AGENTS_BY_ID[room.agentId] : undefined;

  const texture = useMemo(
    () =>
      createLabelTexture({
        text: room.name,
        ...(agent ? { subtitle: agent.name } : {}),
        accent: room.color,
        width: 768,
        height: 252,
      }),
    [room.name, room.color, agent],
  );

  useEffect(() => () => texture.dispose(), [texture]);

  const placement = useMemo(() => {
    if (!door) {
      const size = roomSize(room);
      return {
        position: [
          (room.bounds.minX + room.bounds.maxX) / 2,
          0,
          (room.bounds.minZ + room.bounds.maxZ) / 2 + size.depth * 0.32,
        ] as [number, number, number],
        rotationY: 0,
      };
    }

    const point = doorPoint(room, door);
    const inward = doorInward(door);
    const perpendicular: [number, number] = [inward[2], -inward[0]];

    return {
      position: [
        point[0] + inward[0] * 0.95 + perpendicular[0] * 1.25,
        0,
        point[2] + inward[2] * 0.95 + perpendicular[1] * 1.25,
      ] as [number, number, number],
      rotationY: Math.atan2(inward[0], inward[2]),
    };
  }, [door, room]);

  const plateWidth = 2.6;
  const plateHeight = 0.86;
  const scaler = useRef<Group>(null);

  // Rótulos legíveis em qualquer distância: a placa cresce quando a câmera
  // se afasta (com limite) e gira só no eixo Y para encarar a câmera. Os
  // fatores escalam com o delta real — em renders lentos (1–2 fps do QA)
  // a placa ainda chega ao alvo em poucos frames.
  useFrame(({ camera }, rawDelta) => {
    const node = scaler.current;
    if (!node) return;
    const delta = Math.min(rawDelta, 0.12);
    const world = node.getWorldPosition(node.position.clone().set(0, 0, 0));
    const distance = camera.position.distanceTo(world);
    const target = Math.min(Math.max(distance / 54, 1), 2.3);
    node.scale.x += (target - node.scale.x) * Math.min(1, delta * 8);
    node.scale.y = node.scale.x;
    const yaw = Math.atan2(camera.position.x - world.x, camera.position.z - world.z);
    node.rotation.y += (yaw - node.rotation.y) * Math.min(1, delta * 10);
  });

  return (
    <group
      name={`room-sign-${room.id}`}
      position={placement.position}
      rotation={[0, placement.rotationY, 0]}
    >
      <group ref={scaler}>
        <mesh position={[0, 0.78, 0]} castShadow>
          <cylinderGeometry args={[0.055, 0.07, 1.56, 10]} />
          <meshStandardMaterial color={PALETTE.metal} roughness={0.45} metalness={0.35} />
        </mesh>
        <mesh position={[0, 0.06, 0]} castShadow>
          <cylinderGeometry args={[0.24, 0.24, 0.12, 14]} />
          <meshStandardMaterial color={PALETTE.chair} roughness={0.7} metalness={0.15} />
        </mesh>
        <mesh position={[0, 1.78, -0.03]} castShadow>
          <boxGeometry args={[plateWidth + 0.08, plateHeight + 0.08, 0.06]} />
          <meshStandardMaterial color="#101826" roughness={0.55} metalness={0.2} />
        </mesh>
        <mesh position={[0, 1.78, 0.005]}>
          <planeGeometry args={[plateWidth, plateHeight]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
        {/* filete emissivo na cor da sala — lê como "placa acesa" de longe */}
        <mesh position={[0, 1.31, 0.012]}>
          <planeGeometry args={[plateWidth + 0.08, 0.07]} />
          <meshBasicMaterial color={room.color} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
