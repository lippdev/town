import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { AdditiveBlending, type Mesh, type MeshBasicMaterial } from "three";
import { WALL_HEIGHT } from "@/config/constants";
import { useHQStore } from "@/state/useHQStore";
import { useReducedMotion } from "@/app/useReducedMotion";
import { ROOMS_BY_ID, roomCenter } from "@/world/rooms/rooms";
import { sceneAgentsFromFleet } from "@/world/characters/sceneAgents";
import { stateLabel } from "@/components/hud/fleetView";
import type { BotSnapshot, FleetSnapshot } from "@/integrations/hq/types";
import type { RoomDefinition } from "@/types/hq";

/** Altura do cartão: acima das paredes, para nunca ficar atrás delas. */
const TAG_HEIGHT = WALL_HEIGHT + 1.1;
/** Período do pulso do anel no piso, em segundos. */
const PULSE_SECONDS = 1.6;

export interface RoomTag {
  room: RoomDefinition;
  /** Bot no posto da sala, quando há. */
  bot: BotSnapshot | null;
  kicker: string;
  status: string | null;
}

/** O que o indicador diz de uma sala: nome, quem está no posto e o estado. */
export function roomTag(room: RoomDefinition, fleet: FleetSnapshot | null): RoomTag {
  const occupant = sceneAgentsFromFleet(fleet).find((agent) => agent.roomId === room.id);
  const bot = occupant ? (fleet?.bots.find((candidate) => candidate.id === occupant.id) ?? null) : null;
  const kicker = room.kind === "department" ? "Departamento" : room.id === "reunioes" ? "Reuniões" : "Área comum";
  return {
    room,
    bot,
    kicker,
    status: bot ? (bot.briefing ? "em briefing" : stateLabel(bot.state)) : room.kind === "department" ? "posto livre" : null,
  };
}

/**
 * Indicador da sala sob o mouse, no estilo das marcações de jogador das
 * transmissões de futebol: um cartão flutuando acima da sala, uma haste de luz
 * até o chão e um anel pulsando no piso, na cor do departamento.
 *
 * Aparece ao passar o mouse e fica na sala selecionada. Substitui os totens
 * fixos com placa, que poluíam a vista de cima e liam como postes pretos.
 */
export function RoomIndicator() {
  const hoveredRoomId = useHQStore((state) => state.hoveredRoomId);
  const selectedRoomId = useHQStore((state) => state.selectedRoomId);
  const fleet = useHQStore((state) => state.fleet);
  const roomId = hoveredRoomId ?? selectedRoomId;
  const room = roomId ? ROOMS_BY_ID[roomId] : undefined;
  const tag = useMemo(() => (room ? roomTag(room, fleet) : null), [room, fleet]);
  if (!tag) return null;
  return <Marker key={tag.room.id} tag={tag} />;
}

function Marker({ tag }: { tag: RoomTag }) {
  const reducedMotion = useReducedMotion();
  const ring = useRef<Mesh | null>(null);
  const beam = useRef<Mesh | null>(null);
  const clock = useRef(0);
  const [x, , z] = roomCenter(tag.room);
  const color = tag.room.color;

  useFrame((_, delta) => {
    clock.current += delta;
    // entrada: a haste sobe do chão em ~0,25 s
    if (beam.current) {
      const grow = Math.min(1, clock.current / 0.25);
      beam.current.scale.y = grow;
      beam.current.position.y = (TAG_HEIGHT * grow) / 2;
    }
    if (!ring.current) return;
    const material = ring.current.material as MeshBasicMaterial;
    if (reducedMotion) {
      ring.current.scale.setScalar(1);
      material.opacity = 0.55;
      return;
    }
    const phase = (clock.current % PULSE_SECONDS) / PULSE_SECONDS;
    ring.current.scale.setScalar(0.7 + phase * 0.9);
    material.opacity = 0.75 * (1 - phase);
  });

  return (
    <group position={[x, 0, z]} name="room-indicator">
      {/* anel fixo + anel que pulsa, rente ao piso */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} renderOrder={2}>
        <ringGeometry args={[0.52, 0.6, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.031, 0]} renderOrder={2}>
        <ringGeometry args={[0.62, 0.7, 48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.6}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      {/* haste de luz do chão até o cartão */}
      <mesh ref={beam} position={[0, TAG_HEIGHT / 2, 0]} scale={[1, 0, 1]}>
        <cylinderGeometry args={[0.018, 0.018, TAG_HEIGHT, 8, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.7}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <Html position={[0, TAG_HEIGHT, 0]} zIndexRange={[12, 0]} style={{ pointerEvents: "none" }}>
        <div className="room-tag" style={{ ["--tag-color" as string]: color }}>
          <div className="room-tag-card">
            <span className="room-tag-accent" aria-hidden />
            <div className="room-tag-text">
              <span className="room-tag-kicker">{tag.kicker}</span>
              <strong className="room-tag-name">{tag.room.name}</strong>
              {(tag.bot || tag.status) && (
                <span className="room-tag-meta">
                  {tag.bot && <span className="room-tag-bot">{tag.bot.name}</span>}
                  {tag.status && (
                    <span className={`room-tag-status state-${tag.bot?.briefing ? "working" : (tag.bot?.state ?? "none")}`}>
                      <i aria-hidden />
                      {tag.status}
                    </span>
                  )}
                </span>
              )}
            </div>
            {tag.bot && tag.bot.activeSessions > 0 && (
              <span className="room-tag-count" title="Sessões ativas">
                {tag.bot.activeSessions}
              </span>
            )}
          </div>
          <span className="room-tag-pointer" aria-hidden />
        </div>
      </Html>
    </group>
  );
}
