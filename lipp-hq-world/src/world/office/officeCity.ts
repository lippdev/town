import { BoxGeometry, BufferAttribute, CircleGeometry, Color, ConeGeometry, CylinderGeometry, PlaneGeometry, SphereGeometry, type BufferGeometry } from "three";
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

const SURFACE = { plate: -0.06, road: -0.05, mark: -0.045, walk: -0.015, lawn: -0.011, path: -0.007 } as const;
const DARK_GLASS = "#22303f";
/** O chão é neutro e escuro: quem aparece são os volumes. A calçada da torre é a mais clara. */
const GROUND = { asphalt: "#1a1d22", walk: "#464b54", towerWalk: "#6a6e75", plaza: "#565b64", mark: "#7c7b74" } as const;

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
const FACADES = ["#4f5764", "#434a56", "#364355", "#333944"] as const;
/** Teto de uma cor só: de cima, cada prédio é uma mancha limpa, não um remendo. */
const ROOF = "#363b45";
const CORNICE = "#171a1f";
/** Zinco das coroas e mansardas; a pedra clara é só para frisos e marcos. */
const ZINC = "#2a353d";
const LIMESTONE = "#626870";
const GLASS = "#161c24";
/** Um pouco abaixo do âmbar da torre: a janela mais viva da cena continua sendo a dela. */
const LIT_TONES = ["#dfa648", "#d2b57e"] as const;

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

/**
 * Centros mais altos. Os dois primeiros são os ombros da torre, um de cada lado dela na tela: a
 * cidade sobe em volta e o olho desce para a torre. Os outros formam a linha do céu lá atrás.
 */
const CLUSTERS = [
  { x: -58, z: -10, radius: 30, stories: 12.5 },
  { x: -4, z: -64, radius: 30, stories: 12.5 },
  { x: -78, z: -82, radius: 42, stories: 10 },
  { x: -128, z: 18, radius: 34, stories: 9 },
  { x: 26, z: -124, radius: 36, stories: 10 },
] as const;

/** Nenhum vizinho alcança o corpo da torre, de 14 pavimentos mais a coroa. */
const TALLEST_STORIES = 11;

function districtStories(x: number, z: number, seed: number) {
  let peak = 2.5;
  for (const center of CLUSTERS) {
    const distance = Math.hypot(x - center.x, z - center.z) / center.radius;
    peak = Math.max(peak, center.stories * Math.exp(-distance * distance));
  }
  // Variação de lote a lote, sem o prédio solto bem mais alto que os vizinhos: a massa é que lê.
  const wobble = 0.8 + shuffled(seed) * 0.36;
  return Math.min(TALLEST_STORIES, Math.max(2, Math.round(peak * wobble + shuffled(seed + 0.71))));
}

/**
 * Atrás da torre, no eixo da câmera, a altura sobe devagar: é um vale que deixa a coroa contra
 * telhados baixos, e não contra uma parede do mesmo tamanho dela.
 */
function valleyStories(x: number, z: number) {
  const behind = Math.abs(x - z) < VALLEY_HALF_WIDTH && x + z < 0;
  return behind ? 4 + Math.floor(-(x + z) / 36) : TALLEST_STORIES;
}
const VALLEY_HALF_WIDTH = 26;

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

/** As tipologias: a cidade se repete nelas, e é a repetição que deixa o conjunto limpo. */
export type LandmarkStyle = "clock" | "dome" | "mast";
export type BuildingStyle = "sentinel" | "needle" | "municipal" | "foundry" | "tenement" | LandmarkStyle;

export interface CityBuilding extends Lot {
  /** Até a última laje, sempre um número inteiro de pavimentos. */
  height: number;
  /** Até a ponta: coroa e espigão incluídos. É o que a câmera enxerga por cima. */
  top: number;
  style: BuildingStyle;
  crowned: boolean;
}

/** Coroa de degraus e pináculo da sentinela; espigão da agulha. */
const SENTINEL_CROWN = 4.4;
const NEEDLE_SPIRE = 3.5;

