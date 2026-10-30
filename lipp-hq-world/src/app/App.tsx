import { Canvas } from "@react-three/fiber";
import { Component, Suspense, useEffect, useState, type ReactNode } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { CAMERA } from "@/config/constants";
import { Hud } from "@/components/hud/Hud";
import { LiveConnection } from "@/integrations/openmausbot/LiveConnection";
import { HQScene } from "@/world/scene/HQScene";
import { ReadySignal } from "@/app/ReadySignal";

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function BootLabel({ text }: { text: string }) {
  return <div className="boot-label">{text}</div>;
}

/** Sem WebGL não há cena: mensagem clara em vez de tela preta. */
function NoWebGL() {
  return (
    <div className="boot-error">
      <strong>WebGL indisponível neste navegador.</strong>
      <p>O Lipp HQ World precisa de WebGL 2 para renderizar o escritório 3D.</p>
      <p>Verifique a aceleração gráfica do navegador ou use um Chrome/Edge/Firefox atualizado.</p>
    </div>
  );
}

/** Quebra um erro de render sem derrubar a aplicação inteira. */
class SceneBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="boot-error">
          <strong>A cena 3D encontrou um erro.</strong>
          <p>{this.state.error.message}</p>
          <button type="button" onClick={() => window.location.reload()}>Recarregar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const [webgl] = useState(detectWebGL);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const mark = () => setBooted(true);
    const timer = window.setTimeout(mark, 150);
    window.addEventListener("hq-world-ready", mark);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hq-world-ready", mark);
    };
  }, []);

  if (!webgl) {
    return (
      <div className="app-shell">
        <NoWebGL />
      </div>
    );
  }

  return (
    <div
      className="app-shell"
      onContextMenu={(event) => event.preventDefault()}
    >
      <Canvas
        className="world-canvas"
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{
          fov: CAMERA.fov,
          near: CAMERA.near,
          far: CAMERA.far,
          position: [CAMERA.position[0], CAMERA.position[1], CAMERA.position[2]],
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
          gl.outputColorSpace = SRGBColorSpace;
        }}
      >
        <SceneBoundary>
          <Suspense fallback={null}>
            <HQScene />
          </Suspense>
        </SceneBoundary>
      </Canvas>
      {!booted && <BootLabel text="Carregando Lipp HQ World…" />}
      <Hud />
      <LiveConnection />
      <ReadySignal />
    </div>
  );
}
