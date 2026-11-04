import { Component, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref, type RefObject } from "react";
import { useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Armchair, CircleUserRound, Minus, PersonStanding, Play, Plus, RotateCcw, ScanFace } from "lucide-react";
import { NeutralToneMapping, PCFShadowMap } from "three";
import type { CharacterSpec } from "@/character-studio/model/schema";
import { BASE_MODEL } from "@/character-studio/model/sheet";
import type { FigurePose } from "@/character-studio/viewport/figureRig";
import { CAMERA_FOV, StudioScene, type CameraView, type SceneApi } from "@/character-studio/viewport/StudioScene";

const VIEWS: { id: CameraView; label: string; key: string }[] = [
  { id: "front", label: "Frente", key: "1" },
  { id: "threeQuarter", label: "3/4", key: "2" },
  { id: "side", label: "Lado", key: "3" },
  { id: "back", label: "Costas", key: "4" },
];

const ORBIT_STEP = Math.PI / 12;
const POLAR_STEP = Math.PI / 24;

/** Testa antes de montar o Canvas: dá para explicar em vez de só falhar. */
export function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

class SceneBoundary extends Component<{ onError: (error: unknown) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[personagens] falha na cena do estúdio", error);
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type Phase = { name: "loading" } | { name: "ready" } | { name: "error"; message: string } | { name: "contextLost" };

function describeLoadError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/webgl|context/i.test(text)) return "O navegador recusou criar o contexto 3D.";
  return `Não consegui carregar ${BASE_MODEL.file}. Confira se o servidor está no ar.`;
}

