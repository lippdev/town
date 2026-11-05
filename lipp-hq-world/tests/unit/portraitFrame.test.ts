import { describe, expect, it } from "vitest";
import { centeredFit, solidBounds } from "@/avatar/robot/portraitFrame";

function image(width: number, height: number, solid: Array<[number, number]>, alpha = 255): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of solid) data[(y * width + x) * 4 + 3] = alpha;
  return data;
}

describe("solidBounds", () => {
  it("acha o menor retângulo com pixels sólidos", () => {
    expect(solidBounds(image(8, 8, [[2, 1], [5, 6]]), 8, 8)).toEqual({ x: 2, y: 1, width: 4, height: 6 });
  });

  it("ignora o halo transparente do antialias", () => {
    expect(solidBounds(image(4, 4, [[1, 1]], 40), 4, 4)).toBeNull();
  });
});

describe("centeredFit", () => {
  it("centra nos dois eixos sem distorcer, respeitando a margem", () => {
    const fit = centeredFit({ width: 100, height: 50 }, 32, 2);
    expect(fit.x).toBeCloseTo(2);
    expect(fit.y).toBeCloseTo(9);
    expect(fit.width).toBeCloseTo(28);
    expect(fit.height).toBeCloseTo(14);
  });

  it("usa a maior dimensão quando o recorte é mais alto", () => {
    const fit = centeredFit({ width: 50, height: 100 }, 32, 2);
    expect(fit.x).toBeCloseTo(9);
    expect(fit.y).toBeCloseTo(2);
    expect(fit.width).toBeCloseTo(14);
    expect(fit.height).toBeCloseTo(28);
  });
});
