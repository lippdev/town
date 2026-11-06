import { BoxGeometry, BufferAttribute, Color, ConeGeometry, CylinderGeometry, PlaneGeometry, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ENTRANCE, FLOOR_BOUNDS, type OfficeBounds } from "./officeLayout";
import { ELEVATOR_CORE } from "./officeLobby";

/**
 * A cidade em volta do escritório, só na demonstração: tudo numa malha só, com a cor nos
 * vértices, então custa uma chamada de desenho. A câmera olha de +x +z: prédio alto só atrás
 * do escritório; na frente, baixo, para não cobrir a rua.
 */
/** Chega até onde a torre inteira cabe em tela: do alto dela se vê mais chão. Mais para o fundo, onde a tela aponta. */
export const CITY_BOUNDS: OfficeBounds = { minX: -160, maxX: 128, minZ: -160, maxZ: 126 };

/** O entorno desenhado à mão. Daqui para fora os quarteirões são gerados. */
const CITY_CORE: OfficeBounds = { minX: -34, maxX: 30, minZ: -30, maxZ: 28 };
const OUTER_ROAD_WIDTH = 3.5;
const OUTER_BLOCK = 26;
const LOT = 9;

/** O que a câmera enquadra de início: o prédio e a rua da entrada. */
export const CITY_VIEW: OfficeBounds = { minX: FLOOR_BOUNDS.minX - 1, maxX: FLOOR_BOUNDS.maxX + 1, minZ: FLOOR_BOUNDS.minZ - 1, maxZ: 15.5 };

export const ROADS = {
  south: { from: 11.5, to: 15.5 },
  north: { from: -15, to: -12 },
  east: { from: 14.5, to: 18.5 },
  west: { from: -17, to: -14 },
} as const;

/** Faixa de quem chega: encostada na calçada da entrada. */
export const CURB_LANE_Z = 12.5;
/** Faixa contrária: o trânsito passa por ela e nunca atravessa o carro parado. */
export const FAR_LANE_Z = 14.5;
export const SOUTH_WALK_Z = 10.3;
export const EAST_WALK_X = 13;

const SURFACE = { plate: -0.06, road: -0.05, mark: -0.045, walk: -0.015 } as const;
const FRONT_HEIGHT = 2.6;
const BODY_COLORS = ["#6f7480", "#8a7f73", "#5f6b78", "#7d6f6a", "#6a7770", "#8c8880"] as const;
const LIT = "#f2c777";
const DARK_GLASS = "#22303f";

export class ColorMerge {
  private readonly parts: BufferGeometry[] = [];
  /** Vértices já somados: é o que deixa cortar a malha pronta com `setDrawRange`. */
  vertices = 0;

  add(geometry: BufferGeometry, x: number, y: number, z: number, color: string) {
    geometry.deleteAttribute("uv");
    geometry.translate(x, y, z);
    const { r, g, b } = new Color(color);
    const count = geometry.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) colors.set([r, g, b], index * 3);
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    const part = geometry.index ? geometry.toNonIndexed() : geometry;
    this.vertices += part.getAttribute("position").count;
    this.parts.push(part);
  }

  /** `top` é a face de cima: é o que encosta nas outras camadas do chão. */
  slab(minX: number, maxX: number, minZ: number, maxZ: number, top: number, depth: number, color: string) {
    this.add(new BoxGeometry(maxX - minX, depth, maxZ - minZ), (minX + maxX) / 2, top - depth / 2, (minZ + maxZ) / 2, color);
  }

  box(x: number, bottom: number, z: number, width: number, height: number, length: number, color: string) {
    this.add(new BoxGeometry(width, height, length), x, bottom + height / 2, z, color);
  }

  /** Janela: só a face que a câmera vê, seis vértices em vez dos 36 de uma caixa. */
  pane(x: number, y: number, z: number, facing: "x" | "z", color: string) {
    const pane = new PlaneGeometry(0.7, 0.8);
    if (facing === "x") pane.rotateY(Math.PI / 2);
    this.add(pane, x, y + 0.4, z, color);
  }

  /** Face voltada para +z ou +x, com a base em `y`. Só o que a câmera vê: seis vértices. */
  quad(x: number, y: number, z: number, facing: "x" | "z", width: number, height: number, color: string) {
    const quad = new PlaneGeometry(width, height);
    if (facing === "x") quad.rotateY(Math.PI / 2);
    this.add(quad, x, y + height / 2, z, color);
  }

  build() {
    const merged = mergeGeometries(this.parts);
    for (const part of this.parts) part.dispose();
    if (!merged) throw new Error("A cidade não tem peças.");
    return merged;
  }
}

