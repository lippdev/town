import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";
import { HumanFigure, loadHumanBase, type HumanBase } from "@/avatar/human/HumanFigure";
import { resolveHuman } from "@/avatar/human/preset";
import { HumanActor } from "./HumanActor";
import { HUMAN_SCALE, type OfficeHuman } from "./officeHumans";
import { humanActors, humanFigures, officeRuntime, useOfficeStore } from "./officeStore";

/** Quantos quadros entre um mapa de sombra e outro enquanto alguém anda. */
const WALKING_SHADOW_EVERY = 6;
const TAG_HEIGHT = 2.2 * HUMAN_SCALE;
const SEATED_DROP = 0.3;

function OfficeHumanBody({ human, base, reduced }: { human: OfficeHuman; base: HumanBase; reduced: boolean }) {
  const gl = useThree((state) => state.gl);
  const [actor, setActor] = useState<HumanActor | null>(null);
  const figureRef = useRef<HumanFigure | null>(null);
  const frame = useRef(0);
  const presetKey = JSON.stringify(human.preset);
  const spotKey = `${human.spot.x}:${human.spot.z}:${human.chair?.id ?? ""}`;
  const { id, phase } = human;

  useEffect(() => {
    const figure = new HumanFigure(base, { phase });
    figureRef.current = figure;
    humanFigures.set(id, figure);
    const created = new HumanActor(
      figure,
      useOfficeStore.getState().humans.find((candidate) => candidate.id === id) ?? human,
      { walkSpeed: base.clips.walkSpeed, sitDuration: base.clips.sit.duration, seatedHipsZ: base.clips.seatedHipsZ },
      reduced,
    );
    humanActors.set(id, created);
    setActor(created);
    return () => {
      humanActors.delete(id);
      humanFigures.delete(id);
      officeRuntime.liveAnchors.delete(id);
      figure.dispose();
      figureRef.current = null;
      setActor(null);
    };
    // A pessoa não muda de lugar sem remontar; o preset é vestido à parte, sem recriar nada.
  }, [base, id, phase, reduced, spotKey]);

  useEffect(() => {
    const figure = figureRef.current;
    if (!figure || !actor) return;
    let alive = true;
    void figure.wear(resolveHuman(JSON.parse(presetKey) as OfficeHuman["preset"])).then(() => {
      if (alive) gl.shadowMap.needsUpdate = true;
      if (alive && figure.missing.length > 0) useOfficeStore.getState().setHumansError(`faltaram ${figure.missing.join(", ")}`);
    });
    return () => {
      alive = false;
    };
  }, [actor, gl, presetKey]);

  useFrame((_, delta) => {
    if (!actor) return;
    const store = useOfficeStore.getState();
    actor.command(store.humanGoals[id] ?? "standing");
    actor.update(delta);
    if (store.humanPhases[id] !== actor.phase) store.setHumanPhase(id, actor.phase);
    const { x, y, z } = actor.position;
    const seated = actor.phase === "seated" || actor.phase === "sitting" ? SEATED_DROP : 0;
    officeRuntime.liveAnchors.set(id, [x, y + TAG_HEIGHT - seated, z]);
    frame.current = (frame.current + 1) % WALKING_SHADOW_EVERY;
    if (frame.current === 0 && actor.phase !== "standing" && actor.phase !== "seated") gl.shadowMap.needsUpdate = true;
  });

  return actor ? <primitive object={actor.holder} name={`pessoa-${id}`} /> : null;
}

/** Anel no chão de quem está selecionado; acompanha a pessoa sem renderizar o React. */
function HumanRing() {
  const selected = useOfficeStore((state) => state.selectedHumanId);
  const hovered = useOfficeStore((state) => state.hoveredHumanId);
  const group = useRef<Group | null>(null);
  const id = selected ?? hovered;
  useFrame(() => {
    const position = id ? humanActors.get(id)?.position : null;
    if (group.current && position) group.current.position.set(position.x, 0.07, position.z);
  });
  if (!id) return null;
  return (
    <group ref={group}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <ringGeometry args={[0.5, selected === id ? 0.62 : 0.56, 48]} />
        <meshBasicMaterial color="#f2f5fa" transparent opacity={selected === id ? 0.95 : 0.55} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Pessoas salvas no editor. Falha aqui nunca derruba o andar nem os bots. */
export function OfficeHumans() {
  const humans = useOfficeStore((state) => state.humans);
  const [base, setBase] = useState<HumanBase | null>(null);
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const wanted = humans.length > 0;

  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    loadHumanBase().then(
      (loaded) => {
        if (alive) setBase(loaded);
      },
      (error: unknown) => {
        if (alive) useOfficeStore.getState().setHumansError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      alive = false;
    };
  }, [wanted]);

  if (!base) return null;
  return (
    <>
      {humans.map((human) => (
        <OfficeHumanBody key={human.id} human={human} base={base} reduced={reduced} />
      ))}
      <HumanRing />
    </>
  );
}
