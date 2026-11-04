import { describe, expect, it } from "vitest";
import { FORWARD, RIGHT, UP, worldToScreen } from "@/world/office/officeCamera";
import { floorShadowFactor, screenGroundAxes, shadowAxes, SUN, towardCamera } from "@/world/office/officeSun";
import { pixelSnapOffset } from "@/world/office/spriteSnap";

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

describe("sombra do personagem", () => {
  it("corre no chão para longe do sol, na mesma reta de quem está em cima dela", () => {
    const { along, length } = shadowAxes();
    // da ponta da cabeça, a 1,8 m, o raio de sol cai a 1,8·length do pé
    const end = { x: along.x * length * 1.8, z: along.z * length * 1.8 };
    const ray = [end.x, -1.8, end.z];
    const toSun = [SUN.position[0], SUN.position[1], SUN.position[2]];
    const cosine = -dot(ray, toSun) / (Math.hypot(ray[0]!, ray[1]!, ray[2]!) * Math.hypot(toSun[0]!, toSun[1]!, toSun[2]!));
    expect(cosine).toBeCloseTo(1, 6);
  });

  it("na tela, cai para a esquerda e um pouco para baixo, como a dos móveis", () => {
    const { along } = shadowAxes();
    const onScreen = { right: along.x * RIGHT[0] + along.z * RIGHT[2], up: along.x * UP[0] + along.z * UP[2] };
    expect(onScreen.right).toBeLessThan(-0.9);
    expect(onScreen.up).toBeLessThan(0);
    expect(Math.abs(onScreen.up)).toBeLessThan(0.2);
  });

  it("os eixos do chão são unitários e perpendiculares", () => {
    const { along, across } = shadowAxes();
    expect(Math.hypot(along.x, along.z)).toBeCloseTo(1, 6);
    expect(along.x * across.x + along.z * across.z).toBeCloseTo(0, 6);
    const { right, toCamera } = screenGroundAxes();
    expect(right.x * toCamera.x + right.z * toCamera.z).toBeCloseTo(0, 6);
  });

  it("escurece menos o azul: a luz que sobra sem o sol é a do céu", () => {
    const [r, g, b] = floorShadowFactor();
    expect(r).toBeLessThan(g);
    expect(g).toBeLessThan(b);
    expect(r).toBeGreaterThan(0.2);
    expect(b).toBeLessThan(1);
  });

  it("levantar em direção à câmera não muda o lugar na tela", () => {
    const view = { x: 1, z: 2, zoom: 80 };
    const viewport = { width: 1440, height: 900 };
    const lift = towardCamera(0.3);
    const a = worldToScreen([0, 0, 0], view, viewport);
    const b = worldToScreen(lift, view, viewport);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
    expect(dot(lift, FORWARD)).toBeCloseTo(-0.3, 6);
  });
});

describe("encaixe na grade de pixels", () => {
  const viewport = { width: 1440, height: 900 };
  const cases = [
    { view: { x: 0.13, z: 2.7, zoom: 37.41 }, buffer: { width: 1440, height: 900 } },
    { view: { x: 3.33, z: -1.2, zoom: 133.7 }, buffer: { width: 2160, height: 1350 } },
    { view: { x: -2.01, z: 0.4, zoom: 270 }, buffer: { width: 2160, height: 1350 } },
  ];

  it("cai em pixel inteiro do canvas, em qualquer densidade", () => {
    for (const { view, buffer } of cases) {
      const point = [1.234, 0.015, 3.21] as const;
      const offset = pixelSnapOffset(point, view, viewport, buffer);
      const moved = worldToScreen([point[0] + offset[0], point[1] + offset[1], point[2] + offset[2]], view, viewport);
      const scale = buffer.width / viewport.width;
      expect(moved.x * scale - Math.round(moved.x * scale)).toBeCloseTo(0, 5);
      expect(moved.y * scale - Math.round(moved.y * scale)).toBeCloseTo(0, 5);
    }
  });

  it("nunca move mais que meio pixel", () => {
    for (const { view, buffer } of cases) {
      const scale = buffer.width / viewport.width;
      for (let i = 0; i < 40; i += 1) {
        const point = [i * 0.0173, 0.015, -i * 0.0191] as const;
        const before = worldToScreen(point, view, viewport);
        const offset = pixelSnapOffset(point, view, viewport, buffer);
        const after = worldToScreen([point[0] + offset[0], point[1] + offset[1], point[2] + offset[2]], view, viewport);
        expect(Math.abs(after.x - before.x) * scale).toBeLessThanOrEqual(0.5 + 1e-6);
        expect(Math.abs(after.y - before.y) * scale).toBeLessThanOrEqual(0.5 + 1e-6);
      }
    }
  });
});
