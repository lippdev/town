import { Suspense, forwardRef, useCallback, useMemo, useRef, type ReactNode } from "react";
import type { Group, Object3D } from "three";
import { PALETTE } from "@/config/constants";
import { sharedCapsule, sharedCylinder, sharedSphere } from "@/world/materials";
import type { CharacterLook } from "@/world/characters/appearance";
import type { AgentDefinition } from "@/types/hq";
import { CharacterBoundary, CharacterModel, type CharacterRig } from "@/world/characters/CharacterModel";
import type { CharacterEntry } from "@/world/characters/characterManifest";

export interface AgentFigureHandle {
  group: Group;
  hips: Group;
  leftLeg: Group | null;
  rightLeg: Group | null;
  leftArm: Group | null;
  rightArm: Group | null;
  torso: Object3D | null;
  /** Corpo escalado pela altura escolhida; o anel de seleção fica fora. */
  body: Object3D | null;
  head: Object3D | null;
  ring: Object3D | null;
  /** Personagem GLB pronto: a cena troca clipes em vez de mexer nos membros. */
  rig: CharacterRig | null;
}

interface AgentFigureProps {
  agent: AgentDefinition;
  selected: boolean;
  /** Aparência resolvida (peças editáveis); ausente = visual de fábrica. */
  appearance?: CharacterLook;
  /** Modelo GLB do manifesto para este bot; ausente = figura procedural. */
  model?: { url: string; entry: CharacterEntry } | null;
  figureRef: (handle: AgentFigureHandle) => void;
  onHoverChange?: (hovered: boolean) => void;
  children?: ReactNode;
}

const EYES = "#242a33";


/**
 * Figura low-poly do agente em estilo de jogo moderno: membros em cápsula,
 * torso afunilado, rosto com olhos e cabelo em duas camadas (topo + nuca).
 * Mantém os pivôs de quadril/ombros que as animações usam — a pose de
 * trabalho abaixa o quadril e dobra as pernas na cadeira.
 */
