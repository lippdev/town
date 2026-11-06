import { Box3 } from "three";
import { describe, expect, it } from "vitest";
import { AZIMUTH, ELEVATION, NO_INSETS, fitView, keepGroundInside, screenToGround, zoomLimits, type Viewport } from "@/world/office/officeCamera";
import { viewFit } from "@/world/office/officeBuilding";
import { BUILDING_HEIGHT, STORY } from "@/world/office/officeBuilding";
import { CITY_BOUNDS, CITY_VIEW, PROTECTED_GROUND, buildCityGeometry, cityPlan, occlusionCap } from "@/world/office/officeCity";

/** Aumentar este número é uma decisão: a cidade é uma malha só, mas cada vértice sai toda vez. */
const CITY_VERTEX_BUDGET = 70_000;

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

  it("continua leve: uma malha só, bem menos que os 200 mil vértices da cidade em grade", () => {
    const vertices = geometry.getAttribute("position").count;
    expect(vertices).toBeLessThan(CITY_VERTEX_BUDGET);
  });
});

describe("composição da cidade", () => {
  const { buildings, parks } = cityPlan();
  const heights = buildings.map(({ height }) => height);

  it("nenhum prédio passa do corpo da torre: ela é a protagonista", () => {
    expect(Math.max(...heights)).toBeLessThan(BUILDING_HEIGHT);
  });

  it("os pavimentos têm a medida da torre", () => {
    for (const height of heights) expect((height / STORY) % 1).toBeCloseTo(0, 6);
  });

  it("tem variação de verdade: baixos, médios e altos, com muitas alturas diferentes", () => {
    const bands = { low: 0, mid: 0, high: 0 };
    for (const height of heights) {
      if (height <= 4 * STORY) bands.low += 1;
      else if (height <= 8 * STORY) bands.mid += 1;
      else bands.high += 1;
    }
    expect(bands.low).toBeGreaterThan(buildings.length * 0.15);
    expect(bands.mid).toBeGreaterThan(buildings.length * 0.15);
    expect(bands.high).toBeGreaterThan(5);
    expect(new Set(heights).size).toBeGreaterThanOrEqual(8);
  });

  it("lotes não têm tamanho único: a grade não se repete", () => {
    const widths = new Set(buildings.map(({ minX, maxX }) => Math.round(maxX - minX)));
    expect(widths.size).toBeGreaterThan(6);
  });

  it("nenhum prédio cobre a torre, a calçada ou a rua da entrada na câmera fixa", () => {
    const perMeter = (Math.cos(ELEVATION) * Math.sin(AZIMUTH)) / Math.sin(ELEVATION);
    const { minX, maxX, minZ, maxZ } = PROTECTED_GROUND;
    for (const { minX: a, maxX: b, minZ: c, maxZ: d, height } of buildings) {
      const reach = (height + 1.4) * perMeter;
      // A sombra do prédio na direção da câmera, passo a passo.
      for (let t = 0; t <= reach; t += 0.25) {
        const overlaps = a - t < maxX && b - t > minX && c - t < maxZ && d - t > minZ;
        expect(overlaps, `prédio em ${a},${c} com ${height} m`).toBe(false);
      }
    }
  });

  it("a altura limite vale zero em cima do lote e cresce com a distância", () => {
    expect(occlusionCap({ minX: 0, maxX: 2, minZ: 0, maxZ: 2 })).toBe(0);
    expect(occlusionCap({ minX: 40, maxX: 42, minZ: 40, maxZ: 42 })).toBeGreaterThan(occlusionCap({ minX: 30, maxX: 32, minZ: 30, maxZ: 32 }));
    // De lado, sem passar pelo lote na direção da câmera: não há limite.
    expect(occlusionCap({ minX: -100, maxX: -90, minZ: 80, maxZ: 90 })).toBe(Infinity);
  });

  it("tem praças e não tem prédio dentro do lote nem na praça da entrada", () => {
    expect(parks.length).toBeGreaterThanOrEqual(6);
    for (const { minX, maxX, minZ, maxZ } of buildings) {
      expect(maxX > PROTECTED_GROUND.minX && minX < PROTECTED_GROUND.maxX && maxZ > PROTECTED_GROUND.minZ && minZ < PROTECTED_GROUND.maxZ).toBe(false);
    }
  });
});
