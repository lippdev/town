import { describe, expect, it } from "vitest";
import {
  MAX_BACKOFF_MS,
  MIN_BACKOFF_MS,
  nextDelayMs,
  snapshotOnFailure,
  staleSeconds,
} from "@/integrations/hermes/resilience";
import { ageLabel, freshnessBadge } from "@/components/hud/fleetView";
import type { FleetSnapshot } from "@/integrations/hq/types";

const good: FleetSnapshot = {
  source: "hermes",
  fetchedAt: 1_000_000,
  health: { api: "online", dashboard: "online", version: "1.2.3" },
  bots: [{ id: "pulse", name: "Pulse", state: "working", sessionCount: 1, activeSessions: 1, routineCount: 0 }],
};

describe("resiliência da leitura do Hermes", () => {
  it("sem falhas usa o intervalo base", () => {
    expect(nextDelayMs(0, 4000)).toBe(4000);
    expect(nextDelayMs(-1, 4000)).toBe(4000);
  });

  it("dobra a cada falha até o teto", () => {
    expect(nextDelayMs(1, 4000)).toBe(8000);
    expect(nextDelayMs(2, 4000)).toBe(16_000);
    expect(nextDelayMs(3, 4000)).toBe(MAX_BACKOFF_MS);
    expect(nextDelayMs(9, 4000)).toBe(MAX_BACKOFF_MS);
    expect(nextDelayMs(1, 1000)).toBe(MIN_BACKOFF_MS);
  });

  it("mantém a última frota boa e marca como atrasada quando o poll falha", () => {
    const stale = snapshotOnFailure(good, "proxy HTTP 503", 1_060_000);
    expect(stale.bots).toHaveLength(1);
    expect(stale.stale).toBe(true);
    expect(stale.errorDetail).toBe("proxy HTTP 503");
    expect(stale.fetchedAt).toBe(good.fetchedAt);
    expect(staleSeconds(stale, 1_120_000)).toBe(120);
  });

  it("sem leitura anterior, devolve frota vazia e offline (nunca inventa bots)", () => {
    const empty = snapshotOnFailure(null, "ECONNREFUSED", 1_060_000);
    expect(empty.bots).toEqual([]);
    expect(empty.health.api).toBe("offline");
    expect(empty.health.dashboard).toBe("offline");
    expect(empty.health.detail).toBe("ECONNREFUSED");
  });

  it("idade do dado nunca diz 'agora atrás'", () => {
    const now = 1_000_000;
    expect(ageLabel(now - 5_000, now)).toBe("5 s");
    expect(ageLabel(now - 5 * 60_000, now)).toBe("5 min");
    expect(ageLabel(now - 3 * 3_600_000, now)).toBe("3 h");
    expect(ageLabel(now - 3 * 86_400_000, now)).toBe("3 d");
    expect(ageLabel(undefined, now)).toBe("desconhecida");
  });

  it("selo de frescor: ao vivo não mostra selo, atrasado mostra idade, ambos offline mostra sem sinal", () => {
    expect(freshnessBadge(good, good.fetchedAt)).toBeNull();
    const stale = freshnessBadge({ ...good, stale: true }, good.fetchedAt + 45_000);
    expect(stale).toEqual({ tone: "stale", label: "atrasado 45s" });
    const down = freshnessBadge(
      { ...good, health: { api: "offline", dashboard: "offline" } },
      good.fetchedAt,
    );
    expect(down?.tone).toBe("down");
  });
});
