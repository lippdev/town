import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, SRGBColorSpace, type Mesh, type MeshStandardMaterial } from "three";
import { FloorGroup, GroundGroup } from "./BuildingScene";
import { buildCarGeometry, CURB_LANE_Z } from "./officeCity";
import { ARRIVAL, CHIEF_ID, CLIMB_SECONDS, MEETING_SECONDS, PATROL_PAUSE, WORK_SECONDS, carTravel, chiefIsAway } from "./officeChief";
import { directoratePatrol } from "./officeDirectorate";
import { HelipadScene } from "./HelipadScene";
import { PARKED_POSE, advanceFlight, arrivalVia, awayFlight, flightFrame, helipadRuntime, startArrival, startDeparture, type Flight } from "./officeHelipad";
import type { Point } from "./officeHumans";
import { DESK_REACH, type OfficeSeat } from "./officeLayout";
import { humanActors, useOfficeStore } from "./officeStore";

type Step = "driving" | "door" | "climbing" | "toDesk" | "working" | "meeting" | "rising" | "patrolling" | "pausing";

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
function DeskSign({ seat, meeting, away }: { seat: OfficeSeat; meeting: boolean; away: boolean }) {
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
    // Mesa vazia não diz "na mesa": sem ele, a placa sai de cena e volta com ele.
    <group position={[x, 0.78, z]} rotation={[0, Math.PI / 4, 0]} visible={!away} name="placa-do-chefe">
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
 * Roteiro do Chefe na demonstração: chega de carro ou de helicóptero, sobe ou desce até a mesa,
 * trabalha, entra em reunião, anda pela Diretoria e pode sair de helicóptero. É só desenho, com
 * tempos curtos; não lê agenda. Não há trajeto da porta ao elevador nem subida animada: enquanto
 * "sobe", ele não está em andar nenhum, e reaparece na mesa. O voo segue pelo relógio em qualquer
 * vista, e pedir outra chegada no meio dele recomeça do zero, sem helicóptero parado no ar.
 */
export function ChiefScene() {
  const human = useOfficeStore((state) => state.humans.find((candidate) => candidate.id === CHIEF_ID));
  const status = useOfficeStore((state) => state.chiefStatus);
  const mounted = useOfficeStore((state) => state.humans.find((candidate) => candidate.id === CHIEF_ID)?.floor === undefined ? false : state.mountedFloors.includes(state.humans.find((candidate) => candidate.id === CHIEF_ID)!.floor));
  const car = useRef<Mesh>(null);
  const geometry = useMemo(() => buildCarGeometry("#1d2230"), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const script = useRef<{ step: Step; time: number; legs: Point[][]; leg: number; opened: boolean; flight: Flight | null; parked: boolean; carShown: boolean }>({ step: "driving", time: 0, legs: [], leg: 0, opened: false, flight: null, parked: false, carShown: true });
  const helicopter = useOfficeStore((state) => state.helicopterPresent);
  const seat = human?.chair ?? null;

  useFrame((_, delta) => {
    const actor = humanActors.get(CHIEF_ID);
    if (!human || !car.current) return;
    const store = useOfficeStore.getState();
    const state = script.current;
    const go = (next: Step) => {
      state.step = next;
      state.time = 0;
    };
    const atDesk = () => {
      if (actor) {
        actor.holder.visible = true;
        actor.settle("seated");
      }
      store.setHumanGoal(CHIEF_ID, "seated");
      store.setChiefStatus("mesa");
      go("working");
    };
    const step = Math.min(delta, 0.1);
    state.time += step;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const arriveByAir = () => {
      state.carShown = false;
      store.setHumanGoal(CHIEF_ID, "seated");
      if (reduced) {
        // Movimento reduzido: nada de voo. Já pousado, e ele já na mesa.
        state.flight = null;
        state.parked = true;
        atDesk();
      } else {
        state.parked = false;
        state.flight = startArrival();
      }
    };

    // A abertura se decide uma vez só, no primeiro quadro: recarregar sorteia de novo.
    if (!state.opened) {
      state.opened = true;
      if (arrivalVia(window.location.search) === "helicoptero") arriveByAir();
    }

    // Os pedidos valem de onde ele estiver: o corpo some, e o helicóptero anterior sai sem ser visto,
    // porque os botões ficam na gaveta, de dentro do prédio, com o corte abaixo dele.
    if (store.chiefRequest === "chegada") {
      store.setChiefRequest(null);
      store.setHumanGoal(CHIEF_ID, "seated");
      state.flight = null;
      state.parked = false;
      state.carShown = true;
      go("driving");
    } else if (store.chiefRequest === "chegadaHeli") {
      store.setChiefRequest(null);
      arriveByAir();
    } else if (store.chiefRequest === "saida") {
      store.setChiefRequest(null);
      store.setHumanGoal(CHIEF_ID, "seated");
      state.flight = reduced ? awayFlight() : startDeparture(state.parked);
      state.parked = false;
    }

    let settled = false;
    if (state.flight) {
      state.flight = advanceFlight(state.flight, step);
      if (state.flight.step === "settled") {
        // Chegou: fica pousado no deque, e o chefe aparece na mesa.
        state.flight = null;
        state.parked = true;
        atDesk();
        settled = true;
      }
    }
    const frame = state.flight ? flightFrame(state.flight) : null;
    helipadRuntime.step = state.flight?.step ?? null;
    helipadRuntime.parked = state.parked;
    helipadRuntime.helicopter = frame ? frame.helicopter : state.parked ? PARKED_POSE : null;
    helipadRuntime.rotor = frame?.rotor ?? 0;
    helipadRuntime.figure = frame?.figure ?? null;
    store.setHelicopterPresent(helipadRuntime.helicopter !== null);
    car.current.visible = state.carShown;
    if (settled) return;

    if (frame) {
      if (actor) actor.holder.visible = false;
      // Reunião e ronda não fazem sentido no ar: o pedido não fica preso para quando ele voltar.
      if (store.chiefRequest) store.setChiefRequest(null);
      if (store.chiefStatus !== frame.status) store.setChiefStatus(frame.status);
      return;
    }

    if (state.step === "driving" || state.step === "door" || state.step === "climbing") {
      if (actor) actor.holder.visible = false;
      if (reduced) {
        car.current.position.set(ARRIVAL.stopX, -0.05, CURB_LANE_Z);
        atDesk();
      } else if (state.step === "driving") {
        const point = carTravel(state.time);
        car.current.position.set(point.x, -0.05, CURB_LANE_Z);
        if (store.chiefStatus !== "chegando") store.setChiefStatus("chegando");
        if (point.done) go("door");
      } else if (state.step === "door") {
        if (state.time > ARRIVAL.doorSeconds) {
          store.setChiefStatus("entrando");
          go("climbing");
        }
      } else if (state.time > CLIMB_SECONDS) {
        atDesk();
      }
      return;
    }

    // Fora da Diretoria não há corpo: o passeio termina e ele fica na mesa, sem andar por outro andar.
    if (!actor) {
      if (store.chiefRequest) store.setChiefRequest(null);
      if (state.step !== "working" && state.step !== "meeting") atDesk();
      return;
    }

    const request = store.chiefRequest;
    if (request) {
      if (request === "reuniao" && state.step === "working") {
        store.setChiefRequest(null);
        store.setChiefStatus("reuniao");
        go("meeting");
      } else if (request === "ronda" && (state.step === "working" || state.step === "meeting")) {
        store.setHumanGoal(CHIEF_ID, "standing");
        store.setChiefStatus("levantando");
        go("rising");
      }
    }

    switch (state.step) {
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
          store.setChiefStatus("mesa");
          go("working");
        }
        break;
      case "rising":
        if (actor.phase === "standing") {
          store.setChiefRequest(null);
          state.legs = directoratePatrol(human.spot);
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
      {/* O carro é da rua: desce com a cidade quando o andar em tela é alto. */}
      <GroundGroup>
        <mesh ref={car} geometry={geometry} rotation={[0, Math.PI / 2, 0]} name="carro-do-chefe" position={[ARRIVAL.startX, -0.05, CURB_LANE_Z]}>
          <meshStandardMaterial vertexColors roughness={0.35} metalness={0.45} />
        </mesh>
        {/* Do alto da torre, mas também desce com a cidade: nos andares de baixo, fica sobre o corte. */}
        {helicopter && <HelipadScene />}
      </GroundGroup>
      {seat && human && mounted && (
        <FloorGroup floor={human.floor}>
          <DeskSign seat={seat} meeting={status === "reuniao"} away={chiefIsAway(status)} />
        </FloorGroup>
      )}
    </>
  );
}
