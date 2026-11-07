import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { NeutralToneMapping, SRGBColorSpace } from "three";
import { ReadySignal } from "@/app/ReadySignal";
import { HermesConnection } from "@/integrations/hermes/HermesConnection";
import { useHQStore } from "@/state/useHQStore";
import { effectiveQuality, pixelRatioFor } from "@/world/quality";
import { OfficeScene } from "@/world/office/OfficeScene";
import { OfficeQa } from "@/world/office/OfficeQa";
import { AVATAR_STORAGE_KEY, browserStorage, loadAvatars } from "@/avatar/human/persistence";
import { ROBOT_STORAGE_KEY, loadRobotLooks } from "@/avatar/robot/robotLook";
import { placeEveryone } from "@/world/office/officeChief";
import { assignSeats, demoBots, fleetBots } from "@/world/office/officeRoster";
import { OFFICE_SCENARIO, type OfficeMode } from "@/world/office/officeRoute";
import { useOfficeStore } from "@/world/office/officeStore";
import { OfficeHud } from "./OfficeHud";
import { OfficeLabels } from "./OfficeLabels";
import "@fontsource-variable/onest";
import "@/styles/office.css";

const TechStage = lazy(() => import("@/tech/TechStage"));

/** Quem está em cena: os sete da demonstração, ou a frota real a cada leitura. */
function useRoster(mode: OfficeMode) {
  const fleet = useHQStore((state) => state.fleet);
  const previous = useRef<Record<string, string>>({});
  useEffect(() => {
    const bots = mode === "demo" ? demoBots() : fleetBots(fleet);
    const seating = assignSeats(bots.map((bot) => bot.id), undefined, previous.current);
    previous.current = seating.seats;
    useOfficeStore.getState().setRoster(bots, seating);
    // A sala em foco continua, mas a gaveta não pode apontar para bot que saiu da frota.
    const { selectedBotId, clearSelection } = useHQStore.getState();
    if (selectedBotId && !bots.some((bot) => bot.id === selectedBotId)) clearSelection();
  }, [mode, fleet]);
}

/**
 * Pessoas salvas no editor. Só na demonstração: a frota real é do Hermes, e gente criada à
 * mão no meio dela confundiria quem lê o estado. Salvar em outra aba já reflete aqui.
 */
function useHumans(mode: OfficeMode) {
  const seating = useOfficeStore((state) => state.seating);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === AVATAR_STORAGE_KEY || event.key === null) setVersion((value) => value + 1);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    const store = useOfficeStore.getState();
    if (mode !== "demo") {
      store.setHumans([], []);
      return;
    }
    const { placed, waiting } = placeEveryone(loadAvatars(browserStorage()).doc.presets, Object.values(seating.seats));
    store.setHumans(placed, waiting.map(({ id, name }) => ({ id, name })));
  }, [mode, seating, version]);
}

/** Cor e expressão dos robôs: salvar no editor, em outra aba, já reflete aqui. */
function useRobotLooks() {
  useEffect(() => {
    const read = () => useOfficeStore.getState().setRobotLooks(loadRobotLooks(browserStorage()));
    read();
    const onStorage = (event: StorageEvent) => {
      if (event.key === ROBOT_STORAGE_KEY || event.key === null) read();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
}

/** Escritório completo: página própria, sem o HUD nem a cena antiga. */
export function OfficeApp({ mode }: { mode: OfficeMode }) {
  const quality = useHQStore((state) => effectiveQuality(state.graphicsMode, state.autoQuality));
  const dpr = pixelRatioFor(quality, window.devicePixelRatio);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  // Antes do primeiro quadro: a frota real nunca chega a montar o prédio.
  useState(() => useOfficeStore.getState().setMode(mode));
  useRoster(mode);
  useHumans(mode);
  useRobotLooks();

  return (
    <div className="app-shell office-shell" onContextMenu={(event) => event.preventDefault()}>
      <div className="office-stage" ref={setStage}>
        {stage && (
          <Canvas
            className="world-canvas"
            orthographic
            shadows="soft"
            dpr={dpr}
            gl={{ antialias: true, powerPreference: "high-performance" }}
            camera={{ near: 0.5, far: 400, position: [30, 26, 30], zoom: 30 }}
            onCreated={({ gl }) => {
              gl.toneMapping = NeutralToneMapping;
              gl.toneMappingExposure = 1;
              gl.outputColorSpace = SRGBColorSpace;
            }}
          >
            <OfficeScene stage={stage} />
            <OfficeQa />
            <ReadySignal />
          </Canvas>
        )}
        <OfficeLabels />
        {OFFICE_SCENARIO === "tecnologia" && (
          <Suspense fallback={null}>
            <TechStage />
          </Suspense>
        )}
      </div>
      <OfficeHud live={mode === "live"} />
      {mode === "live" && <HermesConnection />}
    </div>
  );
}
