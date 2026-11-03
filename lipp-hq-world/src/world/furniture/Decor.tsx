import { useMemo } from "react";
import { chartTexture } from "@/world/furniture/Furniture";
import type { RoomDefinition } from "@/types/hq";

interface DecorProps {
  room: RoomDefinition;
}

/** Tapete colorido sob a área de trabalho. */
export function Rug({ room }: DecorProps) {
  const { bounds } = room;
  const cx = (bounds.minX + bounds.maxX) / 2;

  return (
    <mesh position={[cx, 0.018, bounds.minZ + 2.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[3.4, 2.1]} />
      <meshStandardMaterial color={room.color} roughness={0.95} metalness={0} opacity={0.34} transparent />
    </mesh>
  );
}

/** Quadro na parede norte, acima da mesa. */
export function WallArt({ room }: DecorProps) {
  const { bounds } = room;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const z = bounds.minZ + 0.14;

  return (
    <group position={[cx, 1.85, z]}>
      <mesh castShadow>
        <boxGeometry args={[1.35, 0.92, 0.05]} />
        <meshStandardMaterial color="#3a4353" roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[1.18, 0.76]} />
        <meshStandardMaterial map={chartTexture(room.color)} roughness={0.75} metalness={0} />
      </mesh>
    </group>
  );
}

/** Caixas empilhadas — o stock das Operações. */
export function Crates({ room }: DecorProps) {
  const { bounds } = room;
  const spot = useMemo(() => {
    const cx = (bounds.minX + bounds.maxX) / 2;
    return [cx + 2.2, bounds.maxZ - 1.0] as const;
  }, [bounds]);

  const crate = (x: number, y: number, z: number, s: number, key: string) => (
    <mesh key={key} position={[spot[0] + x, 0.22 + y, spot[1] + z]} rotation={[0, (x + z) * 0.13, 0]} castShadow receiveShadow>
      <boxGeometry args={[s, 0.44, s]} />
      <meshStandardMaterial color="#b98d5e" roughness={0.9} metalness={0} />
    </mesh>
  );

  return (
    <group name="crates">
      {crate(0, 0, 0, 0.62, "a")}
      {crate(0.68, 0, 0.1, 0.58, "b")}
      {crate(0.3, 0.46, 0.05, 0.5, "c")}
    </group>
  );
}

/** Caneca e teclado — o detalhe de quem trabalha na mesa. */
export function DeskClutter({ room }: DecorProps) {
  const { bounds } = room;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const z = bounds.minZ + 1.12;

  return (
    <group>
      <mesh position={[cx + 0.95, 0.815, z + 0.18]} castShadow>
        <cylinderGeometry args={[0.05, 0.045, 0.11, 10]} />
        <meshStandardMaterial color={room.color} roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh position={[cx - 0.15, 0.79, z - 0.12]} castShadow>
        <boxGeometry args={[0.5, 0.02, 0.18]} />
        <meshStandardMaterial color="#2c333f" roughness={0.6} metalness={0.1} />
      </mesh>
      {/* papéis espalhados */}
      {[[0.3, -0.2, 0.4], [0.55, 0.15, -0.2], [-0.4, 0.25, 0.9]].map(([x, z, rotation], index) => (
        <mesh key={index} position={[cx + x, 0.785, z + z]} rotation={[0, rotation, 0]} castShadow>
          <boxGeometry args={[0.28, 0.005, 0.2]} />
          <meshStandardMaterial color="#f2f4f7" roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

/** Máquina de café do hall. */
export function CoffeeStation({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 1.0, 0.6]} />
        <meshStandardMaterial color="#3a4353" roughness={0.6} metalness={0.15} />
      </mesh>
      <mesh position={[0, 1.06, 0]} castShadow>
        <boxGeometry args={[0.72, 0.12, 0.55]} />
        <meshStandardMaterial color="#232a35" roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.13, 0]}>
        <boxGeometry args={[0.5, 0.03, 0.4]} />
        <meshStandardMaterial color="#ffbe6e" emissive="#ffbe6e" emissiveIntensity={0.8} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Sofá da comunidade — onde a Echo recebe feedback. */
export function Couch({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.4, 0.85]} />
        <meshStandardMaterial color="#7c5c9e" roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[0, 0.62, -0.36]} castShadow>
        <boxGeometry args={[1.9, 0.6, 0.22]} />
        <meshStandardMaterial color="#6b4f8a" roughness={0.9} metalness={0} />
      </mesh>
      {[-0.82, 0, 0.82].map((x) => (
        <mesh key={x} position={[x, 0.56, 0.05]} castShadow>
          <boxGeometry args={[0.55, 0.14, 0.7]} />
          <meshStandardMaterial color="#8d6cad" roughness={0.92} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}
