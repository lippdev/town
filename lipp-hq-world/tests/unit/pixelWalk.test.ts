import { describe, expect, it } from "vitest";
import { advancePixelWalk, fitScale, initialPixelWalk, PIXEL_ROUTE, pixelPose } from "@/pixel-office/pixelWalk";

describe("passeio em pixel art", () => {
  it("começa parado na primeira parada", () => {
    expect(pixelPose(initialPixelWalk())).toMatchObject({ x: PIXEL_ROUTE[0]!.x, y: PIXEL_ROUTE[0]!.y, walking: false });
  });

  it("anda só em diagonais 2:1, as únicas que a arte sabe desenhar", () => {
    PIXEL_ROUTE.forEach((stop, index) => {
      const next = PIXEL_ROUTE[(index + 1) % PIXEL_ROUTE.length]!;
      expect(Math.abs(next.y - stop.y) / Math.abs(next.x - stop.x)).toBeCloseTo(0.5, 1);
    });
  });

  it("escolhe arte e espelho pela direção na tela", () => {
    let state = initialPixelWalk();
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i += 1) {
      state = advancePixelWalk(state, 0.02);
      const pose = pixelPose(state);
      if (!pose.walking) continue;
      const from = PIXEL_ROUTE[state.leg]!;
      const to = PIXEL_ROUTE[(state.leg + 1) % PIXEL_ROUTE.length]!;
      expect(pose.facing).toBe(to.y > from.y ? "front" : "back");
      expect(pose.mirrored).toBe(to.x < from.x);
      seen.add(`${pose.facing}${pose.mirrored}`);
    }
    expect(seen.size).toBe(4);
  });

  it("anda a mesma distância em qualquer taxa de quadros", () => {
    const run = (dt: number) => {
      let state = initialPixelWalk();
      for (let i = 0; i < Math.round(8 / dt); i += 1) state = advancePixelWalk(state, dt);
      return state.meters;
    };
    expect(run(1 / 20)).toBeCloseTo(run(1 / 120), 2);
  });

  it("não trava com um intervalo muito longo", () => {
    const state = advancePixelWalk(initialPixelWalk(), 500);
    expect(state.leg).toBeLessThan(PIXEL_ROUTE.length);
    expect(Number.isFinite(state.meters)).toBe(true);
  });
});

describe("escala do cenário", () => {
  it("é sempre inteira, para todos os blocos saírem iguais", () => {
    expect(fitScale(1440, 860, 640, 427)).toBe(2);
    expect(fitScale(2880, 1720, 640, 427)).toBe(4);
    expect(fitScale(500, 300, 640, 427)).toBe(1);
  });
});
