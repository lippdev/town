import type { AgentAnimationState } from "@/types/hq";

/**
 * Contrato das fontes de frota (Hermes, OpenMausBot). Toda fonte é somente
 * leitura: ela observa, nunca comanda. A cena, o HUD e o painel consomem
 * apenas este contrato — trocar de fonte não muda nada acima dele.
 */
export type SourceId = "hermes" | "openmausbot";

export type GatewayState = "online" | "degraded" | "offline";

/** Saúde do gateway Hermes, como o proxy de leitura a reporta. */
export interface GatewayHealth {
  /** Serviço de API (`hermes gateway`, porta 8642) alcançável. */
  api: GatewayState;
  /** Dashboard Hermes (`hermes dashboard`) alcançável — fonte da frota. */
  dashboard: GatewayState;
  version?: string;
  /** Mensagem curta e honesta quando algo está fora (ex.: 401 do dashboard). */
  detail?: string;
}

/**
 * Uma sessão real do Hermes, como o dashboard a reporta. Serve para mostrar de
 * onde veio a conversa (cli, telegram, cron…) e o que ela movimentou — nada é
 * inferido além da janela de atividade que o próprio Hermes define.
 */
export interface SessionSnapshot {
  id: string;
  title?: string;
  preview?: string;
  /** Origem como o Hermes grava (`source`): cli, telegram, cron, subagent… */
  source?: string;
  model?: string;
  startedAt?: number;
  lastActiveAt?: number;
  endedAt?: number;
  messageCount?: number;
  toolCallCount?: number;
  costUsd?: number;
  /** Aberta e vista nos últimos 5 min (heurística do Hermes, `is_active`). */
  active: boolean;
}

/**
 * Uma rotina (cron job) do Hermes: quando roda, quando rodou e como terminou.
 * `lastStatus` é o valor cru do Hermes (`ok`, `error`, `delivery_failed`,
 * `cancelled`…); a UI traduz sem inventar estado.
 */
export interface RoutineSnapshot {
  id: string;
  name: string;
  schedule?: string;
  nextAt?: number;
  lastAt?: number;
  lastStatus?: string;
  lastError?: string;
  failureStreak?: number;
  paused?: boolean;
  enabled?: boolean;
}

/**
 * Um bot da frota. `id` é estável entre polls (nome do profile no Hermes),
 * então a cena consegue manter o mesmo personagem no mesmo lugar.
 */
export interface BotSnapshot {
  id: string;
  name: string;
  /** Título curto do bot (bot_title no Hermes), quando existir. */
  title?: string;
  description?: string;
  model?: string;
  provider?: string;
  state: AgentAnimationState;
  /** Texto real vindo da fonte (nunca inventado). */
  activity?: string;
  lastActiveAt?: number;
  sessionCount: number;
  /** Sessões abertas nas últimas 5 min, pela definição do próprio Hermes. */
  activeSessions: number;
  routineCount: number;
  /** Próxima execução agendada de uma rotina, em ms. */
  nextRoutineAt?: number;
  isDefault?: boolean;
  gatewayRunning?: boolean;
  /** Briefing em andamento (diário/semanal/mensal), detectado de sessão cron real. */
  briefing?: { kind: "diario" | "semanal" | "mensal" | "briefing"; title: string; since?: number };
  /** Rotinas do bot, para o HUD mostrar a agenda real (vazio quando não há). */
  routines?: RoutineSnapshot[];
  /** Sessões mais recentes do bot (limitadas); `sessionCount` é o total real. */
  sessions?: SessionSnapshot[];
}

/** Resultado da última leitura de cada endpoint do gateway. */
export interface EndpointDiagnostic {
  ok: boolean;
  status?: number;
  error?: string;
  latencyMs?: number;
  /** Caminho realmente lido, quando difere do padrão (conexão salva: /api/status). */
  path?: string;
}

export type EndpointId = "api" | "profiles" | "sessions" | "jobs";

export interface FleetSnapshot {
  source: SourceId;
  health: GatewayHealth;
  bots: BotSnapshot[];
  fetchedAt: number;
  /**
   * True quando esta frota é a última leitura boa mantida durante uma falha
   * seguida de polls. A UI mostra a idade do dado em vez de fingir frescor.
   */
  stale?: boolean;
  /** Erro da tentativa mais recente, quando houve. */
  errorDetail?: string;
  /** Diagnóstico por endpoint da última leitura (o que respondeu e em quanto). */
  endpoints?: Partial<Record<EndpointId, EndpointDiagnostic>>;
}

/** Fonte de frota: implementações vivem em integrations/<fonte>. */
export interface HQSource {
  readonly id: SourceId;
  readonly label: string;
  start(): void;
  dispose(): void;
}
