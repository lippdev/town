import { CanvasTexture, SRGBColorSpace } from "three";

/** Textos e telas locais: sem fontes ou imagens externas no runtime. */
export function labelTexture(title: string, subtitle: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#24303e";
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = "#dbe7f4";
  ctx.font = "600 78px sans-serif";
  ctx.fillText(title, 48, 112);
  ctx.fillStyle = "#94b4df";
  ctx.font = "32px sans-serif";
  ctx.fillText(subtitle, 50, 177);
  ctx.fillStyle = "#3b82f6";
  ctx.fillRect(48, 220, 928, 5);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function screenTexture(variant: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#101c2d";
  ctx.fillRect(0, 0, 512, 320);
  ctx.fillStyle = "#21334e";
  ctx.fillRect(0, 0, 512, 30);
  ctx.fillStyle = "#adc8e8";
  ctx.font = "14px monospace";
  ctx.fillText(variant === 0 ? "pulse / engenharia" : "world.scene / preview", 18, 21);
  if (variant === 0) {
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = ["#69b9dc", "#8a93cf", "#7fa694", "#d9b78a"][i % 4]!;
      ctx.fillRect(24 + (i % 3) * 16, 52 + i * 15, 60 + ((i * 67) % 310), 4);
    }
  } else {
    ctx.strokeStyle = "#4e7fa3";
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      ctx.strokeRect(70 + i * 13, 90 + i * 7, 190, 120);
    }
    ctx.fillStyle = "#77b8bd";
    ctx.fillRect(25, 285, 280, 3);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
