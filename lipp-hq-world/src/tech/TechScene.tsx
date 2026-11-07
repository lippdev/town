import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CanvasTexture, Group, SRGBColorSpace, type AnimationClip, type Object3D } from "three";
import { AGENTS } from "@/agents/agents";
import { EPIC_STAGES, TRACK_LABEL } from "@/activity/types";
import { HumanFigure, loadHumanBase, type HumanBase } from "@/avatar/human/HumanFigure";
import { ROBOT_URL, loadGltf } from "@/avatar/human/humanAssets";
import { resolveHuman } from "@/avatar/human/preset";
import { RobotRig, findRobotProblems } from "@/avatar/robot/RobotRig";
import { lookFor } from "@/avatar/robot/robotLook";
import { FloorGroup } from "@/world/office/BuildingScene";
import { HumanActor } from "@/world/office/HumanActor";
import { HUMAN_SCALE, pathLength, pathPose, turnToward, type OfficeHuman, type Point } from "@/world/office/officeHumans";
import { bobAt, botPhase } from "@/world/office/officeFlights";
import { humanActors, humanFigures, officeRuntime, useOfficeStore } from "@/world/office/officeStore";
import { BOARD, BOARD_COLUMN_WIDTH, ELEVATOR_PLACE, HEALTH_COLOR, TECH_FLOOR_ID, boardCards, pathBetween, roomId, stageX, type BoardCard, type BotVisit, type Place } from "./techPlaces";
import { useTechStore } from "./techStore";

const WALKING_SHADOW_EVERY = 6;
const TAG_HEIGHT = 2.2 * HUMAN_SCALE;
const SEATED_RISE = 0.1;
/** O dia passa 36 vezes mais rápido: o squad anda com pressa para chegar às reuniões a tempo. */
const SQUAD_PACE = 1.7;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** O que a cena está mostrando agora, para a prova comparar com o painel. */
export const techSceneRuntime = {
  people: new Map<string, { home: string; pending: string | null; hidden: boolean }>(),
  board: [] as Array<{ epicId: string; health: string; stage: number }>,
  robots: new Map<string, { botId: string; x: number; y: number; z: number; arrived: boolean; leaving: boolean; gone: boolean }>(),
};

/**
 * Leva a pessoa até o lugar que o plano pede: levanta, anda pela rede de caminhos, troca de casa e
 * senta. Ninguém sai no meio de um movimento: termina o que começou e então segue o plano novo.
 */
