import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useHQStore } from "@/state/useHQStore";
import { sceneAgentsFromFleet, type SceneAgent } from "@/world/characters/sceneAgents";
import { useReducedMotion } from "@/app/useReducedMotion";
import type { AgentAnimationState } from "@/types/hq";
import { registerPickable } from "@/world/scene/Picking";
import { AgentFigure, type AgentFigureHandle } from "@/world/characters/AgentFigure";
import { resolveLook } from "@/world/characters/appearance";
import { findPath, type NavPoint } from "@/world/navigation/navGrid";

import { ROOMS_BY_ID, roomCenter } from "@/world/rooms/rooms";

const WALK_SPEED = 1.55;
const TURN_SPEED = 7.5;
const WALK_CYCLE = 8.6;
const IDLE_BREATH = 1.7;

/** Estado interno mutável por agente, fora do React. */
interface AgentRuntime {
  definition: SceneAgent;
  figure: AgentFigureHandle | null;
  state: AgentAnimationState;
  summary?: string;
  path: NavPoint[];
  pathIndex: number;
  walkPhase: number;
  heading: number;
  pendingState?: AgentAnimationState;
  pendingHeading?: number;
  seatHeading?: number;
  /** Posição deste bot entre os participantes do briefing (assento fixo). */
  meetingSlot: number;
}

const runtimes = new Map<string, AgentRuntime>();

/** Cria ou devolve o runtime do agente. Seguro em qualquer ordem de montagem. */
function getRuntime(definition: SceneAgent): AgentRuntime {
  let runtime = runtimes.get(definition.id);
  if (!runtime) {
    runtime = {
      definition,
      figure: null,
      state: "idle",
      path: [],
      pathIndex: 0,
      walkPhase: 0,
      heading: Math.PI,
      meetingSlot: 0,
    };
    runtimes.set(definition.id, runtime);
  }
  return runtime;
}

/** Comando de QA: manda o agente caminhar até o hall e voltar ao trabalho. */
export function demoWalkToHall(agentId: string) {
  const runtime = runtimes.get(agentId);
  if (!runtime) return;
  const hall = hallSpot([...runtimes.keys()].indexOf(agentId));
  walkTo(runtime, hall, "idle");
}

/** Posição e estado atuais do personagem, para as esperas do harness. */
export function getAgentRuntimeInfo(
  agentId: string,
): { x: number; z: number; state: string; hipsY: number } | null {
  const runtime = runtimes.get(agentId);
  if (!runtime?.figure?.group) return null;
  return {
    x: runtime.figure.group.position.x,
    z: runtime.figure.group.position.z,
    state: runtime.state,
    // altura do quadril: prova de que a pose sentada foi aplicada (-0.34)
    hipsY: Number(runtime.figure.hips?.position.y.toFixed(3) ?? 0),
  };
}

/** Ponto de trabalho: à frente da mesa, na cadeira do posto do agente. */
function deskSpot(agent: SceneAgent): NavPoint {
  const room = ROOMS_BY_ID[agent.roomId] ?? ROOMS_BY_ID.hall;
  const center = roomCenter(room);
  return { x: center[0], z: room.bounds.minZ + 2.35 };
}

/**
 * Assentos da mesa de reunião, na ordem das cadeiras: três de um lado, três do
 * outro. Um briefing com mais de seis bots usa os lugares em pé encostados na
 * parede — ninguém fica em cima da mesa.
 */
const MEETING_SEATS: Array<{ x: number; z: number; heading: number }> = (() => {
  const room = ROOMS_BY_ID.reunioes;
  const center = roomCenter(room);
  const seats: Array<{ x: number; z: number; heading: number }> = [];
  for (const offset of [-1.15, 0, 1.15]) {
    // lado norte: olha para o sul (mesa e tela adiante)
    seats.push({ x: center[0] + offset, z: center[2] - 1.25, heading: Math.PI });
  }
  for (const offset of [-1.15, 0, 1.15]) {
    seats.push({ x: center[0] + offset, z: center[2] + 1.25, heading: 0 });
  }
  return seats;
})();

/** Posições em pé para quem chega além dos seis assentos. */
const MEETING_STANDING: Array<{ x: number; z: number; heading: number }> = (() => {
  const room = ROOMS_BY_ID.reunioes;
  const center = roomCenter(room);
  return [
    { x: room.bounds.minX + 1.1, z: center[2] - 0.4, heading: Math.PI / 2 },
    { x: room.bounds.minX + 1.1, z: center[2] + 0.6, heading: Math.PI / 2 },
    { x: room.bounds.maxX - 1.1, z: center[2] - 0.4, heading: -Math.PI / 2 },
    { x: room.bounds.maxX - 1.1, z: center[2] + 0.6, heading: -Math.PI / 2 },
  ];
})();

