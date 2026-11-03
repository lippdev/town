import { describe, expect, it } from "vitest";
import { diagnosticsSummary, endpointRows, latencyText } from "@/components/hud/diagnostics";
import type { FleetSnapshot } from "@/integrations/hq/types";

const fleet = (endpoints: FleetSnapshot["endpoints"]): FleetSnapshot => ({
  source: "hermes",
  fetchedAt: 0,
  health: { api: "online", dashboard: "online" },
  bots: [],
  endpoints,
});

describe("diagnóstico do gateway", () => {
  it("lista os endpoints na ordem em que o app pergunta", () => {
    expect(endpointRows(null).map((row) => row.id)).toEqual(["api", "profiles", "sessions", "jobs"]);
    expect(endpointRows(null)[1].path).toBe("/api/profiles");
  });

  it("tudo respondendo é ok", () => {
    const summary = diagnosticsSummary(
      fleet({
        api: { ok: true, status: 200, latencyMs: 12 },
        profiles: { ok: true, status: 200, latencyMs: 40 },
        sessions: { ok: true, status: 200, latencyMs: 55 },
        jobs: { ok: true, status: 200, latencyMs: 31 },
      }),
    );
    expect(summary).toMatchObject({ severity: "ok", okCount: 4, total: 4 });
    expect(summary.firstFailure).toBeUndefined();
  });

  it("dashboard fora com API viva é parcial, e a falha aponta o endpoint", () => {
    const summary = diagnosticsSummary(
      fleet({
        api: { ok: true, status: 200, latencyMs: 10 },
        profiles: { ok: false, status: 401, error: "dashboard exigiu autenticação (HTTP 401)", latencyMs: 8 },
      }),
    );
    expect(summary.severity).toBe("partial");
    expect(summary.okCount).toBe(1);
    expect(summary.firstFailure?.id).toBe("profiles");
  });

  it("nenhum endpoint respondendo é down, e nada lido é unknown", () => {
    expect(diagnosticsSummary(fleet({ api: { ok: false }, profiles: { ok: false } })).severity).toBe("down");
    expect(diagnosticsSummary(null).severity).toBe("unknown");
    expect(diagnosticsSummary(fleet({})).severity).toBe("unknown");
  });

  it("latência é texto honesto, incluindo o caso de falha", () => {
    expect(latencyText(undefined)).toBe("não lido");
    expect(latencyText({ ok: false, status: 401 })).toBe("HTTP 401");
    expect(latencyText({ ok: false })).toBe("sem resposta");
    expect(latencyText({ ok: true, latencyMs: 87 })).toBe("87 ms");
    expect(latencyText({ ok: true, latencyMs: 1500 })).toBe("1.5 s");
    expect(latencyText({ ok: true })).toBe("ok");
  });
});