function SquadBody({ human, base, reduced }: { human: OfficeHuman; base: HumanBase; reduced: boolean }) {
  const gl = useThree((state) => state.gl);
  const [actor, setActor] = useState<HumanActor | null>(null);
  const drive = useRef<{ home: Place; pending: Place | null; hidden: boolean } | null>(null);
  const frame = useRef(0);
  const email = human.squad!;
  const { id } = human;

  useEffect(() => {
    const figure = new HumanFigure(base, { phase: human.phase });
    humanFigures.set(id, figure);
    const created = new HumanActor(figure, human, { walkSpeed: base.clips.walkSpeed, pace: SQUAD_PACE }, reduced);
    const want = useTechStore.getState().people.find((plan) => plan.email === email)!.place;
    created.rehome({ spot: want.spot, chair: want.chair, ...(want.route ? { route: want.route } : {}), restYaw: want.restYaw ?? 0 });
    created.moveTo(want.spot);
    created.settle(want.chair ? "seated" : "standing");
    const hidden = want.key === ELEVATOR_PLACE.key;
    created.holder.visible = !hidden;
    drive.current = { home: want, pending: null, hidden };
    useOfficeStore.getState().setHumanRoom(id, roomId(want.zone));
    humanActors.set(id, created);
    setActor(created);
    let alive = true;
    void figure.wear(resolveHuman(human.preset)).then(() => {
      if (alive) gl.shadowMap.needsUpdate = true;
    });
    return () => {
      alive = false;
      humanActors.delete(id);
      humanFigures.delete(id);
      officeRuntime.liveAnchors.delete(id);
      techSceneRuntime.people.delete(email);
      figure.dispose();
      setActor(null);
    };
    // A pessoa é a mesma a página inteira; quem muda é o plano, lido a cada quadro.
  }, [base, id, email, reduced]);

  useFrame((_, delta) => {
    const state = drive.current;
    if (!actor || !state) return;
    const want = useTechStore.getState().people.find((plan) => plan.email === email)?.place ?? state.home;
    const before = actor.phase;
    if (state.pending) {
      if (actor.phase === "standing") {
        const arrived = state.pending;
        if (arrived.key === ELEVATOR_PLACE.key) {
          actor.holder.visible = false;
          state.hidden = true;
        }
        actor.rehome({ spot: arrived.spot, chair: arrived.chair, ...(arrived.route ? { route: arrived.route } : {}), restYaw: arrived.restYaw ?? 0 });
        state.home = arrived;
        state.pending = null;
        useOfficeStore.getState().setHumanRoom(id, roomId(arrived.zone));
      }
    } else if (actor.phase === "standing" || actor.phase === "seated") {
      if (state.home.key === want.key) {
        if (!state.hidden) actor.command(state.home.chair ? "seated" : "standing");
      } else if (actor.phase === "seated") {
        actor.command("standing");
      } else {
        let from = state.home;
        if (state.hidden) {
          actor.moveTo(ELEVATOR_PLACE.spot);
          actor.holder.visible = true;
          state.hidden = false;
          from = ELEVATOR_PLACE;
        }
        actor.errand(pathBetween(from, want));
        state.pending = want;
      }
    }
    actor.update(delta);
    if (actor.phase !== before || useOfficeStore.getState().humanPhases[id] !== actor.phase) {
      gl.shadowMap.needsUpdate = true;
      useOfficeStore.getState().setHumanPhase(id, actor.phase);
    }
    const { x, y, z } = actor.position;
    officeRuntime.liveAnchors.set(id, [x, y + TAG_HEIGHT + (actor.phase === "seated" ? SEATED_RISE : 0), z]);
    techSceneRuntime.people.set(email, { home: state.home.key, pending: state.pending?.key ?? null, hidden: state.hidden });
    frame.current = (frame.current + 1) % WALKING_SHADOW_EVERY;
    if (frame.current === 0 && actor.phase !== "standing" && actor.phase !== "seated") gl.shadowMap.needsUpdate = true;
  });

  return actor ? <primitive object={actor.holder} name={`squad-${email}`} /> : null;
}

