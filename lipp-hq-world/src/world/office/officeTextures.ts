import { CanvasTexture, SRGBColorSpace } from "three";
import { OFFICE_ROOMS, type OfficeRoom } from "./officeLayout";

/**
 * Telas e placas locais, num atlas só: sem fontes ou imagens externas, e sem uma
 * textura por monitor. As telas são cenográficas: nunca mostram dado de bot.
 */
const SCREEN_CELL = { width: 512, height: 320 };
const SCREEN_COLUMNS = 3;
const SCREEN_ROWS = 4;

export const SCREEN_VARIANTS = SCREEN_COLUMNS * SCREEN_ROWS;

function drawScreen(ctx: CanvasRenderingContext2D, variant: number) {
  const { width, height } = SCREEN_CELL;
  ctx.fillStyle = "#101c2d";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#21334e";
  ctx.fillRect(0, 0, width, 30);
  ctx.fillStyle = "#adc8e8";
  ctx.font = "14px monospace";
  ctx.fillText(["lipp hq / editor", "lipp hq / quadro", "lipp hq / gráficos", "lipp hq / notas"][variant % 4]!, 18, 21);
  const palette = ["#69b9dc", "#8a93cf", "#7fa694", "#d9b78a"];
  switch (variant % 4) {
    case 0:
      for (let i = 0; i < 16; i += 1) {
        ctx.fillStyle = palette[(i + variant) % 4]!;
        ctx.fillRect(24 + (i % 3) * 16, 52 + i * 15, 60 + ((i * 67 + variant * 31) % 310), 4);
      }
      break;
    case 1:
      for (let column = 0; column < 4; column += 1) {
        ctx.fillStyle = "#172638";
        ctx.fillRect(20 + column * 120, 48, 110, 256);
        for (let card = 0; card < 3 + ((column + variant) % 3); card += 1) {
          ctx.fillStyle = palette[(column + card) % 4]!;
          ctx.fillRect(28 + column * 120, 58 + card * 44, 94, 34);
        }
      }
      break;
    case 2:
      ctx.strokeStyle = "#4e7fa3";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 24; i += 1) {
        const x = 24 + i * 19;
        const y = 180 + Math.sin(i * 0.6 + variant) * 70 + Math.cos(i * 1.7) * 18;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      for (let i = 0; i < 12; i += 1) {
        ctx.fillStyle = palette[i % 4]!;
        ctx.fillRect(24 + i * 38, 300 - ((i * 37 + variant * 13) % 50), 26, (i * 37 + variant * 13) % 50);
      }
      break;
    default:
      for (let i = 0; i < 11; i += 1) {
        ctx.fillStyle = i % 4 === 0 ? "#d9b78a" : "#7f92aa";
        ctx.fillRect(28, 50 + i * 23, i % 4 === 0 ? 180 : 300 + ((i * 53) % 140), i % 4 === 0 ? 9 : 5);
      }
  }
}

export function screenAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = SCREEN_CELL.width * SCREEN_COLUMNS;
  canvas.height = SCREEN_CELL.height * SCREEN_ROWS;
  const ctx = canvas.getContext("2d")!;
  for (let variant = 0; variant < SCREEN_VARIANTS; variant += 1) {
    ctx.save();
    ctx.translate((variant % SCREEN_COLUMNS) * SCREEN_CELL.width, Math.floor(variant / SCREEN_COLUMNS) * SCREEN_CELL.height);
    ctx.beginPath();
    ctx.rect(0, 0, SCREEN_CELL.width, SCREEN_CELL.height);
    ctx.clip();
    drawScreen(ctx, variant);
    ctx.restore();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function screenUv(variant: number): [number, number, number, number] {
  const column = variant % SCREEN_COLUMNS;
  const row = Math.floor(variant / SCREEN_COLUMNS) % SCREEN_ROWS;
  const v1 = 1 - row / SCREEN_ROWS;
  return [column / SCREEN_COLUMNS, v1 - 1 / SCREEN_ROWS, (column + 1) / SCREEN_COLUMNS, v1];
}

const SIGN_CELL = { width: 1024, height: 256 };
const SIGN_ROWS = 8;
const SIGN_COLUMNS = 2;

function signRoom(room: OfficeRoom, index: number, ctx: CanvasRenderingContext2D) {
  const { width, height } = SIGN_CELL;
  ctx.save();
  ctx.translate((index % SIGN_COLUMNS) * width, Math.floor(index / SIGN_COLUMNS) * height);
  ctx.fillStyle = "#24303e";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#dbe7f4";
  ctx.font = "600 78px sans-serif";
  ctx.fillText(room.name, 48, 112);
  ctx.fillStyle = "#94b4df";
  ctx.font = "32px sans-serif";
  ctx.fillText(`LIPP HQ  /  ${String(index + 1).padStart(2, "0")}`, 50, 177);
  ctx.fillStyle = room.color;
  ctx.fillRect(48, 220, 928, 5);
  ctx.restore();
}

export function signAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = SIGN_CELL.width * SIGN_COLUMNS;
  canvas.height = SIGN_CELL.height * SIGN_ROWS;
  const ctx = canvas.getContext("2d")!;
  OFFICE_ROOMS.forEach((room, index) => signRoom(room, index, ctx));
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function signUv(roomId: string): [number, number, number, number] {
  const index = OFFICE_ROOMS.findIndex((room) => room.id === roomId);
  const column = index % SIGN_COLUMNS;
  const row = Math.floor(index / SIGN_COLUMNS);
  const v1 = 1 - row / SIGN_ROWS;
  return [column / SIGN_COLUMNS, v1 - 1 / SIGN_ROWS, (column + 1) / SIGN_COLUMNS, v1];
}
