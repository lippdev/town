import { useMemo } from "react";
import { PALETTE } from "@/config/constants";
import { sharedBox, sharedCylinder, sharedMaterial } from "@/world/materials";
import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";

/** Textura procedural para quadros: caixas, setas e post-its. */
function boardTexture(kind: "flow" | "kanban" | "art", accent: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D indisponível.");

  context.fillStyle = "#f4f6f9";
  context.fillRect(0, 0, 512, 256);

  if (kind === "flow") {
    context.fillStyle = "#dce6f5";
    context.strokeStyle = "#8fa8cc";
    for (let column = 0; column < 3; column += 1) {
      context.fillRect(30 + column * 160, 30, 110, 196);
      context.strokeRect(30 + column * 160, 30, 110, 196);
    }
    context.fillStyle = accent;
    for (let column = 0; column < 3; column += 1) {
      const cards = column === 0 ? 3 : column === 1 ? 2 : 1;
      for (let card = 0; card < cards; card += 1) {
        context.fillRect(44 + column * 160, 48 + card * 62, 82, 34);
      }
    }
    context.strokeStyle = "#e0885a";
    context.lineWidth = 5;
    for (let column = 0; column < 2; column += 1) {
      context.beginPath();
      context.moveTo(142 + column * 160, 128);
      context.lineTo(170 + column * 160, 128);
      context.stroke();
      context.beginPath();
      context.moveTo(170 + column * 160, 128);
      context.lineTo(160 + column * 160, 118);
      context.lineTo(160 + column * 160, 138);
      context.closePath();
      context.fillStyle = "#e0885a";
      context.fill();
    }
  } else if (kind === "kanban") {
    context.fillStyle = "#f0e7d2";
    context.fillRect(0, 0, 512, 256);
    context.fillStyle = accent;
    const positions = [
      [40, 40], [130, 40], [70, 110], [200, 110], [330, 40],
      [270, 40], [400, 110], [120, 180], [300, 180], [430, 180],
    ];
    for (const [x, y] of positions) {
      context.save();
      context.translate(x, y);
      context.rotate(((x % 7) - 3) * 0.05);
      context.fillRect(0, 0, 56, 40);
      context.restore();
    }
  } else {
    context.fillStyle = "#e8ecf2";
    context.fillRect(0, 0, 512, 256);
    context.strokeStyle = accent;
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(60, 190);
    context.lineTo(160, 90);
    context.lineTo(250, 150);
    context.lineTo(340, 60);
    context.lineTo(450, 130);
    context.stroke();
    context.fillStyle = accent;
    for (const [x, y] of [[160, 90], [250, 150], [340, 60]]) {
      context.beginPath();
      context.arc(x, y, 9, 0, Math.PI * 2);
      context.fill();
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}

export function flowBoardTexture(accent = "#f97316") {
  return boardTexture("flow", accent);
}

export function kanbanTexture(accent = "#f59e0b") {
  return boardTexture("kanban", accent);
}

export function chartTexture(accent = "#22c55e") {
  return boardTexture("art", accent);
}

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
        <primitive object={sharedBox(2.4, 0.06, 1.1)} attach="geometry" />
        <primitive object={sharedMaterial(PALETTE.desk, 0.55, 0.05)} attach="material" />
      </mesh>
      {([-1.05, 1.05]).map((x) =>
        ([-0.42, 0.42]).map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.37, z]} castShadow>
            <primitive object={sharedBox(0.09, 0.74, 0.09)} attach="geometry" />
            <primitive object={sharedMaterial(PALETTE.deskDark, 0.6, 0.08)} attach="material" />
          </mesh>
        )),
      )}
      <mesh position={[0, 0.4, 0.32]} castShadow>
        <primitive object={sharedBox(2.1, 0.56, 0.03)} attach="geometry" />
        <primitive object={sharedMaterial(PALETTE.deskDark, 0.7, 0.05)} attach="material" />
      </mesh>
    </group>
  );
}

