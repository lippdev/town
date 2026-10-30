import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";

export interface LabelTextureOptions {
  text: string;
  subtitle?: string;
  background?: string;
  color?: string;
  accent?: string;
  width?: number;
  height?: number;
}

/**
 * Gera o letreiro de um departamento como textura de canvas. Evita fontes
 * carregadas pela rede: a cena funciona offline e a tipografia tem medidas
 * previsíveis.
 */
export function createLabelTexture(options: LabelTextureOptions): CanvasTexture {
  const {
    text,
    subtitle,
    background = "#101a2b",
    color = "#f5f8fc",
    accent = "#38bdf8",
    width = 512,
    height = 176,
  } = options;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D indisponível para gerar o letreiro.");

  context.fillStyle = background;
  context.globalAlpha = 0.96;
  context.beginPath();
  context.roundRect(0, 0, width, height, 22);
  context.fill();

  context.strokeStyle = accent;
  context.lineWidth = 6;
  context.beginPath();
  context.roundRect(5, 5, width - 10, height - 10, 19);
  context.stroke();

  context.fillStyle = accent;
  context.fillRect(24, height - 26, width - 48, 6);

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = color;
  const nameSize = subtitle ? 84 : 100;
  context.font = `700 ${nameSize}px "Segoe UI", "Inter", system-ui, sans-serif`;
  context.fillText(text, width / 2, subtitle ? height / 2 - 20 : height / 2 - 6);

  if (subtitle) {
    context.fillStyle = accent;
    context.font = `600 42px "Segoe UI", "Inter", system-ui, sans-serif`;
    context.fillText(subtitle.toUpperCase(), width / 2, height / 2 + 40);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;
  return texture;
}
