import { CanvasTexture, SRGBColorSpace, type BufferGeometry } from "three";
import { BUILDING_HEIGHT, BUILDING_LEVELS, FACADE_BOUNDS, STORY } from "./officeBuilding";
import { ColorMerge } from "./officeCity";
import { ENTRANCE } from "./officeLayout";

/**
 * A fachada do prédio: duas malhas, uma para o que recebe luz e outra para janela acesa. Só
 * pinta as duas faces que a câmera fixa enxerga (+x e +z). Pavimentos entram de baixo para
 * cima: o corte de um andar é só desenhar os vértices até ali, sem refazer nada.
 */
export interface FacadeBuild {
  body: BufferGeometry;
  lit: BufferGeometry;
  /** Vértices até o fim de cada pavimento; o que sobra depois é a coroa. */
  bodyEnds: number[];
  litEnds: number[];
}

const STONE = "#b4aa9a";
const STONE_DARK = "#8d8476";
const GRANITE = "#4b4e52";
const GLASS = "#2a3a4c";
const RIBBON = "#1d2733";
const WARM = "#f3cf94";
const COOL = "#a9c8e4";
const BRASS = "#c2a26a";
const BAY = 1.5;

/** Mesma sequência a cada abertura: a fachada não muda de cara ao recarregar. */
const pseudo = (seed: number) => ((Math.sin(seed * 127.1) * 43758.5453) % 1 + 1) % 1;

function bays(span: number) {
  const count = Math.round(span / BAY);
  return { count, step: span / count };
}

/** Uma fita de janelas nas duas faces, com a coluna de pedra a cada quatro vãos. */
function windowRibbon(body: ColorMerge, lit: ColorMerge, level: number, base: number, sill: number, height: number, litShare: number) {
  const { minX, maxX, minZ, maxZ } = FACADE_BOUNDS;
  const south = bays(maxX - minX);
  const east = bays(maxZ - minZ);
  const y = base + sill;
  body.quad((minX + maxX) / 2, y - 0.08, maxZ + 0.012, "z", maxX - minX, height + 0.16, RIBBON);
  body.quad(maxX + 0.012, y - 0.08, (minZ + maxZ) / 2, "x", maxZ - minZ, height + 0.16, RIBBON);
  const pane = (target: ColorMerge, column: number, face: "x" | "z", color: string, width: number) => {
    if (face === "z") target.quad(minX + (column + 0.5) * south.step, y, maxZ + 0.024, "z", width, height, color);
    else target.quad(maxX + 0.024, y, minZ + (column + 0.5) * east.step, "x", width, height, color);
  };
  for (const [face, grid, salt] of [["z", south, 13], ["x", east, 29]] as const) {
    for (let column = 0; column < grid.count; column += 1) {
      const roll = pseudo(level * 41 + column * salt);
      const width = grid.step - 0.2;
      if (roll < litShare) pane(lit, column, face, roll < litShare * 0.75 ? WARM : COOL, width);
      else pane(body, column, face, roll > 0.8 ? "#34485d" : GLASS, width);
    }
    for (let column = 0; column <= grid.count; column += 4) {
      const offset = column * grid.step;
      if (face === "z") body.box(minX + offset, base, maxZ + 0.04, 0.26, STORY, 0.16, STONE_DARK);
      else body.box(maxX + 0.04, base, minZ + offset, 0.16, STORY, 0.26, STONE_DARK);
    }
  }
}

/** Um vão da vitrine: vidro aceso com bandeira escura em cima, para não virar uma faixa chapada. */
function storefront(body: ColorMerge, lit: ColorMerge, x: number, z: number, face: "x" | "z", width: number, column: number) {
  lit.quad(x, 0.28, z, face, width, 1.9, ["#c9a673", "#d8b884", "#bd9a69"][column % 3]!);
  body.quad(x, 2.22, z, face, width, 0.5, "#38485a");
}

