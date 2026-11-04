import { describe, expect, it } from "vitest";
import { VisitPath } from "@/world/office/visitPath";

describe("pegadas nas curvas", () => {
  const path = new VisitPath([[0, 0], [0, 2], [2, 2], [2, 4]]);
  it("fixa posição e orientação do pé de apoio no mundo, enquanto o corpo avança e vira", () => {
    for (const side of ["L", "R"] as const) {
      let supports = 0;
      for (let d = 0; d < path.length - 0.01; d += 0.005) {
        const a = path.foot(d, side), b = path.foot(d + 0.001, side);
        if (!a.planted || !b.planted) continue;
        expect(b).toEqual(a);
        supports++;
      }
      expect(supports).toBeGreaterThan(100);
    }
  });
  it("chega com os dois pés no ponto final, sem salto de retorno à pose parada", () => {
    for (const side of ["L", "R"] as const) {
      const end = path.foot(path.length, side);
      expect(end.x).toBeCloseTo(2);
      expect(end.z).toBeCloseTo(4);
      expect(end.lift).toBeCloseTo(0);
    }
  });
});
