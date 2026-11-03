import { create } from "zustand";
import type { FleetSnapshot } from "@/integrations/hq/types";
import { pushSample, sampleFromBots, type FleetSample } from "@/integrations/hermes/fleetHistory";
import type { AgentAnimationState, ConnectionStatus, DataSource, HQEvent, WallMode } from "@/types/hq";
import {
  ACCESSORIES,
  HAIR_STYLES,
  randomLookFor,
  type CharacterOverride,
} from "@/world/characters/appearance";

export interface CameraView {
  azimuthDeg: number;
  elevationDeg: number;
  distance: number;
  target: [number, number, number];
}

export interface CameraCommand {
  kind: "focus" | "reset";
  roomId?: string;
  nonce: number;
  /** true: aplica sem animação (usado pelo harness de QA). */
  instant?: boolean;
}

interface HQState {
  wallMode: WallMode;
  dataSource: DataSource;
  connectionStatus: ConnectionStatus;
  selectedRoomId: string | null;
  selectedAgentId: string | null;
  hoveredRoomId: string | null;
  setHoveredRoom: (roomId: string | null) => void;
  events: HQEvent[];
  cameraCommand: CameraCommand | null;
  cameraView: CameraView | null;
  demoPaused: boolean;
  setDemoPaused: (paused: boolean) => void;
  demoRestart: number;
  agentStates: Record<string, AgentAnimationState>;
  setAgentState: (agentId: string, state: AgentAnimationState, summary?: string) => void;
  setWallMode: (mode: WallMode) => void;
  selectRoom: (roomId: string | null) => void;
  selectAgent: (agentId: string | null) => void;
  clearSelection: () => void;
  focusRoom: (roomId: string, options?: { instant?: boolean }) => void;
  resetCamera: (options?: { instant?: boolean }) => void;
  pushEvent: (event: HQEvent) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setDataSource: (source: DataSource) => void;
  /** Remove eventos de simulação ao entrar ao vivo — nunca misturar os dois no feed. */
  dropDemoEvents: () => void;
  /** Aparência personalizada por agente: peças sobrepostas ao preset padrão. */
  agentLooks: Record<string, CharacterOverride>;
  chooseAgentPreset: (agentId: string, presetId: string | null) => void;
  updateAgentLook: (agentId: string, patch: CharacterOverride) => void;
  randomizeAgentLook: (agentId: string) => void;
  resetAgentLook: (agentId: string) => void;
  /** Última frota lida do Hermes (null em Demo ou antes do primeiro poll). */
  fleet: FleetSnapshot | null;
  setFleet: (fleet: FleetSnapshot | null) => void;
  /** Amostras reais da frota, para a sparkline do resumo. */
  fleetHistory: FleetSample[];
  setFleetSnapshot: (fleet: FleetSnapshot | null) => void;
  /** Bot selecionado no painel sai da frota, não da lista fixa. */
  selectedBotId: string | null;
  selectBot: (botId: string | null) => void;
  /** Força uma leitura imediata do gateway (botão "tentar de novo"). */
  gatewayRefresh: (() => void) | null;
  setGatewayRefresh: (refresh: (() => void) | null) => void;
}

const MAX_EVENTS = 60;

/**
 * Persistência local da aparência por agente (UX local, V0).
 * v2 guarda peças soltas; o v1 guardava só o id do preset e é migrado na
 * primeira leitura para ninguém perder o personagem já escolhido.
 */
const LOOK_STORAGE_KEY = "lipp-hq-world:agent-looks:v2";
const LEGACY_PRESET_KEY = "lipp-hq-world:agent-presets:v1";

function sanitizeLook(raw: unknown): CharacterOverride | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const look: CharacterOverride = {};
  if (typeof value.presetId === "string") look.presetId = value.presetId;
  if (typeof value.skin === "string") look.skin = value.skin;
  if (typeof value.hair === "string") look.hair = value.hair;
  if (typeof value.shirt === "string") look.shirt = value.shirt;
  if (typeof value.pants === "string") look.pants = value.pants;
  if (typeof value.shoes === "string") look.shoes = value.shoes;
  if (typeof value.hairStyle === "string" && HAIR_STYLES.some((style) => style.id === value.hairStyle)) {
    look.hairStyle = value.hairStyle as CharacterOverride["hairStyle"];
  }
  if (typeof value.accessory === "string" && ACCESSORIES.some((item) => item.id === value.accessory)) {
    look.accessory = value.accessory as CharacterOverride["accessory"];
  }
  if (typeof value.height === "number") look.height = value.height;
  return look;
}

