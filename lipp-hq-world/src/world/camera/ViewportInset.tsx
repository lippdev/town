import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";
import { useHQStore } from "@/state/useHQStore";

/** Quanto do caminho até o deslocamento novo a câmera anda por segundo. */
const EASE_PER_SECOND = 9;

/**
 * Janela de projeção para deslocar o centro da cena para a esquerda, por
 * `inset` pixels cobertos à direita.
 *
 * O frustum virtual fica `inset` pixels mais largo e o canvas mostra só a
 * parte esquerda dele; o centro virtual cai então no meio da área visível.
 * O aspecto acompanha a largura virtual para nada esticar.
 */
export function insetViewWindow(width: number, height: number, inset: number) {
  const shift = Math.max(0, Math.min(inset, width * 0.6));
  return { fullWidth: width + shift, fullHeight: height, offsetX: shift, aspect: (width + shift) / height };
}

/**
 * Mantém o foco da câmera na parte do canvas que a gaveta não cobre. Sem isso,
 * o bot escolhido ficaria exatamente atrás do painel que fala dele.
 * Raycast e rótulos usam a mesma matriz de projeção, então o clique continua
 * caindo onde o olho vê.
 */
export function ViewportInset() {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const current = useRef(0);
  const applied = useRef({ width: 0, height: 0, inset: -1 });

  useEffect(
    () => () => {
      camera.clearViewOffset();
      camera.aspect = size.width / size.height;
      camera.updateProjectionMatrix();
    },
    [camera, size],
  );

  useFrame((_, delta) => {
    const target = useHQStore.getState().viewInsetRight;
    const step = 1 - Math.exp(-EASE_PER_SECOND * delta);
    current.current += (target - current.current) * step;
    if (Math.abs(target - current.current) < 0.5) current.current = target;

    const inset = Math.round(current.current);
    const last = applied.current;
    if (last.inset === inset && last.width === size.width && last.height === size.height) return;
    applied.current = { width: size.width, height: size.height, inset };

    if (inset === 0) {
      camera.clearViewOffset();
      camera.aspect = size.width / size.height;
    } else {
      const view = insetViewWindow(size.width, size.height, inset);
      camera.aspect = view.aspect;
      camera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, 0, size.width, size.height);
    }
    camera.updateProjectionMatrix();
  });

  return null;
}
