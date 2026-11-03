import type { HQEvent } from "@/types/hq";

/**
 * Adaptador de leitura do OpenMausBot.
 *
 * Contratos verificados no fork (docs/INTEGRATION.md): snapshot em
 * `GET /api/bots?messages=0` (WireBot), stream em `GET /api/events?screens=off`
 * (ServerFrame), com reconexão por `Last-Event-ID` e sem replay quando o
 * cursor cai fora do buffer.
 *
 * O acesso é sempre via proxy de leitura same-origin: o navegador nunca vê o
 * token do OpenMausBot.
 */
export interface OpenMausBotAdapterOptions {
  /** Base do proxy, ex.: "/hq". Padrão: mesma origem, caminho /api/hq. */
  baseUrl?: string;
  onEvent: (event: HQEvent) => void;
  /** Estados derivados dos frames, por agente. */
  onState: (agentId: string, activity: string | null) => void;
  onStatus: (status: "connecting" | "online" | "offline" | "error") => void;
}

/** IDs canônicos da Lipp HQ no OpenMausBot → IDs da cena. */
const AGENT_NAME_MAP: Record<string, string> = {
  argos: "argos",
  forge: "forge",
  pulse: "pulse",
  echo: "echo",
  scout: "scout",
  atlas: "atlas",
  ink: "ink",
};

interface WireBotLike {
  id: string;
  name: string;
  activity?: string;
  tasks?: Array<{
    busy?: boolean;
    activity?: string;
    waitingForTeammates?: boolean;
    openedBy?: { botId: string };
    closedBy?: unknown;
    archivedAt?: number;
    turnStartedAt?: number;
  }>;
}

export class OpenMausBotAdapter {
  private readonly baseUrl: string;
  private readonly options: OpenMausBotAdapterOptions;
  private eventSource: EventSource | null = null;
  private pollTimer: number | null = null;
  private disposed = false;

  constructor(options: OpenMausBotAdapterOptions) {
    this.options = options;
    this.baseUrl = options.baseUrl ?? "/api/hq";
  }

  start(): void {
    if (this.disposed) return;
    this.options.onStatus("connecting");
    void this.pollSnapshot().then((ok) => {
      if (ok) {
        this.options.onStatus("online");
        this.openStream();
        this.schedulePoll();
      } else {
        this.options.onStatus("error");
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    this.eventSource?.close();
    this.eventSource = null;
    if (this.pollTimer !== null) {
      window.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private schedulePoll(): void {
    if (this.disposed) return;
    this.pollTimer = window.setTimeout(() => {
      void this.pollSnapshot(true).then((ok) => {
        if (ok) this.schedulePoll();
        else this.options.onStatus("offline");
      });
    }, 15000);
  }

  private async pollSnapshot(quiet = false): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/snapshot`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`snapshot ${response.status}`);
      const payload = (await response.json()) as { bots?: WireBotLike[] };
      const bots = payload.bots ?? [];

      for (const bot of bots) {
        const agentId = AGENT_NAME_MAP[bot.name?.toLowerCase() ?? bot.id];
        if (!agentId) continue;
        this.options.onState(agentId, bot.activity ?? null);
      }
      if (!quiet) this.options.onStatus("online");
      return true;
    } catch {
      if (!quiet) this.options.onStatus("offline");
      return false;
    }
  }

  private openStream(): void {
    if (this.disposed) return;
    const source = new EventSource(`${this.baseUrl}/stream?screens=off`);
    this.eventSource = source;

    source.addEventListener("open", () => this.options.onStatus("online"));
    source.addEventListener("error", () => {
      this.options.onStatus("offline");
      source.close();
      this.eventSource = null;
      if (!this.disposed) {
        // reconexão com backoff simples
        window.setTimeout(() => {
          if (!this.disposed) {
            void this.pollSnapshot().then((ok) => {
              if (ok) {
                this.options.onStatus("online");
                this.openStream();
              } else {
                this.options.onStatus("offline");
                this.openStream();
              }
            });
          }
        }, 5000);
      }
    });

    source.addEventListener("message", (message) => {
      try {
        const frame = JSON.parse(message.data) as { kind?: string; bot?: WireBotLike };
        if (frame.kind !== "bot" || !frame.bot) return;
        const agentId = AGENT_NAME_MAP[frame.bot.name?.toLowerCase() ?? frame.bot.id];
        if (!agentId) return;
        this.options.onState(agentId, frame.bot.activity ?? null);
      } catch {
        // frame ignorado: contrato inesperado nunca quebra a cena
      }
    });
  }
}