function loadAgentLooks(): Record<string, CharacterOverride> {
  try {
    const raw = window.localStorage.getItem(LOOK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== "object" || parsed === null) return {};
      const looks: Record<string, CharacterOverride> = {};
      for (const [agentId, value] of Object.entries(parsed as Record<string, unknown>)) {
        const look = sanitizeLook(value);
        if (look) looks[agentId] = look;
      }
      return looks;
    }
    const legacy = window.localStorage.getItem(LEGACY_PRESET_KEY);
    if (!legacy) return {};
    const parsedLegacy = JSON.parse(legacy) as unknown;
    if (typeof parsedLegacy !== "object" || parsedLegacy === null) return {};
    return Object.fromEntries(
      Object.entries(parsedLegacy as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([agentId, presetId]) => [agentId, { presetId }]),
    );
  } catch {
    return {};
  }
}

function saveAgentLooks(looks: Record<string, CharacterOverride>): void {
  try {
    window.localStorage.setItem(LOOK_STORAGE_KEY, JSON.stringify(looks));
  } catch {
    // sem localStorage (modo privado etc.): a escolha vale só para a sessão
  }
}

export const useHQStore = create<HQState>((set) => ({
  wallMode: "auto",
  dataSource: "demo",
  connectionStatus: "offline",
  selectedRoomId: null,
  selectedAgentId: null,
  hoveredRoomId: null,
  setHoveredRoom: (hoveredRoomId) => set({ hoveredRoomId }),
  events: [],
  cameraCommand: null,
  cameraView: null,
  agentStates: {},
  demoPaused: false,
  setDemoPaused: (demoPaused) => set({ demoPaused }),
  demoRestart: 0,

  setAgentState: (agentId, agentState, summary) =>
    set((state) => {
      const event: HQEvent | null = summary
        ? {
            id: `${agentId}-${agentState}-${Date.now()}`,
            timestamp: Date.now(),
            agentId,
            source: state.dataSource,
            type: agentState === "working" ? "agent.working" : agentState === "idle" ? "agent.idle" : "agent.started",
            summary,
          }
        : null;
      return {
        agentStates: { ...state.agentStates, [agentId]: agentState },
        events: event ? [event, ...state.events].slice(0, MAX_EVENTS) : state.events,
      };
    }),

  setWallMode: (wallMode) => set({ wallMode }),
  selectRoom: (selectedRoomId) => set({ selectedRoomId, selectedAgentId: null }),
  selectAgent: (selectedAgentId) => set({ selectedAgentId }),
  clearSelection: () => set({ selectedRoomId: null, selectedAgentId: null }),
  focusRoom: (roomId, options) =>
    set({
      selectedRoomId: roomId,
      selectedAgentId: null,
      cameraCommand: { kind: "focus", roomId, nonce: Date.now(), ...options },
    }),
  resetCamera: (options) =>
    set({ cameraCommand: { kind: "reset", nonce: Date.now(), ...options } }),
  pushEvent: (event) =>
    set((state) => ({ events: [event, ...state.events].slice(0, MAX_EVENTS) })),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setDataSource: (dataSource) => set({ dataSource }),
  dropDemoEvents: () =>
    set((state) => {
      const kept = state.events.filter((event) => event.source !== "demo");
      return kept.length === state.events.length ? {} : { events: kept };
    }),
  fleet: null,
  setFleet: (fleet) => set({ fleet }),
  fleetHistory: [],
  setFleetSnapshot: (fleet) =>
    set((state) => {
      if (!fleet) return { fleet: null, fleetHistory: [] };
      // só leitura fresca entra no histórico; leitura atrasada repetiria o passado
      if (fleet.stale) return { fleet };
      return { fleet, fleetHistory: pushSample(state.fleetHistory, sampleFromBots(fleet.bots, fleet.fetchedAt)) };
    }),
  selectedBotId: null,
  selectBot: (selectedBotId) => set({ selectedBotId, selectedAgentId: selectedBotId }),
  gatewayRefresh: null,
  setGatewayRefresh: (gatewayRefresh) => set({ gatewayRefresh }),
  agentLooks: loadAgentLooks(),
  chooseAgentPreset: (agentId, presetId) =>
    set((state) => {
      const next = { ...state.agentLooks };
      if (presetId === null) delete next[agentId];
      else next[agentId] = { presetId };
      saveAgentLooks(next);
      return { agentLooks: next };
    }),
  updateAgentLook: (agentId, patch) =>
    set((state) => {
      const next = { ...state.agentLooks, [agentId]: { ...state.agentLooks[agentId], ...patch } };
      saveAgentLooks(next);
      return { agentLooks: next };
    }),
  randomizeAgentLook: (agentId) =>
    set((state) => {
      const next = { ...state.agentLooks, [agentId]: randomLookFor(agentId, Date.now()) };
      saveAgentLooks(next);
      return { agentLooks: next };
    }),
  resetAgentLook: (agentId) =>
    set((state) => {
      const next = { ...state.agentLooks };
      delete next[agentId];
      saveAgentLooks(next);
      return { agentLooks: next };
    }),
}));
