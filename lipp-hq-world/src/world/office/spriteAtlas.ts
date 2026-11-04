/**
 * Atlas de personagem descrito por um JSON ao lado do PNG. Trocar a arte é trocar os dois
 * arquivos: nada aqui conhece as medidas do Filipe. Sem Three.js, para ser testado sozinho.
 */

export interface SpriteAnimation {
  row: number;
  /** Coluna do primeiro quadro; o parado da arte atual é um quadro no meio da caminhada. */
  firstColumn: number;
  frames: number;
  /** Metros andados por quadro: o pé não desliza. Quem tem isto não usa fps. */
  stepMeters?: number;
  /** Quadros por segundo, para o que anima parado. Zero é pose fixa. */
  fps?: number;
}

export type SpriteFacing = "front" | "back";
export type SpriteAnimationName = "walk-front" | "walk-back" | "idle-front" | "idle-back";
const ANIMATION_NAMES: readonly SpriteAnimationName[] = ["walk-front", "walk-back", "idle-front", "idle-back"];

export interface SpriteAtlas {
  /** PNG, relativo ao JSON. */
  image: string;
  cell: { width: number; height: number };
  /** Linha da célula onde a sola encosta no chão. */
  soleRow: number;
  /** Linhas ocupadas pela figura: elas medem a altura em pé, em qualquer resolução. */
  visibleRows: number;
  animations: Record<SpriteAnimationName, SpriteAnimation>;
}

const isCount = (value: unknown, minimum: number): value is number => Number.isInteger(value) && (value as number) >= minimum;

/** Lê e valida o JSON: arte errada avisa o que faltou, em vez de desenhar lixo. */
export function parseSpriteAtlas(raw: unknown): SpriteAtlas {
  const { image, cell, soleRow, visibleRows, animations } = (raw ?? {}) as Partial<SpriteAtlas>;
  if (typeof image !== "string" || image === "") throw new Error("Atlas sem o campo image.");
  if (!cell || !isCount(cell.width, 1) || !isCount(cell.height, 1)) throw new Error("Atlas sem cell.width e cell.height inteiros.");
  if (!isCount(soleRow, 1) || soleRow > cell.height) throw new Error("soleRow do atlas fora da célula.");
  if (!isCount(visibleRows, 1) || visibleRows > soleRow) throw new Error("visibleRows do atlas não cabe acima da sola.");
  const parsed = {} as Record<SpriteAnimationName, SpriteAnimation>;
  for (const name of ANIMATION_NAMES) {
    const animation = animations?.[name];
    if (!animation) throw new Error(`Atlas sem a animação ${name}.`);
    const firstColumn = animation.firstColumn ?? 0;
    if (!isCount(animation.row, 0) || !isCount(animation.frames, 1) || !isCount(firstColumn, 0)) throw new Error(`Animação ${name} com linha ou quadros inválidos.`);
    const { stepMeters, fps } = animation;
    if (stepMeters !== undefined && !(stepMeters > 0)) throw new Error(`Animação ${name} com stepMeters inválido.`);
    if (fps !== undefined && !(fps >= 0)) throw new Error(`Animação ${name} com fps inválido.`);
    if (animation.frames > 1 && stepMeters === undefined && !fps) throw new Error(`Animação ${name} tem vários quadros, mas nem stepMeters nem fps.`);
    parsed[name] = { row: animation.row, firstColumn, frames: animation.frames, ...(stepMeters === undefined ? {} : { stepMeters }), ...(fps === undefined ? {} : { fps }) };
  }
  return { image, cell: { width: cell.width, height: cell.height }, soleRow, visibleRows, animations: parsed };
}

/** Colunas e linhas do PNG, conferidas contra o JSON. */
export function atlasGrid(atlas: SpriteAtlas, imageWidth: number, imageHeight: number): { columns: number; rows: number } {
  const columns = imageWidth / atlas.cell.width;
  const rows = imageHeight / atlas.cell.height;
  if (!Number.isInteger(columns) || !Number.isInteger(rows)) {
    throw new Error(`PNG de ${imageWidth}×${imageHeight} não divide em células de ${atlas.cell.width}×${atlas.cell.height}.`);
  }
  for (const [name, animation] of Object.entries(atlas.animations)) {
    if (animation.row >= rows || animation.firstColumn + animation.frames > columns) throw new Error(`Animação ${name} sai do PNG de ${columns}×${rows} células.`);
  }
  return { columns, rows };
}

export const animationNameFor = (walking: boolean, facing: SpriteFacing): SpriteAnimationName => `${walking ? "walk" : "idle"}-${facing}`;

export interface SpriteClock {
  /** Metros andados no total. */
  distance: number;
  /** Segundos desde o início; fica em zero com movimento reduzido. */
  time: number;
}

/** Célula do atlas no instante: pela distância se a animação tem passo, senão pelo tempo. */
export function animationCell(animation: SpriteAnimation, { distance, time }: SpriteClock): { row: number; column: number } {
  const step = animation.stepMeters ? Math.floor(distance / animation.stepMeters) : Math.floor(time * (animation.fps ?? 0));
  return { row: animation.row, column: animation.firstColumn + (step % animation.frames) };
}

/** Quadro do sprite em metros. A altura visível fixa o tamanho, qualquer que seja a resolução. */
export interface SpriteQuad {
  /** Um texel na vertical, no plano em pé. */
  texelMeters: number;
  /** Um texel na horizontal: a arte foi desenhada com texel quadrado na tela, já encurtada. */
  texelWidth: number;
  width: number;
  /** Do chão até o alto da célula, e até o pé da célula, abaixo da sola. */
  top: number;
  bottom: number;
}

export function spriteQuad(atlas: SpriteAtlas, standingHeight: number, foreshortening: number): SpriteQuad {
  const texelMeters = standingHeight / atlas.visibleRows;
  const texelWidth = texelMeters * foreshortening;
  return {
    texelMeters,
    texelWidth,
    width: atlas.cell.width * texelWidth,
    top: atlas.soleRow * texelMeters,
    bottom: (atlas.soleRow - atlas.cell.height) * texelMeters,
  };
}