export function Chair({ position, rotation = 0 }: FurnitureProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.46, 0]} castShadow>
        <primitive object={sharedBox(0.52, 0.07, 0.5)} attach="geometry" />
        <primitive object={sharedMaterial(PALETTE.chair, 0.75, 0.1)} attach="material" />
      </mesh>
      <mesh position={[0, 0.72, -0.22]} castShadow>
        <primitive object={sharedBox(0.5, 0.52, 0.06)} attach="geometry" />
        <primitive object={sharedMaterial(PALETTE.chair, 0.75, 0.1)} attach="material" />
      </mesh>
      <mesh position={[0, 0.23, 0]} castShadow>
        <primitive object={sharedCylinder(0.05, 0.05, 0.44, 8)} attach="geometry" />
        <primitive object={sharedMaterial(PALETTE.metal, 0.4, 0.5)} attach="material" />
      </mesh>
      <mesh position={[0, 0.03, 0]} castShadow>
        <primitive object={sharedCylinder(0.26, 0.26, 0.05, 12)} attach="geometry" />
        <primitive object={sharedMaterial(PALETTE.metal, 0.45, 0.45)} attach="material" />
      </mesh>
    </group>
  );
}

export function Monitor({ position, rotation = 0, accent = PALETTE.screenGlow }: FurnitureProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.04, 0]} castShadow>
        <primitive object={sharedBox(0.34, 0.03, 0.2)} attach="geometry" />
        <primitive object={sharedMaterial(PALETTE.metal, 0.45, 0.4)} attach="material" />
      </mesh>
      <mesh position={[0, 0.18, 0]} castShadow>
        <primitive object={sharedBox(0.06, 0.26, 0.05)} attach="geometry" />
        <primitive object={sharedMaterial(PALETTE.metal, 0.45, 0.4)} attach="material" />
      </mesh>
      <mesh position={[0, 0.44, 0]} castShadow>
        <primitive object={sharedBox(0.92, 0.52, 0.045)} attach="geometry" />
        <primitive object={sharedMaterial("#20242c", 0.5, 0.2)} attach="material" />
      </mesh>
      <mesh position={[0, 0.44, 0.028]}>
        <planeGeometry args={[0.84, 0.45]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.55}
          roughness={0.35}
          toneMapped={false}
        />
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
        <primitive object={sharedCylinder(0.22, 0.17, 0.4, 10)} attach="geometry" />
        <primitive object={sharedMaterial("#7a5c48", 0.8, 0.02)} attach="material" />
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
        <primitive object={sharedBox(1.7, 2.1, 0.34)} attach="geometry" />
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
        <primitive object={sharedBox(2.2, 1.3, 0.06)} attach="geometry" />
        <primitive object={sharedMaterial(PALETTE.paper, 0.6, 0.02)} attach="material" />
      </mesh>
      <mesh position={[0, 1.35, 0.036]}>
        <planeGeometry args={[2.0, 1.12]} />
        <meshStandardMaterial color={accent} roughness={0.55} metalness={0} />
      </mesh>
      <mesh position={[0, 0.68, 0]} castShadow>
        <primitive object={sharedBox(0.06, 1.32, 0.05)} attach="geometry" />
        <meshStandardMaterial color={PALETTE.metal} roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

export function ScreenBoard({ position, rotation = 0, accent = PALETTE.screenGlow }: FurnitureProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <primitive object={sharedBox(2.9, 1.6, 0.08)} attach="geometry" />
        <primitive object={sharedMaterial("#141a24", 0.55, 0.15)} attach="material" />
      </mesh>
      <mesh position={[0, 1.5, 0.048]}>
        <planeGeometry args={[2.7, 1.42]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.45} roughness={0.4} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.36, 0]} castShadow>
        <primitive object={sharedBox(0.1, 0.72, 0.1)} attach="geometry" />
        <meshStandardMaterial color={PALETTE.metal} roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

export function MeetingTable({ position, rotation = 0 }: FurnitureProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
        <primitive object={sharedBox(3.6, 0.07, 1.7)} attach="geometry" />
        <meshStandardMaterial color={PALETTE.desk} roughness={0.5} metalness={0.06} />
      </mesh>
      {([-1.5, 0, 1.5]).map((x) => (
        <mesh key={x} position={[x, 0.37, 0]} castShadow>
          <primitive object={sharedBox(0.12, 0.72, 1.2)} attach="geometry" />
          <primitive object={sharedMaterial(PALETTE.deskDark, 0.65, 0.05)} attach="material" />
        </mesh>
      ))}
    </group>
  );
}
