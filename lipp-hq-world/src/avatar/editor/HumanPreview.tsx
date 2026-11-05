import { Component, useEffect, useImperativeHandle, useRef, useState, type ComponentRef, type ReactNode, type Ref } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Armchair, CircleUserRound, Footprints, PersonStanding, ScanFace } from "lucide-react";
import { NeutralToneMapping, PCFShadowMap, Vector3 } from "three";
import { HumanFigure, loadHumanBase, type HumanBase, type HumanMotion } from "@/avatar/human/HumanFigure";
import { PHOTO_POSES } from "@/avatar/human/humanClips";
import { CHAIR, DESK, HUMAN_SCALE, SIT } from "@/avatar/human/seatFit";
import type { ResolvedHuman } from "@/avatar/human/preset";

export type PreviewMotion = Exclude<HumanMotion, "stand">;

export interface PreviewApi {
  snapshot: () => ReturnType<HumanFigure["snapshot"]> | null;
  capture: () => string;
  /** Altura da sola ao topo da cabeça e posição dos ossos, em metros do arquivo. */
  measure: () => { hipsY: number; toeY: number; headY: number } | null;
  frames: () => number;
}

const POSE_LABEL: Record<(typeof PHOTO_POSES)[number], string> = {
  Chill: "Relaxada",
  Cool: "Descolada",
  Dram: "Dramática",
  King: "Rei",
  Ninja: "Ninja",
  Busy: "Ocupada",
  Punch: "Soco",
};

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Banco neutro da prévia, com a altura do assento e do apoio dos pés da bancada do escritório.
 * Não é uma peça do pacote. A pose sentada recua a bacia dos pés: quem chama anda a figura.
 */
const inFile = (meters: number) => meters / HUMAN_SCALE;
const STOOL_TOP = inFile(CHAIR.seatTop);
const BAR_Y = inFile(CHAIR.footBar.y);
const BAR_Z = inFile(CHAIR.footBar.z);
const SIT_SHIFT = inFile(SIT.standOff);

function Stool() {
  return (
    <group>
      <mesh position={[0, STOOL_TOP - 0.03, inFile((CHAIR.seatFront + CHAIR.seatRear) / 2)]} castShadow>
        <boxGeometry args={[inFile(CHAIR.seatWidth), 0.06, inFile(CHAIR.seatFront - CHAIR.seatRear)]} />
        <meshStandardMaterial color="#a9a7a1" roughness={0.75} />
      </mesh>
      <mesh position={[0, (STOOL_TOP - 0.06) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, STOOL_TOP - 0.06, 12]} />
        <meshStandardMaterial color="#a9a7a1" roughness={0.75} />
      </mesh>
      <mesh position={[0, BAR_Y, BAR_Z / 2]} castShadow>
        <boxGeometry args={[0.03, 0.02, BAR_Z]} />
        <meshStandardMaterial color="#a9a7a1" roughness={0.75} />
      </mesh>
      <mesh position={[0, BAR_Y, BAR_Z]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[inFile(CHAIR.footBar.radius), inFile(CHAIR.footBar.radius), inFile(CHAIR.footBar.halfWidth * 2), 10]} />
        <meshStandardMaterial color="#a9a7a1" roughness={0.75} />
      </mesh>
      {/* Só a faixa em que as mãos pousam: um tampo inteiro taparia a roupa que se está montando. */}
      <mesh position={[0, inFile(DESK.top) - 0.015, inFile(SIT.deskEdge + 0.14)]} castShadow>
        <boxGeometry args={[inFile(0.84), 0.03, inFile(0.28)]} />
        <meshStandardMaterial color="#a9a7a1" roughness={0.75} />
      </mesh>
    </group>
  );
}

