import type { FleetSnapshot, HQSource } from "@/integrations/hq/types";
import { botsFromHermes, type HermesCronJob, type HermesProfile, type HermesSessionRow } from "@/integrations/hermes/botsFromHermes";
import { nextDelayMs, snapshotOnFailure } from "@/integrations/hermes/resilience";
import type { HQEvent } from "@/types/hq";

/**
 * Fonte de frota do Hermes (somente leitura), via proxy same-origin `/api/hq`.
 *
 * Comportamento de rede, para um app que fica aberto o dia inteiro:
 * - backoff exponencial com teto quando o gateway falha (sem martelar);
 * - a última leitura boa é mantida e marcada como atrasada em vez de a tela
 *   piscar para vazio;
 * - polling pausa com a aba oculta e volta na hora ao reaparecer;
 * - requisição em voo é cancelada no dispose.
 *
 * Nada é inventado: eventos só existem quando um bot muda de estado ou de
 * atividade de fato.
 */

export interface HermesAdapterOptions {
  /** Base do proxy no navegador. Padrão: /api/hq. */
  baseUrl?: string;
  pollMs?: number;
  onSnapshot: (snapshot: FleetSnapshot) => void;
  onEvent: (event: HQEvent) => void;
  onError?: (message: string) => void;
}

interface ProxyPayload {
  configured?: boolean;
  health?: {
    api?: "online" | "degraded" | "offline";
    dashboard?: "online" | "degraded" | "offline";
    version?: string;
    detail?: string;
  };
  profiles?: HermesProfile[];
  sessions?: HermesSessionRow[];
  jobs?: HermesCronJob[];
  blocks?: Record<
    string,
    { ok: boolean; status?: number; error?: string; ms?: number; path?: string; cause?: string; action?: string }
  >;
  fetchedAt?: number;
  error?: string;
}

/** Converte os `blocks` do proxy no diagnóstico tipado que o HUD mostra. */
function endpointDiagnostics(
  blocks: ProxyPayload["blocks"],
): FleetSnapshot["endpoints"] {
  if (!blocks) return undefined;
  const diagnostics: NonNullable<FleetSnapshot["endpoints"]> = {};
  for (const id of ["api", "profiles", "sessions", "jobs"] as const) {
    const block = blocks[id];
    if (!block) continue;
    diagnostics[id] = {
      ok: block.ok,
      status: block.status,
      error: block.error,
      latencyMs: block.ms,
      path: block.path,
      cause: block.cause,
      action: block.action,
    };
  }
  return diagnostics;
}

export class HermesAdapter implements HQSource {
  readonly id = "hermes" as const;
  readonly label = "Hermes";

  private readonly baseUrl: string;
  private readonly pollMs: number;
  private readonly options: HermesAdapterOptions;
  private timer: number | null = null;
  private disposed = false;
  private inFlight: AbortController | null = null;
  private previous: FleetSnapshot | null = null;
  private lastGood: FleetSnapshot | null = null;
  private failures = 0;
  private eventSeq = 0;
  private paused = false;

  constructor(options: HermesAdapterOptions) {
    this.options = options;
    this.baseUrl = (options.baseUrl ?? "/api/hq").replace(/\/+$/, "");
    this.pollMs = options.pollMs ?? 4000;
  }

