import { SCENARIOS, meetingDuration, sampleMeeting, type DemoScenario } from "./officeMeeting";
import { create } from "zustand";
import { VisitPath, STRIDE_LENGTH, type Footstep } from "./visitPath";
import { OFFICE_SEATS_BY_ID } from "./officeLayout";

export interface ActorPose { x: number; z: number; yaw: number; standing: number; walk: number; talk: number; distance?: number; gaitPhase?: number; feet?: { L: Footstep; R: Footstep } }
interface Beat { label: string; duration: number; from: ActorPose; to: ActorPose; walking?: boolean; path?: VisitPath; talking?: boolean }
const smooth = (v: number) => v * v * (3 - 2 * v);
const angle = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const home = OFFICE_SEATS_BY_ID["engenharia-0"]!;
const hostHome = OFFICE_SEATS_BY_ID["pesquisa-0"]!;
const seated = (seat: typeof home): ActorPose => ({ x: seat.x, z: seat.z, yaw: seat.yaw, standing: 0, walk: 0, talk: 0 });
const origin = seated(home);
const beats: Beat[] = [];
let pose = origin;
function beat(label: string, duration: number, change: Partial<ActorPose>, flags: Partial<Beat> = {}) {
  const next = { ...pose, ...change };
  beats.push({ label, duration, from: pose, to: next, ...flags });
  pose = next;
}
// Rota autoral desta visita: porta sul da Engenharia, corredor oeste e porta
// leste da Pesquisa. Diagonais de 45° suavizam as esquinas nas áreas livres;
// as travessias das portas continuam retas. O desvio ao sul evita a mesa de mapas.
const route = [
  [-6.7, home.z + 0.35], [-6.7, -3.85], [-6.3, -3.45],
  [-4.75, -3.45], [-4.35, -3.05], [-4.35, -0.4], [-4.75, 0],
  [-5.65, 0], [-5.65, 1.0], [-6.0, 1.35], [-8.35, 1.35],
] as const;
function walk(points: readonly (readonly [number, number])[], label: string) {
  const path = new VisitPath(points);
  const end = path.at(path.length);
  beat(label, path.length / 0.85, { ...end }, { walking: true, path });
}
const outward = new VisitPath(route);
const inward = new VisitPath([...route].reverse());
beat("Pulse se levanta", 1.6, { standing: 1, x: route[0][0], z: route[0][1], yaw: outward.at(0).yaw });
walk(route, "Pulse vai à Pesquisa");
beat("Scout recebe Pulse", 1.6, { yaw: -Math.PI / 2 });
export const TALK_START = beats.reduce((sum, item) => sum + item.duration, 0);
beat("Pulse e Scout conversam", 10, {}, { talking: true });
export const TALK_END = TALK_START + 10;
beat("Os dois se despedem", 1.6, { yaw: inward.at(0).yaw });
walk([...route].reverse(), "Pulse volta à Engenharia");
beat("Pulse volta ao posto", 0.5, { yaw: home.yaw });
beat("Pulse se senta", 1.6, origin);
export const VISIT_DURATION = beats.reduce((sum, item) => sum + item.duration, 0);

export function sampleVisit(time: number): { visitor: ActorPose; host: ActorPose; label: string } {
  let remaining = Math.max(0, Math.min(time, VISIT_DURATION));
  let current = beats[beats.length - 1]!;
  for (const item of beats) {
    current = item;
    if (remaining <= item.duration || item === beats[beats.length - 1]) break;
    remaining -= item.duration;
  }
  const linear = Math.min(1, remaining / current.duration);
  const t = current.walking ? linear : smooth(linear);
  const a = current.from, b = current.to;
  const speaking = Math.floor(Math.max(0, time - TALK_START) / 2) % 2 === 0;
  const distance = current.path ? linear * current.path.length : 0;
  const frame = current.path?.at(distance);
  const visitor: ActorPose = {
    x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
    yaw: a.yaw + angle(a.yaw, b.yaw) * t,
    standing: a.standing + (b.standing - a.standing) * t,
    ...(frame ?? {}),
    walk: current.walking ? Math.min(1, distance / (STRIDE_LENGTH / 2), (current.path!.length - distance) / (STRIDE_LENGTH / 2)) : 0,
    ...(current.path ? { distance, gaitPhase: distance / current.path.stride * Math.PI * 2, feet: { L: current.path.foot(distance, "L"), R: current.path.foot(distance, "R") } } : {}),
    talk: current.talking ? (speaking ? 1 : 0.2) : 0,
  };
  const welcome = smooth(Math.max(0, Math.min(1, (time - TALK_START + 1.6) / 1.6)));
  const goodbye = smooth(Math.max(0, Math.min(1, (TALK_END + 1.6 - time) / 1.6)));
  const standing = welcome * goodbye;
  const host = { ...seated(hostHome), z: hostHome.z + standing * 0.7, standing,
    yaw: hostHome.yaw + angle(hostHome.yaw, Math.PI / 2) * standing,
    talk: current.talking ? (speaking ? 0.2 : 1) : 0 };
  return { visitor, host, label: time >= VISIT_DURATION ? "Visita concluída" : current.label };
}

interface VisitState {
  scenario: DemoScenario;
  active: boolean; paused: boolean; time: number; speed: number; label: string;
  start: (scenario?: DemoScenario) => void; reset: () => void; togglePause: () => void;
  setSpeed: (speed: number) => void; advance: (delta: number) => void;
}
export const useVisitStore = create<VisitState>((set, get) => ({
  scenario: "visit", active: false, paused: false, time: 0, speed: 1.5, label: "Pulse visita Scout",
  start: (scenario = "visit") => set({ scenario, active: true, paused: false, time: 0, label: scenario === "visit" ? sampleVisit(0).label : sampleMeeting(scenario, 0).label }),
  reset: () => set({ active: false, paused: false, time: 0, label: SCENARIOS[get().scenario].title }),
  togglePause: () => set({ paused: !get().paused }),
  setSpeed: (speed) => set({ speed: Math.max(0.5, Math.min(2, speed)) }),
  advance: (delta) => {
    const state = get();
    if (!state.active || state.paused) return;
    const duration = state.scenario === "visit" ? VISIT_DURATION : meetingDuration(state.scenario);
    const time = Math.min(duration, state.time + Math.max(0, Math.min(delta, 0.05)) * state.speed);
    set({ time, active: time < duration, label: state.scenario === "visit" ? sampleVisit(time).label : sampleMeeting(state.scenario, time).label });
  },
}));

/** Posição visual compartilhada pelo corpo, rótulo, seleção e clique. */
export function visitPose(botId: string): ActorPose | null {
  const state = useVisitStore.getState();
  if (!state.active) return null;
  if (state.scenario !== "visit") return sampleMeeting(state.scenario, state.time).poses[botId] ?? null;
  const sample = sampleVisit(state.time);
  return botId === "pulse" ? sample.visitor : botId === "scout" ? sample.host : null;
}