/** Pedestal escuro de vidro alto, com marquise e porta clara: daqui se reconhece a entrada. */
function groundLevel(body: ColorMerge, lit: ColorMerge) {
  const { minX, maxX, minZ, maxZ } = FACADE_BOUNDS;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  body.box((minX + maxX) / 2, 0, (minZ + maxZ) / 2, width, STORY, depth, GRANITE);
  const south = bays(width);
  const east = bays(depth);
  for (let column = 0; column < south.count; column += 1) {
    const x = minX + (column + 0.5) * south.step;
    if (Math.abs(x - ENTRANCE.x) < 1.6) continue;
    storefront(body, lit, x, maxZ + 0.024, "z", south.step - 0.16, column);
  }
  for (let column = 0; column < east.count; column += 1) {
    storefront(body, lit, maxX + 0.024, minZ + (column + 0.5) * east.step, "x", east.step - 0.16, column + 2);
  }
  // Faixa de latão entre o pedestal e a torre.
  body.box((minX + maxX) / 2, STORY - 0.42, (minZ + maxZ) / 2, width + 0.16, 0.14, depth + 0.16, BRASS);

  // Portal, porta e marquise, no eixo da entrada do prédio.
  const x = ENTRANCE.x;
  body.box(x, 0, maxZ + 0.08, 3.5, 3.0, 0.16, "#2e3136");
  lit.quad(x, 0.02, maxZ + 0.175, "z", 2.5, 2.3, "#ffe3b0");
  for (const offset of [-1.25, 0, 1.25]) body.box(x + offset, 0, maxZ + 0.19, 0.07, 2.32, 0.04, "#23262a");
  body.box(x, 2.32, maxZ + 0.19, 2.6, 0.07, 0.04, "#23262a");
  body.box(x, 2.66, maxZ + 0.95, 4.4, 0.16, 1.9, "#26292e");
  body.box(x, 2.56, maxZ + 0.95, 4.5, 0.1, 2.0, BRASS);
  for (const offset of [-2, 2]) body.box(x + offset, 0, maxZ + 1.75, 0.12, 2.6, 0.12, "#26292e");
  body.box(x, -0.015, maxZ + 1.0, 4.8, 0.05, 2.2, "#77726a");
  // Canteiros ao lado da porta.
  for (const offset of [-3.6, 3.6]) {
    body.box(x + offset, 0, maxZ + 0.55, 1.8, 0.5, 0.8, "#3b3e42");
    body.box(x + offset, 0.5, maxZ + 0.55, 1.65, 0.1, 0.65, "#4b8d57");
  }
}

function upperLevel(body: ColorMerge, lit: ColorMerge, level: number) {
  const { minX, maxX, minZ, maxZ } = FACADE_BOUNDS;
  const base = level * STORY;
  const top = level === BUILDING_LEVELS - 1;
  body.box((minX + maxX) / 2, base, (minZ + maxZ) / 2, maxX - minX, STORY, maxZ - minZ, top ? "#a59b8a" : STONE);
  if (top) {
    // O último pavimento tem o vidro mais alto e mais aceso: é o que se vê de longe.
    windowRibbon(body, lit, level, base, 0.32, 2.6, 0.52);
    body.box((minX + maxX) / 2, base - 0.05, (minZ + maxZ) / 2, maxX - minX + 0.14, 0.1, maxZ - minZ + 0.14, BRASS);
  } else {
    windowRibbon(body, lit, level, base, 0.86, 1.9, 0.3);
  }
}

function crown(body: ColorMerge, lit: ColorMerge) {
  const { minX, maxX, minZ, maxZ } = FACADE_BOUNDS;
  const x = (minX + maxX) / 2;
  const z = (minZ + maxZ) / 2;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const top = BUILDING_HEIGHT;
  body.box(x, top, z, width + 0.24, 0.5, depth + 0.24, STONE_DARK);
  body.box(x, top + 0.5, z, width - 0.5, 0.02, depth - 0.5, "#3a3d42");
  // Casa de máquinas e antena, recuadas: dão silhueta sem cobrir a placa na frente.
  body.box(x - 3, top + 0.5, z - 2.4, 8, 1.7, 5, "#7b7468");
  body.box(x - 3, top + 2.2, z - 2.4, 8.3, 0.1, 5.3, BRASS);
  for (const [offsetX, offsetZ] of [[4.5, -5], [6.6, -5], [4.5, -3], [6.6, -3]] as const) body.box(x + offsetX, top + 0.5, z + offsetZ, 1.5, 0.9, 1.5, "#62656a");
  body.box(x - 6.5, top + 2.2, z - 3.4, 0.09, 2.2, 0.09, "#4b4e52");
  lit.box(x - 6.5, top + 4.4, z - 3.4, 0.14, 0.14, 0.14, "#ff6b5e");
}

export function buildFacade(): FacadeBuild {
  const body = new ColorMerge();
  const lit = new ColorMerge();
  const bodyEnds: number[] = [];
  const litEnds: number[] = [];
  for (let level = 0; level < BUILDING_LEVELS; level += 1) {
    if (level === 0) groundLevel(body, lit);
    else upperLevel(body, lit, level);
    bodyEnds.push(body.vertices);
    litEnds.push(lit.vertices);
  }
  crown(body, lit);
  return { body: body.build(), lit: lit.build(), bodyEnds, litEnds };
}

/** A placa do alto do prédio, desenhada aqui: nenhuma fonte ou imagem de fora. */
export function buildingSignTexture(text = "LIPP HQ") {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#14171d";
  context.fillRect(0, 0, 768, 128);
  context.fillStyle = "#ffe7c4";
  context.font = `800 ${text.length > 8 ? 76 : 100}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 384, 70);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
