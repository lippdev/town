/**
 * Texels do sprite para a GPU: cada célula fica num espaço próprio, com folga, e os níveis
 * de redução são calculados só com a própria célula. Sem Three.js, para ser testado sozinho.
 *
 * O dado sai em alfa premultiplicado e codificado em sRGB (SRGB8_ALPHA8): a GPU decodifica
 * para linear e aí interpola, então a interpolação é a certa e o RGB sob alfa 0 é zero, sem
 * a franja escura. A codificação guarda precisão nos tons escuros, onde a roupa dele mora.
 */

export interface SpriteMipLevel {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface SpriteTexels {
  levels: SpriteMipLevel[];
  /** Espaço de cada célula no nível 0, múltiplo de 2^(reduções). */
  pitch: { width: number; height: number };
  /** Onde a arte começa dentro do espaço da célula. */
  inset: { x: number; y: number };
  /** Por célula (linha a linha), onde os pés estão em x, em texels a partir do meio da célula. */
  soles: number[];
}

/** Cinco reduções bastam para a sombra e o zoom mínimo, mesmo com arte no dobro da resolução. */
export const MIP_REDUCTIONS = 5;
/** Faixa acima da sola, em metros de arte (texels / altura), que conta como pé. */
const SOLE_BAND = 0.05;
/** Folga mínima por lado, para o filtro da GPU nunca encontrar arte na beira. */
const MIN_PADDING = 2;
/** Nitidez leve de cada nível: devolve o contorno que a média tira. */
const SHARPEN = 0.3;
/** Peso mínimo de um texel igual à vizinhança: sem isto, área lisa perderia a própria cor. */
const DETAIL_FLOOR = 0.05;

const srgbToLinear = (value: number) => (value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
const linearToSrgb = (value: number) => (value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Grava cor em gama e alfa como premultiplicado linear codificado. */
function writeTexel(out: Uint8Array, at: number, r: number, g: number, b: number, alpha: number) {
  const channel = (value: number) => Math.round(linearToSrgb(srgbToLinear(clamp01(value)) * alpha) * 255);
  out[at] = channel(r);
  out[at + 1] = channel(g);
  out[at + 2] = channel(b);
  out[at + 3] = Math.round(alpha * 255);
}

const ceilTo = (value: number, multiple: number) => Math.ceil(value / multiple) * multiple;

export function spriteLayout(cell: { width: number; height: number }) {
  const multiple = 2 ** MIP_REDUCTIONS;
  const pitch = { width: ceilTo(cell.width + MIN_PADDING * 2, multiple), height: ceilTo(cell.height + MIN_PADDING * 2, multiple) };
  return { pitch, inset: { x: Math.floor((pitch.width - cell.width) / 2), y: Math.floor((pitch.height - cell.height) / 2) } };
}

/**
 * Onde os pés estão, em x, em cada célula: o meio das colunas opacas na faixa logo acima da
 * sola. A sombra projetada parte daí, e não do meio da célula, que no passo fica entre os pés.
 */
export function soleCenters(
  source: { data: ArrayLike<number>; width: number; height: number },
  cell: { width: number; height: number },
  sole?: { row: number; visibleRows: number },
): number[] {
  const columns = source.width / cell.width;
  const rows = source.height / cell.height;
  const centers: number[] = [];
  const band = sole ? Math.max(2, Math.round(sole.visibleRows * SOLE_BAND)) : 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let weight = 0;
      let moment = 0;
      for (let y = sole ? Math.max(0, sole.row - band) : 0; y < (sole ? Math.min(cell.height, sole.row) : 0); y += 1) {
        for (let x = 0; x < cell.width; x += 1) {
          const alpha = source.data[((row * cell.height + y) * source.width + column * cell.width + x) * 4 + 3]! / 255;
          weight += alpha;
          moment += alpha * (x + 0.5 - cell.width / 2);
        }
      }
      centers.push(weight > 0 ? moment / weight : 0);
    }
  }
  return centers;
}

/** Tamanho da textura do atlas na GPU, com a folga de cada célula: o que o limite do hardware vê. */
export function spriteTextureSize(cell: { width: number; height: number }, columns: number, rows: number) {
  const { pitch } = spriteLayout(cell);
  return { width: columns * pitch.width, height: rows * pitch.height };
}

/**
 * Monta os níveis a partir de um PNG RGBA. A média é feita em gama, ponderada pelo alfa:
 * em linear, um olho escuro some contra a pele clara, e é isso que fazia o rosto lavar.
 * Dentro de cada bloco, quem destoa da vizinhança pesa mais (como em "detail-preserving
 * downscaling"): olho, sobrancelha e cordão são poucos texels e são eles que fazem o rosto.
 * Cada nível sai direto do original, para a nitidez não acumular.
 */
export function buildSpriteTexels(
  source: { data: ArrayLike<number>; width: number; height: number },
  cell: { width: number; height: number },
  /** Linha da célula onde a sola encosta; sem ela, os pés não são medidos. */
  sole?: { row: number; visibleRows: number },
): SpriteTexels {
  const columns = source.width / cell.width;
  const rows = source.height / cell.height;
  const { pitch, inset } = spriteLayout(cell);
  const levels: SpriteMipLevel[] = [];

  for (let level = 0; level <= MIP_REDUCTIONS; level += 1) {
    const block = 2 ** level;
    const cellWidth = pitch.width / block;
    const cellHeight = pitch.height / block;
    const width = columns * cellWidth;
    const height = rows * cellHeight;
    const data = new Uint8Array(width * height * 4);
    // Cor em gama premultiplicada e alfa, uma célula por vez: o filtro não enxerga a vizinha.
    const work = new Float32Array(cellWidth * cellHeight * 4);
    const at = (x: number, y: number, channel: number) => (x < 0 || y < 0 || x >= cellWidth || y >= cellHeight ? 0 : work[(y * cellWidth + x) * 4 + channel]!);
    const binomial = (x: number, y: number, channel: number) =>
      (at(x - 1, y - 1, channel) + 2 * at(x, y - 1, channel) + at(x + 1, y - 1, channel) +
        2 * at(x - 1, y, channel) + 4 * at(x, y, channel) + 2 * at(x + 1, y, channel) +
        at(x - 1, y + 1, channel) + 2 * at(x, y + 1, channel) + at(x + 1, y + 1, channel)) / 16;
    const sharpened = (x: number, y: number, channel: number) => {
      const center = at(x, y, channel);
      return level === 0 ? center : center + SHARPEN * (center - binomial(x, y, channel));
    };
    const coverage = new Float32Array(cellWidth * cellHeight);
    const guide = new Float32Array(cellWidth * cellHeight * 3);
    const weights = new Float32Array(cellWidth * cellHeight);

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        work.fill(0);
        for (let y = 0; y < cell.height; y += 1) {
          const toY = (y + inset.y) >> level;
          for (let x = 0; x < cell.width; x += 1) {
            const from = ((row * cell.height + y) * source.width + column * cell.width + x) * 4;
            const alpha = source.data[from + 3]! / 255;
            if (alpha === 0) continue;
            const to = (toY * cellWidth + ((x + inset.x) >> level)) * 4;
            work[to] = work[to]! + (source.data[from]! / 255) * alpha;
            work[to + 1] = work[to + 1]! + (source.data[from + 1]! / 255) * alpha;
            work[to + 2] = work[to + 2]! + (source.data[from + 2]! / 255) * alpha;
            work[to + 3] = work[to + 3]! + alpha;
          }
        }
        const area = block * block;
        for (let i = 0; i < work.length; i += 1) work[i] = work[i]! / area;
        if (level > 0) {
          for (let i = 3; i < work.length; i += 4) coverage[(i - 3) / 4] = work[i]!;
          guide.fill(0);
          for (let y = 0; y < cellHeight; y += 1) {
            for (let x = 0; x < cellWidth; x += 1) {
              if (at(x, y, 3) <= 0) continue;
              const to = (y * cellWidth + x) * 3;
              for (let channel = 0; channel < 3; channel += 1) {
                const alpha = binomial(x, y, 3);
                guide[to + channel] = alpha > 0 ? binomial(x, y, channel) / alpha : 0;
              }
            }
          }
          // Refaz a média com o peso de quanto cada texel destoa da vizinhança.
          work.fill(0);
          weights.fill(0);
          for (let y = 0; y < cell.height; y += 1) {
            const toY = (y + inset.y) >> level;
            for (let x = 0; x < cell.width; x += 1) {
              const from = ((row * cell.height + y) * source.width + column * cell.width + x) * 4;
              const alpha = source.data[from + 3]! / 255;
              if (alpha === 0) continue;
              const texel = toY * cellWidth + ((x + inset.x) >> level);
              const r = source.data[from]! / 255;
              const g = source.data[from + 1]! / 255;
              const b = source.data[from + 2]! / 255;
              const weight = alpha * (DETAIL_FLOOR + Math.hypot(r - guide[texel * 3]!, g - guide[texel * 3 + 1]!, b - guide[texel * 3 + 2]!));
              work[texel * 4] = work[texel * 4]! + r * weight;
              work[texel * 4 + 1] = work[texel * 4 + 1]! + g * weight;
              work[texel * 4 + 2] = work[texel * 4 + 2]! + b * weight;
              weights[texel] = weights[texel]! + weight;
            }
          }
          for (let texel = 0; texel < coverage.length; texel += 1) {
            const alpha = coverage[texel]!;
            const total = weights[texel]!;
            work[texel * 4] = total > 0 ? (work[texel * 4]! / total) * alpha : 0;
            work[texel * 4 + 1] = total > 0 ? (work[texel * 4 + 1]! / total) * alpha : 0;
            work[texel * 4 + 2] = total > 0 ? (work[texel * 4 + 2]! / total) * alpha : 0;
            work[texel * 4 + 3] = alpha;
          }
        }

        const originX = column * cellWidth;
        const originY = row * cellHeight;
        for (let y = 0; y < cellHeight; y += 1) {
          for (let x = 0; x < cellWidth; x += 1) {
            if (at(x, y, 3) <= 0) continue;
            const alpha = clamp01(sharpened(x, y, 3));
            if (alpha <= 0) continue;
            writeTexel(data, ((originY + y) * width + originX + x) * 4, sharpened(x, y, 0) / alpha, sharpened(x, y, 1) / alpha, sharpened(x, y, 2) / alpha, alpha);
          }
        }
      }
    }
    levels.push({ width, height, data });
  }
  return { levels, pitch, inset, soles: soleCenters(source, cell, sole) };
}
