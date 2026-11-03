import type { EndpointDiagnostic, EndpointId, FleetSnapshot } from "@/integrations/hq/types";

/**
 * Diagnóstico do gateway: o que o app perguntou, o que respondeu e o que falhou.
 *
 * A ordem importa — API antes do dashboard — porque é o caminho que o app
 * percorre para saber se há frota. Nome do endpoint é o caminho real, não um
 * apelido: quando algo quebra, o usuário precisa poder conferir no Hermes.
 */
export interface EndpointRow {
  id: EndpointId;
  label: string;
  path: string;
  diagnostic?: EndpointDiagnostic;
}

const ENDPOINTS: Array<{ id: EndpointId; label: string; path: string }> = [
  { id: "api", label: "API server", path: "/health" },
  { id: "profiles", label: "Dashboard", path: "/api/profiles" },
  { id: "sessions", label: "Sessões", path: "/api/profiles/sessions" },
  { id: "jobs", label: "Rotinas", path: "/api/cron/jobs" },
];

export function endpointRows(fleet: FleetSnapshot | null): EndpointRow[] {
  return ENDPOINTS.map((endpoint) => ({
    ...endpoint,
    diagnostic: fleet?.endpoints?.[endpoint.id],
  }));
}

export type DiagnosticsSeverity = "ok" | "partial" | "down" | "unknown";

export interface DiagnosticsSummary {
  severity: DiagnosticsSeverity;
  okCount: number;
  total: number;
  /** Primeira falha na ordem de leitura — o que a UI destaca primeiro. */
  firstFailure?: EndpointRow;
}

export function diagnosticsSummary(fleet: FleetSnapshot | null): DiagnosticsSummary {
  const rows = endpointRows(fleet);
  const answered = rows.filter((row) => row.diagnostic !== undefined);
  const okCount = answered.filter((row) => row.diagnostic?.ok).length;
  const firstFailure = rows.find((row) => row.diagnostic && !row.diagnostic.ok);

  if (answered.length === 0) return { severity: "unknown", okCount, total: rows.length };
  if (okCount === answered.length) return { severity: "ok", okCount, total: rows.length };
  if (okCount === 0) return { severity: "down", okCount, total: rows.length, firstFailure };
  return { severity: "partial", okCount, total: rows.length, firstFailure };
}

export function latencyText(diagnostic: EndpointDiagnostic | undefined): string {
  if (!diagnostic) return "não lido";
  if (!diagnostic.ok) return diagnostic.status ? `HTTP ${diagnostic.status}` : "sem resposta";
  const ms = diagnostic.latencyMs;
  if (ms === undefined) return "ok";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}
