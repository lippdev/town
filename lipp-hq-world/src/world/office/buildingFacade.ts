import { CanvasTexture, ConeGeometry, PlaneGeometry, RingGeometry, SRGBColorSpace, type BufferGeometry } from "three";
import { BASE_LEVELS, BUILDING_HEIGHT, BUILDING_LEVELS, CROWN_ROOF, CROWN_STEPS, FACADE_BOUNDS, HELIPAD, SPIRE_HEIGHT, STORY } from "./officeBuilding";
import { ColorMerge } from "./officeCity";
import { ENTRANCE } from "./officeLayout";

/**
 * A fachada da torre: duas malhas, uma para o que recebe luz e outra para janela acesa. Só pinta
 * as duas faces que a câmera fixa enxerga (+x e +z). Pavimentos entram de baixo para cima, e cada
 * detalhe fica no intervalo do seu: o corte de um andar é só desenhar os vértices até ali. Tudo
 * o que passa da altura de um pavimento mora na coroa, depois do último deles.
 */
export interface FacadeBuild {
  body: BufferGeometry;
  lit: BufferGeometry;
  /** Vértices até o fim de cada pavimento; o que sobra depois é a coroa. */
  bodyEnds: number[];
  litEnds: number[];
}

const BASE = "#1d2127";
const STONE = "#5a606b";
const PILASTER = "#737985";
const PIER = "#808692";
const SPANDREL = "#30363f";
const GLASS = "#131921";
const GLASS_SKY = "#222c38";
const BRONZE = "#a6834c";
const WARM = "#ffd07a";
const SOFT = "#e6c489";

/** Passo das pilastras: um vão estreito, para a torre ler na vertical. */
const BAY = 1.5;
const PILASTER_WIDTH = 0.35;
const PILASTER_RELIEF = 0.12;
const WINDOW_WIDTH = 0.72;
/** Cada quantos vãos a pilastra é mais grossa: é o que dá o ritmo art déco. */
const MAJOR_EVERY = 4;
/** Colunas duplas da base: um par a cada dois vãos. */
const BASE_BAYS = 2;
const COLUMN_WIDTH = 0.3;
const COLUMN_RELIEF = 0.22;
const COLUMN_GAP = 0.2;
const SHARE_LIT = 0.2;

/** Mesma sequência a cada abertura: a fachada não muda de cara ao recarregar. */
const pseudo = (seed: number) => ((Math.sin(seed * 127.1) * 43758.5453) % 1 + 1) % 1;

function bays(span: number) {
  const count = Math.round(span / BAY);
  return { count, step: span / count };
}

type Face = "x" | "z";

/** Peça encostada numa face que a câmera vê, medida ao longo dela. */
function faceBox(target: ColorMerge, face: Face, along: number, bottom: number, width: number, height: number, relief: number, color: string) {
  const { maxX, maxZ } = FACADE_BOUNDS;
  if (face === "z") target.box(along, bottom, maxZ + relief / 2, width, height, relief, color);
  else target.box(maxX + relief / 2, bottom, along, relief, height, width, color);
}

function faceQuad(target: ColorMerge, face: Face, along: number, bottom: number, width: number, height: number, depth: number, color: string) {
  const { maxX, maxZ } = FACADE_BOUNDS;
  if (face === "z") target.quad(along, bottom, maxZ + depth, "z", width, height, color);
  else target.quad(maxX + depth, bottom, along, "x", width, height, color);
}

/** As duas faces à vista: começo e tamanho de cada uma no eixo dela. */
function faces() {
  const { minX, maxX, minZ, maxZ } = FACADE_BOUNDS;
  return [
    { face: "z" as const, start: minX, span: maxX - minX, salt: 13 },
    { face: "x" as const, start: minZ, span: maxZ - minZ, salt: 29 },
  ];
}

