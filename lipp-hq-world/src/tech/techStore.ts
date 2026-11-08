import { create } from "zustand";
import type { ActivityState } from "@/activity/events";
import { DEFAULT_SEED, SPEEDS, SimulatedDay, TIME_SCALE, type Speed } from "@/activity/simulation";
import { ActivityRuntime, type ActionResult, type AppAction } from "@/activity/source";
import { DAY_END, DAY_START, at } from "@/activity/time";
import { useHQStore } from "@/state/useHQStore";
import { escapeLayers, useOfficeStore } from "@/world/office/officeStore";
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

/** As três maneiras de olhar o mesmo dia: o andar 3D, a árvore do Notion e o painel. */
export const TECH_VIEWS = ["predio", "projetos", "painel"] as const;
export type TechView = (typeof TECH_VIEWS)[number];
export const TECH_VIEW_LABEL: Record<TechView, string> = { predio: "Prédio", projetos: "Projetos", painel: "Painel" };
const VIEW_QUERY = "visao";

/** `?visao=predio|projetos|painel`: abre direto numa visão; qualquer outro valor é o prédio. */
export function viewFrom(search: string): TechView {
  const asked = new URLSearchParams(search).get(VIEW_QUERY);
  return (TECH_VIEWS as readonly string[]).includes(asked ?? "") ? (asked as TechView) : "predio";
}

/** A URL acompanha a visão, para recarregar ou mandar o link e cair no mesmo lugar. */
export function searchWithView(search: string, view: TechView): string {
  const params = new URLSearchParams(search);
  if (view === "predio") params.delete(VIEW_QUERY);
  else params.set(VIEW_QUERY, view);
  const next = params.toString();
  return next ? `?${next}` : "";
}

export interface Notice {
  id: number;
  text: string;
  tone: "ok" | "erro";
}

/** O que a tela lembra do último pedido de cada ação: a hora e o que o runtime respondeu. */
export interface ActionRecord {
  at: number;
  ok: boolean;
  text: string;
}

/** Uma chave por ação e alvo: "cobrar:HU-27", "pedir_bot:resumir_pr:pr-142", "vincular_github:email". */
export function actionKey(action: AppAction): string {
  switch (action.kind) {
    case "cobrar":
    case "reatribuir":
      return `${action.kind}:${action.storyId}`;
    case "pedir_bot":
      return `pedir_bot:${action.task}:${action.target.kind === "pr" ? `pr-${action.target.number}` : action.target.kind === "story" ? action.target.id : action.target.kind}`;
    case "vincular_github":
      return `vincular_github:${action.email.trim().toLocaleLowerCase()}`;
  }
}

/** O cadastro aberto, e em quem: quem chega pelo aviso da pessoa já cai no vínculo dela. */
export interface RegistryState {
  focus: string | null;
}

interface TechState {
  seed: number;
  state: ActivityState;
  speed: Speed;
  paused: boolean;
  ended: boolean;
  people: PersonPlan[];
  visits: BotVisit[];
  /** Prédio, Projetos ou Painel: todas leem o mesmo `state`. */
  view: TechView;
  selectedEpicId: string | null;
  /** HU em destaque no épico aberto. */
  highlightStoryId: string | null;
  notices: Notice[];
  /** O painel de ação aberto (um só na tela): `${lugar}|${actionKey}`. */
  openAction: string | null;
  /** Último resultado de cada ação, por `actionKey`. */
  records: Record<string, ActionRecord>;
  /** A gaveta do cadastro do squad; nula quando fechada. */
  registry: RegistryState | null;
  tick: (realMs: number) => void;
  setSpeed: (speed: Speed) => void;
  setPaused: (paused: boolean) => void;
  restart: (seed?: number) => void;
  /** Só a prova: leva o relógio adiante até um instante. */
  jumpTo: (instant: number) => void;
  perform: (action: AppAction) => ActionResult;
  selectEpic: (epicId: string | null, storyId?: string | null) => void;
  setView: (view: TechView) => void;
  dismissNotice: (id: number) => void;
  setOpenAction: (key: string | null) => void;
  openRegistry: (focus?: string | null) => void;
  closeRegistry: () => void;
}

const launch = typeof window === "undefined" ? { seed: DEFAULT_SEED, start: DAY_START, speed: 1 as Speed } : launchFrom(window.location.search);
const firstView: TechView = typeof window === "undefined" ? "predio" : viewFrom(window.location.search);
let runtime = new ActivityRuntime(new SimulatedDay(launch.seed), launch.start);
let noticeId = 0;

const derived = (state: ActivityState) => ({ state, people: personPlans(state), visits: botVisits(state), ended: state.at >= DAY_END });

export const useTechStore = create<TechState>((set, get) => ({
  seed: launch.seed,
  ...derived(runtime.state),
  speed: launch.speed,
  paused: false,
  view: firstView,
  selectedEpicId: null,
  highlightStoryId: null,
  notices: [],
  openAction: null,
  records: {},
  registry: null,
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
    set({ seed: next, paused: false, selectedEpicId: null, highlightStoryId: null, notices: [], openAction: null, records: {}, registry: null, ...derived(runtime.state) });
  },
  perform: (action) => {
    const result = runtime.perform(action);
    noticeId += 1;
    const notice: Notice = { id: noticeId, text: result.ok ? result.note : result.problem, tone: result.ok ? "ok" : "erro" };
    const record: ActionRecord = { at: runtime.state.at, ok: result.ok, text: notice.text };
    set({ ...derived(runtime.state), notices: [...get().notices.slice(-3), notice], records: { ...get().records, [actionKey(action)]: record } });
    return result;
  },
  // Épico, pessoa, bot e cadastro dividem a gaveta: abrir um fecha os outros.
  selectEpic: (selectedEpicId, highlightStoryId = null) => set(selectedEpicId ? { selectedEpicId, highlightStoryId, registry: null, openAction: null } : { selectedEpicId, highlightStoryId }),
  setView: (view) => {
    if (view === get().view) return;
    set({ view });
    if (typeof window === "undefined") return;
    const search = searchWithView(window.location.search, view);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
  },
  dismissNotice: (id) => set({ notices: get().notices.filter((notice) => notice.id !== id) }),
  setOpenAction: (openAction) => set({ openAction }),
  openRegistry: (focus = null) => {
    useHQStore.getState().clearSelection();
    useOfficeStore.getState().clearHuman();
    set({ registry: { focus }, selectedEpicId: null, highlightStoryId: null, openAction: null });
  },
  closeRegistry: () => set({ registry: null }),
}));

/**
 * O Esc fecha de dentro para fora: primeiro o painel de uma ação, depois o cadastro. Registrado ao
 * carregar o módulo, antes de qualquer gaveta montar, para vir antes delas em `escapeLayers`.
 */
export function closeTechOverlay(): boolean {
  const store = useTechStore.getState();
  if (store.openAction) {
    store.setOpenAction(null);
    return true;
  }
  if (store.registry) {
    store.closeRegistry();
    return true;
  }
  return false;
}
escapeLayers.add(closeTechOverlay);

export const currentRuntime = () => runtime;
