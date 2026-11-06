import { Box3 } from "three";
import { describe, expect, it } from "vitest";
import { NO_INSETS, fitView, keepGroundInside, screenToGround, zoomLimits, type Viewport } from "@/world/office/officeCamera";
import { viewFit } from "@/world/office/officeBuilding";
import { CITY_BOUNDS, CITY_VIEW, buildCityGeometry } from "@/world/office/officeCity";

const SCREENS: Viewport[] = [
  { width: 1440, height: 900 },
  { width: 1100, height: 800 },
  { width: 390, height: 800 },
  { width: 3440, height: 1440 },
  { width: 800, height: 2000 },
];

function expectGroundInsideCity(view: Parameters<typeof screenToGround>[2], viewport: Viewport) {
  for (const px of [0, viewport.width]) {
    for (const py of [0, viewport.height]) {
      const ground = screenToGround(px, py, view, viewport);
      expect(ground.x).toBeGreaterThanOrEqual(CITY_BOUNDS.minX - 1e-6);
      expect(ground.x).toBeLessThanOrEqual(CITY_BOUNDS.maxX + 1e-6);
      expect(ground.z).toBeGreaterThanOrEqual(CITY_BOUNDS.minZ - 1e-6);
      expect(ground.z).toBeLessThanOrEqual(CITY_BOUNDS.maxZ + 1e-6);
    }
  }
}

describe("borda da cidade", () => {
  it.each(SCREENS)("nunca aparece, mesmo arrastando para qualquer canto em $width×$height", (viewport) => {
    const { min } = zoomLimits(fitView(CITY_VIEW, viewport).zoom);
    for (const zoom of [min, min * 2, 170]) {
      for (const x of [-1000, 0, 1000]) {
        for (const z of [-1000, 0, 1000]) {
          expectGroundInsideCity(keepGroundInside({ x, z, zoom }, viewport, CITY_BOUNDS), viewport);
        }
      }
    }
  });

  it("não mexe em uma vista que já está dentro da cidade", () => {
    const view = { x: 2, z: -3, zoom: 60 };
    expect(keepGroundInside(view, SCREENS[0]!, CITY_BOUNDS)).toEqual(view);
  });

  it("deixa afastar até o limite normal em uma tela comum", () => {
    const viewport = SCREENS[0]!;
    const { min } = zoomLimits(fitView(CITY_VIEW, viewport).zoom);
    expect(keepGroundInside({ x: 0, z: 0, zoom: min }, viewport, CITY_BOUNDS).zoom).toBe(min);
  });
});

describe("geometria da cidade", () => {
  const geometry = buildCityGeometry();

  it("cobre até a ponta sem passar dela", () => {
    const box = new Box3().setFromBufferAttribute(geometry.getAttribute("position") as never);
    expect(box.min.x).toBeCloseTo(CITY_BOUNDS.minX, 3);
    expect(box.max.x).toBeCloseTo(CITY_BOUNDS.maxX, 3);
    expect(box.min.z).toBeCloseTo(CITY_BOUNDS.minZ, 3);
    expect(box.max.z).toBeCloseTo(CITY_BOUNDS.maxZ, 3);
  });

  it("a torre fechada cabe em tela sem a cidade acabar e sem precisar aproximar", () => {
    const { bounds, top } = viewFit("exterior");
    for (const screen of SCREENS) {
      const fit = fitView(bounds, screen, NO_INSETS, { margin: 0.04, ...(top === undefined ? {} : { top }) });
      const kept = keepGroundInside(fit, screen, CITY_BOUNDS);
      expect(kept.x, `${screen.width}`).toBeCloseTo(fit.x, 3);
      expect(kept.z, `${screen.width}`).toBeCloseTo(fit.z, 3);
      expect(kept.zoom, `${screen.width}`).toBeCloseTo(fit.zoom, 3);
    }
  });

  it("continua leve: uma malha só, com menos de 200 mil vértices", () => {
    expect(geometry.getAttribute("position").count).toBeLessThan(200_000);
  });
});