/** Escolhe a tipologia pela altura e pelo lote, na mesma ordem em que a cidade vai do miolo à borda. */
function styleOf(lot: Lot, stories: number, distance: number): BuildingStyle {
  const short = Math.min(lot.maxX - lot.minX, lot.maxZ - lot.minZ);
  const long = Math.max(lot.maxX - lot.minX, lot.maxZ - lot.minZ);
  if (stories >= 9 && short >= 10) return "sentinel";
  if (stories >= 6) return "needle";
  if (stories >= 4 && long >= 13) return "municipal";
  if (distance > 105 && long >= 12) return "foundry";
  return "tenement";
}

/** Os volumes de um prédio, de baixo para cima: cada um recua sobre o anterior. */
function tiersOf(style: BuildingStyle, lot: Lot, stories: number): { lot: Lot; stories: number }[] {
  const inset = (from: Lot, by: number): Lot => ({ minX: from.minX + by, maxX: from.maxX - by, minZ: from.minZ + by, maxZ: from.maxZ - by });
  const short = Math.min(lot.maxX - lot.minX, lot.maxZ - lot.minZ);
  if (style === "sentinel") {
    const middle = inset(lot, 1.5);
    return [
      { lot, stories: 3 },
      { lot: middle, stories: stories - 5 },
      { lot: inset(middle, 1.8), stories: 2 },
    ];
  }
  if (style === "needle" && short >= 7) {
    const base = Math.max(2, Math.round(stories * 0.4));
    const shaft = inset(lot, Math.min(1.2, (short - 4) / 2));
    const crown = Math.min(shaft.maxX - shaft.minX, shaft.maxZ - shaft.minZ) >= 6 ? 2 : 0;
    const tiers = [
      { lot, stories: base },
      { lot: shaft, stories: stories - base - crown },
    ];
    if (crown) tiers.push({ lot: inset(shaft, 1), stories: crown });
    return tiers;
  }
  return [{ lot, stories }];
}

/** Pirâmide de faces planas, com a ponta no meio do retângulo. */
function pyramid(width: number, height: number, length: number) {
  const cone = new ConeGeometry(Math.SQRT1_2, 1, 4, 1, true);
  cone.rotateY(Math.PI / 4);
  cone.scale(width, height, length);
  const faceted = cone.toNonIndexed();
  faceted.computeVertexNormals();
  cone.dispose();
  return faceted;
}

/** Perto, cada pavimento marcado; no meio, um sim, outro não; longe, só os rasgos de vidro. */
type Detail = 0 | 1 | 2;
const BAY_BY_DETAIL = [2.4, 3, 4.4] as const;
const SPANDREL_EVERY = [1, 2, 0] as const;
/** Quanto do rasgo é vidro: o resto do vão é pilastra, sempre mais larga que a da torre. */
const GLASS_SHARE = 0.56;
const CORNER_PIER = 0.5;
/** A vidraça acesa é mais estreita que o rasgo: a luz fica no ritmo fino da janela da torre. */
const LIT_PANE = 0.9;
/** O peitoril e a verga: é a mesma folga no vidro, na luz e na faixa de pavimento. */
const SILL = 0.35;

/** As janelas acesas de um prédio: andares inteiros ou colunas, nunca pontos soltos. */
interface Lights {
  floors: number[];
  columns: number;
  from: number;
  to: number;
  tone: string;
}

function lightsFor(seed: number, stories: number, detail: Detail): Lights {
  const tone = LIT_TONES[Math.floor(shuffled(seed + 0.2) * LIT_TONES.length)]!;
  const dark = { floors: [], columns: 0, from: 0, to: 0, tone };
  const roll = shuffled(seed + 0.47);
  if (roll < 0.34) return dark;
  const at = (salt: number) => Math.floor(shuffled(seed + salt) * stories);
  // O andar da diretoria de cada um: nos altos, o último pavimento é o que mais fica aceso.
  if (roll < 0.5 && detail < 2 && stories >= 6) return { ...dark, floors: [stories - 1 - Math.floor(shuffled(seed + 0.53) * 2)] };
  if (roll < 0.76 && detail < 2) return { ...dark, floors: stories >= 6 && roll > 0.66 ? [at(0.51), at(0.57)] : [at(0.51)] };
  const from = at(0.63);
  return { ...dark, columns: stories >= 6 && roll > 0.9 ? 2 : 1, from, to: from + 2 + Math.floor(shuffled(seed + 0.69) * 4) };
}

