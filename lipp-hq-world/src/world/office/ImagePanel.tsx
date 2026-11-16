import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import type { ScenarioPanel } from "./officeScenario";

/** Pixels por metro da placa: nítido nesta câmera sem pesar na GPU. */
const PIXELS_PER_METER = 220;
const MAX_SIDE = 1024;

/**
 * A imagem oficial numa textura de canvas, inteira e centrada sobre o fundo. A placa entra na hora
 * com o fundo e ganha a imagem quando ela chega: nada espera o arquivo, e SVG sai nítido no tamanho.
 */
export function panelTexture(spec: Pick<ScenarioPanel, "url" | "background" | "pad" | "ratio">, width: number, height: number) {
  const scale = Math.min(PIXELS_PER_METER, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d")!;
  context.fillStyle = spec.background ?? "#111829";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const image = new Image();
  image.onload = () => {
    const pad = (spec.pad ?? 0) * Math.min(canvas.width, canvas.height);
    const room = { width: canvas.width - pad * 2, height: canvas.height - pad * 2 };
    // SVG só com viewBox não tem tamanho próprio confiável: a proporção dele vem do dado.
    const ratio = spec.ratio ?? (image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : room.width / room.height);
    const fit = Math.min(room.width / ratio, room.height);
    const drawn = { width: fit * ratio, height: fit };
    context.drawImage(image, (canvas.width - drawn.width) / 2, (canvas.height - drawn.height) / 2, drawn.width, drawn.height);
    texture.needsUpdate = true;
  };
  image.onerror = () => console.warn(`[escritório] imagem fora da placa: ${spec.url}`);
  image.src = spec.url;
  return texture;
}

/** Placa ou tela com uma imagem oficial, presa numa parede. Não clica e não projeta sombra. */
export function ImagePanel({ spec, name }: { spec: ScenarioPanel; name: string }) {
  const texture = useMemo(() => panelTexture(spec, spec.width, spec.height), [spec]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[spec.at[0], spec.at[1], spec.at[2]]} rotation={[0, spec.rotationY ?? 0, 0]} name={name}>
      <planeGeometry args={[spec.width, spec.height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
