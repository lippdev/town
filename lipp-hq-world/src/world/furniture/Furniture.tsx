import { useMemo } from "react";
import { PALETTE } from "@/config/constants";

export interface FurnitureProps {
  position: [number, number, number];
  rotation?: number;
  accent?: string;
}

/**
 * Mobiliário procedural com o mesmo contrato que um GLB ocuparia. Cada peça é
 * um grupo ancorado no chão, girável no eixo Y.
 */

export function Desk({ position, rotation = 0 }: FurnitureProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.06, 1.1]} />
        <meshStandardMaterial color={PALETTE.desk} roughness={0.55} metalness={0.05} />
      </mesh>
      {([-1.05, 1.05]).map((x) =>
        ([-0.42, 0.42]).map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.37, z]} castShadow>
            <boxGeometry args={[0.09, 0.74, 0.09]} />
            <meshStandardMaterial color={PALETTE.deskDark} roughness={0.6} metalness={0.08} />
          </mesh>
        )),
      )}
      <mesh position={[0, 0.4, 0.32]} castShadow>
        <boxGeometry args={[2.1, 0.56, 0.03]} />
        <meshStandardMaterial color={PALETTE.deskDark} roughness={0.7} metalness={0.05} />
      </mesh>
    </group>
  );
}

export function Chair({ position, rotation = 0 }: FurnitureProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[0.52, 0.07, 0.5]} />
        <meshStandardMaterial color={PALETTE.chair} roughness={0.75} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.72, -0.22]} castShadow>
        <boxGeometry args={[0.5, 0.52, 0.06]} />
        <meshStandardMaterial color={PALETTE.chair} roughness={0.75} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.23, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.44, 8]} />
        <meshStandardMaterial color={PALETTE.metal} roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.26, 0.05, 12]} />
        <meshStandardMaterial color={PALETTE.metal} roughness={0.45} metalness={0.45} />
      </mesh>
    </group>
  );
}

export function Monitor({ position, rotation = 0, accent = PALETTE.screenGlow }: FurnitureProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.04, 0]} castShadow>
        <boxGeometry args={[0.34, 0.03, 0.2]} />
        <meshStandardMaterial color={PALETTE.metal} roughness={0.45} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.18, 0]} castShadow>
        <boxGeometry args={[0.06, 0.26, 0.05]} />
        <meshStandardMaterial color={PALETTE.metal} roughness={0.45} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.44, 0]} castShadow>
        <boxGeometry args={[0.92, 0.52, 0.045]} />
        <meshStandardMaterial color="#20242c" roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.44, 0.028]}>
        <planeGeometry args={[0.84, 0.45]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.85} roughness={0.35} />
      </mesh>
    </group>
  );
}

export function Plant({ position }: FurnitureProps) {
  const foliage = useMemo(
    () =>
      ([0, 0.32, 0.6, 0.86, 1.06] as const).map((y, index) => ({
        y,
        radius: 0.3 - index * 0.045,
      })),
    [],
  );

  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.17, 0.4, 10]} />
        <meshStandardMaterial color="#7a5c48" roughness={0.8} metalness={0.02} />
      </mesh>
      {foliage.map((ball, index) => (
        <mesh key={index} position={[0, 0.55 + ball.y, 0]} castShadow>
          <sphereGeometry args={[ball.radius, 10, 8]} />
          <meshStandardMaterial
            color={index % 2 === 0 ? PALETTE.plant : PALETTE.plantDark}
            roughness={0.85}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  );
}

export function Bookshelf({ position, rotation = 0 }: FurnitureProps) {
  const rows = useMemo(() => {
    const result: Array<Array<{ x: number; height: number; color: string }>> = [];
    const palette = ["#b3554d", "#4d7ab3", "#b39a4d", "#5e8a5a", "#8a5ab3", "#c9cdd4"];
    let seed = 7;
    const next = () => {
      seed = (seed * 31 + 17) % 997;
      return palette[seed % palette.length];
    };
    for (let row = 0; row < 3; row += 1) {
      const cells: Array<{ x: number; height: number; color: string }> = [];
      let x = -0.72;
      while (x < 0.6) {
        const width = 0.08 + (seed % 5) * 0.02;
        seed = (seed * 31 + 17) % 997;
        cells.push({ x: x + width / 2, height: 0.26 + (seed % 4) * 0.03, color: next() });
        x += width + 0.015;
      }
      result.push(cells);
    }
    return result;
  }, []);

  const shelfY = [0.45, 0.95, 1.45];

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 2.1, 0.34]} />
        <meshStandardMaterial color={PALETTE.deskDark} roughness={0.7} metalness={0.04} />
      </mesh>
      {shelfY.map((y, rowIndex) =>
        rows[rowIndex]?.map((book, index) => (
          <mesh key={`${rowIndex}-${index}`} position={[book.x, y + 0.14, 0.03]} castShadow>
            <boxGeometry args={[0.07, book.height, 0.24]} />
            <meshStandardMaterial color={book.color} roughness={0.85} metalness={0} />
          </mesh>
        )),
      )}
    </group>
  );
}

export function Whiteboard({ position, rotation = 0, accent = "#ffffff" }: FurnitureProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.35, 0]} castShadow>
        <boxGeometry args={[2.2, 1.3, 0.06]} />
        <meshStandardMaterial color={PALETTE.paper} roughness={0.6} metalness={0.02} />
      </mesh>
      <mesh position={[0, 1.35, 0.036]}>
        <planeGeometry args={[2.0, 1.12]} />
        <meshStandardMaterial color={accent} roughness={0.55} metalness={0} />
      </mesh>
      <mesh position={[0, 0.68, 0]} castShadow>
        <boxGeometry args={[0.06, 1.32, 0.05]} />
        <meshStandardMaterial color={PALETTE.metal} roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

export function ScreenBoard({ position, rotation = 0, accent = PALETTE.screenGlow }: FurnitureProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[2.9, 1.6, 0.08]} />
        <meshStandardMaterial color="#141a24" roughness={0.55} metalness={0.15} />
      </mesh>
      <mesh position={[0, 1.5, 0.048]}>
        <planeGeometry args={[2.7, 1.42]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.55} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.36, 0]} castShadow>
        <boxGeometry args={[0.1, 0.72, 0.1]} />
        <meshStandardMaterial color={PALETTE.metal} roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

export function MeetingTable({ position, rotation = 0 }: FurnitureProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.6, 0.07, 1.7]} />
        <meshStandardMaterial color={PALETTE.desk} roughness={0.5} metalness={0.06} />
      </mesh>
      {([-1.5, 0, 1.5]).map((x) => (
        <mesh key={x} position={[x, 0.37, 0]} castShadow>
          <boxGeometry args={[0.12, 0.72, 1.2]} />
          <meshStandardMaterial color={PALETTE.deskDark} roughness={0.65} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}
