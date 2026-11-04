import { describe, expect, it } from "vitest";
import { buildSpriteTexels, MIP_REDUCTIONS, soleCenters, spriteLayout, spriteTextureSize } from "@/world/office/spriteMipmaps";

const CELL = { width: 58, height: 115 };

/** Atlas de teste: uma figura opaca no meio de cada célula, com a cor da célula, e fundo com lixo no RGB. */
function atlas(columns: number, rows: number, colors: Array<[number, number, number]>, cell = CELL) {
  const width = columns * cell.width;
  const height = rows * cell.height;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const color = colors[row * columns + column]!;
      for (let y = 0; y < cell.height; y += 1) {
        for (let x = 0; x < cell.width; x += 1) {
          const at = ((row * cell.height + y) * width + column * cell.width + x) * 4;
          const inside = x >= 2 && x < cell.width - 2 && y >= 2 && y < cell.height - 2;
          // o que o PNG guarda sob alfa 0 não pode aparecer em lugar nenhum
          data[at] = inside ? color[0] : 255;
          data[at + 1] = inside ? color[1] : 0;
          data[at + 2] = inside ? color[2] : 255;
          data[at + 3] = inside ? 255 : 0;
        }
      }
    }
  }
  return { data, width, height };
}

describe("níveis de redução por célula", () => {
  it("cada nível divide a célula por um número exato, para o UV valer em todos", () => {
    const { pitch, inset } = spriteLayout(CELL);
    expect(pitch).toEqual({ width: 64, height: 128 });
    expect(inset).toEqual({ x: 3, y: 6 });
    const texels = buildSpriteTexels(atlas(2, 1, [[10, 20, 30], [40, 50, 60]]), CELL);
    expect(texels.levels).toHaveLength(MIP_REDUCTIONS + 1);
    texels.levels.forEach((level, index) => {
      expect(level.width).toBe((2 * 64) / 2 ** index);
      expect(level.height).toBe(128 / 2 ** index);
      expect(level.data).toHaveLength(level.width * level.height * 4);
    });
  });

  it("arte com o dobro da resolução também fecha a divisão", () => {
    const { pitch } = spriteLayout({ width: 116, height: 230 });
    expect(pitch).toEqual({ width: 128, height: 256 });
    expect(spriteLayout({ width: 64, height: 128 }).pitch).toEqual({ width: 96, height: 160 });
  });

  it("não vaza entre células em nenhum nível, mesmo com arte encostando na vizinha", () => {
    const red: [number, number, number] = [255, 0, 0];
    const blue: [number, number, number] = [0, 0, 255];
    const texels = buildSpriteTexels(atlas(2, 2, [red, blue, blue, red]), CELL);
    texels.levels.forEach((level) => {
      const cellWidth = level.width / 2;
      const cellHeight = level.height / 2;
      for (let y = 0; y < level.height; y += 1) {
        for (let x = 0; x < level.width; x += 1) {
          const at = (y * level.width + x) * 4;
          if (level.data[at + 3] === 0) continue;
          const isRedCell = (x < cellWidth) === (y < cellHeight);
          expect(level.data[at + (isRedCell ? 2 : 0)]).toBe(0);
        }
      }
    });
  });

  it("guarda alfa premultiplicado: sob alfa 0 o RGB é zero, e o RGB nunca passa do alfa", () => {
    const texels = buildSpriteTexels(atlas(1, 1, [[230, 180, 150]]), CELL);
    for (const level of texels.levels) {
      for (let at = 0; at < level.data.length; at += 4) {
        const alpha = level.data[at + 3]!;
        if (alpha === 0) expect([level.data[at], level.data[at + 1], level.data[at + 2]]).toEqual([0, 0, 0]);
        // codificado em sRGB, premultiplicado linear com alfa a dá no máximo enc(a)
        const decoded = ((level.data[at]! / 255 + 0.055) / 1.055) ** 2.4;
        expect(decoded).toBeLessThanOrEqual(alpha / 255 + 0.01);
      }
    }
  });

  it("o nível 0 é a arte, sem filtro: nada muda nos blocos", () => {
    const texels = buildSpriteTexels(atlas(1, 1, [[230, 180, 150]]), CELL);
    const { inset, levels } = texels;
    const at = ((inset.y + 20) * levels[0]!.width + inset.x + 20) * 4;
    expect([...levels[0]!.data.slice(at, at + 4)]).toEqual([230, 180, 150, 255]);
    // fora da figura e na folga, transparente
    expect(levels[0]!.data[3]).toBe(0);
  });

  it("um olho escuro de 2 texels sobrevive à redução, mais que na média simples", () => {
    const source = atlas(1, 1, [[230, 180, 150]]);
    const dark = new Set<number>();
    for (const [x, y] of [[20, 20], [21, 20]] as const) {
      const at = (y * source.width + x) * 4;
      dark.add(at);
      source.data[at] = source.data[at + 1] = source.data[at + 2] = 20;
    }
    const { levels, inset } = buildSpriteTexels(source, CELL);
    const texel = ((((inset.y + 20) >> 1) * levels[1]!.width + ((inset.x + 20) >> 1)) * 4);
    const skinAt = ((((inset.y + 40) >> 1) * levels[1]!.width + ((inset.x + 40) >> 1)) * 4);
    const eye = levels[1]!.data[texel + 1]!;
    const skin = levels[1]!.data[skinAt + 1]!;
    // média em gama de dois texels escuros e dois de pele daria (20 + 180) / 2 = 100
    expect(eye).toBeLessThan(100);
    expect(skin).toBeGreaterThan(170);
    expect(skin).toBeLessThan(195);
  });
});

describe("pés e tamanho da textura", () => {
  const source = (cell: { width: number; height: number }, feet: number[]) => {
    const data = new Uint8ClampedArray(cell.width * cell.height * 4);
    for (const x of feet) for (let y = cell.height - 8; y < cell.height - 3; y += 1) data[(y * cell.width + x) * 4 + 3] = 255;
    return { data, width: cell.width, height: cell.height };
  };

  it("acha os pés em x a partir do meio da célula, só acima da sola", () => {
    const cell = { width: 20, height: 40 };
    // pés nas colunas 4 e 8: o meio fica em 6,5 − 10 = −3,5
    const art = source(cell, [4, 8]);
    expect(soleCenters(art, cell, { row: 36, visibleRows: 30 })[0]).toBeCloseTo(-3.5, 6);
    // sem a sola descrita, nada é medido
    expect(soleCenters(art, cell)[0]).toBe(0);
  });

  it("dá o tamanho do atlas na GPU com a folga de cada célula: 12 quadros de 116 px cabem", () => {
    const size = spriteTextureSize({ width: 116, height: 230 }, 12, 4);
    expect(size).toEqual({ width: 12 * 128, height: 4 * 256 });
    expect(size.width).toBeLessThanOrEqual(4096);
  });
});