export function StudioViewport({ spec, name, pose, motion, onPose, onMotion, apiRef, webgl }: {
  spec: CharacterSpec;
  name: string;
  pose: FigurePose;
  motion: boolean;
  onPose: (pose: FigurePose) => void;
  onMotion: (motion: boolean) => void;
  apiRef: RefObject<SceneApi | null>;
  webgl: boolean;
}) {
  const [phase, setPhase] = useState<Phase>(webgl ? { name: "loading" } : { name: "error", message: "" });
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<CameraView | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  const onReady = useCallback(() => setPhase({ name: "ready" }), []);
  const onProblem = useCallback((message: string) => setPhase({ name: "error", message }), []);
  const onSceneError = useCallback((error: unknown) => setPhase({ name: "error", message: describeLoadError(error) }), []);

  useEffect(() => () => cleanup.current?.(), []);

  const retry = () => {
    useGLTF.clear(BASE_MODEL.file);
    setPhase({ name: "loading" });
    setAttempt((value) => value + 1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const camera = apiRef.current?.camera;
    if (!camera || event.target !== event.currentTarget || event.metaKey || event.ctrlKey || event.altKey) return;
    const action: Record<string, () => void> = {
      ArrowLeft: () => camera.orbit(-ORBIT_STEP, 0),
      ArrowRight: () => camera.orbit(ORBIT_STEP, 0),
      ArrowUp: () => camera.orbit(0, -POLAR_STEP),
      ArrowDown: () => camera.orbit(0, POLAR_STEP),
      "+": () => camera.zoom(0.85),
      "=": () => camera.zoom(0.85),
      "-": () => camera.zoom(1 / 0.85),
      "0": () => {
        setView(null);
        camera.reset();
      },
    };
    const picked = VIEWS.find((item) => item.key === event.key);
    if (picked) {
      setView(picked.id);
      camera.view(picked.id);
    } else if (action[event.key]) {
      if (event.key.startsWith("Arrow")) setView(null);
      action[event.key]!();
    } else return;
    event.preventDefault();
  };

  const pickView = (id: CameraView) => {
    setView(id);
    apiRef.current?.camera.view(id);
  };

  const failed = phase.name === "error";
  const hasScene = webgl && !failed;

  return (
    <section className="cs-stage" aria-label="Prévia 3D do personagem">
      <div
        className="cs-canvas"
        tabIndex={0}
        role="application"
        aria-label={`Prévia 3D de ${name}. Setas giram, mais e menos aproximam, 1 a 4 trocam a vista, zero restaura.`}
        onKeyDown={onKeyDown}
      >
        {hasScene && (
          <SceneBoundary key={attempt} onError={onSceneError}>
            <Canvas
              frameloop="demand"
              dpr={[1, 1.75]}
              shadows={{ type: PCFShadowMap }}
              gl={{ alpha: true, antialias: true, powerPreference: "default" }}
              camera={{ fov: CAMERA_FOV, near: 0.1, far: 40, position: [0, 1, 9] }}
              onCreated={({ gl }) => {
                // Neutro preserva a cor escolhida; o ACES padrão lavaria os tons.
                gl.toneMapping = NeutralToneMapping;
                gl.setClearColor(0x000000, 0);
                const canvas = gl.domElement;
                canvas.tabIndex = -1;
                const lost = (event: Event) => {
                  event.preventDefault();
                  setPhase({ name: "contextLost" });
                };
                const restored = () => setPhase({ name: "ready" });
                canvas.addEventListener("webglcontextlost", lost);
                canvas.addEventListener("webglcontextrestored", restored);
                cleanup.current = () => {
                  canvas.removeEventListener("webglcontextlost", lost);
                  canvas.removeEventListener("webglcontextrestored", restored);
                };
              }}
            >
              <StudioScene spec={spec} pose={pose} motion={motion} apiRef={apiRef as Ref<SceneApi>} onReady={onReady} onProblem={onProblem} />
            </Canvas>
          </SceneBoundary>
        )}
      </div>

      {phase.name === "loading" && (
        <div className="cs-overlay" role="status">
          <span className="cs-spinner" aria-hidden="true" />
          <p>Carregando o modelo base…</p>
        </div>
      )}
      {phase.name === "contextLost" && (
        <div className="cs-overlay" role="status">
          <span className="cs-spinner" aria-hidden="true" />
          <p>O navegador pausou o contexto 3D. Tentando recuperar…</p>
        </div>
      )}
      {failed && webgl && (
        <div className="cs-overlay" role="alert">
          <h2>A prévia 3D não abriu</h2>
          <p>{phase.message}</p>
          <p className="cs-muted">Suas variações continuam salvas; o painel segue funcionando.</p>
          <button type="button" className="cs-button cs-button--primary" onClick={retry}>Tentar de novo</button>
        </div>
      )}
      {!webgl && (
        <div className="cs-overlay" role="alert">
          <h2>Este navegador não abriu o WebGL</h2>
          <p>Sem ele não há prévia 3D, mas ainda dá para editar valores, salvar e exportar a ficha.</p>
          <p className="cs-muted">Costuma resolver ativar a aceleração de hardware nas configurações do navegador.</p>
        </div>
      )}

      {hasScene && phase.name === "ready" && (
        <>
          <div className="cs-readout" aria-hidden="true">
            <strong>{name}</strong>
            <span>{spec.proportions.heightM.toFixed(2).replace(".", ",")} m</span>
          </div>

          <div className="cs-dock cs-dock--pose" role="group" aria-label="Pose">
            <button type="button" className="cs-tool" aria-pressed={pose === "standing"} onClick={() => onPose("standing")}>
              <PersonStanding size={16} aria-hidden="true" /> Em pé
            </button>
            <button type="button" className="cs-tool" aria-pressed={pose === "sitting"} onClick={() => onPose("sitting")}>
              <Armchair size={16} aria-hidden="true" /> Sentado
            </button>
            <span className="cs-dock__rule" aria-hidden="true" />
            <button type="button" className="cs-tool" aria-pressed={motion} disabled={pose !== "standing"} onClick={() => onMotion(!motion)} title="Toca o clipe Idle; desligado, a página não gasta GPU">
              <Play size={15} aria-hidden="true" /> Movimento
            </button>
          </div>

          <div className="cs-dock cs-dock--view" role="group" aria-label="Câmera">
            {VIEWS.map((item) => (
              <button key={item.id} type="button" className="cs-tool" aria-pressed={view === item.id} onClick={() => pickView(item.id)}>
                {item.label}
              </button>
            ))}
            <span className="cs-dock__rule" aria-hidden="true" />
            <button type="button" className="cs-tool cs-tool--icon" aria-label="Enquadrar o corpo inteiro" title="Corpo inteiro" onClick={() => apiRef.current?.camera.frame("body")}>
              <CircleUserRound size={16} aria-hidden="true" />
            </button>
            <button type="button" className="cs-tool cs-tool--icon" aria-label="Enquadrar o rosto" title="Rosto" onClick={() => apiRef.current?.camera.frame("head")}>
              <ScanFace size={16} aria-hidden="true" />
            </button>
            <button type="button" className="cs-tool cs-tool--icon" aria-label="Afastar" title="Afastar" onClick={() => apiRef.current?.camera.zoom(1 / 0.85)}>
              <Minus size={16} aria-hidden="true" />
            </button>
            <button type="button" className="cs-tool cs-tool--icon" aria-label="Aproximar" title="Aproximar" onClick={() => apiRef.current?.camera.zoom(0.85)}>
              <Plus size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="cs-tool cs-tool--icon"
              aria-label="Restaurar a câmera"
              title="Restaurar a câmera"
              onClick={() => {
                setView(null);
                apiRef.current?.camera.reset();
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
