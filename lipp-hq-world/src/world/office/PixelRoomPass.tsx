import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BoxGeometry, FramebufferTexture, Mesh, NearestFilter, Scene, ShaderMaterial, Vector2 } from "three";
import { OFFICE_ROOMS_BY_ID, WALL_HEIGHT } from "./officeLayout";
import { useOfficeStore } from "./officeStore";

const VERTEX = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A cópia já está em sRGB e com tone mapping: nada de conversão aqui, a cor sai como na tela.
const FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 span;
  void main() {
    gl_FragColor = texture2D(map, gl_FragCoord.xy / span);
  }
`;

/**
 * Teste de pixel art 3D: a cena é desenhada numa fração da tela, copiada e colada sem
 * suavização só no volume da sala, por cima do desenho normal. Assume a renderização
 * do quadro; desligado, desenha a cena como sempre.
 */
export function PixelRoomPass({ roomId }: { roomId: string }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const capture = useRef<FramebufferTexture | null>(null);
  const drawing = useRef(new Vector2());
  const origin = useRef(new Vector2());

  const { overlay, material } = useMemo(() => {
    const { bounds, center } = OFFICE_ROOMS_BY_ID[roomId]!;
    const material = new ShaderMaterial({
      uniforms: { map: { value: null }, span: { value: new Vector2(1, 1) } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const geometry = new BoxGeometry(bounds.maxX - bounds.minX, WALL_HEIGHT, bounds.maxZ - bounds.minZ);
    const box = new Mesh(geometry, material);
    box.position.set(center.x, WALL_HEIGHT / 2, center.z);
    const overlay = new Scene();
    overlay.add(box);
    return { overlay, material };
  }, [roomId]);

  useEffect(
    () => () => {
      capture.current?.dispose();
      capture.current = null;
      material.dispose();
      (overlay.children[0] as Mesh).geometry.dispose();
    },
    [material, overlay],
  );

  useFrame(() => {
    const pixelSize = useOfficeStore.getState().pixelRoomSize;
    if (pixelSize === 0) {
      gl.render(scene, camera);
      return;
    }
    const ratio = gl.getPixelRatio();
    const block = pixelSize * ratio;
    gl.getDrawingBufferSize(drawing.current);
    const width = Math.ceil(drawing.current.x / block);
    const height = Math.ceil(drawing.current.y / block);
    if (!capture.current || capture.current.image.width !== width || capture.current.image.height !== height) {
      capture.current?.dispose();
      capture.current = new FramebufferTexture(width, height);
      capture.current.magFilter = NearestFilter;
      capture.current.minFilter = NearestFilter;
      material.uniforms.map!.value = capture.current;
    }
    material.uniforms.span!.value.set(width * block, height * block);

    gl.setViewport(0, 0, width / ratio, height / ratio);
    gl.render(scene, camera);
    gl.copyFramebufferToTexture(capture.current, origin.current);
    gl.setViewport(0, 0, drawing.current.x / ratio, drawing.current.y / ratio);

    // o mapa de sombra acabou de ser atualizado: a segunda passada não precisa refazê-lo
    const shadows = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    gl.render(scene, camera);
    gl.shadowMap.autoUpdate = shadows;

    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.render(overlay, camera);
    gl.autoClear = autoClear;
  }, 1);

  return null;
}
