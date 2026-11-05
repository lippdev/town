import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, type Mesh } from "three";
import { HumanFigure, loadHumanBase, type HumanBase } from "@/avatar/human/HumanFigure";
import { newPreset, resolveHuman, type HumanPreset } from "@/avatar/human/preset";
import { HUMAN_SCALE, turnToward } from "./officeHumans";
import { CITY_BOUNDS, EAST_WALK_X, FAR_LANE_Z, ROADS, SOUTH_WALK_Z, buildCarGeometry, buildCityGeometry } from "./officeCity";

const TURN_PER_SECOND = 5;
const LONGEST_FRAME = 0.05;

function usePrefersReduced() {
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  return reduced;
}

interface Traffic {
  color: string;
  axis: "x" | "z";
  lane: number;
  direction: 1 | -1;
  speed: number;
  start: number;
}

/** `start` é quanto da via o carro já andou: os primeiros começam perto do escritório. */
const TRAFFIC: readonly Traffic[] = [
  { color: "#b23a48", axis: "x", lane: FAR_LANE_Z, direction: -1, speed: 4.2, start: 74 },
  { color: "#d7d3c8", axis: "x", lane: FAR_LANE_Z, direction: -1, speed: 3.4, start: 100 },
  { color: "#3f6b4f", axis: "x", lane: FAR_LANE_Z, direction: -1, speed: 3.8, start: 135 },
  { color: "#23262c", axis: "x", lane: FAR_LANE_Z, direction: -1, speed: 3.6, start: 180 },
  { color: "#3a6ea5", axis: "z", lane: ROADS.east.from + 1, direction: 1, speed: 3.8, start: 104 },
  { color: "#8a7f73", axis: "z", lane: ROADS.east.from + 1, direction: 1, speed: 3.3, start: 60 },
  { color: "#c9a13b", axis: "z", lane: ROADS.east.to - 1, direction: -1, speed: 3.1, start: 92 },
  { color: "#6f7480", axis: "z", lane: ROADS.east.to - 1, direction: -1, speed: 3.5, start: 150 },
];

function TrafficCar({ car, reduced }: { car: Traffic; reduced: boolean }) {
  const mesh = useRef<Mesh>(null);
  const geometry = useMemo(() => buildCarGeometry(car.color), [car.color]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Dá a volta além da ponta da cidade, onde a câmera não chega: nenhum carro some à vista.
  const span = car.axis === "x" ? [CITY_BOUNDS.minX - 4, CITY_BOUNDS.maxX + 4] : [CITY_BOUNDS.minZ - 4, CITY_BOUNDS.maxZ + 4];
  const length = span[1]! - span[0]!;
  const travelled = useRef(car.start);
  useFrame((_, delta) => {
    if (!mesh.current) return;
    if (!reduced) travelled.current = (travelled.current + car.speed * Math.min(delta, LONGEST_FRAME)) % length;
    const position = car.direction > 0 ? span[0]! + travelled.current : span[1]! - travelled.current;
    if (car.axis === "x") mesh.current.position.set(position, -0.05, car.lane);
    else mesh.current.position.set(car.lane, -0.05, position);
  });
  const yaw = car.axis === "x" ? (car.direction * Math.PI) / 2 : car.direction > 0 ? 0 : Math.PI;
  return (
    <mesh ref={mesh} geometry={geometry} rotation={[0, yaw, 0]}>
      <meshStandardMaterial vertexColors roughness={0.5} metalness={0.2} />
    </mesh>
  );
}

interface Walker {
  id: string;
  axis: "x" | "z";
  lane: number;
  from: number;
  to: number;
  start: number;
  look: (preset: HumanPreset) => HumanPreset;
}

const WALKERS: readonly Walker[] = [
  {
    id: "passante-a",
    axis: "x",
    lane: SOUTH_WALK_Z,
    from: -11,
    to: 12,
    start: 0.2,
    look: (preset) => ({ ...preset, parts: { ...preset.parts, hair: "Hair.004" }, colors: { ...preset.colors, top: "#a83232", bottom: "#23262c", hair: "#6b4426" } }),
  },
  {
    id: "passante-b",
    axis: "z",
    lane: EAST_WALK_X,
    from: -9,
    to: 9,
    start: 0.6,
    look: (preset) => ({ ...preset, parts: { ...preset.parts, hair: "Hair.007" }, colors: { ...preset.colors, top: "#22c55e", bottom: "#2f4256", head: "#8d5a3c", nose: "#8d5a3c", hair: "#17120f" } }),
  },
];

/** Gente de passagem: não está na lista de pessoas, não clica e não significa nada. */
function Passerby({ walker, base, reduced }: { walker: Walker; base: HumanBase; reduced: boolean }) {
  const [holder] = useState(() => {
    const group = new Group();
    group.scale.setScalar(HUMAN_SCALE);
    return group;
  });
  const state = useRef({ at: walker.from + (walker.to - walker.from) * walker.start, direction: 1, yaw: 0, figure: null as HumanFigure | null });
  useEffect(() => {
    const figure = new HumanFigure(base, { phase: walker.start * 4 });
    state.current.figure = figure;
    holder.add(figure.root);
    void figure.wear(resolveHuman(walker.look(newPreset(walker.id, walker.id, "2026-11-04T00:00:00.000Z"))));
    figure.play("walk");
    return () => {
      holder.remove(figure.root);
      figure.dispose();
      state.current.figure = null;
    };
  }, [base, holder, walker]);
  useFrame((_, delta) => {
    const now = state.current;
    const step = reduced ? 0 : Math.min(delta, LONGEST_FRAME);
    now.figure?.update(step, { blink: false });
    now.at += now.direction * base.clips.walkSpeed * HUMAN_SCALE * step;
    if (now.at > walker.to) now.direction = -1;
    if (now.at < walker.from) now.direction = 1;
    const goal = walker.axis === "x" ? (now.direction * Math.PI) / 2 : now.direction > 0 ? 0 : Math.PI;
    now.yaw = turnToward(now.yaw, goal, TURN_PER_SECOND * step);
    holder.rotation.y = now.yaw;
    if (walker.axis === "x") holder.position.set(now.at, -0.015, walker.lane);
    else holder.position.set(walker.lane, -0.015, now.at);
  });
  return <primitive object={holder} />;
}

/** Cidade, trânsito e gente na rua. Não mexe em nada do escritório. */
export function OfficeCity() {
  const reduced = usePrefersReduced();
  const geometry = useMemo(() => buildCityGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const [base, setBase] = useState<HumanBase | null>(null);
  useEffect(() => {
    let alive = true;
    loadHumanBase().then(
      (loaded) => {
        if (alive) setBase(loaded);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);
  return (
    <>
      <mesh geometry={geometry} name="cidade" receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.9} />
      </mesh>
      {TRAFFIC.map((car) => (
        <TrafficCar key={car.color} car={car} reduced={reduced} />
      ))}
      {base && WALKERS.map((walker) => <Passerby key={walker.id} walker={walker} base={base} reduced={reduced} />)}
    </>
  );
}