/** Assento do agente no briefing: escolhido pelo índice na lista de participantes. */
function meetingSeat(index: number): { x: number; z: number; heading: number } {
  const seats = MEETING_SEATS;
  if (index < seats.length) return seats[index];
  const standing = MEETING_STANDING;
  return standing[(index - seats.length) % standing.length];
}

function hallSpot(index: number): NavPoint {
  return { x: -1.2 + (index % 3) * 1.4, z: index < 3 ? 0.8 : -0.8 };
}

function setState(runtime: AgentRuntime, state: AgentAnimationState, summary?: string) {
  runtime.state = state;
  runtime.summary = summary;
}

function walkTo(runtime: AgentRuntime, target: NavPoint, then: AgentAnimationState, faceHeading?: number) {
  const figure = runtime.figure;
  if (!figure) return;
  const position = figure.group.position;
  const path = findPath(position.x, position.z, target.x, target.z);
  // destino igual ao ponto atual (ou inalcançável): nunca entre em "walking"
  // com caminho vazio — era o congelamento que travava a bateria
  if (path.length === 0) {
    setState(runtime, then);
    runtime.pendingState = undefined;
    return;
  }
  runtime.path = path;
  runtime.pathIndex = 0;
  runtime.pendingState = then;
  runtime.pendingHeading = faceHeading;
  setState(runtime, "walking");
}

declare module "@/world/characters/Agents" {
  // estende o runtime com o estado pendente pós-caminhada
}

/**
 * Controladores por agente: máquina de estados, navegação e animação rodam
 * aqui, por referência direta — sem re-render por frame.
 */
