import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, SRGBColorSpace, type Mesh, type MeshStandardMaterial } from "three";
import { buildCarGeometry, CURB_LANE_Z } from "./officeCity";
import { ARRIVAL, CHIEF_ID, MEETING_SECONDS, PATROL_PAUSE, WORK_SECONDS, arrivalPath, carTravel, patrolLegs } from "./officeChief";
import type { Point } from "./officeHumans";
import { DESK_REACH, OFFICE_SEATS_BY_ID, type OfficeSeat } from "./officeLayout";
import { humanActors, useOfficeStore } from "./officeStore";

type Step = "driving" | "door" | "entering" | "toDesk" | "working" | "meeting" | "rising" | "patrolling" | "pausing";

function signTexture(text: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#14171d";
  context.fillRect(0, 0, 256, 96);
  context.fillStyle = color;
  context.font = "bold 34px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 128, 50);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Placa na mesa dele: de longe, a cor já diz se pode interromper. */
function DeskSign({ seat, meeting }: { seat: OfficeSeat; meeting: boolean }) {
  const busy = useMemo(() => signTexture("EM REUNIÃO", "#ff6b5e"), []);
  const free = useMemo(() => signTexture("NA MESA", "#6fe08f"), []);
  useEffect(
    () => () => {
      busy.dispose();
      free.dispose();
    },
    [busy, free],
  );
  const lamp = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (lamp.current) lamp.current.emissiveIntensity = meeting ? 1.2 + Math.sin(clock.elapsedTime * 4) * 0.8 : 0.5;
  });
  const forward = DESK_REACH + 0.2;
  // Na ponta da bancada, do lado: na frente dele, a placa cobriria o corpo.
  const side = -0.32;
  const x = seat.x + Math.sin(seat.yaw) * forward + Math.cos(seat.yaw) * side;
  const z = seat.z + Math.cos(seat.yaw) * forward - Math.sin(seat.yaw) * side;
  const color = meeting ? "#ff4d3d" : "#35c46a";
  return (
    <group position={[x, 0.78, z]} rotation={[0, Math.PI / 4, 0]} name="placa-do-chefe">
      <mesh position={[0, 0.16, 0]}>
        <planeGeometry args={[0.62, 0.23]} />
        <meshBasicMaterial map={meeting ? busy : free} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.02, -0.005]}>
        <boxGeometry args={[0.2, 0.05, 0.06]} />
        <meshStandardMaterial color="#23262c" />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <sphereGeometry args={[0.035, 10, 8]} />
        <meshStandardMaterial ref={lamp} color={color} emissive={color} />
      </mesh>
    </group>
  );
}

/**
 * Roteiro do Chefe na demonstração: chega de carro, entra, trabalha, entra em reunião e faz a
 * ronda. É só desenho, com tempos curtos para caber na tela; não lê agenda nenhuma ainda.
 */
export function ChiefScene() {
  const human = useOfficeStore((state) => state.humans.find((candidate) => candidate.id === CHIEF_ID));
  const status = useOfficeStore((state) => state.chiefStatus);
  const car = useRef<Mesh>(null);
  const geometry = useMemo(() => buildCarGeometry("#1d2230"), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const script = useRef<{ step: Step; time: number; legs: Point[][]; leg: number }>({ step: "driving", time: 0, legs: [], leg: 0 });
  const seat = human?.chair ? OFFICE_SEATS_BY_ID[human.chair.id] : null;

  useFrame((_, delta) => {
    const actor = humanActors.get(CHIEF_ID);
    if (!actor || !human || !car.current) return;
    const store = useOfficeStore.getState();
    const state = script.current;
    const go = (step: Step) => {
      state.step = step;
      state.time = 0;
    };
    state.time += Math.min(delta, 0.1);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced && state.step === "driving") {
      car.current.position.set(ARRIVAL.stopX, -0.05, CURB_LANE_Z);
      actor.holder.visible = true;
      store.setHumanGoal(CHIEF_ID, "seated");
      store.setChiefStatus("mesa");
      go("working");
      return;
    }

    const request = store.chiefRequest;
    if (request) {
      if (request === "reuniao" && state.step === "working") {
        store.setChiefRequest(null);
        store.setChiefStatus("reuniao");
        go("meeting");
      } else if ((request === "ronda" || request === "chegada") && (state.step === "working" || state.step === "meeting")) {
        store.setHumanGoal(CHIEF_ID, "standing");
        store.setChiefStatus("levantando");
        go("rising");
      }
    }

    switch (state.step) {
      case "driving": {
        const point = carTravel(state.time);
        car.current.position.set(point.x, -0.05, CURB_LANE_Z);
        actor.holder.visible = false;
        actor.moveTo({ x: point.x, z: CURB_LANE_Z });
        if (store.chiefStatus !== "chegando") store.setChiefStatus("chegando");
        if (point.done) go("door");
        break;
      }
      case "door":
        if (state.time > ARRIVAL.doorSeconds) {
          actor.moveTo(ARRIVAL.door);
          actor.holder.visible = true;
          actor.errand(arrivalPath(human.spot));
          store.setChiefStatus("entrando");
          go("entering");
        }
        break;
      case "entering":
        if (actor.phase === "standing") {
          store.setHumanGoal(CHIEF_ID, "seated");
          go("toDesk");
        }
        break;
      case "toDesk":
        if (actor.phase === "seated") {
          store.setChiefStatus("mesa");
          go("working");
        }
        break;
      case "working":
        if (state.time > WORK_SECONDS) {
          store.setChiefStatus("reuniao");
          go("meeting");
        }
        break;
      case "meeting":
        if (state.time > MEETING_SECONDS) {
          store.setHumanGoal(CHIEF_ID, "standing");
          store.setChiefStatus("levantando");
          go("rising");
        }
        break;
      case "rising":
        if (actor.phase === "standing") {
          if (useOfficeStore.getState().chiefRequest === "chegada") {
            store.setChiefRequest(null);
            go("driving");
            break;
          }
          store.setChiefRequest(null);
          state.legs = patrolLegs(human.spot);
          state.leg = 0;
          actor.errand(state.legs[0]!);
          store.setChiefStatus("ronda");
          go("patrolling");
        }
        break;
      case "patrolling":
        if (actor.phase === "standing") {
          state.leg += 1;
          if (state.leg >= state.legs.length) {
            store.setHumanGoal(CHIEF_ID, "seated");
            store.setChiefStatus("voltando");
            go("toDesk");
          } else {
            go("pausing");
          }
        }
        break;
      case "pausing":
        if (state.time > PATROL_PAUSE) {
          actor.errand(state.legs[state.leg]!);
          go("patrolling");
        }
        break;
    }
  });

  return (
    <>
      <mesh ref={car} geometry={geometry} rotation={[0, Math.PI / 2, 0]} name="carro-do-chefe" position={[ARRIVAL.startX, -0.05, CURB_LANE_Z]}>
        <meshStandardMaterial vertexColors roughness={0.35} metalness={0.45} />
      </mesh>
      {seat && <DeskSign seat={seat} meeting={status === "reuniao"} />}
    </>
  );
}
