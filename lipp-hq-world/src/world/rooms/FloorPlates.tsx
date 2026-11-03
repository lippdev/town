import { useMemo } from "react";
import type { Texture } from "three";
import { useHQStore } from "@/state/useHQStore";
import { ROOMS } from "@/world/rooms/rooms";
import { CORRIDOR_FLOORS } from "@/world/walls/walls";
import { registerPickable } from "@/world/scene/Picking";
import { stoneFloorTexture, woodFloorTexture } from "@/world/textures/floorTextures";

interface RectProps {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
  color: string;
  roughness?: number;
  opacity?: number;
  map?: Texture;
}

function FloorRect({ minX, maxX, minZ, maxZ, y, color, roughness = 0.94, opacity, map, roomId, }: RectProps & { roomId?: string }) {
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
        map={map}
        roughness={roughness}
        metalness={0}
        transparent={transparent}
        opacity={opacity ?? 1}
        depthWrite={!transparent}
      />
    </mesh>
  );
}

/** Um tile de textura cobre ~3,2 m (8 tábuas de 40 cm) na madeira. */
const WOOD_TILE_METERS = 3.2;
const STONE_TILE_METERS = 2.56;

function repeatedTexture(source: Texture, width: number, depth: number, tileMeters: number): Texture {
  const texture = source.clone();
  texture.repeat.set(Math.max(1, Math.round(width / tileMeters)), Math.max(1, Math.round(depth / tileMeters)));
  return texture;
}

/**
 * Pisos com textura procedural: madeira de verdade nas salas de departamento,
 * pedra fosca nos corredores, hall e reuniões. Cada sala recebe ainda uma
 * faixa interna com a cor do departamento.
 */
export function FloorPlates() {
  const hoveredRoomId = useHQStore((state) => state.hoveredRoomId);
  const selectedRoomId = useHQStore((state) => state.selectedRoomId);

  const wood = useMemo(() => woodFloorTexture(), []);
  const stone = useMemo(() => stoneFloorTexture(), []);

  // Clones por retângulo com repeat próprio — memoizados porque as salas são
  // estáticas e o hover re-renderiza este componente com frequência.
  const corridorMaps = useMemo(
    () =>
      CORRIDOR_FLOORS.map((rect) =>
        repeatedTexture(stone, rect.maxX - rect.minX, rect.maxZ - rect.minZ, STONE_TILE_METERS),
      ),
    [stone],
  );
  const roomMaps = useMemo(() => {
    const maps = new Map<string, Texture>();
    for (const room of ROOMS) {
      if (room.kind !== "department") continue;
      maps.set(
        room.id,
        repeatedTexture(wood, room.bounds.maxX - room.bounds.minX, room.bounds.maxZ - room.bounds.minZ, WOOD_TILE_METERS),
      );
    }
    return maps;
  }, [wood]);
  const roomStoneMaps = useMemo(() => {
    const maps = new Map<string, Texture>();
    for (const room of ROOMS) {
      if (room.kind === "department") continue;
      maps.set(
        room.id,
        repeatedTexture(stone, room.bounds.maxX - room.bounds.minX, room.bounds.maxZ - room.bounds.minZ, STONE_TILE_METERS),
      );
    }
    return maps;
  }, [stone]);

  return (
    <group name="floors">
      {CORRIDOR_FLOORS.map((rect, index) => (
        <FloorRect
          key={rect.id}
          minX={rect.minX}
          maxX={rect.maxX}
          minZ={rect.minZ}
          maxZ={rect.maxZ}
          y={0.004}
          color="#ffffff"
          map={corridorMaps[index]}
          roughness={0.97}
        />
      ))}

      {ROOMS.map((room) => {
        const { bounds } = room;
        const isDepartment = room.kind === "department";
        const highlighted = room.id === hoveredRoomId || room.id === selectedRoomId;
        const inset = 1.25;

        return (
          <group key={room.id}>
            <FloorRect
              minX={bounds.minX}
              maxX={bounds.maxX}
              minZ={bounds.minZ}
              maxZ={bounds.maxZ}
              y={0.006}
              color="#ffffff"
              map={isDepartment ? roomMaps.get(room.id) : roomStoneMaps.get(room.id)}
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
