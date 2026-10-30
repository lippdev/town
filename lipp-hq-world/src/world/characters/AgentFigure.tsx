import { forwardRef, useMemo, type ReactNode } from "react";
import type { Group, Object3D } from "three";
import { PALETTE } from "@/config/constants";
import { sharedCapsule, sharedCylinder, sharedSphere } from "@/world/materials";
import type { AgentDefinition } from "@/types/hq";

export interface AgentFigureHandle {
  group: Group;
  hips: Group;
  leftLeg: Group | null;
  rightLeg: Group | null;
  leftArm: Group | null;
  rightArm: Group | null;
  torso: Object3D | null;
  head: Object3D | null;
  ring: Object3D | null;
}

interface AgentFigureProps {
  agent: AgentDefinition;
  selected: boolean;
  figureRef: (handle: AgentFigureHandle) => void;
  onHoverChange?: (hovered: boolean) => void;
  children?: ReactNode;
}

const SKIN = "#e8b98a";
const PANTS = "#2f3742";
const SHOES = "#1e242e";
const EYES = "#242a33";

/**
 * Figura low-poly do agente em estilo de jogo moderno: membros em cápsula,
 * torso afunilado, rosto com olhos e cabelo em duas camadas (topo + nuca).
 * Mantém os pivôs de quadril/ombros que as animações usam — a pose de
 * trabalho abaixa o quadril e dobra as pernas na cadeira.
 */
export const AgentFigure = forwardRef<AgentFigureHandle, AgentFigureProps>(
  function AgentFigure({ agent, selected, figureRef, onHoverChange, children }) {
    const parts = useMemo<AgentFigureHandle>(
      () => ({
        group: null as unknown as Group,
        hips: null as unknown as Group,
        leftLeg: null,
        rightLeg: null,
        leftArm: null,
        rightArm: null,
        torso: null,
        head: null,
        ring: null,
      }),
      [],
    );

    const assign = (key: keyof AgentFigureHandle) => (node: AgentFigureHandle[keyof AgentFigureHandle] | null) => {
      if (!node) return;
      (parts[key] as AgentFigureHandle[keyof AgentFigureHandle]) = node;
      figureRef(parts);
    };

    const shirt = agent.color;
    const hair = agent.hairColor ?? PALETTE.chair;

    return (
      <group
        ref={assign("group")}
        name={`agent-${agent.id}`}
        userData={{ agentId: agent.id }}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHoverChange?.(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHoverChange?.(false);
          document.body.style.cursor = "";
        }}
      >
        {children}
        <mesh
          ref={assign("ring")}
          position={[0, 0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={selected}
        >
          <ringGeometry args={[0.34, 0.44, 24]} />
          <meshBasicMaterial color={agent.accent} transparent opacity={0.9} />
        </mesh>

        <group ref={assign("hips")}>
          <group ref={assign("leftLeg")} position={[-0.11, 0.68, 0]}>
            <mesh position={[0, -0.3, 0]} castShadow geometry={sharedCapsule(0.075, 0.46)}>
              <meshStandardMaterial color={PANTS} roughness={0.8} metalness={0.03} />
            </mesh>
            <mesh position={[0, -0.65, 0.05]} castShadow>
              <boxGeometry args={[0.16, 0.09, 0.27]} />
              <meshStandardMaterial color={SHOES} roughness={0.7} metalness={0.05} />
            </mesh>
          </group>

          <group ref={assign("rightLeg")} position={[0.11, 0.68, 0]}>
            <mesh position={[0, -0.3, 0]} castShadow geometry={sharedCapsule(0.075, 0.46)}>
              <meshStandardMaterial color={PANTS} roughness={0.8} metalness={0.03} />
            </mesh>
            <mesh position={[0, -0.65, 0.05]} castShadow>
              <boxGeometry args={[0.16, 0.09, 0.27]} />
              <meshStandardMaterial color={SHOES} roughness={0.7} metalness={0.05} />
            </mesh>
          </group>

          <mesh ref={assign("torso")} position={[0, 0.98, 0]} castShadow geometry={sharedCylinder(0.2, 0.27, 0.64, 14)}>
            <meshStandardMaterial color={shirt} roughness={0.72} metalness={0.05} />
          </mesh>

          <group ref={assign("leftArm")} position={[-0.28, 1.24, 0]}>
            <mesh position={[0, 0, 0]} castShadow geometry={sharedSphere(0.09, 12, 10)}>
              <meshStandardMaterial color={shirt} roughness={0.75} metalness={0.04} />
            </mesh>
            <mesh position={[0, -0.26, 0]} castShadow geometry={sharedCapsule(0.06, 0.4)}>
              <meshStandardMaterial color={shirt} roughness={0.75} metalness={0.04} />
            </mesh>
            <mesh position={[0, -0.54, 0]} castShadow geometry={sharedSphere(0.075, 12, 10)}>
              <meshStandardMaterial color={SKIN} roughness={0.65} metalness={0} />
            </mesh>
          </group>

          <group ref={assign("rightArm")} position={[0.28, 1.24, 0]}>
            <mesh position={[0, 0, 0]} castShadow geometry={sharedSphere(0.09, 12, 10)}>
              <meshStandardMaterial color={shirt} roughness={0.75} metalness={0.04} />
            </mesh>
            <mesh position={[0, -0.26, 0]} castShadow geometry={sharedCapsule(0.06, 0.4)}>
              <meshStandardMaterial color={shirt} roughness={0.75} metalness={0.04} />
            </mesh>
            <mesh position={[0, -0.54, 0]} castShadow geometry={sharedSphere(0.075, 12, 10)}>
              <meshStandardMaterial color={SKIN} roughness={0.65} metalness={0} />
            </mesh>
          </group>

          <group ref={assign("head")} position={[0, 1.42, 0]}>
            <mesh position={[0, 0.15, 0]} castShadow geometry={sharedSphere(0.22, 18, 14)}>
              <meshStandardMaterial color={SKIN} roughness={0.6} metalness={0} />
            </mesh>
            <mesh position={[-0.085, 0.15, 0.185]} geometry={sharedSphere(0.028, 8, 8)}>
              <meshStandardMaterial color={EYES} roughness={0.35} metalness={0} />
            </mesh>
            <mesh position={[0.085, 0.15, 0.185]} geometry={sharedSphere(0.028, 8, 8)}>
              <meshStandardMaterial color={EYES} roughness={0.35} metalness={0} />
            </mesh>
            <mesh position={[0, 0.26, -0.01]} castShadow geometry={sharedSphere(0.225, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.1)}>
              <meshStandardMaterial color={hair} roughness={0.8} metalness={0.05} />
            </mesh>
            <mesh position={[0, 0.16, -0.09]} castShadow geometry={sharedSphere(0.17, 14, 10)}>
              <meshStandardMaterial color={hair} roughness={0.8} metalness={0.05} />
            </mesh>
          </group>
        </group>
      </group>
    );
  },
);