function Scene({ human, motion, apiRef, onReady, onError, onWorn }: {
  human: ResolvedHuman;
  motion: PreviewMotion;
  apiRef: Ref<PreviewApi>;
  onReady: () => void;
  onError: (message: string) => void;
  onWorn: (missing: string[]) => void;
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const [figure, setFigure] = useState<HumanFigure | null>(null);
  const humanRef = useRef(human);
  humanRef.current = human;

  useEffect(() => {
    let alive = true;
    let created: HumanFigure | null = null;
    loadHumanBase().then(
      (base: HumanBase) => {
        if (!alive) return;
        created = new HumanFigure(base);
        setFigure(created);
        onReady();
      },
      (error: unknown) => {
        if (alive) onError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      alive = false;
      created?.dispose();
      setFigure(null);
    };
  }, [onError, onReady]);

  useEffect(() => {
    if (!figure) return;
    let alive = true;
    void figure.wear(human).then(() => {
      if (!alive) return;
      onWorn(figure.missing);
      invalidate();
    });
    return () => {
      alive = false;
    };
  }, [figure, human, invalidate, onWorn]);

  useEffect(() => {
    if (!figure) return;
    const still = reduced();
    // Na prévia, sentar mostra a pose pronta: não há cadeira para girar nem mesa para alcançar.
    figure.play(motion, { instant: still || motion === "sit", frozen: still && motion !== "sit" });
    figure.root.position.z = motion === "sit" ? SIT_SHIFT : 0;
    invalidate();
  }, [figure, motion, invalidate]);

  // Volta a pedir quadros quando a aba reaparece; escondida, o laço fica parado.
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) invalidate();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [invalidate]);

  useFrame((state, delta) => {
    if (!figure || document.hidden || reduced()) return;
    figure.update(delta);
    state.invalidate();
  });

  useImperativeHandle(apiRef, () => ({
    snapshot: () => figure?.snapshot() ?? null,
    capture: () => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/png");
    },
    measure: () => {
      if (!figure) return null;
      figure.root.updateMatrixWorld(true);
      const y = (name: string) => figure.root.getObjectByName(name)!.getWorldPosition(new Vector3()).y;
      return { hipsY: y("mixamorigHips"), toeY: y("mixamorigLeftToeBase"), headY: y("mixamorigHead") };
    },
    frames: () => gl.info.render.frame,
  }), [camera, figure, gl, scene]);

  return figure ? <primitive object={figure.root} /> : null;
}

/** Enquadramentos: o corpo todo, ou só a cabeça para escolher rosto e cabelo. */
const FRAMING = {
  body: { y: 1.02, distance: 6.2 },
  head: { y: 1.62, distance: 2.5 },
} as const;

function Camera({ framing }: { framing: keyof typeof FRAMING }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    const { y, distance } = FRAMING[framing];
    const direction = camera.position.clone().sub(orbit.target).normalize();
    orbit.target.set(0, y, 0);
    camera.position.copy(orbit.target).addScaledVector(direction, distance);
    orbit.update();
    invalidate();
  }, [camera, framing, invalidate]);
  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={0.14} minDistance={1.2} maxDistance={9} minPolarAngle={0.25} maxPolarAngle={Math.PI / 2 + 0.16} />;
}

class Boundary extends Component<{ onError: (message: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error));
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

type Phase = { name: "loading" } | { name: "ready" } | { name: "error"; message: string };

