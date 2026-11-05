import { useEffect, useRef, useState } from "react";
import { PerformanceMonitor } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Sphere, type Mesh } from "three";
import { useHQStore } from "@/state/useHQStore";
import { effectiveQuality } from "@/world/quality";

/** A cada quantos quadros o mapa de sombra é refeito. */
const SHADOW_EVERY: Record<"alta" | "leve", number> = { alta: 2, leve: 4 };
/** Objeto menor que isto (raio, m) não projeta sombra que se veja de cima. */
const SMALL_CASTER_RADIUS = 0.16;
/** Intervalo para revisar quem projeta sombra (bots entram e saem da cena). */
const CASTER_SWEEP_MS = 3000;
/** A abertura compila shaders e carrega texturas: medir antes disso rebaixaria até máquina rápida. */
const WARMUP_MS = 4000;

const sphere = new Sphere();

/**
 * Corta sombra de objetos miúdos: papel, teclado, xícara, olhos e mãos. De
 * cima, a sombra deles não aparece, mas cada um custa uma chamada de desenho
 * a mais no passe de sombra.
 */
function trimShadowCasters(root: { traverse: (fn: (node: unknown) => void) => void }): number {
  let trimmed = 0;
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.castShadow || !mesh.geometry) return;
    // Quem decide já decidiu: a esfera de malha comprimida nem está em metros.
    if (mesh.userData.keepShadow) return;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld);
    if (sphere.radius < SMALL_CASTER_RADIUS) {
      mesh.castShadow = false;
      trimmed += 1;
    }
  });
  return trimmed;
}

/**
 * Mantém a cena leve:
 * - no modo auto, o PerformanceMonitor desce para leve se a alta não segurar
 *   ~38 fps depois do aquecimento;
 * - a sombra não é refeita a cada quadro, só no ritmo da qualidade — os
 *   móveis não se mexem e os bots andam devagar;
 * - objetos miúdos deixam de projetar sombra.
 */
export function QualityController({ shadowEvery = SHADOW_EVERY }: { shadowEvery?: Record<"alta" | "leve", number> } = {}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const setAutoQuality = useHQStore((state) => state.setAutoQuality);
  const frame = useRef(0);
  const [measuring, setMeasuring] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMeasuring(true), WARMUP_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    const sweep = () => {
      scene.updateMatrixWorld();
      if (trimShadowCasters(scene) > 0) gl.shadowMap.needsUpdate = true;
    };
    sweep();
    const timer = window.setInterval(sweep, CASTER_SWEEP_MS);
    return () => {
      window.clearInterval(timer);
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl, scene]);

  useFrame(() => {
    const { graphicsMode, autoQuality } = useHQStore.getState();
    const every = shadowEvery[effectiveQuality(graphicsMode, autoQuality)];
    frame.current = (frame.current + 1) % every;
    if (frame.current === 0) gl.shadowMap.needsUpdate = true;
  });

  if (!measuring) return null;
  // só desce: a leve sempre sobra fps, então subir de volta faria a cena
  // alternar entre as duas. Quem quiser alta escolhe "Alta" no seletor.
  return (
    <PerformanceMonitor
      // limites fixos: o drei estima a taxa da tela pelo maior fps já visto, e
      // numa cena sempre lenta essa estimativa fica baixa e o corte nunca vem
      bounds={() => [38, 55]}
      onDecline={() => setAutoQuality("leve")}
    />
  );
}
