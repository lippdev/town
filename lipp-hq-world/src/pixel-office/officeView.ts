/**
 * Enquadramento do escritório: zoom contínuo e posição em pixels CSS, sem arredondar nada.
 * Sem DOM, para ser testado sozinho.
 */

export interface Size {
  width: number;
  height: number;
}

export interface OfficeView {
  /** Pixels CSS por pixel do cenário. */
  zoom: number;
  x: number;
  y: number;
}

/** Até onde o zoom passa do enquadramento inicial, que mostra o cenário inteiro. */
export const MAX_ZOOM_OVER_FIT = 3;

/** Zoom que mostra o cenário inteiro: fracionário, para aproveitar toda a tela. */
export function fitScale(viewWidth: number, viewHeight: number, sceneWidth: number, sceneHeight: number): number {
  return Math.min(viewWidth / sceneWidth, viewHeight / sceneHeight);
}

const fitOf = (scene: Size, space: Size) => fitScale(space.width, space.height, scene.width, scene.height);

/** Menor que a tela, centraliza; maior, não deixa arrastar para fora do cenário. */
export function clampView(view: OfficeView, scene: Size, space: Size): OfficeView {
  const axis = (position: number, length: number, room: number) => {
    const size = length * view.zoom;
    return size <= room ? (room - size) / 2 : Math.min(0, Math.max(room - size, position));
  };
  return { zoom: view.zoom, x: axis(view.x, scene.width, space.width), y: axis(view.y, scene.height, space.height) };
}

/** Quanto o zoom passou do enquadramento inicial: 1 é o cenário inteiro. */
export const zoomLevel = (view: OfficeView, scene: Size, space: Size) => view.zoom / fitOf(scene, space);

/** Muda o zoom sem tirar do lugar o ponto sob a âncora, dentro dos limites. */
export function zoomAround(view: OfficeView, zoom: number, anchor: { x: number; y: number }, scene: Size, space: Size): OfficeView {
  const fit = fitOf(scene, space);
  const next = Math.max(fit, Math.min(zoom, fit * MAX_ZOOM_OVER_FIT));
  const ratio = next / view.zoom;
  return clampView({ zoom: next, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio }, scene, space);
}

/** Tela nova: mantém o nível de zoom e o ponto do cenário que estava no meio. Sem tela anterior, mostra tudo. */
export function resizeView(view: OfficeView | null, scene: Size, from: Size | null, to: Size): OfficeView {
  const fit = fitOf(scene, to);
  if (!view || !from) return clampView({ zoom: fit, x: 0, y: 0 }, scene, to);
  const zoom = fit * zoomLevel(view, scene, from);
  const middleX = (from.width / 2 - view.x) / view.zoom;
  const middleY = (from.height / 2 - view.y) / view.zoom;
  return clampView({ zoom, x: to.width / 2 - middleX * zoom, y: to.height / 2 - middleY * zoom }, scene, to);
}
