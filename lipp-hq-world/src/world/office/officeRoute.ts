import type { FleetSnapshot } from "@/integrations/hq/types";

export type OfficeMode = "live" | "demo";

const OFFICE_QUERY = "escritorio";
const DEMO_QUERY = "modo";

/** `?escritorio=completo` liga no Hermes; com `&modo=demonstracao`, os sete de referência. */
export function parseOfficeRoute(search: string): OfficeMode | null {
  const params = new URLSearchParams(search);
  if (params.get(OFFICE_QUERY) !== "completo") return null;
  return params.get(DEMO_QUERY) === "demonstracao" ? "demo" : "live";
}

export const OFFICE_LIVE_URL = `/?${OFFICE_QUERY}=completo`;
export const OFFICE_DEMO_URL = `${OFFICE_LIVE_URL}&${DEMO_QUERY}=demonstracao`;

/** Cenários a mais da demonstração. Sem `cenario`, a demonstração é a de sempre. */
export type OfficeScenario = "tecnologia";
const SCENARIO_QUERY = "cenario";

/** Só vale na demonstração: a frota real nunca recebe cenário simulado. */
export function parseScenario(search: string): OfficeScenario | null {
  if (parseOfficeRoute(search) !== "demo") return null;
  return new URLSearchParams(search).get(SCENARIO_QUERY) === "tecnologia" ? "tecnologia" : null;
}

/**
 * Lido uma vez, ao carregar: o cenário troca a tabela dos andares, e a tabela é montada na
 * importação. Trocar de cenário é trocar de página.
 */
export const OFFICE_SCENARIO: OfficeScenario | null = typeof window === "undefined" ? null : parseScenario(window.location.search);
export const OFFICE_TECH_URL = `${OFFICE_DEMO_URL}&${SCENARIO_QUERY}=tecnologia`;

export type OfficeConnection =
  | { kind: "connecting" }
  /** Hermes fora: nenhuma frota lida. A cena fica sem corpos e oferece a demonstração. */
  | { kind: "offline"; detail?: string }
  /** Hermes respondeu, mas não há bots. */
  | { kind: "empty"; detail?: string }
  | { kind: "stale"; bots: number; detail?: string }
  | { kind: "live"; bots: number };

/** O que dizer sobre a conexão. `waited` limita a espera para não haver carregamento eterno. */
export function officeConnection(fleet: FleetSnapshot | null, waited: boolean): OfficeConnection {
  if (!fleet) return waited ? { kind: "offline" } : { kind: "connecting" };
  const detail = fleet.errorDetail ?? fleet.health.detail;
  if (fleet.bots.length > 0) {
    return fleet.stale
      ? { kind: "stale", bots: fleet.bots.length, ...(detail ? { detail } : {}) }
      : { kind: "live", bots: fleet.bots.length };
  }
  const reachable = fleet.health.dashboard !== "offline";
  return reachable ? { kind: "empty", ...(detail ? { detail } : {}) } : { kind: "offline", ...(detail ? { detail } : {}) };
}
