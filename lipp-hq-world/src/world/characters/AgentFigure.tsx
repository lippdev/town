import { forwardRef, useMemo } from "react";
import type { Group, Object3D } from "three";
import { PALETTE } from "@/config/constants";
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
}

const SKIN = "#e8b98a";
const PANTS = "#2f3742";

/**
 * Figura low-poly do agente, com pivôs de quadril/ombros para as animações.
 * A pose de trabalho abaixa o quadril e dobra as pernas na cadeira.
 */
export const AgentFigure = forwardRef<AgentFigureHandle, AgentFigureProps>(
  function AgentFigure({ agent, selected, figureRef }, _forwardedRef) {
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

    return (
      <group
        ref={assign("group")}
        name={`agent-${agent.id}`}
        userData={{ agentId: agent.id }}
      >
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
          <group
            ref={assign("leftLeg")}
            position={[-0.11, 0.68, 0]}
          >
            <mesh position={[0, -0.32, 0]} castShadow>
              <boxGeometry args={[0.15, 0.64, 0.17]} />
              <meshStandardMaterial color={PANTS} roughness={0.8} metalness={0.03} />
            </mesh>
            <mesh position={[0, -0.66, 0.04]} castShadow>
              <boxGeometry args={[0.16, 0.09, 0.26]} />
              <meshStandardMaterial color="#1e242e" roughness={0.7} metalness={0.05} />
            </mesh>
          </group>

          <group
            ref={assign("rightLeg")}
            position={[0.11, 0.68, 0]}
          >
            <mesh position={[0, -0.32, 0]} castShadow>
              <boxGeometry args={[0.15, 0.64, 0.17]} />
              <meshStandardMaterial color={PANTS} roughness={0.8} metalness={0.03} />
            </mesh>
            <mesh position={[0, -0.66, 0.04]} castShadow>
              <boxGeometry args={[0.16, 0.09, 0.26]} />
              <meshStandardMaterial color="#1e242e" roughness={0.7} metalness={0.05} />
            </mesh>
          </group>

          <mesh ref={assign("torso")} position={[0, 0.98, 0]} castShadow>
            <boxGeometry args={[0.46, 0.62, 0.28]} />
            <meshStandardMaterial color={shirt} roughness={0.72} metalness={0.05} />
          </mesh>

          <group ref={assign("leftArm")} position={[-0.29, 1.24, 0]}>
            <mesh position={[0, -0.26, 0]} castShadow>
              <boxGeometry args={[0.11, 0.52, 0.13]} />
              <meshStandardMaterial color={shirt} roughness={0.75} metalness={0.04} />
            </mesh>
            <mesh position={[0, -0.56, 0]} castShadow>
              <boxGeometry args={[0.1, 0.12, 0.12]} />
              <meshStandardMaterial color={SKIN} roughness={0.65} metalness={0} />
            </mesh>
          </group>

          <group ref={assign("rightArm")} position={[0.29, 1.24, 0]}>
            <mesh position={[0, -0.26, 0]} castShadow>
              <boxGeometry args={[0.11, 0.52, 0.13]} />
              <meshStandardMaterial color={shirt} roughness={0.75} metalness={0.04} />
            </mesh>
            <mesh position={[0, -0.56, 0]} castShadow>
              <boxGeometry args={[0.1, 0.12, 0.12]} />
              <meshStandardMaterial color={SKIN} roughness={0.65} metalness={0} />
            </mesh>
          </group>

          <group ref={assign("head")} position={[0, 1.42, 0]}>
            <mesh position={[0, 0.14, 0]} castShadow>
              <sphereGeometry args={[0.2, 16, 14]} />
              <meshStandardMaterial color={SKIN} roughness={0.6} metalness={0} />
            </mesh>
            <mesh position={[0, 0.24, 0]} castShadow>
              <sphereGeometry args={[0.205, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
              <meshStandardMaterial color={agent.hairColor ?? PALETTE.chair} roughness={0.8} metalness={0.05} />
            </mesh>
          </group>
        </group>
      </group>
    );
  },
);