/** Sequência fixa: mesma cidade a cada abertura. */
function shuffled(seed: number) {
  return ((Math.sin(seed * 127.1) * 43758.5453) % 1 + 1) % 1;
}

function building(city: ColorMerge, minX: number, maxX: number, minZ: number, maxZ: number, height: number, seed: number) {
  const x = (minX + maxX) / 2;
  const z = (minZ + maxZ) / 2;
  const width = maxX - minX;
  const length = maxZ - minZ;
  const color = BODY_COLORS[Math.floor(shuffled(seed) * BODY_COLORS.length)]!;
  city.box(x, 0, z, width, height, length, color);
  city.box(x, height, z, width + 0.2, 0.14, length + 0.2, "#4b4f57");
  // Janela só nas duas faces que a câmera vê.
  const floors = Math.max(1, Math.floor((height - 0.7) / 1.25));
  for (let floor = 0; floor < floors; floor += 1) {
    const y = 0.7 + floor * 1.25;
    const columnsZ = Math.floor(width / 1.3);
    for (let column = 0; column < columnsZ; column += 1) {
      const lit = shuffled(seed + floor * 7 + column * 13) > 0.72;
      city.pane(minX + (column + 0.5) * (width / columnsZ), y, maxZ + 0.03, "z", lit ? LIT : DARK_GLASS);
    }
    const columnsX = Math.floor(length / 1.3);
    for (let column = 0; column < columnsX; column += 1) {
      const lit = shuffled(seed + floor * 11 + column * 17) > 0.72;
      city.pane(maxX + 0.03, y, minZ + (column + 0.5) * (length / columnsX), "x", lit ? LIT : DARK_GLASS);
    }
  }
}

function tree(city: ColorMerge, x: number, z: number, scale = 1) {
  city.add(new CylinderGeometry(0.09 * scale, 0.12 * scale, 1 * scale, 6), x, 0.5 * scale, z, "#5c4230");
  city.add(new ConeGeometry(0.75 * scale, 1.5 * scale, 7), x, 1.5 * scale, z, "#3f7a4a");
  city.add(new ConeGeometry(0.55 * scale, 1.2 * scale, 7), x, 2.2 * scale, z, "#4b8d57");
}

function lane(city: ColorMerge, axis: "x" | "z", at: number, from: number, to: number) {
  for (let position = from; position < to; position += 3) {
    const end = Math.min(to, position + 1.4);
    if (axis === "x") city.slab(position, end, at - 0.05, at + 0.05, SURFACE.mark, 0.004, "#d9d4c4");
    else city.slab(at - 0.05, at + 0.05, position, end, SURFACE.mark, 0.004, "#d9d4c4");
  }
}

type Span = readonly [number, number];

/** Ruas e quarteirões de um eixo, do entorno até a ponta da cidade. */
function outerStreets(coreMin: number, coreMax: number, min: number, max: number) {
  const roads: Span[] = [];
  const blocks: Span[] = [];
  const step = OUTER_ROAD_WIDTH + OUTER_BLOCK;
  for (let at = coreMax; at < max; at += step) {
    roads.push([at, at + OUTER_ROAD_WIDTH]);
    blocks.push([at + OUTER_ROAD_WIDTH, Math.min(max, at + step)]);
  }
  for (let at = coreMin; at > min; at -= step) {
    roads.push([at - OUTER_ROAD_WIDTH, at]);
    blocks.push([Math.max(min, at - step), at - OUTER_ROAD_WIDTH]);
  }
  return { roads, blocks };
}

