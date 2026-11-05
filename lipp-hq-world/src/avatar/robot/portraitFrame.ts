export interface PixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A partir deste alfa o pixel conta como parte do robô, sem o halo do antialias. */
const SOLID_ALPHA = 128;

/** Menor retângulo com pixels sólidos, ou null quando nada foi desenhado. */
export function solidBounds(rgba: ArrayLike<number>, width: number, height: number): PixelBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3]! < SOLID_ALPHA) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Onde desenhar o recorte para ele caber no quadrado, sem distorcer e centrado nos dois eixos. */
export function centeredFit(bounds: Pick<PixelBounds, "width" | "height">, size: number, margin: number): PixelBounds {
  const room = size - margin * 2;
  const scale = room / Math.max(bounds.width, bounds.height);
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  return { x: (size - width) / 2, y: (size - height) / 2, width, height };
}
