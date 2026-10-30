import { useMemo } from "react";
import type { Group } from "three";
import { PLINTH_HEIGHT, PALETTE, WALL_HEIGHT } from "@/config/constants";
import type { WallDefinition } from "@/types/hq";

interface SolidPiece {
  center: number;
  length: number;
}

/** Divide o vão da parede em trechos sólidos, respeitando os vãos das portas. */
export function solidPieces(wall: WallDefinition): SolidPiece[] {
  const doors = [...wall.doors].sort((a, b) => a.center - b.center);
  const pieces: SolidPiece[] = [];
  let cursor = wall.start;

  for (const door of doors) {
    const doorStart = door.center - door.width / 2;
    const doorEnd = door.center + door.width / 2;
    if (doorStart > cursor) {
      pieces.push({ center: (cursor + doorStart) / 2, length: doorStart - cursor });
    }
    cursor = Math.max(cursor, doorEnd);
  }

  if (cursor < wall.end) {
    pieces.push({ center: (cursor + wall.end) / 2, length: wall.end - cursor });
  }

  return pieces.filter((piece) => piece.length > 0.01);
}

interface WallSegmentProps {
  wall: WallDefinition;
  registerPanel: (wallId: string, node: Group | null) => void;
}

/**
 * Um segmento de parede: rodapé permanente e painel superior removível.
 * O painel vive num grupo próprio, ancorado em y = 0, para que o sistema de
 * cutaway possa reduzir sua altura sem tocar no rodapé nem no piso.
 */
export function WallSegment({ wall, registerPanel }: WallSegmentProps) {
  const pieces = useMemo(() => solidPieces(wall), [wall]);
  const panelHeight = WALL_HEIGHT - PLINTH_HEIGHT;

  const box = (length: number, height: number, along: number, y: number) => ({
    geometry:
      wall.axis === "x"
        ? ([length, height, wall.thickness] as [number, number, number])
        : ([wall.thickness, height, length] as [number, number, number]),
    position:
      wall.axis === "x"
        ? ([along, y, wall.fixed] as [number, number, number])
        : ([wall.fixed, y, along] as [number, number, number]),
  });

  return (
    <group name="wall-group">
      {pieces.map((piece, index) => {
        const plinth = box(piece.length, PLINTH_HEIGHT, piece.center, PLINTH_HEIGHT / 2);
        return (
          <mesh key={`${wall.id}-plinth-${index}`} position={plinth.position} receiveShadow>
            <boxGeometry args={plinth.geometry} />
            <meshStandardMaterial color={PALETTE.wallPlinth} roughness={0.82} metalness={0.03} />
          </mesh>
        );
      })}

      <group ref={(node) => registerPanel(wall.id, node)}>
        {pieces.map((piece, index) => {
          const panel = box(
            piece.length,
            panelHeight,
            piece.center,
            PLINTH_HEIGHT + panelHeight / 2,
          );
          return (
            <mesh key={`${wall.id}-panel-${index}`} position={panel.position} receiveShadow>
              <boxGeometry args={panel.geometry} />
              <meshStandardMaterial color={PALETTE.wall} roughness={0.86} metalness={0.02} />
            </mesh>
          );
        })}

        {wall.doors.map((door, index) => {
          const lintelHeight = WALL_HEIGHT - 2.1;
          const lintel = box(door.width, lintelHeight, door.center, 2.1 + lintelHeight / 2);
          return (
            <mesh key={`${wall.id}-lintel-${index}`} position={lintel.position} receiveShadow>
              <boxGeometry args={lintel.geometry} />
              <meshStandardMaterial color={PALETTE.wall} roughness={0.86} metalness={0.02} />
            </mesh>
          );
        })}
      </group>

      {wall.doors.map((door, index) => {
        const frame = box(door.width + 0.14, 0.09, door.center, 2.06);
        return (
          <mesh key={`${wall.id}-frame-${index}`} position={frame.position}>
            <boxGeometry args={frame.geometry} />
            <meshStandardMaterial color={PALETTE.wallTrim} roughness={0.62} metalness={0.12} />
          </mesh>
        );
      })}
    </group>
  );
}
