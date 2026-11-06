import { BoxGeometry, BufferAttribute, Color, ConeGeometry, CylinderGeometry, PlaneGeometry, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { AZIMUTH, ELEVATION } from "./officeCamera";
import { ENTRANCE, FLOOR_BOUNDS, type OfficeBounds } from "./officeLayout";
import { ELEVATOR_CORE } from "./officeLobby";

/**
 * A cidade em volta da torre, só na demonstração: tudo numa malha só, com a cor nos vértices,
 * então custa uma chamada de desenho. A câmera olha de +x +z, e isso manda na composição: o alto
 * fica atrás da torre, e na frente a altura é limitada pelo que esconderia o lote (`occlusionCap`).
 * As medidas são as da torre: um pavimento tem a mesma altura lá e aqui.
 */
/** Chega até onde a torre inteira cabe em tela: do alto dela se vê mais chão. Mais para o fundo, onde a tela aponta. */
export const CITY_BOUNDS: OfficeBounds = { minX: -160, maxX: 128, minZ: -160, maxZ: 126 };

/** O que a câmera enquadra de início: o prédio e a rua da entrada. */
export const CITY_VIEW: OfficeBounds = { minX: FLOOR_BOUNDS.minX - 1, maxX: FLOOR_BOUNDS.maxX + 1, minZ: FLOOR_BOUNDS.minZ - 1, maxZ: 15.5 };

/** Altura de um pavimento, igual à da torre. Aqui para o prédio não depender da cidade e vice-versa. */
const STORY = 3.4;

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
const DARK_GLASS = "#22303f";
/** O chão é neutro e escuro: quem aparece são os volumes. A calçada da torre é a mais clara. */
const GROUND = { asphalt: "#26282e", walk: "#55575c", towerWalk: "#7d7e80", mark: "#8c8a80" } as const;

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

  /** Volume só com o que a câmera vê: topo e faces +x e +z, dezoito vértices em vez de 36. */
  prism(minX: number, maxX: number, minZ: number, maxZ: number, bottom: number, top: number, side: string, shade: string, roof: string) {
    const width = maxX - minX;
    const length = maxZ - minZ;
    const height = top - bottom;
    this.quad((minX + maxX) / 2, bottom, maxZ, "z", width, height, side);
    this.quad(maxX, bottom, (minZ + maxZ) / 2, "x", length, height, shade);
    const cover = new PlaneGeometry(width, length);
    cover.rotateX(-Math.PI / 2);
    this.add(cover, (minX + maxX) / 2, top, (minZ + maxZ) / 2, roof);
  }

  /** Marca ou piso sem espessura, seis vértices. */
  flat(minX: number, maxX: number, minZ: number, maxZ: number, y: number, color: string) {
    const cover = new PlaneGeometry(maxX - minX, maxZ - minZ);
    cover.rotateX(-Math.PI / 2);
    this.add(cover, (minX + maxX) / 2, y, (minZ + maxZ) / 2, color);
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

type Span = readonly [number, number];
type Lot = { minX: number; maxX: number; minZ: number; maxZ: number };

const WEST_TO = -160;

function mix(color: string, to: string, amount: number) {
  return `#${new Color(color).lerp(new Color(to), amount).getHexString()}`;
}

/** Ardósia, carvão, azul-escuro e pedra fria: quatro tons vizinhos, mais escuros que a pedra da torre. */
const FACADES = ["#3f4552", "#4a505c", "#384354", "#555a63"] as const;
/** Teto de uma cor só: de cima, cada prédio é uma mancha limpa, não um remendo. */
const ROOF = "#2a2d34";
const CORNICE = "#22252b";
const GLASS = "#141a23";
const LIT_TONES = ["#f4b860", "#f0c67a"] as const;

/** Tamanhos de quarteirão e larguras de rua de cada lado da torre: sem passo fixo, sem tapete. */
const STREETS = {
  east: { blocks: [11.5, 24, 17, 30, 20, 26], roads: [4, 6, 3.5, 3.5, 6, 3.5] },
  west: { blocks: [18, 26, 20, 32, 22, 24, 20], roads: [3.5, 6, 3.5, 3.5, 6, 3.5] },
  south: { blocks: [8.5, 22, 28, 16, 24, 20], roads: [3.5, 6, 3.5, 3.5, 6] },
  north: { blocks: [16, 30, 18, 26, 22, 24, 20], roads: [3.5, 3.5, 6, 3.5, 3.5, 6] },
} as const;

/** Quarteirões e ruas de um eixo, partindo do fim das ruas da torre até a ponta da cidade. */
function axis(from: number, limit: number, direction: 1 | -1, { blocks, roads }: { blocks: readonly number[]; roads: readonly number[] }) {
  const spans: Span[] = [];
  const streets: { span: Span; width: number }[] = [];
  let at = from;
  for (let index = 0; index < blocks.length; index += 1) {
    const end = at + direction * blocks[index]!;
    const clipped = direction > 0 ? Math.min(end, limit) : Math.max(end, limit);
    spans.push(direction > 0 ? [at, clipped] : [clipped, at]);
    if (clipped === limit) break;
    const width = roads[index] ?? 3.5;
    const after = end + direction * width;
    streets.push({ span: direction > 0 ? [end, Math.min(after, limit)] : [Math.max(after, limit), end], width });
    at = after;
    if (direction > 0 ? at >= limit : at <= limit) break;
  }
  return { spans, streets };
}

/** O que precisa ficar à vista: a torre com a calçada dela e a rua da entrada. */
export const PROTECTED_GROUND: OfficeBounds = { minX: ROADS.west.to, maxX: ROADS.east.from, minZ: ROADS.north.to, maxZ: ROADS.south.to };
/** Quanto um metro de altura esconde de chão, em x e em z, com a câmera fixa em 45°/30°. */
const HIDES_PER_METER = (Math.cos(ELEVATION) * Math.sin(AZIMUTH)) / Math.sin(ELEVATION);

/** A maior altura em que um prédio não cobre o lote da torre; infinita para quem nunca o alcança. */
export function occlusionCap(lot: Lot, ground: OfficeBounds = PROTECTED_GROUND): number {
  const reach = Math.max(lot.minX - ground.maxX, lot.minZ - ground.maxZ, 0);
  // Andando para o fundo da tela, a projeção dele nunca passa pelo lote: fica de lado ou atrás.
  if (lot.maxX - reach < ground.minX || lot.maxZ - reach < ground.minZ) return Infinity;
  return reach / HIDES_PER_METER;
}

/** Centros mais altos, todos atrás ou ao lado da torre: é onde o olho aceita a massa. */
const CLUSTERS = [
  { x: -78, z: -82, radius: 52, stories: 11.5 },
  { x: -128, z: 18, radius: 34, stories: 8 },
  { x: 26, z: -124, radius: 36, stories: 9 },
] as const;

/** Nenhum vizinho alcança o corpo da torre, de 14 pavimentos mais a coroa. */
const TALLEST_STORIES = 11;

function districtStories(x: number, z: number, seed: number) {
  let peak = 2.5;
  for (const center of CLUSTERS) {
    const distance = Math.hypot(x - center.x, z - center.z) / center.radius;
    peak = Math.max(peak, center.stories * Math.exp(-distance * distance));
  }
  // Variação de lote a lote; de vez em quando, um prédio bem mais alto que os vizinhos.
  const wobble = 0.68 + shuffled(seed) * 0.5;
  const hero = shuffled(seed + 0.37) > 0.9 ? 1.45 : 1;
  return Math.min(TALLEST_STORIES, Math.max(2, Math.round(peak * wobble * hero + shuffled(seed + 0.71) * 1.5)));
}

/** Corta o quarteirão em lotes de tamanho desigual, sempre pelo lado maior. */
function splitLots(lot: Lot, seed: number, max: number, out: Lot[] = []): Lot[] {
  const width = lot.maxX - lot.minX;
  const length = lot.maxZ - lot.minZ;
  if (Math.max(width, length) <= max) {
    out.push(lot);
    return out;
  }
  const at = 0.36 + shuffled(seed) * 0.28;
  if (width >= length) {
    const cut = lot.minX + width * at;
    splitLots({ ...lot, maxX: cut }, seed * 1.31 + 2, max, out);
    splitLots({ ...lot, minX: cut }, seed * 1.17 + 5, max, out);
  } else {
    const cut = lot.minZ + length * at;
    splitLots({ ...lot, maxZ: cut }, seed * 1.31 + 7, max, out);
    splitLots({ ...lot, minZ: cut }, seed * 1.17 + 11, max, out);
  }
  return out;
}

export interface CityBuilding extends Lot {
  height: number;
}

/** Fachada de um pavimento por vez, com detalhe conforme a distância: perto, janela; longe, faixa. */
function facade(city: ColorMerge, glow: ColorMerge, face: "x" | "z", at: number, start: number, span: number, bottom: number, stories: number, glass: string, seed: number, near: boolean, far: number) {
  const place = (along: number, y: number, width: number, height: number, color: string, relief = 0, into = city) => {
    if (face === "z") into.quad(along, y, at + relief, "z", width, height, color);
    else into.quad(at + relief, y, along, "x", width, height, color);
  };
  const bay = 2.6 + shuffled(seed) * 1.4;
  const count = Math.max(1, Math.round(span / bay));
  const step = span / count;
  const lit = LIT_TONES[Math.floor(shuffled(seed + 0.2) * LIT_TONES.length)]!;
  const inner = span - 0.8;
  if (inner <= 0.4) return;
  // Longe, um pavimento sim, outro não: lê igual e custa metade.
  const every = far > 0.55 ? 2 : 1;
  for (let story = 0; story < stories; story += every) {
    const y = bottom + story * STORY + 0.85;
    place(start + span / 2, y, inner, 1.9 * (every === 2 ? 1.4 : 1), glass);
    if (!near && far > 0.55) continue;
    for (let column = 0; column < count; column += 1) {
      if (shuffled(seed + story * 7.1 + column * 13.3) < 0.8) continue;
      // Janela acesa vai para a malha própria: de dia ela apaga sem mexer no resto.
      place(start + (column + 0.5) * step, y, Math.min(step * 0.62, 1.8), 1.7, lit, 0.03, glow);
    }
  }
}

/** Um prédio: base, às vezes um corpo recuado e uma casa de máquinas. Só o que a câmera vê. */
function building(city: ColorMerge, glow: ColorMerge, lot: Lot, stories: number, seed: number): number {
  const distance = Math.hypot((lot.minX + lot.maxX) / 2, (lot.minZ + lot.maxZ) / 2);
  const far = Math.min(1, distance / 170);
  const near = distance < 62;
  const side = FACADES[Math.floor(shuffled(seed + 0.11) * FACADES.length)]!;
  const shade = mix(side, "#14171d", 0.22);
  const roof = ROOF;
  const glass = GLASS;
  const stack = (from: Lot, base: number, count: number, salt: number) => {
    const top = base + count * STORY;
    city.prism(from.minX, from.maxX, from.minZ, from.maxZ, base, top, side, shade, roof);
    facade(city, glow, "z", from.maxZ + 0.02, from.minX, from.maxX - from.minX, base, count, glass, seed + salt, near, far);
    facade(city, glow, "x", from.maxX + 0.02, from.minZ, from.maxZ - from.minZ, base, count, glass, seed + salt + 3, near, far);
    if (far < 0.6) city.prism(from.minX - 0.1, from.maxX + 0.1, from.minZ - 0.1, from.maxZ + 0.1, top, top + 0.22, CORNICE, CORNICE, roof);
    return top;
  };
  const width = lot.maxX - lot.minX;
  const length = lot.maxZ - lot.minZ;
  const roomy = Math.min(width, length) > 8;
  if (stories >= 6 && roomy && shuffled(seed + 0.83) > 0.35) {
    const podium = 2 + Math.floor(shuffled(seed + 0.9) * 2);
    let top = stack(lot, 0, podium, 1);
    const inset = 1.2 + shuffled(seed + 0.4) * 1.4;
    const upper = { minX: lot.minX + inset, maxX: lot.maxX - inset, minZ: lot.minZ + inset, maxZ: lot.maxZ - inset };
    const crowned = stories >= 10 && Math.min(upper.maxX - upper.minX, upper.maxZ - upper.minZ) > 6;
    top = stack(upper, top, stories - podium - (crowned ? 2 : 0), 2);
    if (crowned) {
      top = stack({ minX: upper.minX + 1.6, maxX: upper.maxX - 1.6, minZ: upper.minZ + 1.6, maxZ: upper.maxZ - 1.6 }, top, 2, 3);
    }
    return top;
  }
  const top = stack(lot, 0, stories, 1);
  if (near && stories >= 3 && shuffled(seed + 0.61) > 0.5) {
    const x = lot.minX + width * 0.35;
    const z = lot.minZ + length * 0.4;
    city.prism(x - 1, x + 1, z - 1, z + 1, top, top + 1.1, CORNICE, CORNICE, roof);
  }
  return top;
}

function tree(city: ColorMerge, x: number, z: number, scale = 1, detailed = true) {
  city.add(new CylinderGeometry(0.09 * scale, 0.12 * scale, 1 * scale, 6), x, 0.5 * scale, z, "#2e2622");
  city.add(new ConeGeometry(0.75 * scale, 1.5 * scale, 7), x, 1.5 * scale, z, "#2f4a38");
  if (detailed) city.add(new ConeGeometry(0.55 * scale, 1.2 * scale, 7), x, 2.2 * scale, z, "#36543f");
}

/** Marcas no meio da via: de perto, tracejadas; lá longe, mais espaçadas. */
function lane(city: ColorMerge, along: "x" | "z", at: number, from: number, to: number) {
  for (let position = from; position < to;) {
    const end = Math.min(to, position + 1.4);
    if (along === "x") city.flat(position, end, at - 0.05, at + 0.05, SURFACE.mark, GROUND.mark);
    else city.flat(at - 0.05, at + 0.05, position, end, SURFACE.mark, GROUND.mark);
    position += Math.abs(position) + Math.abs(at) < 70 ? 3 : 7;
  }
}

const GARDEN = "#39503f";

/** Quarteirões deliberadamente abertos, pelo índice em cada eixo. A cidade respira neles. */
const PARKS: ReadonlySet<string> = new Set(["east:1|west:1", "west:2|north:2", "east:3|south:1", "west:4|south:2", "east:2|north:3", "west:5|north:0", "lot|south:3"]);

interface BlockSpec {
  x: Span;
  z: Span;
  key: string;
}

/** Todos os quarteirões, com o nome de cada um: é o que deixa escolher as praças à mão. */
function cityBlocks(): BlockSpec[] {
  const { minX, maxX, minZ, maxZ } = CITY_BOUNDS;
  const xs: { span: Span; key: string }[] = [
    ...axis(ROADS.east.to, maxX, 1, STREETS.east).spans.map((span, index) => ({ span, key: `east:${index}` })),
    { span: [ROADS.west.to, ROADS.east.from], key: "lot" },
    ...axis(ROADS.west.from, minX, -1, STREETS.west).spans.map((span, index) => ({ span, key: `west:${index}` })),
  ];
  const zs: { span: Span; key: string }[] = [
    ...axis(ROADS.south.to, maxZ, 1, STREETS.south).spans.map((span, index) => ({ span, key: `south:${index}` })),
    { span: [ROADS.north.to, ROADS.south.from], key: "lot" },
    ...axis(ROADS.north.from, minZ, -1, STREETS.north).spans.map((span, index) => ({ span, key: `north:${index}` })),
  ];
  return xs.flatMap((x) => zs.map((z) => ({ x: x.span, z: z.span, key: `${x.key}|${z.key}` })));
}

/** Respiro em volta da torre: os quarteirões colados a ela são baixos ou abertos. */
const BREATHING = 26;

/** A planta da cidade: onde há prédio e de que altura, sem desenhar nada. Também é o que o teste lê. */
export function cityPlan(): { buildings: CityBuilding[]; parks: BlockSpec[]; blocks: BlockSpec[] } {
  const buildings: CityBuilding[] = [];
  const parks: BlockSpec[] = [];
  const blocks = cityBlocks().filter(({ key }) => key !== "lot|lot");
  blocks.forEach((block, blockIndex) => {
    const [fromX, toX] = block.x;
    const [fromZ, toZ] = block.z;
    // O primeiro quarteirão de cada lado da frente é praça, com a rua da entrada à vista.
    const front = block.key.endsWith("south:0") || block.key.startsWith("east:0");
    if (front || PARKS.has(block.key) || toX - fromX < 6 || toZ - fromZ < 6) {
      parks.push(block);
      return;
    }
    const inner = { minX: fromX + 1.5, maxX: toX - 1.5, minZ: fromZ + 1.5, maxZ: toZ - 1.5 };
    const center = Math.hypot((fromX + toX) / 2, (fromZ + toZ) / 2);
    const lots = splitLots(inner, 37 + blockIndex * 3.3, center < 70 ? 11 : 15);
    lots.forEach((lot, lotIndex) => {
      const seed = 100 + blockIndex * 17.7 + lotIndex * 3.1;
      // De vez em quando um miolo aberto: quarteirão sem furo nenhum parece bloco maciço.
      if (shuffled(seed + 0.13) > 0.93) return;
      const gap = shuffled(seed + 0.77) > 0.5 ? 0.25 : 0.1;
      const building = { minX: lot.minX + gap, maxX: lot.maxX - gap, minZ: lot.minZ + gap, maxZ: lot.maxZ - gap };
      let stories = districtStories((lot.minX + lot.maxX) / 2, (lot.minZ + lot.maxZ) / 2, seed);
      const ring = Math.max(Math.abs((lot.minX + lot.maxX) / 2), Math.abs((lot.minZ + lot.maxZ) / 2));
      if (ring < BREATHING + 14) stories = Math.min(stories, 3 + Math.floor(Math.max(0, ring - BREATHING) / 5));
      const cap = occlusionCap(building);
      stories = Math.min(stories, Math.floor((cap - 0.3 - EXTRAS) / STORY));
      if (stories >= 1) buildings.push({ ...building, height: stories * STORY });
    });
  });
  return { buildings, parks, blocks };
}

/** Cornija e casa de máquinas: o teto do prédio passa um pouco da altura dos pavimentos. */
const EXTRAS = 1.4;

/** A cidade em duas malhas: o corpo, que recebe luz, e as janelas acesas, que brilham por conta própria. */
export function buildCity(): { body: BufferGeometry; lit: BufferGeometry } {
  const city = new ColorMerge();
  const glow = new ColorMerge();
  const { minX, maxX, minZ, maxZ } = CITY_BOUNDS;
  city.slab(minX, maxX, minZ, maxZ, SURFACE.plate, 1.4, GROUND.asphalt);
  // Calçada em volta do prédio; a laje do escritório cobre o meio dela.
  city.slab(ROADS.west.to, ROADS.east.from, ROADS.north.to, ROADS.south.from, SURFACE.walk, 0.05, GROUND.towerWalk);

  const { south, north, east, west } = ROADS;
  lane(city, "x", (south.from + south.to) / 2, minX + 1, maxX);
  lane(city, "x", (north.from + north.to) / 2, minX + 1, maxX);
  lane(city, "z", (east.from + east.to) / 2, minZ + 1, maxZ);
  lane(city, "z", (west.from + west.to) / 2, minZ + 1, maxZ);
  for (const { streets } of [axis(ROADS.east.to, maxX, 1, STREETS.east), axis(ROADS.west.from, WEST_TO, -1, STREETS.west)]) {
    for (const { span, width } of streets) if (width >= 6) lane(city, "z", (span[0] + span[1]) / 2, minZ + 1, maxZ);
  }
  for (const { streets } of [axis(ROADS.south.to, maxZ, 1, STREETS.south), axis(ROADS.north.from, minZ, -1, STREETS.north)]) {
    for (const { span, width } of streets) if (width >= 6) lane(city, "x", (span[0] + span[1]) / 2, minX + 1, maxX);
  }

  const { buildings, parks, blocks } = cityPlan();
  for (const block of blocks) {
    const [fromX, toX] = block.x;
    const [fromZ, toZ] = block.z;
    city.flat(fromX, toX, fromZ, toZ, SURFACE.walk, GROUND.walk);
  }
  buildings.forEach((lot, index) => building(city, glow, lot, Math.round(lot.height / STORY), 300 + index * 2.3));
  parks.forEach((park, index) => {
    const [fromX, toX] = park.x;
    const [fromZ, toZ] = park.z;
    const x = (fromX + toX) / 2;
    const z = (fromZ + toZ) / 2;
    if (toX - fromX < 3 || toZ - fromZ < 3) return;
    city.flat(fromX + 1, toX - 1, fromZ + 1, toZ - 1, SURFACE.walk + 0.004, GARDEN);
    const near = Math.hypot(x, z) < 70;
    const count = Math.min(near ? 14 : 8, Math.floor(((toX - fromX) * (toZ - fromZ)) / (near ? 28 : 70)));
    for (let item = 0; item < count; item += 1) {
      const seed = 700 + index * 11 + item * 5.3;
      tree(city, fromX + 2 + shuffled(seed) * (toX - fromX - 4), fromZ + 2 + shuffled(seed + 0.5) * (toZ - fromZ - 4), near ? 1 : 1.3, near);
    }
  });

  // Árvores das calçadas da torre, por fora de quem chega de carro.
  for (let x = -12; x <= 13; x += 4.5) {
    if (Math.abs(x - ENTRANCE.x) > 2) tree(city, x, 11.15, 0.8);
  }
  for (let z = -10; z <= 9; z += 4.75) tree(city, 14.1, z, 0.8);
  // A calçada dos fundos cede o lugar da caixa dos elevadores.
  for (let x = -12; x <= 13; x += 5) if (x < ELEVATOR_CORE.bounds.minX - 1 || x > ELEVATOR_CORE.bounds.maxX + 1) tree(city, x, -11.6, 0.8);
  return { body: city.build(), lit: glow.build() };
}

/** Só o corpo da cidade, para quem mede a extensão e o peso dela. */
export function buildCityGeometry() {
  const { body, lit } = buildCity();
  lit.dispose();
  return body;
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
