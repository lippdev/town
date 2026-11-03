import { describe, expect, it } from "vitest";
import { effectiveQuality, pixelRatioFor } from "@/world/quality";

describe("qualidade gráfica", () => {
  it("densidade de pixels: alta até 1.5, leve em 1, nunca acima da tela", () => {
    expect(pixelRatioFor("alta", 2)).toBe(1.5);
    expect(pixelRatioFor("alta", 1)).toBe(1);
    expect(pixelRatioFor("leve", 2)).toBe(1);
    expect(pixelRatioFor("leve", 0)).toBe(1);
  });

  it("escolha fixa vence; no auto vale o monitor", () => {
    expect(effectiveQuality("alta", "leve")).toBe("alta");
    expect(effectiveQuality("leve", "alta")).toBe("leve");
    expect(effectiveQuality("auto", "leve")).toBe("leve");
  });
});