interface FaceSpec {
  face: "x" | "z";
  at: number;
  start: number;
  span: number;
  bottom: number;
  stories: number;
  wall: string;
  seed: number;
  detail: Detail;
  lights: Lights;
}

/**
 * Fachada vertical: rasgos de vidro de cima a baixo entre pilastras, como na torre, e uma faixa por
 * pavimento. As faixas moram no múltiplo do pavimento a partir do chão: alinham de um prédio a outro.
 */
function facade(city: ColorMerge, glow: ColorMerge, { face, at, start, span, bottom, stories, wall, seed, detail, lights }: FaceSpec) {
  const place = (along: number, y: number, width: number, height: number, color: string, relief: number, into = city) => {
    if (face === "z") into.quad(along, y, at + relief, "z", width, height, color);
    else into.quad(at + relief, y, along, "x", width, height, color);
  };
  const inner = span - CORNER_PIER * 2;
  if (inner <= 1) return;
  const count = Math.max(1, Math.round(inner / BAY_BY_DETAIL[detail]));
  const step = inner / count;
  const glassWidth = step * GLASS_SHARE;
  const pane = Math.min(glassWidth, LIT_PANE);
  const first = start + CORNER_PIER;
  const center = (column: number) => first + (column + 0.5) * step;
  const height = stories * STORY;
  const firstStory = Math.round(bottom / STORY);
  for (let column = 0; column < count; column += 1) place(center(column), bottom + SILL, glassWidth, height - SILL * 2, GLASS, 0.02);
  // Janela acesa vai para a malha própria: de dia ela apaga sem mexer no resto.
  for (const story of lights.floors) {
    if (story < firstStory || story >= firstStory + stories) continue;
    for (let column = 0; column < count; column += 1) place(center(column), story * STORY + SILL, pane, STORY - SILL * 2, lights.tone, 0.03, glow);
  }
  if (lights.columns > 0) {
    const from = Math.max(lights.from, firstStory);
    const to = Math.min(lights.to, firstStory + stories);
    for (let lit = 0; to > from && lit < lights.columns; lit += 1) {
      const column = Math.floor(shuffled(seed + 0.83 + lit * 0.17) * count);
      place(center(column), from * STORY + SILL, pane, (to - from) * STORY - SILL * 2, lights.tone, 0.03, glow);
    }
  }
  const every = SPANDREL_EVERY[detail];
  if (every > 0) {
    const spandrel = mix(wall, GLASS, 0.55);
    for (let story = firstStory + 1; story < firstStory + stories; story += 1) {
      if (story % every === 0) place(start + span / 2, story * STORY - SILL, inner, SILL * 2, spandrel, 0.04);
    }
  }
}

