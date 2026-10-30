import { CanvasTexture, NearestFilter, RepeatWrapping, type Texture } from "three";

/**
 * Texturas procedurais de piso, geradas em canvas no boot — nenhum asset
 * externo, custo de memória fixo (uma textura por tipo, clonada por sala
 * apenas para ajustar o repeat).
 */

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d indisponível");
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement): Texture {
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = "srgb";
  return texture;
}

/** Pseudoaleatório determinístico — texturas idênticas em toda execução. */
function seeded(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

let woodTexture: Texture | null = null;

/** Tábuas de madeira: base quente com variação por tábua e junta escura. */
export function woodFloorTexture(): Texture {
  if (woodTexture) return woodTexture;
  const { canvas, ctx } = makeCanvas(256);
  const planks = 8;
  const plankHeight = canvas.height / planks;
  const tones = ["#c29a6b", "#bd9362", "#c69f72", "#b88d5c", "#c39c6e"];
  for (let plank = 0; plank < planks; plank += 1) {
    const tone = tones[plank % tones.length];
    ctx.fillStyle = tone;
    ctx.fillRect(0, plank * plankHeight, canvas.width, plankHeight);
    // juntas horizontais deslocadas por tábua
    ctx.fillStyle = "rgba(84, 58, 34, 0.55)";
    ctx.fillRect(0, plank * plankHeight, canvas.width, 2);
    const seam = ((plank * 97) % 256);
    ctx.fillRect(seam, plank * plankHeight, 2, plankHeight);
    // veios leves
    ctx.strokeStyle = "rgba(90, 62, 36, 0.14)";
    ctx.lineWidth = 1;
    for (let vein = 0; vein < 3; vein += 1) {
      const y = plank * plankHeight + 6 + vein * 9 + ((plank * 13) % 5);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(canvas.width / 3, y + 2, (canvas.width * 2) / 3, y - 2, canvas.width, y);
      ctx.stroke();
    }
  }
  woodTexture = toTexture(canvas);
  return woodTexture;
}

let stoneTexture: Texture | null = null;

/** Pedra fosca dos corredores: lages grandes com juntas finas e ruído sutil. */
export function stoneFloorTexture(): Texture {
  if (stoneTexture) return stoneTexture;
  const { canvas, ctx } = makeCanvas(256);
  ctx.fillStyle = "#a8a49c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // ruído granulado determinístico
  const random = seeded(20261030);
  for (let dot = 0; dot < 900; dot += 1) {
    const light = random() > 0.5;
    ctx.fillStyle = light ? "rgba(255, 255, 255, 0.05)" : "rgba(58, 54, 48, 0.05)";
    ctx.fillRect(random() * canvas.width, random() * canvas.height, 2, 2);
  }
  // juntas das lages
  ctx.strokeStyle = "rgba(74, 70, 62, 0.5)";
  ctx.lineWidth = 2;
  const tile = 128;
  for (let line = 0; line <= canvas.width; line += tile) {
    ctx.beginPath();
    ctx.moveTo(line, 0);
    ctx.lineTo(line, canvas.height);
    ctx.moveTo(0, line);
    ctx.lineTo(canvas.width, line);
    ctx.stroke();
  }
  stoneTexture = toTexture(canvas);
  return stoneTexture;
}

let skyTexture: Texture | null = null;

/** Fundo em gradiente vertical: noite profunda em cima, azul de horizonte embaixo. */
export function skyGradientTexture(): Texture {
  if (skyTexture) return skyTexture;
  const { canvas, ctx } = makeCanvas(64);
  canvas.height = 256;
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#070c16");
  gradient.addColorStop(0.55, "#0d1526");
  gradient.addColorStop(1, "#1b2b47");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = toTexture(canvas);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  skyTexture = texture;
  return skyTexture;
}
