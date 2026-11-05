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

/**
 * Recorte quadrado comum a todos os quadros de uma animação. O centro vem do primeiro
 * quadro, que é o retrato parado: virar a cabeça não muda a escala nem desloca o rosto.
 */
export function sharedCrop(base: PixelBounds, frames: readonly PixelBounds[]): PixelBounds {
  const centerX = base.x + base.width / 2;
  const centerY = base.y + base.height / 2;
  let half = Math.max(base.width, base.height) / 2;
  for (const frame of frames) {
    half = Math.max(half, centerX - frame.x, frame.x + frame.width - centerX, centerY - frame.y, frame.y + frame.height - centerY);
  }
  return { x: centerX - half, y: centerY - half, width: half * 2, height: half * 2 };
}
