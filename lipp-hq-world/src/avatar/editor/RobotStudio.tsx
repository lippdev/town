import { useEffect, useRef, useState, type ComponentRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Hand, RotateCcw, ThumbsUp } from "lucide-react";
import { NeutralToneMapping } from "three";
import { AGENTS } from "@/agents/agents";
import { ROBOT_URL, loadGltf } from "@/avatar/human/humanAssets";
import { browserStorage } from "@/avatar/human/persistence";
import { RobotRig, findRobotProblems, type RobotGesture } from "@/avatar/robot/RobotRig";
import {
  ROBOT_BODY_PALETTE,
  ROBOT_EXPRESSIONS,
  ROBOT_EXPRESSION_LABEL,
  ROBOT_STORAGE_KEY,
  loadRobotLooks,
  lookFor,
  saveRobotLooks,
  type RobotLook,
  type RobotLooks,
} from "@/avatar/robot/robotLook";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Robot({ look, gesture, rigRef, onError }: { look: RobotLook; gesture: { name: RobotGesture; at: number } | null; rigRef: { current: RobotRig | null }; onError: (message: string) => void }) {
  const [rig, setRig] = useState<RobotRig | null>(null);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    let alive = true;
    let created: RobotRig | null = null;
    loadGltf(ROBOT_URL).then(
      (gltf) => {
        if (!alive) return;
        const problems = findRobotProblems(gltf.scene, gltf.animations);
        if (problems.length > 0) {
          onError(`O modelo não tem ${problems.join(", ")}.`);
          return;
        }
        created = new RobotRig(gltf.scene, gltf.animations, { reduced: reduced() });
        rigRef.current = created;
        setRig(created);
      },
      (error: unknown) => {
        if (alive) onError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      alive = false;
      rigRef.current = null;
      created?.dispose();
      setRig(null);
    };
  }, [onError, rigRef]);

  useEffect(() => {
    rig?.apply(look);
    invalidate();
  }, [rig, look, invalidate]);

  useEffect(() => {
    if (rig && gesture) rig.play(gesture.name);
    invalidate();
  }, [rig, gesture, invalidate]);

  useFrame((state, delta) => {
    if (!rig || document.hidden) return;
    rig.update(reduced() ? 0 : delta);
    if (!reduced()) state.invalidate();
  });

  return rig ? <primitive object={rig.root} position={[0, 0.25, 0]} /> : null;
}

function Camera() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    controls.current?.target.set(0, 0.75, 0);
    controls.current?.update();
  }, []);
  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={0.14} minDistance={1.2} maxDistance={8} minPolarAngle={0.25} maxPolarAngle={Math.PI / 2 + 0.16} />;
}