/** Um prédio segundo a tipologia dele: só o que a câmera vê, com o tom sorteado entre os vizinhos. */
function building(city: ColorMerge, glow: ColorMerge, plan: CityBuilding, seed: number) {
  if (plan.style === "clock") return clockTower(city, glow, plan, seed);
  if (plan.style === "dome") return domedHall(city, glow, plan, seed);
  if (plan.style === "mast") return mastTower(city, glow, plan, seed);
  const distance = Math.hypot((plan.minX + plan.maxX) / 2, (plan.minZ + plan.maxZ) / 2);
  const detail: Detail = distance < 70 ? 0 : distance < 118 ? 1 : 2;
  const side = FACADES[Math.floor(shuffled(seed + 0.11) * FACADES.length)]!;
  const shade = mix(side, "#14171d", 0.12);
  const stories = Math.round(plan.height / STORY);
  const lights = lightsFor(seed, stories, detail);
  // Só o que sobe marca a cornija em pedra: no prédio baixo ela afundaria o primeiro plano.
  const cornice = stories >= 6 ? LIMESTONE : CORNICE;
  let base = 0;
  let last: Lot = plan;
  for (const [index, tier] of tiersOf(plan.style, plan, stories).entries()) {
    const top = base + tier.stories * STORY;
    const { minX, maxX, minZ, maxZ } = tier.lot;
    city.prism(minX, maxX, minZ, maxZ, base, top, side, shade, ROOF);
    const shared = { bottom: base, stories: tier.stories, detail, lights };
    facade(city, glow, { ...shared, face: "z", at: maxZ, start: minX, span: maxX - minX, wall: side, seed: seed + index });
    facade(city, glow, { ...shared, face: "x", at: maxX, start: minZ, span: maxZ - minZ, wall: shade, seed: seed + index + 3 });
    if (detail < 2) city.prism(minX - 0.12, maxX + 0.12, minZ - 0.12, maxZ + 0.12, top - 0.02, top + 0.25, cornice, cornice, ROOF);
    base = top;
    last = tier.lot;
  }
  if (!plan.crowned) return;
  const x = (last.minX + last.maxX) / 2;
  const z = (last.minZ + last.maxZ) / 2;
  const width = last.maxX - last.minX;
  const length = last.maxZ - last.minZ;
  if (plan.style === "sentinel") {
    city.prism(x - width * 0.32, x + width * 0.32, z - length * 0.32, z + length * 0.32, base, base + 1.2, ZINC, ZINC, ZINC);
    city.prism(x - width * 0.18, x + width * 0.18, z - length * 0.18, z + length * 0.18, base + 1.2, base + 2.4, ZINC, ZINC, ZINC);
    city.add(new ConeGeometry(0.35, 2, 4), x, base + 3.4, z, LIMESTONE);
  } else {
    city.add(pyramid(width, NEEDLE_SPIRE, length), x, base + NEEDLE_SPIRE / 2, z, ZINC);
  }
}

/**
 * Os marcos, um por quarteirão escolhido à mão, cada um numa praça de pedra. Os dois primeiros ladeiam
 * a torre na tela; o mastro fica mais para trás, na linha do céu. Nenhum chega à última laje dela.
 */
const LANDMARKS: Readonly<Record<string, { style: LandmarkStyle; half: number; stories: number; top: number }>> = {
  "west:1|lot": { style: "clock", half: 6, stories: 11, top: 11 * STORY + 7.2 },
  "lot|north:1": { style: "dome", half: 8, stories: 4, top: 4 * STORY + 10.5 },
  "west:2|lot": { style: "mast", half: 6, stories: 10, top: 10 * STORY + 9.5 },
};
/** Cobre velho, bem apagado: é o único tom fora da ardósia, e de dia um verde mais vivo roubava a cena. */
const PATINA = "#31454a";
const DIAL = "#a8a494";
const DIAL_LIT = "#d4b67e";
const BEACON = "#ff5a3c";

function stoneTier(city: ColorMerge, glow: ColorMerge, lot: Lot, bottom: number, stories: number, wall: string, seed: number) {
  const top = bottom + stories * STORY;
  const { minX, maxX, minZ, maxZ } = lot;
  const shade = mix(wall, "#14171d", 0.12);
  city.prism(minX, maxX, minZ, maxZ, bottom, top, wall, shade, ROOF);
  // Marco não sorteia luz: a dele é o mostrador, as frestas e o aviso.
  const shared = { bottom, stories, detail: 0 as const, lights: { floors: [], columns: 0, from: 0, to: 0, tone: LIT_TONES[0] } };
  facade(city, glow, { ...shared, face: "z", at: maxZ, start: minX, span: maxX - minX, wall, seed });
  facade(city, glow, { ...shared, face: "x", at: maxX, start: minZ, span: maxZ - minZ, wall: shade, seed: seed + 3 });
  city.prism(minX - 0.16, maxX + 0.16, minZ - 0.16, maxZ + 0.16, top - 0.02, top + 0.3, LIMESTONE, LIMESTONE, ROOF);
  return top;
}

