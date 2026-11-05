import { describe, expect, it } from "vitest";
import { sharedCrop, solidBounds } from "@/avatar/robot/portraitFrame";

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

describe("sharedCrop", () => {
  const base = { x: 40, y: 60, width: 100, height: 50 };

  it("mantém o retrato parado no centro do recorte", () => {
    const crop = sharedCrop(base, [base, { x: 20, y: 60, width: 100, height: 50 }, { x: 60, y: 40, width: 100, height: 80 }]);
    expect(crop.x + crop.width / 2).toBe(base.x + base.width / 2);
    expect(crop.y + crop.height / 2).toBe(base.y + base.height / 2);
    expect(crop.width).toBe(crop.height);
  });

  it("cabe em todos os quadros", () => {
    const frames = [base, { x: 10, y: 60, width: 100, height: 50 }, { x: 70, y: 20, width: 100, height: 90 }];
    const crop = sharedCrop(base, frames);
    for (const frame of frames) {
      expect(frame.x).toBeGreaterThanOrEqual(crop.x);
      expect(frame.y).toBeGreaterThanOrEqual(crop.y);
      expect(frame.x + frame.width).toBeLessThanOrEqual(crop.x + crop.width);
      expect(frame.y + frame.height).toBeLessThanOrEqual(crop.y + crop.height);
    }
  });

  it("sem outros quadros, o recorte é o quadrado da própria cabeça", () => {
    expect(sharedCrop(base, [base])).toEqual({ x: 40, y: 35, width: 100, height: 100 });
  });
});