/** Cor e expressão dos robôs. Grava na hora: o escritório aberto em outra aba acompanha. */
export function RobotStudio() {
  const [looks, setLooks] = useState<RobotLooks>(() => loadRobotLooks(browserStorage()));
  const [botId, setBotId] = useState(AGENTS[0]!.id);
  const [gesture, setGesture] = useState<{ name: RobotGesture; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const rig = useRef<RobotRig | null>(null);
  const agent = AGENTS.find((item) => item.id === botId)!;
  const look = lookFor(agent.color, looks[botId]);
  const onError = useRef((message: string) => setError(message)).current;

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === ROBOT_STORAGE_KEY) setLooks(loadRobotLooks(browserStorage()));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const bridge = { snapshot: () => rig.current?.snapshot() ?? null };
    (window as unknown as { __HQ_ROBOT_QA__?: typeof bridge }).__HQ_ROBOT_QA__ = bridge;
    return () => {
      delete (window as unknown as { __HQ_ROBOT_QA__?: typeof bridge }).__HQ_ROBOT_QA__;
    };
  }, []);

  const update = (next: RobotLooks) => {
    setLooks(next);
    setSaveFailed(!saveRobotLooks(browserStorage(), next));
  };
  const change = (patch: Partial<RobotLook>) => update({ ...looks, [botId]: { ...looks[botId], ...patch } });
  const reset = () => {
    const rest = { ...looks };
    delete rest[botId];
    update(rest);
  };
  const play = (name: RobotGesture) => setGesture({ name, at: Date.now() });

  return (
    <>
      <main className="cs-main">
        <section className="cs-stage" aria-label="Prévia 3D do robô">
          <div className="cs-canvas" role="application" aria-label={`Prévia 3D do robô ${agent.name}. Arraste para girar e role para aproximar.`}>
            {!error && (
              <Canvas
                frameloop="demand"
                dpr={[1, 1.75]}
                gl={{ alpha: true, antialias: true, powerPreference: "default" }}
                camera={{ fov: 26, near: 0.1, far: 30, position: [1.3, 1.05, 3.6] }}
                onCreated={({ gl }) => {
                  gl.toneMapping = NeutralToneMapping;
                  gl.setClearColor(0x000000, 0);
                }}
              >
                <hemisphereLight args={["#ffffff", "#d6d1c7", 1.7]} />
                <directionalLight position={[2.4, 4.4, 3.4]} intensity={1.9} />
                <directionalLight position={[-3, 2, 2]} intensity={0.55} />
                <Robot look={look} gesture={gesture} rigRef={rig} onError={onError} />
                <Camera />
              </Canvas>
            )}
          </div>
          {error && (
            <div className="cs-overlay" role="alert">
              <h2>A prévia do robô não abriu</h2>
              <p>{error}</p>
              <button type="button" className="cs-button cs-button--primary" onClick={() => setError(null)}>Tentar de novo</button>
            </div>
          )}
          <div className="cs-readout" aria-hidden="true">
            <strong>{agent.name}</strong>
            <span>{agent.role}</span>
          </div>
          <div className="cs-dock cs-dock--pose" role="group" aria-label="Gestos">
            <button type="button" className="cs-tool" onClick={() => play("Wave")}>
              <Hand size={15} aria-hidden="true" /> Acenar
            </button>
            <button type="button" className="cs-tool" onClick={() => play("ThumbsUp")}>
              <ThumbsUp size={15} aria-hidden="true" /> Positivo
            </button>
          </div>
        </section>
      </main>

      <aside className="cs-panel" aria-label="Cor e expressão do robô">
        <header className="cs-panel__head">
          <h2 className="cs-name cs-name--static">{agent.name}</h2>
          <p className="cs-subtitle">{saveFailed ? "Não consegui gravar neste navegador." : "Grava na hora, neste navegador."}</p>
        </header>
        <div className="cs-panel__scroll">
          <section className="cs-section" aria-label="Bots">
            <h3 className="cs-eyebrow">Bots</h3>
            <div className="av-tabs" role="tablist" aria-label="Bots">
              {AGENTS.map((item) => (
                <button key={item.id} type="button" role="tab" aria-selected={item.id === botId} className="av-tab" data-robot={item.id} onClick={() => setBotId(item.id)}>
                  {item.name}
                </button>
              ))}
            </div>
          </section>
          <section className="cs-section" aria-label="Cor do corpo">
            <div className="cs-color">
              <span className="cs-color__label">Cor do corpo</span>
              <input className="cs-color__well" type="color" value={look.body} aria-label="Escolher a cor do corpo" onChange={(event) => change({ body: event.target.value.toLowerCase() })} />
              <code className="cs-color__hex av-hex">{look.body}</code>
              <div className="cs-color__palette" role="group" aria-label="Amostras de cor">
                {[agent.color, ...ROBOT_BODY_PALETTE.filter((hex) => hex !== agent.color)].slice(0, 9).map((hex) => (
                  <button key={hex} type="button" className="cs-chip" style={{ background: hex }} aria-label={hex} aria-pressed={look.body === hex} onClick={() => change({ body: hex })} />
                ))}
              </div>
            </div>
            <p className="cs-hint">O padrão é a cor do bot nas etiquetas e nos painéis. Mudar aqui muda só o corpo do robô.</p>
          </section>
          <section className="cs-section" aria-label="Expressão">
            <h3 className="cs-eyebrow">Expressão</h3>
            <div className="av-segmented" role="radiogroup" aria-label="Expressão">
              {ROBOT_EXPRESSIONS.map((expression) => (
                <button key={expression} type="button" role="radio" aria-checked={look.expression === expression} className="cs-button cs-button--small" data-expression={expression} onClick={() => change({ expression })}>
                  {ROBOT_EXPRESSION_LABEL[expression]}
                </button>
              ))}
            </div>
            <p className="cs-hint">A expressão é só aparência: não diz nada sobre o estado do bot.</p>
          </section>
          <section className="cs-credits" aria-label="Créditos">
            <span><strong>Robô:</strong> RobotExpressive, de Tomás Laulhé (Quaternius), com modificações de Don McCurdy. CC0 1.0.</span>
          </section>
        </div>
        <footer className="cs-panel__foot av-foot">
          <button type="button" className="cs-button av-save" onClick={reset}>
            <RotateCcw size={15} aria-hidden="true" /> Voltar ao padrão
          </button>
        </footer>
      </aside>
    </>
  );
}