/** Enche um quarteirão de prédios ou, de vez em quando, faz dele uma praça. */
function outerBlock(city: ColorMerge, [fromX, toX]: Span, [fromZ, toZ]: Span, seed: number) {
  const columns = Math.floor((toX - fromX - 2) / LOT);
  const rows = Math.floor((toZ - fromZ - 2) / LOT);
  if (columns < 1 || rows < 1) return;
  if (shuffled(seed) > 0.82) {
    city.slab(fromX, toX, fromZ, toZ, SURFACE.walk, 0.05, "#5c7a58");
    for (let index = 0; index < columns * rows; index += 1) {
      tree(city, fromX + 2 + shuffled(seed + index * 3) * (toX - fromX - 4), fromZ + 2 + shuffled(seed + index * 5) * (toZ - fromZ - 4));
    }
    return;
  }
  // Na frente do escritório os prédios são baixos: a câmera olha por cima deles.
  const front = fromX >= CITY_CORE.maxX || fromZ >= CITY_CORE.maxZ;
  const width = (toX - fromX - 2) / columns;
  const length = (toZ - fromZ - 2) / rows;
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const lot = seed + column * 19 + row * 23;
      const height = front ? 2.5 + shuffled(lot) * 4 : 4 + shuffled(lot) * 7;
      const minX = fromX + 1 + column * width;
      const minZ = fromZ + 1 + row * length;
      building(city, minX, minX + width - 1, minZ, minZ + length - 1, height, lot);
    }
  }
}

function outerCity(city: ColorMerge) {
  const { minX, maxX, minZ, maxZ } = CITY_BOUNDS;
  const alongX = outerStreets(CITY_CORE.minX, CITY_CORE.maxX, minX, maxX);
  const alongZ = outerStreets(CITY_CORE.minZ, CITY_CORE.maxZ, minZ, maxZ);
  for (const [from, to] of alongX.roads) {
    city.slab(from, to, minZ, maxZ, SURFACE.road, 0.02, "#33363c");
    lane(city, "z", (from + to) / 2, minZ + 1, maxZ);
  }
  for (const [from, to] of alongZ.roads) {
    city.slab(minX, maxX, from, to, SURFACE.road, 0.02, "#33363c");
    lane(city, "x", (from + to) / 2, minX + 1, maxX);
  }
  // As ruas do entorno seguem até a ponta da cidade e dividem também os quarteirões de fora.
  const { south, north, east, west } = ROADS;
  const coreX: Span[] = [[CITY_CORE.minX, west.from], [west.to, east.from], [east.to, CITY_CORE.maxX]];
  const coreZ: Span[] = [[CITY_CORE.minZ, north.from], [north.to, south.from], [south.to, CITY_CORE.maxZ]];
  const xs = [...coreX, ...alongX.blocks];
  const zs = [...coreZ, ...alongZ.blocks];
  let seed = 500;
  for (const x of xs) {
    for (const z of zs) {
      seed += 1;
      if (!coreX.includes(x) || !coreZ.includes(z)) outerBlock(city, x, z, seed);
    }
  }
}

