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
  routines?: Array<{ id: string; name: string; schedule?: string; nextAt?: number }>;
}

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
}

/** Fonte de frota: implementações vivem em integrations/<fonte>. */
export interface HQSource {
  readonly id: SourceId;
  readonly label: string;
  start(): void;
  dispose(): void;
}
