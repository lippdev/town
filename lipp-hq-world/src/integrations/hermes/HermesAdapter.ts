import type { FleetSnapshot, HQSource } from "@/integrations/hq/types";
import { botsFromHermes, type HermesCronJob, type HermesProfile, type HermesSessionRow } from "@/integrations/hermes/botsFromHermes";
import type { HQEvent } from "@/types/hq";

/**
 * Fonte de frota do Hermes (somente leitura), via proxy same-origin `/api/hq`.
 *
 * O adaptador só lê: snapshot HTTP a cada ciclo. Nenhuma escrita, nenhum
 * comando. Eventos do feed são derivados de mudanças reais de atividade
 * (título de sessão, estado do bot, rotina agendada) — nada é inventado, e
 * quando não há mudança nenhum evento é emitido.
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
  blocks?: Record<string, { ok: boolean; error?: string }>;
  fetchedAt?: number;
  error?: string;
}

export class HermesAdapter implements HQSource {
  readonly id = "hermes" as const;
  readonly label = "Hermes";

  private readonly baseUrl: string;
  private readonly pollMs: number;
  private readonly options: HermesAdapterOptions;
  private timer: number | null = null;
  private disposed = false;
  private inFlight = false;
  private previous: FleetSnapshot | null = null;
  private eventSeq = 0;

  constructor(options: HermesAdapterOptions) {
    this.options = options;
    this.baseUrl = (options.baseUrl ?? "/api/hq").replace(/\/+$/, "");
    this.pollMs = options.pollMs ?? 4000;
  }

  start(): void {
    if (this.disposed) return;
    void this.poll();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    if (this.disposed) return;
    this.timer = window.setTimeout(() => {
      void this.poll();
    }, this.pollMs);
  }

  private async poll(): Promise<void> {
    if (this.disposed || this.inFlight) return;
    this.inFlight = true;
    try {
      const response = await fetch(`${this.baseUrl}/hermes/snapshot`, {
        signal: AbortSignal.timeout(8000),
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
      };

      this.emitTransitions(snapshot);
      this.previous = snapshot;
      if (!this.disposed) this.options.onSnapshot(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.onError?.(message);
      const offline: FleetSnapshot = {
        source: "hermes",
        fetchedAt: Date.now(),
        health: { api: "offline", dashboard: "offline", detail: message },
        bots: [],
      };
      if (!this.disposed) this.options.onSnapshot(offline);
    } finally {
      this.inFlight = false;
      this.schedule();
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