/** Janela estreita e funda entre duas pilastras, com o peitoril escuro: a coluna de vidro segue contínua. */
function shaftLevel(body: ColorMerge, lit: ColorMerge, level: number, sill: number, height: number, share: number) {
  const base = level * STORY;
  for (const { face, start, span, salt } of faces()) {
    const grid = bays(span);
    for (let column = 0; column < grid.count; column += 1) {
      const along = start + (column + 0.5) * grid.step;
      faceQuad(body, face, along, base, grid.step - PILASTER_WIDTH, STORY, 0.012, SPANDREL);
      const roll = pseudo(level * 41 + column * salt);
      if (roll < share) faceQuad(lit, face, along, base + sill, WINDOW_WIDTH, height, 0.024, roll < share * 0.7 ? WARM : SOFT);
      else faceQuad(body, face, along, base + sill, WINDOW_WIDTH, height, 0.024, roll > 0.85 ? GLASS_SKY : GLASS);
      faceQuad(body, face, along, base + sill, 0.05, height, 0.036, SPANDREL);
    }
    for (let column = 0; column <= grid.count; column += 1) {
      const major = column % MAJOR_EVERY === 0;
      const corner = column === 0 || column === grid.count;
      if (corner) continue;
      faceBox(body, face, start + column * grid.step, base, major ? 0.62 : PILASTER_WIDTH, STORY, major ? 0.18 : PILASTER_RELIEF, major ? PIER : PILASTER);
    }
  }
  cornerPiers(body, base, STORY, 0.2, PIER);
}

/** Os cantos à vista são mais grossos que as pilastras: seguram a torre de cima a baixo. */
function cornerPiers(body: ColorMerge, base: number, height: number, relief: number, color: string) {
  const { minX, maxX, minZ, maxZ } = FACADE_BOUNDS;
  const size = 1.1;
  body.box(maxX - size / 2 + relief, base, maxZ - size / 2 + relief, size, height, size, color);
  body.box(minX + size / 2 - relief, base, maxZ - size / 2 + relief, size, height, size, color);
  body.box(maxX - size / 2 + relief, base, minZ + size / 2 - relief, size, height, size, color);
}

/** Pavimento da base: pares de colunas, vidro alto e friso de bronze por cima. */
function baseLevel(body: ColorMerge, lit: ColorMerge, level: number) {
  const { minX, maxX, minZ, maxZ } = FACADE_BOUNDS;
  const base = level * STORY;
  const isDoor = (face: Face, along: number) => level === 0 && face === "z" && Math.abs(along - ENTRANCE.x) < 2.2;
  for (const { face, start, span } of faces()) {
    const grid = bays(span);
    const step = grid.step * BASE_BAYS;
    const count = Math.round(span / step);
    const pitch = span / count;
    for (let column = 0; column < count; column += 1) {
      const along = start + (column + 0.5) * pitch;
      if (isDoor(face, along)) continue;
      const width = pitch - 2 * COLUMN_WIDTH - COLUMN_GAP;
      if (level === 0) {
        faceQuad(lit, face, along, 0.3, width, 2.1, 0.024, ["#b99a68", "#c9a673", "#ad8f60"][column % 3]!);
        faceQuad(body, face, along, 2.4, width, 0.52, 0.024, GLASS_SKY);
        for (const offset of [-width / 4, width / 4]) faceQuad(body, face, along + offset, 0.3, 0.05, 2.1, 0.036, BRONZE);
      } else {
        // Mezanino da base: mais pedra que vidro, para o peso ficar embaixo.
        faceQuad(body, face, along, base + 0.7, width * 0.72, 2.1, 0.024, GLASS);
        faceQuad(body, face, along, base + 0.7, 0.05, 2.1, 0.036, BRONZE);
      }
    }
    for (let column = 0; column <= count; column += 1) {
      const along = start + column * pitch;
      if (column === 0 || column === count || isDoor(face, along)) continue;
      for (const side of [-1, 1]) faceBox(body, face, along + side * (COLUMN_GAP + COLUMN_WIDTH) / 2, base, COLUMN_WIDTH, STORY - 0.3, COLUMN_RELIEF, STONE);
    }
  }
  cornerPiers(body, base, STORY, 0.28, STONE);
  // Friso de bronze sobre a base: o de cima, mais largo, fecha o volume antes da torre.
  const frieze = level === BASE_LEVELS - 1 ? 0.3 : 0.16;
  body.box((minX + maxX) / 2, base + STORY - frieze - 0.02, (minZ + maxZ) / 2, maxX - minX + 0.5, frieze, maxZ - minZ + 0.5, BRONZE);
}

