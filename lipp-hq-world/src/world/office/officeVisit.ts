import { create } from "zustand";
import { OFFICE_SEATS_BY_ID } from "./officeLayout";

export interface ActorPose { x: number; z: number; yaw: number; standing: number; walk: number; talk: number }
interface Beat { label: string; duration: number; from: ActorPose; to: ActorPose; walking?: boolean; talking?: boolean }
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
  for (const [x, z] of points) {
    const distance = Math.hypot(x - pose.x, z - pose.z);
    if (distance < 0.01) continue;
    beat(label, 0.4, { yaw: Math.atan2(x - pose.x, z - pose.z) });
    beat(label, distance / 0.85, { x, z }, { walking: true });
  }
}
beat("Pulse se levanta", 1.6, { standing: 1, x: route[0][0], z: route[0][1] });
walk(route.slice(1), "Pulse vai à Pesquisa");
beat("Scout recebe Pulse", 1.6, { yaw: -Math.PI / 2 });
export const TALK_START = beats.reduce((sum, item) => sum + item.duration, 0);
beat("Pulse e Scout conversam", 10, {}, { talking: true });
export const TALK_END = TALK_START + 10;
beat("Os dois se despedem", 1.6, {});
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
  const visitor = {
    x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
    yaw: a.yaw + angle(a.yaw, b.yaw) * t,
    standing: a.standing + (b.standing - a.standing) * t,
    walk: current.walking ? Math.sin(Math.PI * linear) ** 0.2 : 0,
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
  active: boolean; paused: boolean; time: number; speed: number; label: string;
  start: () => void; reset: () => void; togglePause: () => void;
  setSpeed: (speed: number) => void; advance: (delta: number) => void;
}
export const useVisitStore = create<VisitState>((set, get) => ({
  active: false, paused: false, time: 0, speed: 1.5, label: "Pulse visita Scout",
  start: () => set({ active: true, paused: false, time: 0, label: sampleVisit(0).label }),
  reset: () => set({ active: false, paused: false, time: 0, label: "Pulse visita Scout" }),
  togglePause: () => set({ paused: !get().paused }),
  setSpeed: (speed) => set({ speed: Math.max(0.5, Math.min(2, speed)) }),
  advance: (delta) => {
    const state = get();
    if (!state.active || state.paused) return;
    const time = Math.min(VISIT_DURATION, state.time + Math.max(0, Math.min(delta, 0.05)) * state.speed);
    set({ time, active: time < VISIT_DURATION, label: sampleVisit(time).label });
  },
}));

/** Posição visual compartilhada pelo corpo, rótulo, seleção e clique. */
export function visitPose(botId: string): ActorPose | null {
  const state = useVisitStore.getState();
  if (!state.active) return null;
  const sample = sampleVisit(state.time);
  return botId === "pulse" ? sample.visitor : botId === "scout" ? sample.host : null;
}