export const AgentFigure = forwardRef<AgentFigureHandle, AgentFigureProps>(
  function AgentFigure({ agent, selected, appearance, model, figureRef, onHoverChange, children }) {
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
        body: null,
        ring: null,
        rig: null,
      }),
      [],
    );

    // o pai passa um figureRef novo a cada render; o rig não pode depender
    // dele, senão o mixer seria recriado a cada hover
    const latestFigureRef = useRef(figureRef);
    latestFigureRef.current = figureRef;
    const onRig = useCallback(
      (rig: CharacterRig | null) => {
        parts.rig = rig;
        latestFigureRef.current(parts);
      },
      [parts],
    );

    const assign = (key: keyof AgentFigureHandle) => (node: AgentFigureHandle[keyof AgentFigureHandle] | null) => {
      if (!node) return;
      (parts[key] as AgentFigureHandle[keyof AgentFigureHandle]) = node;
      figureRef(parts);
    };

    const shirt = appearance?.shirt ?? agent.color;
    const skin = appearance?.skin ?? "#e8b98a";
    const hair = appearance?.hair ?? agent.hairColor ?? PALETTE.chair;
    const hairStyle = appearance?.hairStyle ?? "curto";
    const pants = appearance?.pants ?? "#2f3742";
    const shoes = appearance?.shoes ?? "#1e242e";
    const accessory = appearance?.accessory ?? "nenhum";
    const height = appearance?.height ?? 1;
    const agentAccent = agent.accent;

    // a figura procedural: visual padrão, reserva enquanto o GLB carrega e
    // quando ele falha
    const procedural = (
      <group ref={assign("body")} name="body" scale={height}>
      <group ref={assign("hips")}>
        <group ref={assign("leftLeg")} position={[-0.11, 0.68, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow geometry={sharedCapsule(0.075, 0.46)}>
            <meshStandardMaterial color={pants} roughness={0.8} metalness={0.03} />
          </mesh>
          <mesh position={[0, -0.65, 0.05]} castShadow>
            <boxGeometry args={[0.16, 0.09, 0.27]} />
            <meshStandardMaterial color={shoes} roughness={0.7} metalness={0.05} />
          </mesh>
        </group>

        <group ref={assign("rightLeg")} position={[0.11, 0.68, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow geometry={sharedCapsule(0.075, 0.46)}>
            <meshStandardMaterial color={pants} roughness={0.8} metalness={0.03} />
          </mesh>
          <mesh position={[0, -0.65, 0.05]} castShadow>
            <boxGeometry args={[0.16, 0.09, 0.27]} />
            <meshStandardMaterial color={shoes} roughness={0.7} metalness={0.05} />
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
            <meshStandardMaterial color={skin} roughness={0.65} metalness={0} />
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
            <meshStandardMaterial color={skin} roughness={0.65} metalness={0} />
          </mesh>
        </group>

        <group ref={assign("head")} position={[0, 1.42, 0]}>
          <mesh position={[0, 0.15, 0]} castShadow geometry={sharedSphere(0.22, 18, 14)}>
            <meshStandardMaterial color={skin} roughness={0.6} metalness={0} />
          </mesh>
          <mesh position={[-0.085, 0.15, 0.185]} geometry={sharedSphere(0.028, 8, 8)}>
            <meshStandardMaterial color={EYES} roughness={0.35} metalness={0} />
          </mesh>
          <mesh position={[0.085, 0.15, 0.185]} geometry={sharedSphere(0.028, 8, 8)}>
            <meshStandardMaterial color={EYES} roughness={0.35} metalness={0} />
          </mesh>
          {hairStyle === "curto" && (
            <>
              <mesh position={[0, 0.26, -0.01]} castShadow geometry={sharedSphere(0.225, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.1)}>
                <meshStandardMaterial color={hair} roughness={0.8} metalness={0.05} />
              </mesh>
              <mesh position={[0, 0.16, -0.09]} castShadow geometry={sharedSphere(0.17, 14, 10)}>
                <meshStandardMaterial color={hair} roughness={0.8} metalness={0.05} />
              </mesh>
            </>
          )}
          {hairStyle === "coque" && (
            <>
              <mesh position={[0, 0.26, -0.01]} castShadow geometry={sharedSphere(0.225, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.1)}>
                <meshStandardMaterial color={hair} roughness={0.8} metalness={0.05} />
              </mesh>
              <mesh position={[0, 0.16, -0.09]} castShadow geometry={sharedSphere(0.17, 14, 10)}>
                <meshStandardMaterial color={hair} roughness={0.8} metalness={0.05} />
              </mesh>
              <mesh position={[0, 0.42, -0.05]} castShadow geometry={sharedSphere(0.085, 12, 10)}>
                <meshStandardMaterial color={hair} roughness={0.8} metalness={0.05} />
              </mesh>
            </>
          )}
          {hairStyle === "longo" && (
            <>
              <mesh position={[0, 0.26, -0.01]} castShadow geometry={sharedSphere(0.228, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.1)}>
                <meshStandardMaterial color={hair} roughness={0.85} metalness={0.04} />
              </mesh>
              <mesh position={[0, -0.04, -0.13]} castShadow>
                <boxGeometry args={[0.34, 0.52, 0.12]} />
                <meshStandardMaterial color={hair} roughness={0.85} metalness={0.04} />
              </mesh>
              <mesh position={[-0.2, 0.06, 0.0]} castShadow>
                <boxGeometry args={[0.06, 0.36, 0.2]} />
                <meshStandardMaterial color={hair} roughness={0.85} metalness={0.04} />
              </mesh>
              <mesh position={[0.2, 0.06, 0.0]} castShadow>
                <boxGeometry args={[0.06, 0.36, 0.2]} />
                <meshStandardMaterial color={hair} roughness={0.85} metalness={0.04} />
              </mesh>
            </>
          )}
          {hairStyle === "raspado" && (
            <mesh position={[0, 0.21, -0.01]} castShadow geometry={sharedSphere(0.222, 18, 10, 0, Math.PI * 2, 0, Math.PI / 3.4)}>
              <meshStandardMaterial color={hair} roughness={0.95} metalness={0.02} />
            </mesh>
          )}
          {hairStyle === "moicano" && (
            <>
              <mesh position={[0, 0.21, -0.02]} castShadow geometry={sharedSphere(0.224, 18, 10, 0, Math.PI * 2, 0, Math.PI / 3.2)}>
                <meshStandardMaterial color={hair} roughness={0.95} metalness={0.02} />
              </mesh>
              {[0.24, 0.1, -0.04, -0.18].map((offset, index) => (
                <mesh key={offset} position={[0, 0.42 - index * 0.03, offset]} rotation={[index * 0.18, 0, 0]} castShadow>
                  <boxGeometry args={[0.07, 0.16 + (index === 0 ? 0.06 : 0), 0.14]} />
                  <meshStandardMaterial color={hair} roughness={0.7} metalness={0.08} />
                </mesh>
              ))}
            </>
          )}
          {accessory === "oculos" && (
            <group position={[0, 0.15, 0.2]}>
              <mesh position={[-0.085, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.058, 0.058, 0.014, 12]} />
                <meshStandardMaterial color={EYES} roughness={0.3} metalness={0.1} />
              </mesh>
              <mesh position={[0.085, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.058, 0.058, 0.014, 12]} />
                <meshStandardMaterial color={EYES} roughness={0.3} metalness={0.1} />
              </mesh>
              <mesh position={[0, 0, 0]}>
                <boxGeometry args={[0.06, 0.012, 0.012]} />
                <meshStandardMaterial color={EYES} roughness={0.3} metalness={0.1} />
              </mesh>
            </group>
          )}
          {accessory === "bone" && (
            <group position={[0, 0.33, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.232, 0.238, 0.11, 18]} />
                <meshStandardMaterial color={agentAccent} roughness={0.75} metalness={0.05} />
              </mesh>
              <mesh position={[0, -0.045, 0.16]} castShadow>
                <boxGeometry args={[0.3, 0.026, 0.24]} />
                <meshStandardMaterial color={agentAccent} roughness={0.8} metalness={0.03} />
              </mesh>
            </group>
          )}
          {accessory === "fone" && (
            <group position={[0, 0.15, 0]}>
              <mesh rotation={[0, 0, 0]} castShadow>
                <torusGeometry args={[0.235, 0.017, 8, 20, Math.PI]} />
                <meshStandardMaterial color="#20262f" roughness={0.5} metalness={0.3} />
              </mesh>
              {[-1, 1].map((side) => (
                <mesh key={side} position={[side * 0.225, -0.02, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.062, 0.062, 0.05, 14]} />
                  <meshStandardMaterial color="#20262f" roughness={0.45} metalness={0.35} />
                </mesh>
              ))}
            </group>
          )}
        </group>
      </group>
      </group>
    );

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

        {model ? (
          <CharacterBoundary url={model.url} fallback={procedural}>
            <Suspense fallback={procedural}>
              <group ref={assign("body")} name="body">
                <group ref={assign("hips")}>
                  <CharacterModel url={model.url} entry={model.entry} heightScale={height} onRig={onRig} />
                </group>
              </group>
            </Suspense>
          </CharacterBoundary>
        ) : (
          procedural
        )}
      </group>
    );
  },
);
