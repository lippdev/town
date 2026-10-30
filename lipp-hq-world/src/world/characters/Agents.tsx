import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { AGENTS, AGENTS_BY_ID } from "@/agents/agents";
import { useHQStore } from "@/state/useHQStore";
import { useReducedMotion } from "@/app/useReducedMotion";
import type { AgentAnimationState, VirtualAgent } from "@/types/hq";
import { registerPickable } from "@/world/scene/Picking";
import { AgentFigure, type AgentFigureHandle } from "@/world/characters/AgentFigure";
import { resolveAppearance } from "@/world/characters/appearance";
import { findPath, type NavPoint } from "@/world/navigation/navGrid";

/** Hash determinístico por id — substitui Math.random no cenário demo. */
function deterministicHash(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 997;
  }
  return hash;
}
import { ROOMS_BY_ID, roomCenter } from "@/world/rooms/rooms";

const WALK_SPEED = 1.55;
const TURN_SPEED = 7.5;
const WALK_CYCLE = 8.6;
const IDLE_BREATH = 1.7;

/** Estado interno mutável por agente, fora do React. */
interface AgentRuntime {
  definition: (typeof AGENTS)[number];
  figure: AgentFigureHandle | null;
  state: AgentAnimationState;
  source: VirtualAgent["statusSource"];
  summary?: string;
  path: NavPoint[];
  pathIndex: number;
  walkPhase: number;
  heading: number;
  walkTimer: number;
  nextIdleWalkAt: number;
  pendingState?: AgentAnimationState;
}

const runtimes = new Map<string, AgentRuntime>();

/** Cria ou devolve o runtime do agente. Seguro em qualquer ordem de montagem. */
function getRuntime(definition: (typeof AGENTS)[number]): AgentRuntime {
  let runtime = runtimes.get(definition.id);
  if (!runtime) {
    runtime = {
      definition,
      figure: null,
      state: "idle",
      source: "demo",
      path: [],
      pathIndex: 0,
      walkPhase: 0,
      heading: Math.PI,
      walkTimer: 0,
      nextIdleWalkAt: 6 + Math.random() * 8,
    };
    runtimes.set(definition.id, runtime);
  }
  return runtime;
}

/** Comando demo: manda o agente caminhar até o hall e voltar ao trabalho. */
export function demoWalkToHall(agentId: string) {
  const runtime = runtimes.get(agentId);
  if (!runtime) return;
  const hall = hallSpot([...runtimes.keys()].indexOf(agentId));
  walkTo(runtime, hall, "idle");
}

/** Posição e estado atuais do personagem, para as esperas do harness. */
export function getAgentRuntimeInfo(agentId: string): { x: number; z: number; state: string } | null {
  const runtime = runtimes.get(agentId);
  if (!runtime?.figure?.group) return null;
  return {
    x: runtime.figure.group.position.x,
    z: runtime.figure.group.position.z,
    state: runtime.state,
  };
}

/** Ponto de trabalho: à frente da mesa, na cadeira. */
function deskSpot(agentId: string): NavPoint {
  const agent = AGENTS_BY_ID[agentId];
  const room = ROOMS_BY_ID[agent.roomId];
  const center = roomCenter(room);
  return { x: center[0], z: room.bounds.minZ + 2.35 };
}

function meetingSpot(): NavPoint {
  const room = ROOMS_BY_ID.reunioes;
  const center = roomCenter(room);
  // cadeira ao norte da mesa, não o centro dela
  return { x: center[0], z: center[2] - 1.25 };
}

function hallSpot(index: number): NavPoint {
  return { x: -1.2 + (index % 3) * 1.4, z: index < 3 ? 0.8 : -0.8 };
}

function setState(runtime: AgentRuntime, state: AgentAnimationState, summary?: string) {
  runtime.state = state;
  runtime.summary = summary;
}

function walkTo(runtime: AgentRuntime, target: NavPoint, then: AgentAnimationState) {
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
  const dataSource = useHQStore((state) => state.dataSource);
  const agentPresets = useHQStore((state) => state.agentPresets);
  const agents = AGENTS;
  const reducedMotion = useReducedMotion();
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const indexRef = useRef(0);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  useFrame((_, rawDelta) => {
    // animação de pose usa delta travado; locomoção usa o delta real, senão o
    // personagem anda em câmera lenta em renders lentos
    const delta = Math.min(rawDelta, 0.12);
    const locomotionDelta = Math.min(rawDelta, 1.0);
    indexRef.current += delta;

    for (const [agentId, runtime] of runtimes) {
      const figure = runtime.figure;
      if (!figure) continue;

      // alimenta o estado a partir da fonte de dados
      const state = useHQStore.getState().agentStates[agentId];
      if (state && state !== runtime.state && runtime.state !== "walking") {
        if (state === "meeting") {
          // navega até a mesa e só então assume a pose de reunião
          walkTo(runtime, meetingSpot(), "meeting");
        } else {
          runtime.state = state;
          runtime.source = dataSource;
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
      const sitting = runtime.state === "working" || runtime.state === "blocked";
      const sittingTargetY = sitting ? -0.34 : 0;
      hips.position.y += (sittingTargetY - hips.position.y) * Math.min(1, delta * 6);

      if (sitting) {
        if (leftLeg) leftLeg.rotation.x += (-Math.PI / 2 - leftLeg.rotation.x) * Math.min(1, delta * 6);
        if (rightLeg) rightLeg.rotation.x += (-Math.PI / 2 - rightLeg.rotation.x) * Math.min(1, delta * 6);
        if (leftArm) leftArm.rotation.x += (-0.95 - leftArm.rotation.x) * Math.min(1, delta * 5);
        if (rightArm) rightArm.rotation.x += (-0.95 - rightArm.rotation.x) * Math.min(1, delta * 5);
        if (torso) {
          const typing = Math.sin(indexRef.current * 9.5) * 0.014;
          torso.position.z = typing;
        }
        if (head) head.rotation.x = 0.16;
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
          // orientação para a mesa; a posição chegou por navegação, nunca por
          // interpolação direta (personagem não atravessa parede)
          runtime.heading += (0 - runtime.heading) * Math.min(1, delta * 2);
        }
      }

      // ---- passeio de idle em modo demo ----
      if (dataSource === "demo" && runtime.state === "idle" && runtime.path.length === 0) {
        runtime.walkTimer += delta;
        if (runtime.walkTimer > runtime.nextIdleWalkAt) {
          runtime.walkTimer = 0;
          runtime.nextIdleWalkAt = 14 + (deterministicHash(agentId) % 16);
          const hallIndex = [...runtimes.keys()].indexOf(agentId);
          walkTo(runtime, hallSpot(hallIndex), "idle");
        }
      }
    }
  });

  return (
    <group name="agents">
      {agents.map((agent) => {
        const spot = deskSpot(agent.id);
        const showLabel = hoveredAgentId === agent.id || selectedAgentId === agent.id;
        const appearance = resolveAppearance(agent, agentPresets[agent.id] ?? null);
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