/** Mostrador nas duas faces à vista: claro de dia, aceso à noite, e os ponteiros sempre escuros. */
function clockFace(city: ColorMerge, glow: ColorMerge, face: "x" | "z", at: number, along: number, y: number) {
  const disc = (radius: number, relief: number, color: string, target: ColorMerge) => {
    const circle = new CircleGeometry(radius, 20);
    if (face === "x") circle.rotateY(Math.PI / 2);
    if (face === "z") target.add(circle, along, y, at + relief, color);
    else target.add(circle, at + relief, y, along, color);
  };
  disc(2.1, 0.02, CORNICE, city);
  disc(1.9, 0.04, DIAL, city);
  disc(1.9, 0.06, DIAL_LIT, glow);
  const hand = (width: number, height: number, drop: number, shift: number) => {
    if (face === "z") city.quad(along + shift, y - drop, at + 0.08, "z", width, height, CORNICE);
    else city.quad(at + 0.08, y - drop, along - shift, "x", width, height, CORNICE);
  };
  // Nove em ponto, sempre: ponteiro que anda custaria uma malha a mais por quase nada.
  hand(0.16, 1.6, 0, 0);
  hand(1.15, 0.16, 0.08, -0.575);
}

/** Torre do relógio: base larga, fuste estreito, campanário com mostrador e telhado em ponta. */
function clockTower(city: ColorMerge, glow: ColorMerge, plan: CityBuilding, seed: number) {
  const x = (plan.minX + plan.maxX) / 2;
  const z = (plan.minZ + plan.maxZ) / 2;
  const around = (half: number): Lot => ({ minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half });
  let top = stoneTier(city, glow, around(6), 0, 3, FACADES[0], seed);
  top = stoneTier(city, glow, around(3.6), top, 6, FACADES[3], seed + 1);
  const belfry = around(3.4);
  city.prism(belfry.minX, belfry.maxX, belfry.minZ, belfry.maxZ, top, top + 2 * STORY, FACADES[0], mix(FACADES[0], "#14171d", 0.12), ROOF);
  clockFace(city, glow, "z", belfry.maxZ, x, top + STORY);
  clockFace(city, glow, "x", belfry.maxX, z, top + STORY);
  top += 2 * STORY;
  city.prism(belfry.minX - 0.2, belfry.maxX + 0.2, belfry.minZ - 0.2, belfry.maxZ + 0.2, top - 0.02, top + 0.3, LIMESTONE, LIMESTONE, ROOF);
  city.add(pyramid(6.8, 5, 6.8), x, top + 0.3 + 2.5, z, ZINC);
  city.add(new ConeGeometry(0.22, 1.9, 4, 1, true), x, top + 5.3 + 0.95, z, LIMESTONE);
}

/** Palácio de cúpula: colunata, ático, tambor com frestas acesas e cúpula de cobre velho. */
function domedHall(city: ColorMerge, glow: ColorMerge, plan: CityBuilding, seed: number) {
  const x = (plan.minX + plan.maxX) / 2;
  const z = (plan.minZ + plan.maxZ) / 2;
  const around = (half: number): Lot => ({ minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half });
  let top = stoneTier(city, glow, around(8), 0, 3, FACADES[0], seed);
  top = stoneTier(city, glow, around(6), top, 1, FACADES[1], seed + 1);
  const radius = 4.4;
  const drum = 3.4;
  city.add(new CylinderGeometry(radius, radius, drum, 16, 1, true), x, top + drum / 2, z, LIMESTONE);
  // As frestas só na metade que a câmera vê: de +x a +z.
  for (let slit = 0; slit < 5; slit += 1) {
    const angle = (slit + 0.5) * (Math.PI / 5);
    const plane = new PlaneGeometry(0.55, 2.2);
    plane.rotateY(angle);
    glow.add(plane, x + Math.sin(angle) * (radius + 0.03), top + 1.7, z + Math.cos(angle) * (radius + 0.03), DIAL_LIT);
  }
  top += drum;
  city.add(new SphereGeometry(radius + 0.2, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2), x, top, z, PATINA);
  top += radius + 0.2;
  city.add(new CylinderGeometry(0.7, 0.7, 1, 8, 1, true), x, top + 0.4, z, LIMESTONE);
  city.add(new ConeGeometry(0.28, 1.6, 6, 1, true), x, top + 0.9 + 0.8, z, PATINA);
}