/** Portal alto, porta clara e marquise, no eixo da entrada: daqui se reconhece a porta. */
function entrance(body: ColorMerge, lit: ColorMerge) {
  const { maxZ } = FACADE_BOUNDS;
  const x = ENTRANCE.x;
  body.box(x, 0, maxZ + 0.08, 4.2, 3.2, 0.16, "#2a2d33");
  for (const side of [-1, 1]) body.box(x + side * 2.05, 0, maxZ + 0.13, 0.26, 3.2, 0.26, BRONZE);
  lit.quad(x, 0.02, maxZ + 0.175, "z", 2.5, 2.3, "#ffe3b0");
  for (const offset of [-1.25, 0, 1.25]) body.box(x + offset, 0, maxZ + 0.19, 0.07, 2.32, 0.04, "#23262a");
  body.box(x, 2.32, maxZ + 0.19, 2.6, 0.07, 0.04, "#23262a");
  body.box(x, 2.66, maxZ + 0.95, 4.4, 0.16, 1.9, "#1f2228");
  body.box(x, 2.56, maxZ + 0.95, 4.5, 0.1, 2.0, BRONZE);
  for (const offset of [-2, 2]) body.box(x + offset, 0, maxZ + 1.75, 0.12, 2.6, 0.12, "#1f2228");
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
  body.box((minX + maxX) / 2, base, (minZ + maxZ) / 2, maxX - minX, STORY, maxZ - minZ, STONE);
  // A Diretoria tem o vidro mais alto e mais aceso, e é o que se vê de longe.
  if (top) shaftLevel(body, lit, level, 0.3, 2.75, 0.5);
  else shaftLevel(body, lit, level, 0.5, 2.4, SHARE_LIT);
}

/** Um degrau da coroa: volume recuado, pilastras altas, frestas de luz e beiral de bronze. */
function crownStep(body: ColorMerge, lit: ColorMerge, bottom: number, inset: number, height: number, index: number, roof: number) {
  const { minX, maxX, minZ, maxZ } = FACADE_BOUNDS;
  const x = (minX + maxX) / 2;
  const z = (minZ + maxZ) / 2;
  const width = maxX - minX - inset * 2;
  const depth = maxZ - minZ - inset * 2;
  body.box(x, bottom, z, width, height, depth, STONE);
  body.box(x, bottom + height - 0.14, z, width + 0.3, 0.14, depth + 0.3, BRONZE);
  // Laje descoberta: o escuro faz o degrau de cima saltar.
  body.box(x, bottom + height, z, width - 0.1, 0.01, depth - 0.1, roof === index ? "#14171c" : "#23262b");
  const south = maxZ - inset;
  const east = maxX - inset;
  const fins = Math.max(3, Math.round(width / 2.6));
  const finsEast = Math.max(2, Math.round(depth / 2.6));
  for (let fin = 0; fin <= fins; fin += 1) {
    const along = x - width / 2 + (fin * width) / fins;
    body.box(along, bottom, south + 0.09, 0.3, height - 0.14, 0.18, PIER);
    if (fin < fins) {
      const middle = along + width / fins / 2;
      if (index > 0) lit.quad(middle, bottom + 0.3, south + 0.02, "z", 0.2, height - 0.8, SOFT);
      else body.quad(middle, bottom + 0.3, south + 0.02, "z", 0.2, height - 0.8, GLASS);
    }
  }
  for (let fin = 0; fin <= finsEast; fin += 1) {
    const along = z - depth / 2 + (fin * depth) / finsEast;
    body.box(east + 0.09, bottom, along, 0.18, height - 0.14, 0.3, PIER);
    if (fin < finsEast) lit.quad(east + 0.02, bottom + 0.3, along + depth / finsEast / 2, "x", 0.2, height - 0.8, SOFT);
  }
}

