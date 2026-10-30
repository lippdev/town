/** Unidades do Three.js. Uma unidade equivale a aproximadamente um metro. */
export type Vector3Tuple = [number, number, number];

/** Eixo de um segmento de parede no plano do piso. */
export type Axis = "x" | "z";

/** Lados de uma sala. `north` é o lado de menor Z, `south` o de maior Z. */
export type RoomSide = "north" | "south" | "east" | "west";

export type RoomKind = "department" | "common";

export interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface DoorDefinition {
  side: RoomSide;
  /** Coordenada do centro da porta ao longo da parede (X para lados norte/sul, Z para leste/oeste). */
  center: number;
  width: number;
}

export interface RoomDefinition {
  id: string;
  name: string;
  kind: RoomKind;
  agentId?: string;
  /** Cor de identificação do departamento. */
  color: string;
  bounds: RoomBounds;
  doors: DoorDefinition[];
  /** Pontos usados para calcular oclusão das paredes, em coordenadas de mundo. */
  samples: Vector3Tuple[];
}

export interface WallDoorGap {
  center: number;
  width: number;
}

/**
 * Segmento de parede independente. Cada parede pertence a no máximo uma sala,
 * porque todo vão entre salas é um corredor: nunca existem duas paredes
 * exatamente sobrepostas.
 */
export interface WallDefinition {
  id: string;
  /** Sala dona da parede; `null` para muros que fecham corredores no perímetro. */
  roomId: string | null;
  /** `x`: a parede corre ao longo de X, com Z fixo. `z`: ao longo de Z, com X fixo. */
  axis: Axis;
  /** Coordenada fixa: Z quando `axis` é "x", X quando `axis` é "z". */
  fixed: number;
  /** Início e fim ao longo do eixo. */
  start: number;
  end: number;
  height: number;
  thickness: number;
  /** Normal horizontal apontando para fora da sala. */
  outward: Vector3Tuple;
  doors: WallDoorGap[];
}

export type AgentAnimationState =
  | "idle"
  | "walking"
  | "working"
  | "waiting"
  | "meeting"
  | "blocked"
  | "offline";

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  responsibility: string;
  roomId: string;
  color: string;
  accent: string;
}

export interface VirtualAgent extends AgentDefinition {
  currentPosition: Vector3Tuple;
  destination?: Vector3Tuple;
  animationState: AgentAnimationState;
  statusSource: "live" | "demo" | "unknown";
  summary?: string;
  lastEventAt?: number;
}

export type HQEventType =
  | "agent.started"
  | "agent.working"
  | "agent.waiting"
  | "agent.blocked"
  | "agent.completed"
  | "agent.failed"
  | "agent.idle"
  | "handoff"
  | "routine.started"
  | "routine.completed";

export interface HQEvent {
  id: string;
  timestamp: number;
  agentId?: string;
  taskId?: string;
  projectId?: string;
  source: "live" | "demo";
  type: HQEventType;
  summary?: string;
  fromAgentId?: string;
  toAgentId?: string;
}

export type DataSource = "live" | "demo";
export type ConnectionStatus = "connecting" | "online" | "offline" | "error";
export type WallMode = "auto" | "low" | "full";

export interface CameraFocusRequest {
  roomId: string;
  nonce: number;
}