/** Prédio do mastro: dois recuos e uma antena fina, com a luz de aviso que aparece de longe. */
function mastTower(city: ColorMerge, glow: ColorMerge, plan: CityBuilding, seed: number) {
  const x = (plan.minX + plan.maxX) / 2;
  const z = (plan.minZ + plan.maxZ) / 2;
  const around = (half: number): Lot => ({ minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half });
  let top = stoneTier(city, glow, around(6), 0, 4, FACADES[2], seed);
  top = stoneTier(city, glow, around(4.6), top, 4, FACADES[2], seed + 1);
  top = stoneTier(city, glow, around(3.2), top, 2, FACADES[2], seed + 2);
  city.add(new ConeGeometry(0.3, 9, 4, 1, true), x, top + 0.3 + 4.5, z, LIMESTONE);
  glow.add(new BoxGeometry(0.5, 0.5, 0.5), x, top + 0.3 + 8.9, z, BEACON);
}

/** Conífera fechada: perto, com tronco e dois tempos; longe, só a copa. */
function tree(city: ColorMerge, x: number, z: number, scale = 1, detailed = true) {
  if (detailed) city.add(new CylinderGeometry(0.09 * scale, 0.12 * scale, 1 * scale, 5, 1, true), x, 0.5 * scale, z, "#2e2622");
  city.add(new ConeGeometry(0.75 * scale, 1.5 * scale, detailed ? 7 : 5, 1, true), x, 1.5 * scale, z, "#2d4234");
  if (detailed) city.add(new ConeGeometry(0.55 * scale, 1.2 * scale, 7, 1, true), x, 2.2 * scale, z, "#34503c");
}

