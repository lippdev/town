import { PALETTE } from "@/config/constants";
import { useHQStore } from "@/state/useHQStore";
import { ROOMS } from "@/world/rooms/rooms";
import { CORRIDOR_FLOORS } from "@/world/walls/walls";
import { registerPickable } from "@/world/scene/Picking";

interface RectProps {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
  color: string;
  roughness?: number;
  opacity?: number;
}

function FloorRect({ minX, maxX, minZ, maxZ, y, color, roughness = 0.94, opacity, roomId, }: RectProps & { roomId?: string }) {
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const transparent = opacity !== undefined;
  return (
    <mesh
      ref={(node) => {
        if (node && roomId) registerPickable(node);
      }}
      position={[(minX + maxX) / 2, y, (minZ + maxZ) / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      userData={roomId ? { roomId } : undefined}
    >
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={0}
        transparent={transparent}
        opacity={opacity ?? 1}
        depthWrite={!transparent}
      />
    </mesh>
  );
}

/**
 * Pisos: madeira nas salas de departamento, pedra fosca nos corredores e um
 * tom neutro no hall e na sala de reuniões. Cada sala recebe ainda uma faixa
 * interna com a cor do departamento.
 */
export function FloorPlates() {
  const hoveredRoomId = useHQStore((state) => state.hoveredRoomId);
  const selectedRoomId = useHQStore((state) => state.selectedRoomId);

  return (
    <group name="floors">
      {CORRIDOR_FLOORS.map((rect) => (
        <FloorRect
          key={rect.id}
          minX={rect.minX}
          maxX={rect.maxX}
          minZ={rect.minZ}
          maxZ={rect.maxZ}
          y={0.004}
          color={PALETTE.corridorFloor}
          roughness={0.97}
        />
      ))}

      {ROOMS.map((room, index) => {
        const { bounds } = room;
        const isDepartment = room.kind === "department";
        const highlighted = room.id === hoveredRoomId || room.id === selectedRoomId;
        const base = isDepartment
          ? index % 2 === 0
            ? PALETTE.floorWood
            : PALETTE.floorWoodAlt
          : room.id === "hall"
            ? PALETTE.hallFloor
            : PALETTE.corridorFloor;
        const inset = 1.25;

        return (
          <group key={room.id}>
            <FloorRect
              minX={bounds.minX}
              maxX={bounds.maxX}
              minZ={bounds.minZ}
              maxZ={bounds.maxZ}
              y={0.006}
              color={base}
              roomId={room.id}
            />
            <FloorRect
              minX={bounds.minX + inset}
              maxX={bounds.maxX - inset}
              minZ={bounds.minZ + inset}
              maxZ={bounds.maxZ - inset}
              y={0.012}
              color={room.color}
              opacity={highlighted ? (isDepartment ? 0.42 : 0.3) : isDepartment ? 0.16 : 0.08}
            />
            {highlighted && (
              <FloorRect
                minX={bounds.minX + 0.35}
                maxX={bounds.maxX - 0.35}
                minZ={bounds.minZ + 0.35}
                maxZ={bounds.maxZ - 0.35}
                y={0.02}
                color="#ffffff"
                opacity={room.id === selectedRoomId ? 0.16 : 0.09}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
