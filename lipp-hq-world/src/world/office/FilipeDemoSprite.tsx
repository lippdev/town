import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, FileLoader, ImageLoader, type Group } from "three";
import { AZIMUTH, ELEVATION, worldToScreen } from "./officeCamera";
import { advanceWalk, initialWalk, walkPose } from "./filipeWalk";
import { OFFICE_ROOMS_BY_ID } from "./officeLayout";
import { officeRuntime } from "./officeStore";
import { shadowAxes, towardCamera } from "./officeSun";
import { animationCell, animationNameFor, atlasGrid, parseSpriteAtlas, spriteQuad, type SpriteAnimationName, type SpriteQuad } from "./spriteAtlas";
import { createSpriteMaterial, createSpriteShadowMaterial, selectCell, spriteTexture, spriteUniforms } from "./spriteMaterials";
import { buildSpriteTexels } from "./spriteMipmaps";
import { pixelSnapOffset } from "./spriteSnap";

const ATLAS_URL = "/characters/filipe/walk.json";
const STANDING_HEIGHT = 1.8;
/** Tampa da laje do hall. */
const FLOOR_TOP = 0.015;
/** A sombra passa por cima do tapete (0,0475), sem mudar de lugar na tela. */
const SHADOW_LIFT = 0.04;
/** A figura tem volume: o plano dela fica um pouco à frente do centro dos pés. */
const BODY_DEPTH = 0.12;
/** Normal na beira do quadro, para o lado da tela: um cilindro bem aberto, de luz leve. */
const CYLINDER_EDGE = 0.62;

export interface ForcedSpritePose {
  x: number;
  z: number;
  animation: SpriteAnimationName;
  column: number;
  mirrored: boolean;
}

/** Ponte com o harness scripts/visual-qa/sprite-zoom.mjs. */
export const filipeSpriteQa = {
  ready: false,
  snap: true,
  forced: null as ForcedSpritePose | null,
  screen: { x: 0, y: 0 },
  buildMs: 0,
};

/**
 * Plano da figura: em pé no mundo, virado para a câmera. A profundidade sobe com a altura,
 * como a de uma pessoa, e aí móvel atrás dele não corta a cabeça. A normal abre como a de
 * um cilindro, e o sombreador interpola o resto.
 */
function bodyGeometry(quad: SpriteQuad) {
  const half = quad.width / 2;
  const front = Math.sqrt(1 - CYLINDER_EDGE * CYLINDER_EDGE);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array([-half, quad.top, 0, half, quad.top, 0, -half, quad.bottom, 0, half, quad.bottom, 0]), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array([-CYLINDER_EDGE, 0, front, CYLINDER_EDGE, 0, front, -CYLINDER_EDGE, 0, front, CYLINDER_EDGE, 0, front]), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
  geometry.setIndex([0, 2, 1, 2, 3, 1]);
  return geometry;
}

/** Retângulo no chão que cobre a silhueta estirada e a mancha de contato. */
function shadowGeometry(quad: SpriteQuad, height: number) {
  const { along, across, length } = shadowAxes();
  const side = Math.max(quad.width / 2, 0.45);
  const near = -0.4;
  const far = height * length + 0.2;
  const corner = (a: number, c: number) => [along.x * a + across.x * c, 0, along.z * a + across.z * c];
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array([...corner(near, -side), ...corner(near, side), ...corner(far, side), ...corner(far, -side)]), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  // (across × along) aponta para baixo: esta ordem deixa a face para cima
  geometry.setIndex([0, 2, 1, 0, 3, 2]);
  return geometry;
}

function readPixels(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
}

function useAtlas() {
  const text = useLoader(FileLoader, ATLAS_URL) as string;
  const atlas = useMemo(() => parseSpriteAtlas(JSON.parse(text)), [text]);
  const image = useLoader(ImageLoader, new URL(atlas.image, new URL(ATLAS_URL, window.location.href)).href);
  return { atlas, image };
}

/** Filipe andando pelo hall da demonstração, em pixel art, com a sola no chão. */
export function FilipeDemoSprite() {
  const { atlas, image } = useAtlas();
  const gl = useThree((state) => state.gl);
  const group = useRef<Group>(null);
  const walk = useRef(initialWalk());
  const time = useRef(0);
  const reducedMotion = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const hall = OFFICE_ROOMS_BY_ID.hall!;

  const parts = useMemo(() => {
    const started = performance.now();
    atlasGrid(atlas, image.width, image.height);
    const texels = buildSpriteTexels(readPixels(image), atlas.cell);
    filipeSpriteQa.buildMs = performance.now() - started;
    const quad = spriteQuad(atlas, STANDING_HEIGHT, Math.cos(ELEVATION));
    const texture = spriteTexture(texels);
    const uniforms = spriteUniforms(atlas, texels, texture);
    return {
      texels,
      uniforms,
      texture,
      body: bodyGeometry(quad),
      ground: shadowGeometry(quad, STANDING_HEIGHT),
      material: createSpriteMaterial(uniforms),
      shadowMaterial: createSpriteShadowMaterial(uniforms, atlas, quad, hall.bounds),
    };
  }, [atlas, image, hall.bounds]);

  useEffect(() => {
    filipeSpriteQa.ready = true;
    return () => {
      filipeSpriteQa.ready = false;
      parts.texture.dispose();
      parts.body.dispose();
      parts.ground.dispose();
      parts.material.dispose();
      parts.shadowMaterial.dispose();
    };
  }, [parts]);

  useFrame((_, delta) => {
    if (!group.current) return;
    // aba em segundo plano devolve um delta enorme: não vale como caminhada
    if (!reducedMotion.current) {
      walk.current = advanceWalk(walk.current, Math.min(delta, 0.1));
      time.current += Math.min(delta, 0.1);
    }
    const pose = walkPose(walk.current);
    const forced = filipeSpriteQa.forced;
    const animation = atlas.animations[forced?.animation ?? animationNameFor(pose.walking, pose.facing)];
    const cell = forced ? { row: animation.row, column: forced.column } : animationCell(animation, { distance: walk.current.distance, time: time.current });
    selectCell(parts.uniforms, parts.texels, cell.column, cell.row, forced?.mirrored ?? pose.mirrored);

    const feet: [number, number, number] = [hall.center.x + (forced?.x ?? pose.x), FLOOR_TOP, hall.center.z + (forced?.z ?? pose.z)];
    const { view, viewport } = officeRuntime;
    const snap = filipeSpriteQa.snap ? pixelSnapOffset(feet, view, viewport, gl.domElement) : [0, 0, 0];
    group.current.position.set(feet[0] + snap[0]!, feet[1] + snap[1]!, feet[2] + snap[2]!);
    filipeSpriteQa.screen = worldToScreen([group.current.position.x, group.current.position.y, group.current.position.z], view, viewport);
  });

  const bodyAt = towardCamera(BODY_DEPTH);
  const shadowAt = towardCamera(SHADOW_LIFT / Math.sin(ELEVATION));
  return (
    <group ref={group}>
      {/* A sombra vem antes de todo o resto translúcido: ela multiplica o chão. */}
      <mesh geometry={parts.ground} material={parts.shadowMaterial} position={shadowAt} renderOrder={-1} receiveShadow frustumCulled={false} />
      {/* Depois das marcas do chão (1 e 2), e sem escrever profundidade: a borda é suave. */}
      <mesh geometry={parts.body} material={parts.material} position={bodyAt} rotation={[0, AZIMUTH, 0]} renderOrder={3} receiveShadow frustumCulled={false} />
    </group>
  );
}
