import { create } from "zustand";
import type { ActivityState } from "@/activity/events";
import { DEFAULT_SEED, SPEEDS, SimulatedDay, TIME_SCALE, type Speed } from "@/activity/simulation";
import { ActivityRuntime, type ActionResult, type AppAction } from "@/activity/source";
import { DAY_END, DAY_START, at } from "@/activity/time";
import { botVisits, personPlans, type BotVisit, type PersonPlan } from "./techPlaces";

/**
 * O relógio e o estado do cenário de tecnologia. A tela só lê daqui; quem alimenta é o
 * `ActivityRuntime`, que hoje fala com a simulação e amanhã com os conectores.
 */

interface Launch {
  seed: number;
  start: number;
  speed: Speed;
}

/** `?semente=`, `?hora_sim=HH:MM` e `?velocidade=`: para repetir um dia e para a prova. */
export function launchFrom(search: string): Launch {
  const params = new URLSearchParams(search);
  const seed = Number.parseInt(params.get("semente") ?? "", 10);
  const clock = /^(\d{1,2}):(\d{2})$/.exec(params.get("hora_sim") ?? "");
  const hour = clock ? Number(clock[1]) : NaN;
  const minute = clock ? Number(clock[2]) : NaN;
  const start = clock && hour >= 9 && hour < 18 && minute < 60 ? at(hour, minute) : DAY_START;
  const asked = Number(params.get("velocidade"));
  return { seed: Number.isFinite(seed) ? seed : DEFAULT_SEED, start, speed: (SPEEDS as readonly number[]).includes(asked) ? (asked as Speed) : 1 };
}

export interface Notice {
  id: number;
  text: string;
  tone: "ok" | "erro";
}

interface TechState {
  seed: number;
  state: ActivityState;
  speed: Speed;
  paused: boolean;
  ended: boolean;
  people: PersonPlan[];
  visits: BotVisit[];
  selectedEpicId: string | null;
  /** HU em destaque no épico aberto. */
  highlightStoryId: string | null;
  notices: Notice[];
  tick: (realMs: number) => void;
  setSpeed: (speed: Speed) => void;
  setPaused: (paused: boolean) => void;
  restart: (seed?: number) => void;
  /** Só a prova: leva o relógio adiante até um instante. */
  jumpTo: (instant: number) => void;
  perform: (action: AppAction) => ActionResult;
  selectEpic: (epicId: string | null, storyId?: string | null) => void;
  dismissNotice: (id: number) => void;
}

const launch = typeof window === "undefined" ? { seed: DEFAULT_SEED, start: DAY_START, speed: 1 as Speed } : launchFrom(window.location.search);
let runtime = new ActivityRuntime(new SimulatedDay(launch.seed), launch.start);
let noticeId = 0;

const derived = (state: ActivityState) => ({ state, people: personPlans(state), visits: botVisits(state), ended: state.at >= DAY_END });

export const useTechStore = create<TechState>((set, get) => ({
  seed: launch.seed,
  ...derived(runtime.state),
  speed: launch.speed,
  paused: false,
  selectedEpicId: null,
  highlightStoryId: null,
  notices: [],
  tick: (realMs) => {
    const { paused, speed, ended } = get();
    if (paused || ended) return;
    // Aba escondida volta com um salto grande: no máximo um segundo de relógio por vez.
    const step = Math.min(realMs, 1000) * TIME_SCALE * speed;
    get().jumpTo(Math.min(DAY_END, runtime.state.at + step));
  },
  jumpTo: (instant) => {
    const before = runtime.state;
    runtime.advanceTo(instant);
    if (runtime.state !== before) set(derived(runtime.state));
  },
  setSpeed: (speed) => set({ speed }),
  setPaused: (paused) => set({ paused }),
  restart: (seed) => {
    const next = seed ?? get().seed;
    runtime = new ActivityRuntime(new SimulatedDay(next), DAY_START);
    set({ seed: next, paused: false, selectedEpicId: null, highlightStoryId: null, notices: [], ...derived(runtime.state) });
  },
  perform: (action) => {
    const result = runtime.perform(action);
    noticeId += 1;
    const notice: Notice = { id: noticeId, text: result.ok ? result.note : result.problem, tone: result.ok ? "ok" : "erro" };
    set({ ...derived(runtime.state), notices: [...get().notices.slice(-3), notice] });
    return result;
  },
  selectEpic: (selectedEpicId, highlightStoryId = null) => set({ selectedEpicId, highlightStoryId }),
  dismissNotice: (id) => set({ notices: get().notices.filter((notice) => notice.id !== id) }),
}));

export const currentRuntime = () => runtime;