function TechSquad() {
  const squad = useOfficeStore((state) => state.squad);
  const [base, setBase] = useState<HumanBase | null>(null);
  const [reduced] = useState(reducedMotion);
  useEffect(() => {
    let alive = true;
    loadHumanBase().then(
      (loaded) => {
        if (alive) setBase(loaded);
      },
      (error: unknown) => useOfficeStore.getState().setHumansError(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      alive = false;
    };
  }, []);
  if (!base) return null;
  return (
    <>
      {squad.map((human) => (
        <SquadBody key={human.id} human={human} base={base} reduced={reduced} />
      ))}
    </>
  );
}

// ─── Quadro dos épicos ───────────────────────────────────────────────────────

const PX_PER_METER = 2048 / (BOARD.maxX - BOARD.minX);
const FONT = '"Onest Variable", "Onest", system-ui, sans-serif';

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

/** Desenha o quadro inteiro: trilhas, etapas e um cartão por épico, na cor da saúde. */
function drawBoard(canvas: HTMLCanvasElement, cards: readonly BoardCard[], titles: Record<string, string>) {
  const context = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const px = (meters: number) => meters * PX_PER_METER;
  const toX = (x: number) => px(x - BOARD.minX);
  const toY = (y: number) => px(BOARD.top - y);
  context.fillStyle = "#f3f0e9";
  context.fillRect(0, 0, width, height);
  // As duas trilhas, cada uma com o nome em cima, e a seta de uma para a outra.
  const discoveryEnd = stageX(2) + BOARD_COLUMN_WIDTH / 2;
  const deliveryStart = stageX(3) - BOARD_COLUMN_WIDTH / 2;
  context.fillStyle = "#e6e0d3";
  context.fillRect(toX(BOARD.minX + BOARD.margin), 0, toX(discoveryEnd) - toX(BOARD.minX + BOARD.margin), px(BOARD.header));
  context.fillRect(toX(deliveryStart), 0, toX(BOARD.maxX - BOARD.margin) - toX(deliveryStart), px(BOARD.header));
  context.fillStyle = "#3a3d42";
  context.font = `700 30px ${FONT}`;
  context.textBaseline = "top";
  context.fillText(TRACK_LABEL.discovery.toLocaleUpperCase("pt-BR"), toX(BOARD.minX + BOARD.margin) + 14, 8);
  context.fillText(`${TRACK_LABEL.delivery.toLocaleUpperCase("pt-BR")}`, toX(deliveryStart) + 14, 8);
  context.font = `700 40px ${FONT}`;
  context.fillText("→", toX((discoveryEnd + deliveryStart) / 2) - 16, px(BOARD.top - BOARD.bottom) / 2 - 20);
  context.font = `500 22px ${FONT}`;
  context.fillStyle = "#5a5d63";
  EPIC_STAGES.forEach((stage, index) => {
    const x = stageX(index);
    context.fillText(stage.label, toX(x - BOARD_COLUMN_WIDTH / 2) + 14, 46);
    if (index !== 0 && index !== 3) {
      context.fillStyle = "#d8d2c5";
      context.fillRect(toX(x - BOARD_COLUMN_WIDTH / 2) - 1, px(BOARD.header) + 6, 2, height - px(BOARD.header) - 12);
      context.fillStyle = "#5a5d63";
    }
  });
  for (const card of cards) {
    const left = toX(card.x - card.width / 2);
    const top = toY(card.y + card.height / 2);
    roundRect(context, left, top, px(card.width), px(card.height), 10);
    context.fillStyle = HEALTH_COLOR[card.health];
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = `700 24px ${FONT}`;
    context.fillText(card.epicId, left + 14, top + 10);
    context.font = `500 21px ${FONT}`;
    const title = titles[card.epicId] ?? "";
    let text = title;
    while (text.length > 3 && context.measureText(text).width > px(card.width) - 74) text = text.slice(0, -1);
    context.fillText(text === title ? text : `${text.trimEnd()}…`, left + 62, top + 12);
  }
}

function EpicBoard() {
  const state = useTechStore((store) => store.state);
  const cards = useMemo(() => boardCards(state), [state]);
  const key = cards.map((card) => `${card.epicId}:${card.stage}:${card.health}`).join("|");
  const titles = useMemo(() => Object.fromEntries(state.epics.map((epic) => [epic.id, epic.title])), [state.epics]);
  const canvas = useMemo(() => {
    const element = document.createElement("canvas");
    element.width = 2048;
    element.height = Math.round(2048 * ((BOARD.top - BOARD.bottom) / (BOARD.maxX - BOARD.minX)));
    return element;
  }, []);
  const texture = useMemo(() => {
    const made = new CanvasTexture(canvas);
    made.colorSpace = SRGBColorSpace;
    made.anisotropy = 4;
    return made;
  }, [canvas]);
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    void document.fonts?.ready.then(() => setFontsReady(true));
  }, []);
  useEffect(() => {
    drawBoard(canvas, cards, titles);
    texture.needsUpdate = true;
    techSceneRuntime.board = cards.map((card) => ({ epicId: card.epicId, health: card.health, stage: card.stage }));
    // Redesenha só quando muda etapa ou saúde: o quadro custa uma textura e duas chamadas.
  }, [key, fontsReady]);
  useEffect(() => () => texture.dispose(), [texture]);
  const width = BOARD.maxX - BOARD.minX;
  const height = BOARD.top - BOARD.bottom;
  const x = (BOARD.minX + BOARD.maxX) / 2;
  const y = (BOARD.top + BOARD.bottom) / 2;
  return (
    <group name="quadro-epicos">
      <mesh position={[x, y, BOARD.z - 0.02]}>
        <boxGeometry args={[width + 0.12, height + 0.12, 0.03]} />
        <meshStandardMaterial color="#3a3d42" roughness={0.8} />
      </mesh>
      <mesh position={[x, y, BOARD.z]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ─── Bots em visita ──────────────────────────────────────────────────────────

const BOT_SPEED = 2.2;
const HOVER = 0.12;
const BOT_COLOR = Object.fromEntries(AGENTS.map((agent) => [agent.id, agent.color]));

/** Sai do elevador, voa até o lugar da tarefa, fica lá enquanto ela dura e volta. */
function BotVisitor({ visit, scene, clips, reduced }: { visit: BotVisit; scene: Object3D; clips: AnimationClip[]; reduced: boolean }) {
  const saved = useOfficeStore((state) => state.robotLooks[visit.botId]);
  const holder = useMemo(() => new Group(), []);
  const rig = useMemo(() => new RobotRig(scene, clips, { reduced }), [scene, clips, reduced]);
  // O lugar fica o da partida: se a pessoa sair da mesa no meio, o robô não muda de rumo.
  const path = useMemo<Point[]>(() => pathBetween(ELEVATOR_PLACE, visit.place), [visit.taskId]);
  const length = useMemo(() => pathLength(path), [path]);
  const motion = useRef({ distance: reduced ? length : 0, yaw: Math.PI, gone: false });
  const done = visit.done;
  useEffect(() => {
    holder.add(rig.root);
    return () => {
      holder.remove(rig.root);
      rig.dispose();
      techSceneRuntime.robots.delete(visit.taskId);
    };
  }, [holder, rig, visit.taskId]);
  useEffect(() => rig.apply(lookFor(BOT_COLOR[visit.botId] ?? "#ca9337", saved)), [rig, saved, visit.botId]);
  useFrame(({ clock }, delta) => {
    const step = Math.min(delta, 0.05);
    rig.update(reduced ? 0 : step);
    const state = motion.current;
    const goal = done ? 0 : length;
    if (reduced) state.distance = goal;
    else state.distance += Math.sign(goal - state.distance) * Math.min(Math.abs(goal - state.distance), BOT_SPEED * step);
    const pose = pathPose(path, state.distance);
    const moving = Math.abs(goal - state.distance) > 1e-3;
    state.yaw = turnToward(state.yaw, moving ? (done ? pose.yaw + Math.PI : pose.yaw) : 0, 4 * step);
    state.gone = done && state.distance <= 1e-3;
    holder.visible = !state.gone;
    const y = HOVER + (reduced ? 0 : bobAt(clock.elapsedTime, botPhase(visit.botId)));
    holder.position.set(pose.x, y, pose.z);
    holder.rotation.y = state.yaw;
    techSceneRuntime.robots.set(visit.taskId, { botId: visit.botId, x: pose.x, y: y + rig.height, z: pose.z, arrived: !done && !moving, leaving: done && !state.gone, gone: state.gone });
  });
  return <primitive object={holder} name={`visita-${visit.botId}`} />;
}

function TechBots() {
  const visits = useTechStore((store) => store.visits);
  const [model, setModel] = useState<{ scene: Object3D; clips: AnimationClip[] } | null>(null);
  const [reduced] = useState(reducedMotion);
  const wanted = visits.length > 0;
  useEffect(() => {
    if (!wanted || model) return;
    let alive = true;
    loadGltf(ROBOT_URL).then((gltf) => {
      if (alive && findRobotProblems(gltf.scene, gltf.animations).length === 0) setModel({ scene: gltf.scene, clips: gltf.animations });
    }, () => undefined);
    return () => {
      alive = false;
    };
  }, [wanted, model]);
  if (!model) return null;
  return (
    <>
      {visits.map((visit) => (
        <BotVisitor key={visit.taskId} visit={visit} scene={model.scene} clips={model.clips} reduced={reduced} />
      ))}
    </>
  );
}

/** O que o cenário põe no andar da Tecnologia. Só existe com o andar montado. */
export function TechScene() {
  const mounted = useOfficeStore((state) => state.mountedFloors.includes(TECH_FLOOR_ID));
  if (!mounted) return null;
  return (
    <FloorGroup floor={TECH_FLOOR_ID}>
      <EpicBoard />
      <TechSquad />
      <TechBots />
    </FloorGroup>
  );
}

export default TechScene;