export function buildCityGeometry() {
  const city = new ColorMerge();
  const { minX, maxX, minZ, maxZ } = CITY_BOUNDS;
  city.slab(minX, maxX, minZ, maxZ, SURFACE.plate, 1.4, "#55595f");
  // Calçada em volta do prédio; a laje do escritório cobre o meio dela.
  city.slab(ROADS.west.to, ROADS.east.from, ROADS.north.to, ROADS.south.from, SURFACE.walk, 0.05, "#a8a59c");

  const { south, north, east, west } = ROADS;
  city.slab(minX, maxX, south.from, south.to, SURFACE.road, 0.02, "#33363c");
  city.slab(minX, maxX, north.from, north.to, SURFACE.road, 0.02, "#33363c");
  city.slab(east.from, east.to, minZ, maxZ, SURFACE.road, 0.02, "#33363c");
  city.slab(west.from, west.to, minZ, maxZ, SURFACE.road, 0.02, "#33363c");
  lane(city, "x", (south.from + south.to) / 2, minX + 1, maxX);
  lane(city, "x", (north.from + north.to) / 2, minX + 1, maxX);
  lane(city, "z", (east.from + east.to) / 2, minZ + 1, maxZ);
  lane(city, "z", (west.from + west.to) / 2, minZ + 1, maxZ);

  // Quarteirões: x de oeste a leste, z do fundo para a frente. Só há prédio fora das ruas.
  const columns: readonly (readonly [number, number])[] = [[-33, -26], [-25, -18], [-13, -6], [-5, 2], [3, 13], [19.5, 29]];
  const rows: readonly (readonly [number, number])[] = [[-29, -23], [-22, -16], [22, 27]];
  const west_rows: readonly (readonly [number, number])[] = [[-11, -3], [-2, 5], [6, 10.5]];
  let seed = 1;
  for (const [fromX, toX] of columns) {
    for (const [fromZ, toZ] of rows) {
      seed += 1;
      const front = fromZ > 0 && fromX > -18;
      const height = front ? 1.6 + shuffled(seed) * (FRONT_HEIGHT - 1.6) : 4 + shuffled(seed) * 7;
      building(city, fromX, toX, fromZ, toZ, height, seed);
    }
  }
  for (const [fromZ, toZ] of west_rows) {
    for (const [fromX, toX] of [[-33, -26], [-25, -18]] as const) {
      seed += 1;
      building(city, fromX, toX, fromZ, toZ, 4 + shuffled(seed) * 6, seed);
    }
  }
  // Praças na frente da rua: prédio ali esconderia o carro e a entrada.
  city.slab(CITY_CORE.minX, CITY_CORE.maxX, 16.5, 21, SURFACE.walk, 0.05, "#5c7a58");
  city.slab(19.5, CITY_CORE.maxX, -11, 21, SURFACE.walk, 0.05, "#5c7a58");
  for (let x = -30; x < 28; x += 6.5) tree(city, x, 18.8 + (shuffled(x) - 0.5) * 2.2);
  for (let z = -9; z < 15; z += 5.5) tree(city, 24 + (shuffled(z) - 0.5) * 3, z);

  for (let x = -12; x <= 13; x += 4.5) {
    if (Math.abs(x - ENTRANCE.x) > 2) tree(city, x, 11.15, 0.8);
  }
  for (let z = -10; z <= 9; z += 4.75) tree(city, 14.1, z, 0.8);
  // A calçada dos fundos cede o lugar da caixa dos elevadores.
  for (let x = -12; x <= 13; x += 5) if (x < ELEVATOR_CORE.bounds.minX - 1 || x > ELEVATOR_CORE.bounds.maxX + 1) tree(city, x, -11.6, 0.8);
  outerCity(city);
  return city.build();
}

/** Carro de 3,4 m, olhando para +z com rotação zero. */
export function buildCarGeometry(body: string) {
  const car = new ColorMerge();
  car.box(0, 0.22, 0, 1.45, 0.42, 3.4, body);
  car.box(0, 0.64, -0.2, 1.28, 0.42, 1.8, DARK_GLASS);
  car.box(0, 1.06, -0.2, 1.28, 0.05, 1.8, body);
  car.box(0, 0.36, 1.71, 1.2, 0.1, 0.02, "#f5e7b0");
  car.box(0, 0.36, -1.71, 1.2, 0.1, 0.02, "#b3312c");
  for (const x of [-0.72, 0.72]) {
    for (const z of [-1.1, 1.1]) {
      const wheel = new CylinderGeometry(0.28, 0.28, 0.2, 10);
      wheel.rotateZ(Math.PI / 2);
      car.add(wheel, x, 0.28, z, "#17181b");
    }
  }
  return car.build();
}
