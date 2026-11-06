import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh} from "three";
import { CanvasTexture, MeshBasicMaterial, PlaneGeometry, type AnimationClip, type Object3D } from "three";
import { ROBOT_URL, loadGltf } from "@/avatar/human/humanAssets";
import { RobotRig, findRobotProblems } from "@/avatar/robot/RobotRig";
import { lookFor } from "@/avatar/robot/robotLook";
import { useHQStore } from "@/state/useHQStore";
import { OFFICE_SEATS_BY_ID, type OfficeSeat } from "./officeLayout";
import { buildFlightPlans, type FlightPlan, type FlightWorld } from "./officeFlights";
import type { OfficeBot } from "./officeRoster";
import { RobotActor } from "./RobotActor";
import { officeRuntime, robotActors, useOfficeStore } from "./officeStore";

function softDisc() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, "rgba(10, 12, 20, 0.55)");
  gradient.addColorStop(1, "rgba(10, 12, 20, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

/** Marca de chão: é o que mostra a altura. A sombra do sol iria aos saltos a cada refazer. */
function useGroundMark() {
  const shared = useMemo(() => {
    const texture = softDisc();
    return { texture, material: new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }), geometry: new PlaneGeometry(0.95, 0.95) };
  }, []);
  useEffect(
    () => () => {
      shared.texture.dispose();
      shared.material.dispose();
      shared.geometry.dispose();
    },
    [shared],
  );
  return shared;
}

function RobotBody({ bot, seat, plan, scene, clips, reduced, mark }: {
  bot: OfficeBot;
  seat: OfficeSeat;
  plan: FlightPlan | null;
  scene: Object3D;
  clips: AnimationClip[];
  reduced: boolean;
  mark: ReturnType<typeof useGroundMark>;
}) {
  const [actor, setActor] = useState<RobotActor | null>(null);
  const shadow = useRef<Mesh | null>(null);
  const saved = useOfficeStore((state) => state.robotLooks[bot.id]);
  const lookKey = JSON.stringify(lookFor(bot.color, saved));
  const selected = useHQStore((state) => state.selectedBotId === bot.id);
  const wasSelected = useRef(false);
  const lookRef = useRef(lookKey);
  lookRef.current = lookKey;

  useEffect(() => {
    const rig = new RobotRig(scene, clips, { reduced });
    // Já nasce com a cor certa: nenhum quadro no amarelo do arquivo.
    rig.apply(JSON.parse(lookRef.current));
    const created = new RobotActor(rig, seat, plan, bot.id, reduced);
    robotActors.set(bot.id, created);
    setActor(created);
    return () => {
      robotActors.delete(bot.id);
      officeRuntime.liveAnchors.delete(bot.id);
      rig.dispose();
      setActor(null);
    };
  }, [scene, clips, reduced, seat, plan, bot.id]);

  useEffect(() => {
    actor?.rig.apply(JSON.parse(lookKey));
  }, [actor, lookKey]);

  // Resposta a quem clicou: acena uma vez. Não diz nada sobre o que o bot está fazendo.
  useEffect(() => {
    if (actor && selected && !wasSelected.current && !reduced) actor.rig.play("Wave");
    wasSelected.current = selected;
  }, [actor, selected, reduced]);

  useFrame(({ clock }, delta) => {
    if (!actor) return;
    actor.update(clock.elapsedTime, delta, selected);
    const { x, y, z } = actor.position;
    officeRuntime.liveAnchors.set(bot.id, [x, y + actor.rig.height + 0.08, z]);
    shadow.current?.position.set(x, 0.058, z);
  });

  if (!actor) return null;
  return (
    <>
      <primitive object={actor.holder} name={`bot-${bot.id}`} userData={{ botId: bot.id }} />
      <mesh ref={shadow} geometry={mark.geometry} material={mark.material} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} />
    </>
  );
}

/** Anel no chão de quem está selecionado; vai junto com o robô sem renderizar o React. */
function RobotRing() {
  const selectedBotId = useHQStore((state) => state.selectedBotId);
  const hoveredBotId = useOfficeStore((state) => state.hoveredBotId);
  const bots = useOfficeStore((state) => state.bots);
  const id = selectedBotId ?? hoveredBotId;
  const bot = bots.find((candidate) => candidate.id === id);
  const group = useRef<Group | null>(null);
  useFrame(() => {
    const position = id ? robotActors.get(id)?.position : null;
    if (group.current) {
      group.current.visible = Boolean(position);
      if (position) group.current.position.set(position.x, 0.07, position.z);
    }
  });
  if (!bot) return null;
  const selected = selectedBotId === bot.id;
  return (
    <group ref={group} visible={false} name="bot-selection-ring">
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <ringGeometry args={[0.46, selected ? 0.58 : 0.52, 48]} />
        <meshBasicMaterial color={bot.color} transparent opacity={selected ? 0.95 : 0.55} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * Os bots como robôs. Só a demonstração voa; na frota real o robô flutua no posto, porque
 * um voo ali pareceria dizer algo sobre o que o bot está fazendo.
 */
export function OfficeRobots({ world }: { world: FlightWorld }) {
  const bots = useOfficeStore((state) => state.bots);
  const seating = useOfficeStore((state) => state.seating);
  const mode = useOfficeStore((state) => state.mode);
  const [model, setModel] = useState<{ scene: Object3D; clips: AnimationClip[] } | null>(null);
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const mark = useGroundMark();
  const wanted = bots.length > 0;

  useEffect(() => {
    useOfficeStore.getState().setFiguresError(null);
    if (!wanted) return;
    let alive = true;
    loadGltf(ROBOT_URL).then(
      (gltf) => {
        if (!alive) return;
        const problems = findRobotProblems(gltf.scene, gltf.animations);
        if (problems.length > 0) useOfficeStore.getState().setFiguresError(`O modelo não tem ${problems.join(", ")}.`);
        else setModel({ scene: gltf.scene, clips: gltf.animations });
      },
      (error: unknown) => {
        if (alive) useOfficeStore.getState().setFiguresError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      alive = false;
    };
  }, [wanted]);

  const seatedKey = JSON.stringify(seating.seats);
  const plans = useMemo(() => {
    if (mode !== "demo" || reduced) return new Map<string, FlightPlan>();
    const seats = JSON.parse(seatedKey) as Record<string, string>;
    const seated = Object.entries(seats).map(([botId, seatId]) => ({ botId, seat: OFFICE_SEATS_BY_ID[seatId]! }));
    return new Map(buildFlightPlans(seated, world).map((plan) => [plan.botId, plan]));
  }, [mode, reduced, seatedKey, world]);

  if (!model) return null;
  return (
    <>
      {bots.map((bot) => {
        const seat = OFFICE_SEATS_BY_ID[seating.seats[bot.id] ?? ""];
        if (!seat) return null;
        return <RobotBody key={bot.id} bot={bot} seat={seat} plan={plans.get(bot.id) ?? null} scene={model.scene} clips={model.clips} reduced={reduced} mark={mark} />;
      })}
      <RobotRing />
    </>
  );
}