/** Praça em ordem: gramado, duas alamedas em cruz e árvores em fila pela borda, em passo fixo. */
function park(city: ColorMerge, { x: [fromX, toX], z: [fromZ, toZ] }: BlockSpec) {
  const width = toX - fromX;
  const length = toZ - fromZ;
  if (width < 3 || length < 3) return;
  const x = (fromX + toX) / 2;
  const z = (fromZ + toZ) / 2;
  city.flat(fromX + 1, toX - 1, fromZ + 1, toZ - 1, SURFACE.lawn, GARDEN);
  const near = Math.hypot(x, z) < 70;
  const step = near ? 4 : 11;
  const scale = near ? 1 : 1.3;
  const row = (along: "x" | "z", at: number, from: number, to: number) => {
    // Praça curta demais para esta fila: ela sairia do quarteirão.
    if (to < from) return;
    const count = Math.max(1, Math.floor((to - from) / step));
    for (let item = 0; item <= count; item += 1) {
      const position = from + ((to - from) * item) / count;
      // A alameda em cruz passa livre no meio da fila.
      if (Math.abs(position - (along === "x" ? x : z)) < 1.2) continue;
      if (along === "x") tree(city, position, at, scale, near);
      else tree(city, at, position, scale, near);
    }
  };
  if (Math.min(width, length) < 10) {
    if (width >= length) row("x", z, fromX + 2.5, toX - 2.5);
    else row("z", x, fromZ + 2.5, toZ - 2.5);
    return;
  }
  city.flat(x - 0.6, x + 0.6, fromZ + 1, toZ - 1, SURFACE.path, GROUND.walk);
  city.flat(fromX + 1, toX - 1, z - 0.6, z + 0.6, SURFACE.path, GROUND.walk);
  row("x", fromZ + 2.4, fromX + 2.4, toX - 2.4);
  row("x", toZ - 2.4, fromX + 2.4, toX - 2.4);
  row("z", fromX + 2.4, fromZ + 2.4 + step, toZ - 2.4 - step);
  row("z", toX - 2.4, fromZ + 2.4 + step, toZ - 2.4 - step);
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

const GARDEN = "#2d4234";

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
export function cityPlan(): { buildings: CityBuilding[]; parks: BlockSpec[]; plazas: BlockSpec[]; blocks: BlockSpec[] } {
  const buildings: CityBuilding[] = [];
  const parks: BlockSpec[] = [];
  const plazas: BlockSpec[] = [];
  const blocks = cityBlocks().filter(({ key }) => key !== "lot|lot");
  blocks.forEach((block, blockIndex) => {
    const [fromX, toX] = block.x;
    const [fromZ, toZ] = block.z;
    const landmark = LANDMARKS[block.key];
    if (landmark) {
      const x = (fromX + toX) / 2;
      const z = (fromZ + toZ) / 2;
      plazas.push(block);
      buildings.push({ minX: x - landmark.half, maxX: x + landmark.half, minZ: z - landmark.half, maxZ: z + landmark.half, height: landmark.stories * STORY, top: landmark.top, style: landmark.style, crowned: true });
      return;
    }
    // O primeiro quarteirão de cada lado da frente é praça, com a rua da entrada à vista.
    const front = block.key.endsWith("south:0") || block.key.startsWith("east:0");
    if (front || PARKS.has(block.key) || toX - fromX < 6 || toZ - fromZ < 6) {
      parks.push(block);
      return;
    }
    const inner = { minX: fromX + 1.5, maxX: toX - 1.5, minZ: fromZ + 1.5, maxZ: toZ - 1.5 };
    const center = Math.hypot((fromX + toX) / 2, (fromZ + toZ) / 2);
    const lots = splitLots(inner, 37 + blockIndex * 3.3, center < 70 ? 13 : center < 118 ? 16 : 20);
    lots.forEach((lot, lotIndex) => {
      const seed = 100 + blockIndex * 17.7 + lotIndex * 3.1;
      // De vez em quando um miolo aberto: quarteirão sem furo nenhum parece bloco maciço.
      if (shuffled(seed + 0.13) > 0.93) return;
      // A folga entre lotes é uma viela de verdade: é o que separa um volume do outro na tela.
      const gap = shuffled(seed + 0.77) > 0.5 ? 0.7 : 0.4;
      const footprint = { minX: lot.minX + gap, maxX: lot.maxX - gap, minZ: lot.minZ + gap, maxZ: lot.maxZ - gap };
      const x = (lot.minX + lot.maxX) / 2;
      const z = (lot.minZ + lot.maxZ) / 2;
      let stories = Math.min(districtStories(x, z, seed), valleyStories(x, z));
      const ring = Math.max(Math.abs(x), Math.abs(z));
      if (ring < BREATHING + 14) stories = Math.min(stories, 5 + Math.floor(Math.max(0, ring - BREATHING) / 3));
      const cap = occlusionCap(footprint);
      stories = Math.min(stories, Math.floor((cap - 0.3 - EXTRAS) / STORY));
      if (stories < 1) return;
      const height = stories * STORY;
      const style = styleOf(footprint, stories, Math.hypot(x, z));
      // Coroa só onde nada dela pode cobrir o lote da torre: na frente, a linha fica reta.
      const crownFits = cap === Infinity && (style === "sentinel" || style === "needle");
      const crowned = crownFits && shuffled(seed + 0.29) > 0.3;
      const top = height + (crowned ? (style === "sentinel" ? SENTINEL_CROWN : NEEDLE_SPIRE) : 0);
      buildings.push({ ...footprint, height, top, style, crowned });
    });
  });
  return { buildings, parks, plazas, blocks };
}

/** A cornija: o teto do prédio passa um pouco da altura dos pavimentos. */
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

  const { buildings, parks, plazas, blocks } = cityPlan();
  for (const block of blocks) {
    const [fromX, toX] = block.x;
    const [fromZ, toZ] = block.z;
    city.flat(fromX, toX, fromZ, toZ, SURFACE.walk, GROUND.walk);
  }
  buildings.forEach((plan, index) => building(city, glow, plan, 300 + index * 2.3));
  for (const block of parks) park(city, block);
  for (const { x: [fromX, toX], z: [fromZ, toZ] } of plazas) city.flat(fromX + 1, toX - 1, fromZ + 1, toZ - 1, SURFACE.lawn, GROUND.plaza);

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