export function HumanPreview({ human, name, apiRef, onWorn }: {
  human: ResolvedHuman;
  name: string;
  apiRef: Ref<PreviewApi>;
  onWorn: (missing: string[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [motion, setMotion] = useState<PreviewMotion>("idle");
  const [framing, setFraming] = useState<keyof typeof FRAMING>("body");
  const [webgl] = useState(detectWebGL);
  const onReady = useRef(() => setPhase({ name: "ready" })).current;
  const onError = useRef((message: string) => setPhase({ name: "error", message })).current;

  const pose = PHOTO_POSES.includes(motion as (typeof PHOTO_POSES)[number]) ? motion : "";

  return (
    <section className="cs-stage" aria-label="Prévia 3D da pessoa">
      <div className="cs-canvas" role="application" aria-label={`Prévia 3D de ${name}. Arraste para girar e role para aproximar.`}>
        {webgl && phase.name !== "error" && (
          <Boundary key={attempt} onError={onError}>
            <Canvas
              frameloop="demand"
              dpr={[1, 1.75]}
              shadows={{ type: PCFShadowMap }}
              gl={{ alpha: true, antialias: true, powerPreference: "default" }}
              camera={{ fov: 26, near: 0.1, far: 40, position: [1.5, 1.15, 6] }}
              onCreated={({ gl }) => {
                gl.toneMapping = NeutralToneMapping;
                gl.setClearColor(0x000000, 0);
              }}
            >
              <hemisphereLight args={["#ffffff", "#d6d1c7", 1.6]} />
              <directionalLight
                position={[2.4, 4.4, 3.4]}
                intensity={1.9}
                castShadow
                shadow-mapSize={[1024, 1024]}
                shadow-camera-left={-1.6}
                shadow-camera-right={1.6}
                shadow-camera-top={2.6}
                shadow-camera-bottom={-1}
                shadow-camera-near={1}
                shadow-camera-far={10}
                shadow-bias={-0.0005}
                shadow-normalBias={0.02}
              />
              <directionalLight position={[-3, 2, 2]} intensity={0.55} />
              <directionalLight position={[0.5, 2.6, -4]} intensity={0.7} />
              <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <circleGeometry args={[3, 48]} />
                <shadowMaterial opacity={0.17} />
              </mesh>
              {motion === "sit" && <Stool />}
              <Scene human={human} motion={motion} apiRef={apiRef} onReady={onReady} onError={onError} onWorn={onWorn} />
              <Camera framing={framing} />
            </Canvas>
          </Boundary>
        )}
      </div>

      {phase.name === "loading" && webgl && (
        <div className="cs-overlay" role="status">
          <span className="cs-spinner" aria-hidden="true" />
          <p>Carregando o esqueleto e as animações…</p>
        </div>
      )}
      {phase.name === "error" && (
        <div className="cs-overlay" role="alert">
          <h2>A prévia 3D não abriu</h2>
          <p>{phase.message}</p>
          <p className="cs-muted">As pessoas salvas continuam guardadas; o painel segue funcionando.</p>
          <button
            type="button"
            className="cs-button cs-button--primary"
            onClick={() => {
              setPhase({ name: "loading" });
              setAttempt((value) => value + 1);
            }}
          >
            Tentar de novo
          </button>
        </div>
      )}
      {!webgl && (
        <div className="cs-overlay" role="alert">
          <h2>Este navegador não abriu o WebGL</h2>
          <p>Sem ele não há prévia 3D, mas ainda dá para escolher as peças e salvar.</p>
        </div>
      )}

      {phase.name === "ready" && (
        <>
          <div className="cs-readout" aria-hidden="true">
            <strong>{name}</strong>
          </div>
          <div className="cs-dock cs-dock--pose" role="group" aria-label="Movimento">
            <button type="button" className="cs-tool" aria-pressed={motion === "idle"} onClick={() => setMotion("idle")}>
              <PersonStanding size={16} aria-hidden="true" /> Em pé
            </button>
            <button type="button" className="cs-tool" aria-pressed={motion === "walk"} onClick={() => setMotion("walk")}>
              <Footprints size={15} aria-hidden="true" /> Andando
            </button>
            <button type="button" className="cs-tool" aria-pressed={motion === "sit"} onClick={() => setMotion("sit")}>
              <Armchair size={16} aria-hidden="true" /> Sentada
            </button>
            <span className="cs-dock__rule" aria-hidden="true" />
            <label className="av-pose">
              <span className="cs-sr">Pose de foto</span>
              <select value={pose} onChange={(event) => setMotion((event.target.value || "idle") as PreviewMotion)}>
                <option value="">Pose de foto…</option>
                {PHOTO_POSES.map((item) => (
                  <option key={item} value={item}>{POSE_LABEL[item]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="cs-dock cs-dock--view" role="group" aria-label="Câmera">
            <button type="button" className="cs-tool cs-tool--icon" aria-pressed={framing === "body"} aria-label="Corpo inteiro" title="Corpo inteiro" onClick={() => setFraming("body")}>
              <CircleUserRound size={16} aria-hidden="true" />
            </button>
            <button type="button" className="cs-tool cs-tool--icon" aria-pressed={framing === "head"} aria-label="Rosto" title="Rosto" onClick={() => setFraming("head")}>
              <ScanFace size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
