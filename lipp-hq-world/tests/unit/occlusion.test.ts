import { describe, expect, it } from "vitest";
import { computeWallOcclusion, segmentsIntersect, shouldCutaway, wallMidpoint } from "@/world/walls/occlusion";
import { WALLS } from "@/world/walls/walls";
import { ROOMS_BY_ID } from "@/world/rooms/rooms";

const SAMPLES = ROOMS_BY_ID.comando.samples;

describe("segmentsIntersect", () => {
  it("detecta cruzamento central", () => {
    const a = { x: 0, z: 0 };
    const b = { x: 10, z: 0 };
    const c = { x: 5, z: -5 };
    const d = { x: 5, z: 5 };
    expect(segmentsIntersect(a, b, c, d)).toBe(true);
  });

  it("ignora segmentos paralelos", () => {
    const a = { x: 0, z: 0 };
    const b = { x: 10, z: 0 };
    expect(segmentsIntersect(a, b, { x: 0, z: 1 }, { x: 10, z: 1 })).toBe(false);
  });

  it("ignora encostas nas pontas", () => {
    const a = { x: 0, z: 0 };
    const b = { x: 10, z: 0 };
    const c = { x: 10, z: -5 };
    const d = { x: 10, z: 5 };
    expect(segmentsIntersect(a, b, c, d)).toBe(false);
  });
});

describe("computeWallOcclusion", () => {
  const comando = WALLS.find((wall) => wall.id === "comando-south");
  const comandoNorth = WALLS.find((wall) => wall.id === "comando-north");

  it("parede sul bloqueia quando a câmera está ao sul", () => {
    const wall = comando;
    if (!wall) throw new Error("parede sul do Comando não encontrada");
    const midpoint = wallMidpoint(wall);
    const occlusion = computeWallOcclusion(wall, SAMPLES, { x: midpoint.x, y: 30, z: midpoint.z + 20 });
    expect(occlusion.facingScore).toBeGreaterThan(0.9);
    expect(occlusion.occlusionRatio).toBeGreaterThan(0.5);
    expect(shouldCutaway(occlusion, false)).toBe(true);
  });

  it("parede norte não bloqueia quando a câmera está ao sul", () => {
    const wall = comandoNorth;
    if (!wall) throw new Error("parede norte do Comando não encontrada");
    const midpoint = wallMidpoint(wall);
    const occlusion = computeWallOcclusion(wall, SAMPLES, { x: midpoint.x, y: 30, z: midpoint.z + 24 });
    expect(shouldCutaway(occlusion, false)).toBe(false);
  });
});

describe("histerese", () => {
  it("sai do cutaway só abaixo do limiar baixo", () => {
    const borderline = { facingScore: 0.2, blockingSampleCount: 2, totalSamples: 9, occlusionRatio: 0.22 };
    expect(shouldCutaway(borderline, true)).toBe(true);
    expect(shouldCutaway(borderline, false)).toBe(false);
  });
});

describe("planta", () => {
  it("nenhuma parede compartilhada entre salas", () => {
    const roomWalls = WALLS.filter((wall) => wall.roomId !== null);
    const keys = roomWalls.map((wall) => `${wall.axis}:${wall.fixed}:${wall.start}:${wall.end}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("44 paredes no total", () => {
    expect(WALLS.length).toBe(44);
  });
});