function crown(body: ColorMerge, lit: ColorMerge) {
  const { minX, maxX, minZ, maxZ } = FACADE_BOUNDS;
  const x = (minX + maxX) / 2;
  const z = (minZ + maxZ) / 2;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  // Beiral da última laje, em volta do andar inteiro.
  body.box(x, BUILDING_HEIGHT - 0.04, z, width + 0.5, 0.34, depth + 0.5, BRONZE);
  body.box(x, BUILDING_HEIGHT + 0.3, z, width - 0.02, 0.01, depth - 0.02, "#191c21");
  let bottom = BUILDING_HEIGHT + 0.01;
  for (const [index, step] of CROWN_STEPS.entries()) {
    crownStep(body, lit, bottom, step.inset, step.height, index, CROWN_STEPS.length - 1);
    bottom += step.height;
  }
  helipad(body, lit);
}

/** Tinta no piso do deque: uma folha só com a face de cima. */
function deckPaint(target: ColorMerge, x: number, z: number, width: number, length: number, height: number, color: string) {
  const sheet = new PlaneGeometry(width, length);
  sheet.rotateX(-Math.PI / 2);
  target.add(sheet, x, HELIPAD.top + height, z, color);
}

/** Deque em balanço sobre o último degrau, com a marcação, as luzes de borda, a escada e o mastro. */
function helipad(body: ColorMerge, lit: ColorMerge) {
  const { x, z, half, bottom, top, mast, kiosk } = HELIPAD;
  const side = half * 2;
  // Pé recuado sobre o último degrau e colunas no degrau de baixo: é o que segura o balanço.
  body.box(x, CROWN_ROOF, z, 8.6, bottom - CROWN_ROOF, 5, STONE);
  const lower = CROWN_ROOF - CROWN_STEPS.at(-1)!.height;
  for (const along of [-4.4, -1.47, 1.47, 4.4]) {
    body.box(x + along, lower, z + half - 0.42, 0.26, bottom - lower, 0.26, PIER);
    body.box(x + along, bottom - 0.42, z + half - 0.42 - 1.05, 0.2, 0.26, 2.1, SPANDREL);
  }
  // Laje com o friso de bronze dos degraus: de longe, o deque é mais um deles.
  body.box(x, bottom, z, side, top - bottom, side, "#2b2f36");
  body.box(x, bottom + 0.06, z, side + 0.26, 0.14, side + 0.26, BRONZE);
  deckPaint(body, x, z, side - 0.1, side - 0.1, 0.004, "#3f444c");
  // Borda, círculo e H: a tinta fica um fio acima do piso, para não piscar com ele.
  const inset = half - 0.5;
  for (const sign of [-1, 1]) {
    deckPaint(body, x + sign * inset, z, 0.16, inset * 2 + 0.16, 0.008, "#d9b86a");
    deckPaint(body, x, z + sign * inset, inset * 2 + 0.16, 0.16, 0.008, "#d9b86a");
  }
  const ring = new RingGeometry(3.3, 3.62, 48);
  ring.rotateX(-Math.PI / 2);
  body.add(ring, x, top + 0.012, z, "#e4e1d6");
  for (const sign of [-1, 1]) deckPaint(body, x + sign * 0.95, z, 0.56, 3, 0.012, "#e4e1d6");
  deckPaint(body, x, z, 1.5, 0.56, 0.012, "#e4e1d6");
  // Luzes de borda na malha acesa: brilham à noite e quase somem de dia, como as janelas.
  const count = 8;
  for (let index = 0; index <= count; index += 1) {
    const along = -half + 0.2 + (index * (side - 0.4)) / count;
    for (const sign of [-1, 1]) {
      lit.box(x + along, top, z + sign * (half - 0.2), 0.17, 0.08, 0.17, "#8df2ae");
      if (index > 0 && index < count) lit.box(x + sign * (half - 0.2), top, z + along, 0.17, 0.08, 0.17, "#8df2ae");
    }
  }
  // Guarda-corpo baixo: abaixo do rotor e dos esquis, só marca a beira.
  const rail = 0.56;
  const edge = half + 0.02;
  for (const sign of [-1, 1]) {
    body.box(x + sign * edge, top + rail, z, 0.07, 0.07, side + 0.1, PILASTER);
    body.box(x, top + rail, z + sign * edge, side + 0.1, 0.07, 0.07, PILASTER);
  }
  for (let index = 0; index <= 5; index += 1) {
    const along = -edge + (index * edge * 2) / 5;
    for (const sign of [-1, 1]) {
      body.box(x + along, top, z + sign * edge, 0.06, rail, 0.06, SPANDREL);
      if (index > 0 && index < 5) body.box(x + sign * edge, top, z + along, 0.06, rail, 0.06, SPANDREL);
    }
  }
  // Casinha da escada: porta acesa para +z, de onde o chefe sai e por onde ele some.
  const hutX = x + kiosk.x;
  const hutZ = z + kiosk.z;
  const front = hutZ + kiosk.size / 2;
  body.box(hutX, top, hutZ, kiosk.size, kiosk.height, kiosk.size, STONE);
  body.box(hutX, top + kiosk.height, hutZ, kiosk.size + 0.22, 0.12, kiosk.size + 0.22, BRONZE);
  body.box(hutX, top, front + 0.03, 1.04, 1.74, 0.06, SPANDREL);
  lit.quad(hutX, top + 0.02, front + 0.07, "z", 0.82, 1.6, "#ffe3b0");
  lit.quad(hutX + kiosk.size / 2 + 0.01, top + 0.5, hutZ, "x", 0.2, 1.1, SOFT);
  // O mastro, recuado: base em dois tempos e ponta fina, do degrau de baixo até o alto da coroa.
  const mastX = x + mast.x;
  const mastZ = z + mast.z;
  const peak = CROWN_ROOF + SPIRE_HEIGHT;
  body.box(mastX, lower, mastZ, 0.96, 3.2, 0.96, STONE);
  body.box(mastX, lower + 3.2, mastZ, 0.58, 1.1, 0.58, PIER);
  body.box(mastX, lower + 4.3, mastZ, 0.66, 0.07, 0.66, BRONZE);
  const needle = peak - (lower + 4.37);
  body.add(new ConeGeometry(0.17, needle, 8), mastX, lower + 4.37 + needle / 2, mastZ, BRONZE);
  // A lâmpada de obstrução fica colada na ponta: à noite, é ela que marca o alto da torre.
  lit.box(mastX, peak - 0.8, mastZ, 0.2, 0.14, 0.2, "#ff5a48");
}

export function buildFacade(): FacadeBuild {
  const body = new ColorMerge();
  const lit = new ColorMerge();
  const bodyEnds: number[] = [];
  const litEnds: number[] = [];
  for (let level = 0; level < BUILDING_LEVELS; level += 1) {
    if (level < BASE_LEVELS) {
      const { minX, maxX, minZ, maxZ } = FACADE_BOUNDS;
      body.box((minX + maxX) / 2, level * STORY, (minZ + maxZ) / 2, maxX - minX, STORY, maxZ - minZ, BASE);
      baseLevel(body, lit, level);
      if (level === 0) entrance(body, lit);
    } else upperLevel(body, lit, level);
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
  // Placa comprida encolhe até caber: o canvas tem largura fixa.
  const room = context.measureText(text).width;
  if (room > 720) context.font = `800 ${Math.floor(76 * (720 / room))}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 384, 70);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
