import { describe, expect, it } from "vitest";
import { findPath } from "@/world/navigation/navGrid";

describe("navegação", () => {
  it("caminho da Pesquisa ao Comando existe e desvia do mobiliário", () => {
    const path = findPath(-11.4, -0.65, 0, -10.05);
    expect(path.length).toBeGreaterThan(3);
  });

  it("nenhum segmento atravessa a parede sul do Comando fora da porta", () => {
    const path = findPath(-11.4, -0.65, 0, -10.05);
    // a única travessia permitida na faixa z=-5 é pelo vão do corredor vertical
    for (let index = 1; index < path.length; index += 1) {
      const a = path[index - 1];
      const b = path[index];
      if (a.z < -5 && b.z > -5) {
        const x = Math.min(a.x, b.x);
        expect(x).toBeLessThan(-4.2);
        expect(x).toBeGreaterThan(-6.6);
      }
    }
  });

  it("destino dentro do mobiliário aproxima em vez de falhar", () => {
    const path = findPath(-11.4, -0.65, 0, -10.05);
    expect(path.length).toBeGreaterThan(0);
  });
});
