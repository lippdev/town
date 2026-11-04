import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import {
  AnimationMixer,
  Box3,
  LoopOnce,
  LoopRepeat,
  Vector3,
  type AnimationAction,
  type Group,
  type Mesh,
  type Object3D,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  CHARACTER_POSES,
  DEFAULT_CHARACTER_HEIGHT,
  fitScale,
  resolveClips,
  type CharacterEntry,
  type CharacterPose,
} from "@/world/characters/characterManifest";

/** Tempo de mistura entre duas animações: curto o bastante para não deslizar. */
const CROSSFADE_SECONDS = 0.35;
/** Poses sentadas: recebem o ajuste de assento do manifesto. */
const SEATED: ReadonlySet<CharacterPose> = new Set(["sit", "type", "talk"]);

/**
 * Controle do personagem GLB que o laço de animação da cena usa. A locomoção
 * (posição e direção) continua no Agents.tsx; o rig só troca e avança clipes.
 */
export interface CharacterRig {
  play: (pose: CharacterPose) => void;
  update: (delta: number) => void;
  /** Poses com animação neste arquivo (diagnóstico e QA). */
  poses: CharacterPose[];
  current: () => CharacterPose | null;
}

interface CharacterModelProps {
  url: string;
  entry: CharacterEntry;
  /** Multiplicador de altura do editor de personagem (0.9–1.1). */
  heightScale?: number;
  onRig: (rig: CharacterRig | null) => void;
}

/**
 * Um bot vestido com o GLB do manifesto.
 *
 * O arquivo é carregado uma vez e cada bot recebe um clone com esqueleto
 * próprio (SkeletonUtils), senão todos dividiriam a mesma pose. A altura é
 * medida e normalizada — arquivos do Mixamo chegam em centímetros, outros em
 * metros — e os pés ficam no chão.
 */
export function CharacterModel({ url, entry, heightScale = 1, onRig }: CharacterModelProps) {
  const gltf = useGLTF(url);
  const seat = useRef<Group | null>(null);

  const { root, scale, lift } = useMemo(() => {
    const instance = cloneSkinned(gltf.scene) as Object3D;
    instance.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // malha com esqueleto anima fora da caixa original: sem isso ela some
        // da tela quando a pose sai do volume de repouso
        mesh.frustumCulled = false;
      }
    });
    // a caixa de malha com esqueleto usa a matriz de mundo dos ossos; no clone
    // recém-criado, fora da cena, elas ainda são identidade e a medida sai
    // errada (o personagem some de tão grande ou de tão pequeno)
    instance.updateMatrixWorld(true);
    const box = new Box3().setFromObject(instance);
    const size = box.getSize(new Vector3());
    const fitted = fitScale(size.y, entry.height ?? DEFAULT_CHARACTER_HEIGHT);
    return { root: instance, scale: fitted, lift: -box.min.y * fitted };
  }, [gltf.scene, entry.height]);

  useEffect(() => {
    const mixer = new AnimationMixer(root);
    const names = gltf.animations.map((clip) => clip.name);
    const mapping = resolveClips(names, entry.clips);
    const actions = new Map<CharacterPose, AnimationAction>();
    for (const pose of CHARACTER_POSES) {
      const name = mapping[pose];
      const clip = name ? gltf.animations.find((candidate) => candidate.name === name) : undefined;
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      action.setLoop(LoopRepeat, Infinity);
      actions.set(pose, action);
    }
    // um clipe de sentar que é só a transição (senta e para) segura o último quadro
    for (const pose of ["sit"] as const) {
      const action = actions.get(pose);
      if (action && action.getClip().duration < 1.2) {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }
    }

    let current: CharacterPose | null = null;
    let active: AnimationAction | null = null;
    const seatTarget = new Vector3();
    const rig: CharacterRig = {
      poses: [...actions.keys()],
      current: () => current,
      play: (pose) => {
        if (pose === current) return;
        const next = actions.get(pose);
        current = pose;
        if (SEATED.has(pose)) seatTarget.set(0, entry.seatOffset?.y ?? 0, entry.seatOffset?.z ?? 0);
        else seatTarget.set(0, 0, 0);
        if (!next || next === active) return;
        next.reset().setEffectiveWeight(1).fadeIn(CROSSFADE_SECONDS).play();
        active?.fadeOut(CROSSFADE_SECONDS);
        active = next;
      },
      update: (delta) => {
        mixer.update(delta);
        seat.current?.position.lerp(seatTarget, Math.min(1, delta * 6));
      },
    };
    onRig(rig);
    rig.play("idle");
    return () => {
      onRig(null);
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    };
  }, [root, gltf.animations, entry.clips, entry.seatOffset, onRig]);

  const yaw = ((entry.yawDeg ?? 0) * Math.PI) / 180;
  return (
    <group scale={heightScale} name="character-model">
      <group ref={seat}>
        <primitive object={root} scale={scale} position={[0, lift, 0]} rotation={[0, yaw, 0]} />
      </group>
    </group>
  );
}

/**
 * Arquivo quebrado ou ausente não derruba a cena: o bot volta para a figura
 * procedural e o erro vai para o console com o nome do arquivo.
 */
export class CharacterBoundary extends Component<
  { fallback: ReactNode; url: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn(`[personagens] não consegui carregar ${this.props.url}; usando a figura simples.`, error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