export function Agents() {
  const selectedAgentId = useHQStore((state) => state.selectedAgentId);
  const agentLooks = useHQStore((state) => state.agentLooks);
  const fleet = useHQStore((state) => state.fleet);
  const agents = useMemo(() => {
    const live = sceneAgentsFromFleet(fleet);
    return live;
  }, [fleet]);
  const reducedMotion = useReducedMotion();
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const indexRef = useRef(0);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  // assento de briefing por ordem estável de id: quem entra na reunião mantém
  // o mesmo lugar entre polls
  const meetingSlots = useMemo(() => {
    const slots = new Map<string, number>();
    agents
      .filter((agent) => (agent.live ? agent.liveState === "meeting" : false))
      .map((agent) => agent.id)
      .sort()
      .forEach((agentId, index) => slots.set(agentId, index));
    return slots;
  }, [agents]);

  useFrame((_, rawDelta) => {
    // animação de pose usa delta travado; locomoção usa o delta real, senão o
    // personagem anda em câmera lenta em renders lentos
    const delta = Math.min(rawDelta, 0.12);
    const locomotionDelta = Math.min(rawDelta, 1.0);
    indexRef.current += delta;

    for (const [agentId, runtime] of runtimes) {
      const figure = runtime.figure;
      if (!figure) continue;
      runtime.meetingSlot = meetingSlots.get(agentId) ?? runtime.meetingSlot;

      // alimenta o estado a partir da fonte de dados
      const state = useHQStore.getState().agentStates[agentId];
      if (state && state !== runtime.state && runtime.state !== "walking") {
        if (state === "meeting") {
          // briefing: cada participante vai ao seu assento na sala de reuniões
          const seat = meetingSeat(runtime.meetingSlot);
          walkTo(runtime, { x: seat.x, z: seat.z }, "meeting", seat.heading);
        } else {
          runtime.state = state;
        }
      }

      const { group, hips, leftLeg, rightLeg, leftArm, rightArm, torso, head, ring } = figure;
      if (!group || !hips) continue;

      // ---- locomoção ----
      if (runtime.state === "walking" && runtime.path.length > 0) {
        const target = runtime.path[runtime.pathIndex];
        if (target) {
          const dx = target.x - group.position.x;
          const dz = target.z - group.position.z;
          const distance = Math.hypot(dx, dz);
          if (distance < 0.08) {
            runtime.pathIndex += 1;
            if (runtime.pathIndex >= runtime.path.length) {
              runtime.path = [];
              if (runtime.pendingHeading !== undefined) {
                runtime.heading = runtime.pendingHeading;
                runtime.seatHeading = runtime.pendingHeading;
                runtime.pendingHeading = undefined;
              }
              setState(runtime, runtime.pendingState ?? "idle");
              runtime.pendingState = undefined;
            }
          } else {
            const step = Math.min(WALK_SPEED * locomotionDelta, distance);
            group.position.x += (dx / distance) * step;
            group.position.z += (dz / distance) * step;
            const targetHeading = Math.atan2(dx, dz);
            let gap = targetHeading - runtime.heading;
            while (gap > Math.PI) gap -= Math.PI * 2;
            while (gap < -Math.PI) gap += Math.PI * 2;
            runtime.heading += gap * Math.min(1, TURN_SPEED * delta);
          }
        }
        runtime.walkPhase += delta * WALK_CYCLE;
      }

      group.rotation.y = runtime.heading;

      // ---- pulso do anel de seleção (desligado com movimento reduzido) ----
      if (ring) {
        const isSelected = useHQStore.getState().selectedAgentId === agentId;
        ring.visible = isSelected;
        if (isSelected && !reducedRef.current) {
          const pulse = 1 + Math.sin(indexRef.current * 3.1) * 0.07;
          ring.scale.set(pulse, pulse, 1);
        } else if (isSelected) {
          ring.scale.set(1, 1, 1);
        }
      }

      // ---- poses e micro-animações ----
      // em reunião o bot senta na cadeira do assento, como quem trabalha
      const sitting = runtime.state === "working" || runtime.state === "blocked" || runtime.state === "meeting";
      const sittingTargetY = sitting ? -0.34 : 0;
      hips.position.y += (sittingTargetY - hips.position.y) * Math.min(1, delta * 6);

      if (sitting) {
        if (leftLeg) leftLeg.rotation.x += (-Math.PI / 2 - leftLeg.rotation.x) * Math.min(1, delta * 6);
        if (rightLeg) rightLeg.rotation.x += (-Math.PI / 2 - rightLeg.rotation.x) * Math.min(1, delta * 6);
        if (leftArm) leftArm.rotation.x += (-0.95 - leftArm.rotation.x) * Math.min(1, delta * 5);
        if (rightArm) rightArm.rotation.x += (-0.95 - rightArm.rotation.x) * Math.min(1, delta * 5);
        if (torso) {
          // na reunião não há teclado: tronco quieto e cabeça erguida para a mesa
          torso.position.z = runtime.state === "meeting" ? 0 : Math.sin(indexRef.current * 9.5) * 0.014;
        }
        if (head) head.rotation.x = runtime.state === "meeting" ? 0.04 : 0.16;
      } else if (runtime.state === "walking") {
        const swing = Math.sin(runtime.walkPhase);
        if (leftLeg) leftLeg.rotation.x = swing * 0.62;
        if (rightLeg) rightLeg.rotation.x = -swing * 0.62;
        if (leftArm) leftArm.rotation.x = -swing * 0.5;
        if (rightArm) rightArm.rotation.x = swing * 0.5;
        if (head) head.rotation.x = 0;
      } else {
        // idle / waiting / meeting / offline
        const breath = Math.sin(indexRef.current * IDLE_BREATH + runtime.definition.id.length) * 0.02;
        if (leftLeg) leftLeg.rotation.x += (0 - leftLeg.rotation.x) * Math.min(1, delta * 5);
        if (rightLeg) rightLeg.rotation.x += (0 - rightLeg.rotation.x) * Math.min(1, delta * 5);
        if (leftArm) leftArm.rotation.x += (breath - leftArm.rotation.x) * Math.min(1, delta * 5);
        if (rightArm) rightArm.rotation.x += (breath - rightArm.rotation.x) * Math.min(1, delta * 5);
        if (head) head.rotation.x = 0;
        if (torso) torso.position.z = 0;

        if (runtime.state === "meeting") {
          // a orientação vem do assento (definida ao chegar); sem assento, encara
          // a mesa. Posição sempre por navegação — personagem não atravessa parede
          const target = runtime.seatHeading ?? 0;
          runtime.heading += (target - runtime.heading) * Math.min(1, delta * 2);
        }
      }
    }
  });

  return (
    <group name="agents">
      {agents.map((agent) => {
        const spot = deskSpot(agent);
        const showLabel = hoveredAgentId === agent.id || selectedAgentId === agent.id;
        const appearance = resolveLook(
          agent,
          agentLooks[agent.id] ?? (agent.presetId ? { presetId: agent.presetId } : null),
        );
        return (
          <AgentFigure
            key={agent.id}
            agent={agent}
            appearance={appearance}
            selected={selectedAgentId === agent.id}
            figureRef={(handle) => {
              // refs de filhos chegam antes do grupo pai: só registre com grupo pronto.
              // A posição inicial vale só no primeiro registro — re-renders (hover,
              // aparência, seleção) re-disparam o ref e não podem teletransportar
              // o personagem de volta à mesa no meio de uma caminhada.
              if (!handle.group) return;
              const runtime = getRuntime(agent);
              const firstRegistration = runtime.figure === null;
              runtime.figure = handle;
              if (firstRegistration) {
                handle.group.position.set(spot.x, 0, spot.z);
              }
              registerPickable(handle.group);
            }}
            onHoverChange={(hovered) => setHoveredAgentId(hovered ? agent.id : null)}
          >
            {showLabel && (
              <Html center position={[0, 2.05, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
                <div
                  style={{
                    background: "rgba(13, 21, 36, 0.92)",
                    border: `1px solid ${agent.color}`,
                    borderRadius: 8,
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#e6ecf5",
                    whiteSpace: "nowrap",
                  }}
                >
                  {agent.name} · {agent.role}
                </div>
              </Html>
            )}
          </AgentFigure>
        );
      })}
    </group>
  );
}

