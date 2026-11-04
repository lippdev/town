import { describe, expect, it } from "vitest";
import { clampView, fitScale, MAX_ZOOM_OVER_FIT, resizeView, zoomAround, zoomLevel } from "@/pixel-office/officeView";

const SCENE = { width: 1536, height: 1024 };
const SPACE = { width: 1440, height: 860 };

describe("escala do cenário", () => {
  it("é fracionária e mostra o cenário inteiro, pelo lado que aperta", () => {
    expect(fitScale(1440, 860, 1536, 1024)).toBeCloseTo(860 / 1024, 6);
    expect(fitScale(800, 1000, 1536, 1024)).toBeCloseTo(800 / 1536, 6);
    expect(fitScale(3072, 2048, 1536, 1024)).toBe(2);
  });
});

describe("enquadramento", () => {
  const fit = () => resizeView(null, SCENE, null, SPACE);

  it("começa com o cenário inteiro, no meio da tela", () => {
    const view = fit();
    expect(view.zoom).toBeCloseTo(860 / 1024, 6);
    expect(view.x).toBeCloseTo((1440 - 1536 * view.zoom) / 2, 6);
    expect(view.y).toBeCloseTo(0, 6);
  });

  it("mantém posição fracionária, sem arredondar", () => {
    const view = clampView({ zoom: 1.37, x: -100.25, y: -33.75 }, SCENE, SPACE);
    expect(view).toEqual({ zoom: 1.37, x: -100.25, y: -33.75 });
  });

  it("não deixa arrastar para fora do cenário", () => {
    const view = clampView({ zoom: 2, x: 500, y: -99999 }, SCENE, SPACE);
    expect(view.x).toBe(0);
    expect(view.y).toBe(860 - 1024 * 2);
  });

  it("segura o ponto sob a âncora ao mudar o zoom", () => {
    const start = zoomAround(fit(), 1.1, { x: 720, y: 430 }, SCENE, SPACE);
    const anchor = { x: 700, y: 400 };
    const before = { x: (anchor.x - start.x) / start.zoom, y: (anchor.y - start.y) / start.zoom };
    const after = zoomAround(start, 1.37, anchor, SCENE, SPACE);
    expect(after.zoom).toBe(1.37);
    expect((anchor.x - after.x) / after.zoom).toBeCloseTo(before.x, 6);
    expect((anchor.y - after.y) / after.zoom).toBeCloseTo(before.y, 6);
  });

  it("limita o zoom entre o cenário inteiro e o máximo", () => {
    const center = { x: 720, y: 430 };
    expect(zoomLevel(zoomAround(fit(), 0.01, center, SCENE, SPACE), SCENE, SPACE)).toBeCloseTo(1, 6);
    expect(zoomLevel(zoomAround(fit(), 99, center, SCENE, SPACE), SCENE, SPACE)).toBeCloseTo(MAX_ZOOM_OVER_FIT, 6);
  });

  it("ao redimensionar, mantém o nível de zoom e o ponto do meio", () => {
    const start = zoomAround(fit(), 1.5, { x: 300, y: 300 }, SCENE, SPACE);
    const to = { width: 1100, height: 700 };
    const after = resizeView(start, SCENE, SPACE, to);
    expect(zoomLevel(after, SCENE, to)).toBeCloseTo(zoomLevel(start, SCENE, SPACE), 6);
    expect((to.width / 2 - after.x) / after.zoom).toBeCloseTo((SPACE.width / 2 - start.x) / start.zoom, 6);
    expect((to.height / 2 - after.y) / after.zoom).toBeCloseTo((SPACE.height / 2 - start.y) / start.zoom, 6);
  });
});
