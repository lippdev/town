import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, MeshBasicMaterial } from "three";
import { useHQStore } from "@/state/useHQStore";
import { briefingLabel } from "@/integrations/hermes/briefings";
import { createLabelTexture } from "@/world/textures/labelTexture";
import { ROOMS_BY_ID, roomCenter } from "@/world/rooms/rooms";

/**
 * Quadro de briefing na parede da sala de reuniões.
 *
 * Mostra o que está acontecendo de verdade: quando há briefing em andamento
 * (sessão de rotina do Hermes), o quadro diz o tipo e quem está na sala.
 * Sem briefing, mostra a agenda neutra — nunca inventa uma reunião.
 */
export function BriefingBoard() {
  const fleet = useHQStore((state) => state.fleet);
  const room = ROOMS_BY_ID.reunioes;

  const briefingBots = useMemo(() => (fleet?.bots ?? []).filter((bot) => bot.briefing), [fleet]);
  const kind = briefingBots[0]?.briefing?.kind;
  const title = kind ? briefingLabel(kind) : "Sala de reuniões";
  const subtitle = kind
    ? `${briefingBots.length} bot${briefingBots.length === 1 ? "" : "s"} · ${briefingBots
        .slice(0, 3)
        .map((bot) => bot.name)
        .join(", ")}${briefingBots.length > 3 ? "…" : ""}`
    : "Briefing diário, semanal e mensal acontecem aqui";

  const texture = useMemo(
    () =>
      createLabelTexture({
        text: title,
        subtitle,
        accent: kind ? "#4ade80" : "#94a3b8",
        background: kind ? "#0c1f18" : "#0f172a",
        width: 768,
        height: 252,
      }),
    [title, subtitle, kind],
  );

  useEffect(() => () => texture.dispose(), [texture]);

  const board = useRef<Group>(null);
  const center = roomCenter(room);

  // brilho pulsante no filete quando há briefing — sinal de "ao vivo" na sala,
  // sem mexer na geometria presa à parede
  const liveRef = useRef<MeshBasicMaterial | null>(null);
  useFrame(({ clock }) => {
    const material = liveRef.current;
    if (!material || !kind) return;
    material.opacity = 0.6 + Math.sin(clock.elapsedTime * 2.2) * 0.4;
  });

  return (
    <group
      ref={board}
      name="briefing-board"
      position={[center[0] - 2.55, 2.05, room.bounds.minZ + 0.18]}
    >
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[2.72, 0.94]} />
        <meshStandardMaterial color="#0b1220" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0, 0.005]}>
        <planeGeometry args={[2.6, 0.86]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {kind && (
        <mesh position={[0, -0.52, 0.02]}>
          <planeGeometry args={[2.6, 0.05]} />
          <meshBasicMaterial ref={liveRef} color="#4ade80" toneMapped={false} transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}
