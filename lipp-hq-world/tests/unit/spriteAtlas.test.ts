import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { animationCell, animationNameFor, atlasGrid, parseSpriteAtlas, spriteQuad } from "@/world/office/spriteAtlas";

const current = () => JSON.parse(readFileSync("public/characters/filipe/walk.json", "utf8")) as Record<string, unknown>;

/** A arte que vai chegar: 12 de caminhada, 8 de parado, no dobro da resolução. */
const newArt = {
  image: "walk.png",
  cell: { width: 116, height: 230 },
  soleRow: 224,
  visibleRows: 214,
  animations: {
    "walk-front": { row: 0, frames: 12, stepMeters: 0.0667 },
    "walk-back": { row: 1, frames: 12, stepMeters: 0.0667 },
    "idle-front": { row: 2, frames: 8, fps: 6 },
    "idle-back": { row: 3, frames: 8, fps: 6 },
  },
};

describe("atlas por metadados", () => {
  it("lê o JSON do Filipe com as medidas do PNG", () => {
    const atlas = parseSpriteAtlas(current());
    expect(atlas.cell).toEqual({ width: 127, height: 248 });
    expect(atlasGrid(atlas, 1524, 992)).toEqual({ columns: 12, rows: 4 });
  });

  it("o parado respira pelo tempo, sem depender da distância andada", () => {
    const atlas = parseSpriteAtlas(current());
    expect(animationCell(atlas.animations["idle-front"], { distance: 3, time: 0.4 })).toEqual({ row: 2, column: 2 });
    expect(animationCell(atlas.animations["idle-back"], { distance: 9, time: 0.4 })).toEqual({ row: 3, column: 2 });
  });

  it("anda um quadro por passo em metros, sem depender do tempo", () => {
    const atlas = parseSpriteAtlas(current());
    const walk = atlas.animations["walk-front"];
    expect(animationCell(walk, { distance: 0.5, time: 99 }).column).toBe(4);
    // um ciclo tem 1,36 m: depois dele, o quadro volta ao começo
    expect(animationCell(walk, { distance: 1.4, time: 0 }).column).toBe(0);
  });

  it("aceita a arte nova sem nada no código", () => {
    const atlas = parseSpriteAtlas(newArt);
    expect(atlasGrid(atlas, 116 * 12, 230 * 4)).toEqual({ columns: 12, rows: 4 });
    expect(animationCell(atlas.animations["walk-back"], { distance: 0.0667 * 13.5, time: 0 })).toEqual({ row: 1, column: 1 });
    expect(animationCell(atlas.animations["idle-front"], { distance: 0, time: 1.5 })).toEqual({ row: 2, column: 1 });
  });

  it("com o tempo parado, o parado animado fica no primeiro quadro: é a pose de movimento reduzido", () => {
    const atlas = parseSpriteAtlas(newArt);
    expect(animationCell(atlas.animations["idle-front"], { distance: 0, time: 0 })).toEqual({ row: 2, column: 0 });
  });

  it("o tamanho em metros não muda com a resolução da arte", () => {
    const foreshortening = Math.cos(Math.PI / 6);
    const a = spriteQuad(parseSpriteAtlas(newArt), 1.8, foreshortening);
    const doubled = {
      ...newArt,
      cell: { width: newArt.cell.width * 2, height: newArt.cell.height * 2 },
      soleRow: newArt.soleRow * 2,
      visibleRows: newArt.visibleRows * 2,
    };
    const b = spriteQuad(parseSpriteAtlas(doubled), 1.8, foreshortening);
    expect(b.width).toBeCloseTo(a.width, 6);
    expect(b.top).toBeCloseTo(a.top, 6);
    expect(b.bottom).toBeCloseTo(a.bottom, 6);
    // o texel é quadrado na tela: o vertical encurta com a câmera, o horizontal não
    expect(a.texelMeters * foreshortening).toBeCloseTo(a.texelWidth, 6);
  });

  it("aceita pés abaixo da linha do chão: na caminhada em diagonal, o pé da frente desce na tela", () => {
    const atlas = parseSpriteAtlas(current());
    expect(atlas.visibleRows).toBeGreaterThan(atlas.soleRow);
    expect(() => parseSpriteAtlas({ ...current(), visibleRows: atlas.cell.height + 1 })).toThrow(/visibleRows/);
  });

  it("escolhe a animação pela direção e por estar andando", () => {
    expect(animationNameFor(true, "back")).toBe("walk-back");
    expect(animationNameFor(false, "front")).toBe("idle-front");
  });

  it("recusa arte que não fecha, dizendo o que há de errado", () => {
    const atlas = parseSpriteAtlas(current());
    expect(() => atlasGrid(atlas, 230, 230)).toThrow(/não divide/);
    expect(() => atlasGrid(atlas, 127, 992)).toThrow(/sai do PNG/);
    expect(() => parseSpriteAtlas({ ...current(), soleRow: 900 })).toThrow(/soleRow/);
    expect(() => parseSpriteAtlas({ ...current(), animations: {} })).toThrow(/walk-front/);
    expect(() =>
      parseSpriteAtlas({ ...newArt, animations: { ...newArt.animations, "walk-front": { row: 0, frames: 4 } } }),
    ).toThrow(/stepMeters nem fps/);
  });
});
