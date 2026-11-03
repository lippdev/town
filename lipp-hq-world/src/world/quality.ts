/**
 * Qualidade gráfica. "auto" começa em alta e cai para leve quando o
 * PerformanceMonitor vê quadros lentos; "alta" e "leve" são escolhas fixas.
 *
 * O que muda entre as duas (medido numa tela retina 1728×1000):
 * - alta: dpr até 1.5, oclusão de ambiente, bloom e vinheta;
 * - leve: dpr 1 e sem pós-processamento (o tone mapping vai para o renderer).
 * A densidade de pixels e o pós-processamento eram quase todo o custo: com
 * dpr 2 e MSAA 4 no composer, a cena rodava a 8 fps.
 */
export type GraphicsMode = "auto" | "alta" | "leve";
export type GraphicsQuality = "alta" | "leve";

export const GRAPHICS_MODES: GraphicsMode[] = ["auto", "alta", "leve"];
export const GRAPHICS_LABEL: Record<GraphicsMode, string> = { auto: "Auto", alta: "Alta", leve: "Leve" };

const STORAGE_KEY = "hq.graphics";

/** Teto de densidade de pixels por qualidade; nunca acima do da tela. */
export function pixelRatioFor(quality: GraphicsQuality, deviceRatio: number): number {
  const cap = quality === "alta" ? 1.5 : 1;
  return Math.max(1, Math.min(deviceRatio || 1, cap));
}

/** Qualidade efetiva: a escolha fixa vence; no auto, vale o que o monitor decidiu. */
export function effectiveQuality(mode: GraphicsMode, auto: GraphicsQuality): GraphicsQuality {
  return mode === "auto" ? auto : mode;
}

export function loadGraphicsMode(): GraphicsMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "alta" || raw === "leve" || raw === "auto" ? raw : "auto";
  } catch {
    return "auto";
  }
}

export function saveGraphicsMode(mode: GraphicsMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // sem localStorage: a escolha vale só para a sessão
  }
}
