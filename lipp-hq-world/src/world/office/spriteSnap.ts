import { RIGHT, UP, worldToScreen, type OfficeView, type Viewport } from "./officeCamera";

/**
 * Quanto mover um ponto no mundo para ele cair exatamente num pixel do canvas: o desenho
 * entre os blocos fica igual de um quadro para o outro, e andar deixa de tremer. O
 * movimento é no plano da tela, então nunca passa de meio pixel nem tira o pé do lugar.
 */
export function pixelSnapOffset(
  point: readonly [number, number, number],
  view: OfficeView,
  viewport: Viewport,
  buffer: { width: number; height: number },
): [number, number, number] {
  const scaleX = buffer.width / viewport.width;
  const scaleY = buffer.height / viewport.height;
  const screen = worldToScreen(point, view, viewport);
  const dx = (Math.round(screen.x * scaleX) - screen.x * scaleX) / scaleX / view.zoom;
  const dy = -(Math.round(screen.y * scaleY) - screen.y * scaleY) / scaleY / view.zoom;
  return [RIGHT[0] * dx + UP[0] * dy, UP[1] * dy, RIGHT[2] * dx + UP[2] * dy];
}