  start(): void {
    if (this.disposed) return;
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibility);
      this.paused = document.visibilityState === "hidden";
    }
    if (!this.paused) void this.poll();
  }

  /** Força uma leitura agora (botão "tentar de novo"). */
  refresh(): void {
    if (this.disposed) return;
    this.failures = 0;
    this.clearTimer();
    void this.poll();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.inFlight?.abort();
    this.inFlight = null;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibility);
    }
  }

  private readonly onVisibility = () => {
    if (this.disposed) return;
    const hidden = document.visibilityState === "hidden";
    this.paused = hidden;
    if (hidden) {
      this.clearTimer();
      return;
    }
    // voltou a aparecer: atualiza imediatamente, sem esperar o ciclo
    this.clearTimer();
    void this.poll();
  };

  private clearTimer(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(delayMs: number): void {
    if (this.disposed || this.paused) return;
    this.clearTimer();
    this.timer = window.setTimeout(() => {
      void this.poll();
    }, delayMs);
  }

  private async poll(): Promise<void> {
    if (this.disposed || this.inFlight) return;
    const controller = new AbortController();
    this.inFlight = controller;

    try {
      const response = await fetch(`${this.baseUrl}/hermes/snapshot`, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`proxy HTTP ${response.status}`);
      const payload = (await response.json()) as ProxyPayload;

      const snapshot: FleetSnapshot = {
        source: "hermes",
        fetchedAt: payload.fetchedAt ?? Date.now(),
        health: {
          api: payload.health?.api ?? "offline",
          dashboard: payload.health?.dashboard ?? "offline",
          version: payload.health?.version,
          detail: payload.health?.detail,
        },
        bots: botsFromHermes({
          health: {
            api: payload.health?.api ?? "offline",
            dashboard: payload.health?.dashboard ?? "offline",
            version: payload.health?.version,
            detail: payload.health?.detail,
          },
          profiles: payload.profiles ?? [],
          sessions: payload.sessions ?? [],
          jobs: payload.jobs ?? [],
        }),
        endpoints: endpointDiagnostics(payload.blocks),
      };

      // Frota vazia com o gateway fora não significa "não há bots": significa
      // que não sabemos. Mantém a última leitura boa, marcada como atrasada.
      const unknownFleet = snapshot.bots.length === 0 && snapshot.health.dashboard === "offline";
      if (unknownFleet && this.lastGood && this.lastGood.bots.length > 0) {
        this.failures += 1;
        const message = snapshot.health.detail ?? "dashboard do Hermes fora do ar";
        this.options.onError?.(message);
        this.options.onSnapshot(snapshotOnFailure(this.lastGood, message, Date.now()));
        return;
      }

      this.emitTransitions(snapshot);
      this.previous = snapshot;
      this.lastGood = snapshot;
      this.failures = 0;
      if (!this.disposed) this.options.onSnapshot(snapshot);
    } catch (error) {
      if (this.disposed || controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      this.failures += 1;
      this.options.onError?.(message);
      const stale = snapshotOnFailure(this.lastGood, message, Date.now());
      if (!this.disposed) this.options.onSnapshot(stale);
    } finally {
      if (this.inFlight === controller) this.inFlight = null;
      this.schedule(nextDelayMs(this.failures, this.pollMs));
    }
  }

  /** Emite eventos apenas para transições reais observadas entre dois polls. */
  private emitTransitions(next: FleetSnapshot): void {
    const previous = this.previous;
    if (!previous) {
      // Primeira leitura: semeia o feed com a atividade real que cada bot já
      // reporta agora. É dado do Hermes, não evento inventado.
      const timestamp = Date.now();
      for (const bot of next.bots) {
        if (!bot.activity) continue;
        this.eventSeq += 1;
        this.options.onEvent({
          id: `hermes-${bot.id}-${timestamp}-${this.eventSeq}`,
          timestamp,
          agentId: bot.id,
          source: "live",
          type: bot.state === "working" ? "agent.working" : "agent.idle",
          summary: `${bot.name}: ${bot.activity}`,
        });
      }
      return;
    }

    const before = new Map(previous.bots.map((bot) => [bot.id, bot]));
    const timestamp = Date.now();

    for (const bot of next.bots) {
      const old = before.get(bot.id);
      if (!old) continue;
      if (old.state === bot.state && old.activity === bot.activity) continue;

      const type =
        bot.state === "working"
          ? "agent.working"
          : bot.state === "waiting"
            ? "agent.waiting"
            : bot.state === "offline"
              ? "agent.failed"
              : "agent.idle";

      this.eventSeq += 1;
      this.options.onEvent({
        id: `hermes-${bot.id}-${timestamp}-${this.eventSeq}`,
        timestamp,
        agentId: bot.id,
        source: "live",
        type,
        summary: bot.activity
          ? `${bot.name}: ${bot.activity}`
          : `${bot.name} está ${bot.state === "working" ? "trabalhando" : "ocioso"}`,
      });
    }
  }
}
