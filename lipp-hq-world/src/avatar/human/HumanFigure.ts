import type {
  Matrix4} from "three";
import {
  AnimationMixer,
  Group,
  LoopOnce,
  LoopRepeat,
  MeshStandardMaterial,
  SkinnedMesh,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type Object3D,
  type Skeleton,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildHumanClips, type HumanClips, type PhotoPose } from "./humanClips";
import { ARMATURE_URL, POSES_URL, ROBOT_URL, loadGltf, loadPart, releasePart, type PartAsset } from "./humanAssets";
import type { CategoryId } from "./catalog";
import type { Expression, ResolvedHuman, ResolvedPart } from "./preset";

export interface HumanBase {
  armature: Object3D;
  clips: HumanClips;
}

let base: Promise<HumanBase> | null = null;

/** O esqueleto e as animações, uma vez por página. As peças vêm depois, sob demanda. */
export function loadHumanBase(): Promise<HumanBase> {
  base ??= Promise.all([loadGltf(ARMATURE_URL), loadGltf(POSES_URL), loadGltf(ROBOT_URL)]).then(([armature, poses, robot]) => ({
    armature: armature.scene,
    clips: buildHumanClips({
      armature: armature.scene,
      poses: poses.animations,
      robot: { scene: robot.scene, clips: robot.animations },
    }),
  }));
  base.catch(() => {
    base = null;
  });
  return base;
}

export type HumanMotion = "idle" | "walk" | "sit" | "stand" | PhotoPose;

const SHADOWLESS: ReadonlySet<CategoryId> = new Set(["eyes", "eyebrow", "nose", "face", "earring", "glasses", "facialHair"]);
const FADE = 0.25;
const BLINK_EVERY = 4.1;
const BLINK_LENGTH = 0.14;

interface WornPart {
  asset: PartAsset;
  itemId: string;
  meshes: SkinnedMesh[];
  /** Materiais só desta figura: o cache do arquivo fica intacto para as outras. */
  own: MeshStandardMaterial[];
}

/**
 * A compressão guarda cada peça em coordenadas próprias e compensa isso nas matrizes do
 * esqueleto do arquivo. Como aqui todas usam o mesmo esqueleto (o do Armature), a mesma
 * compensação vai para a matriz de ligação da malha.
 */
export function quantizationOf(source: SkinnedMesh, skeleton: Skeleton): Matrix4 {
  return skeleton.boneInverses[0]!.clone().invert().multiply(source.skeleton.boneInverses[0]!);
}

function isColorMaterial(material: Material) {
  return material.name.includes("Color_");
}

function isSkinMaterial(material: Material) {
  return material.name.includes("Skin_");
}

/**
 * Um humano montado: um esqueleto próprio e várias malhas ligadas a ele. A geometria é
 * do arquivo e dividida com as outras figuras; esqueleto, materiais de cor e morphs são
 * só desta, então mudar a cor de uma pessoa nunca muda a da outra.
 */
export class HumanFigure {
  readonly root = new Group();
  private readonly armature: Object3D;
  private readonly skeleton: Skeleton;
  private readonly mixer: AnimationMixer;
  private readonly clips: HumanClips;
  private readonly skin = new MeshStandardMaterial({ color: "#eab08c", roughness: 1, name: "Skin_" });
  private readonly worn = new Map<CategoryId, WornPart>();
  private current: AnimationAction | null = null;
  private motion: HumanMotion = "idle";
  private expression: Expression = "neutral";
  private generation = 0;
  private disposed = false;
  private blinkClock: number;
  /** Peças que não baixaram: a figura segue sem elas e o editor explica. */
  missing: string[] = [];

  constructor(humanBase: HumanBase, { phase = 0 }: { phase?: number } = {}) {
    this.clips = humanBase.clips;
    this.blinkClock = phase;
    const copy = cloneSkinned(humanBase.armature);
    this.armature = copy.getObjectByName("Armature")!;
    const holder = copy.getObjectByName("Plane") as SkinnedMesh;
    // A malha "Plane" só existe para o arquivo guardar o esqueleto.
    this.skeleton = holder.skeleton;
    holder.removeFromParent();
    this.root.add(copy);
    this.mixer = new AnimationMixer(copy);
    this.play("idle", { instant: true, frozen: true });
  }

  /** Veste o preset. Peça que chega depois de outra troca é descartada. */
  async wear(human: ResolvedHuman): Promise<void> {
    const generation = (this.generation += 1);
    this.skin.color.set(human.skin);
    const wanted = new Map<CategoryId, ResolvedPart>(human.parts.map((part) => [part.category, part]));
    const missing: string[] = [];
    const loaded = await Promise.all(
      human.parts.map(async (part) => {
        const worn = this.worn.get(part.category);
        if (worn?.itemId === part.itemId) return { part, asset: worn.asset };
        try {
          return { part, asset: await loadPart(part.file) };
        } catch {
          missing.push(part.itemId);
          return { part, asset: null };
        }
      }),
    );
    if (this.disposed || generation !== this.generation) return;

    for (const [category, worn] of [...this.worn]) {
      const next = wanted.get(category);
      if (!next || next.itemId !== worn.itemId) this.takeOff(category);
    }
    for (const { part, asset } of loaded) {
      if (!asset) continue;
      if (!this.worn.has(part.category)) this.putOn(part, asset);
      const worn = this.worn.get(part.category)!;
      if (part.color) for (const material of worn.own) material.color.set(part.color);
    }
    this.missing = missing;
    this.setExpression(human.expression);
  }

  private takeOff(category: CategoryId) {
    const worn = this.worn.get(category);
    if (!worn) return;
    for (const mesh of worn.meshes) mesh.removeFromParent();
    for (const material of worn.own) material.dispose();
    releasePart(worn.asset);
    this.worn.delete(category);
  }

  private putOn(part: ResolvedPart, asset: PartAsset) {
    const meshes: SkinnedMesh[] = [];
    const own: MeshStandardMaterial[] = [];
    asset.users += 1;
    asset.scene.traverse((node) => {
      const source = node as SkinnedMesh;
      if (!source.isSkinnedMesh) return;
      const original = source.material as MeshStandardMaterial;
      let material: Material = original;
      if (isSkinMaterial(original)) material = this.skin;
      else if (isColorMaterial(original)) {
        const copy = original.clone();
        own.push(copy);
        material = copy;
      }
      const mesh = new SkinnedMesh(source.geometry, material);
      mesh.name = source.name;
      // Peça miúda não aparece na sombra e custaria uma chamada de desenho a mais.
      mesh.castShadow = !SHADOWLESS.has(part.category);
      mesh.userData.keepShadow = true;
      mesh.receiveShadow = true;
      // A caixa de repouso não acompanha a pose, e refazê-la pelos vértices custa caro.
      mesh.frustumCulled = false;
      if (source.morphTargetInfluences) {
        mesh.morphTargetDictionary = source.morphTargetDictionary!;
        mesh.morphTargetInfluences = source.morphTargetInfluences.map(() => 0);
      }
      mesh.bind(this.skeleton, quantizationOf(source, this.skeleton));
      this.armature.add(mesh);
      meshes.push(mesh);
    });
    this.worn.set(part.category, { asset, itemId: part.itemId, meshes, own });
  }

  setExpression(expression: Expression) {
    this.expression = expression;
    for (const worn of this.worn.values()) {
      for (const mesh of worn.meshes) {
        const dictionary = mesh.morphTargetDictionary;
        if (!dictionary || dictionary.smile === undefined) continue;
        for (const name of ["smile", "sad", "neutral"] as const) mesh.morphTargetInfluences![dictionary[name]!] = name === expression ? 1 : 0;
      }
    }
  }

  private clipFor(motion: HumanMotion): AnimationClip {
    if (motion === "idle") return this.clips.idle;
    if (motion === "walk") return this.clips.walk;
    if (motion === "sit" || motion === "stand") return this.clips.sit;
    return this.clips.poses[motion];
  }

  /** `frozen` deixa no primeiro quadro: é o estado com movimento reduzido. */
  play(motion: HumanMotion, { instant = false, frozen = false, timeScale = 1 }: { instant?: boolean; frozen?: boolean; timeScale?: number } = {}) {
    const clip = this.clipFor(motion);
    const next = this.mixer.clipAction(clip);
    const settled = motion !== "idle" && motion !== "walk";
    next.enabled = true;
    next.setLoop(settled ? LoopOnce : LoopRepeat, settled ? 1 : Infinity);
    next.clampWhenFinished = settled;
    next.reset();
    if (motion === "stand") {
      next.time = clip.duration;
      next.timeScale = -timeScale;
    } else {
      next.timeScale = timeScale;
    }
    // Sentar com movimento reduzido vai direto à pose final.
    if (instant && motion === "sit") next.time = clip.duration;
    if (instant && motion === "stand") next.time = 0;
    next.paused = frozen;
    next.play();
    if (this.current && this.current !== next) {
      if (instant) this.current.stop();
      else {
        next.setEffectiveWeight(1);
        this.current.crossFadeTo(next, FADE, false);
      }
    }
    this.current = next;
    this.motion = motion;
    if (instant) this.mixer.update(0);
  }

  get currentMotion() {
    return this.motion;
  }

  /** O clipe de sentar terminou nesta direção. */
  get settled() {
    if (!this.current) return true;
    if (this.motion === "stand") return this.current.time <= 1e-3;
    if (this.motion === "sit") return this.current.time >= this.current.getClip().duration - 1e-3;
    return true;
  }

  update(delta: number, { blink = true }: { blink?: boolean } = {}) {
    this.mixer.update(Math.min(delta, 1 / 20));
    if (blink) this.blink(delta);
  }

  private blink(delta: number) {
    this.blinkClock = (this.blinkClock + delta) % BLINK_EVERY;
    const amount = this.blinkClock < BLINK_LENGTH ? Math.sin((this.blinkClock / BLINK_LENGTH) * Math.PI) : 0;
    const eyes = this.worn.get("eyes");
    if (!eyes) return;
    for (const mesh of eyes.meshes) {
      const dictionary = mesh.morphTargetDictionary;
      if (!dictionary) continue;
      for (const name of ["eyeBlinkLeft", "eyeBlinkRight"]) {
        const index = dictionary[name];
        if (index !== undefined) mesh.morphTargetInfluences![index] = amount;
      }
    }
  }

  /** Onde estão os ossos que encostam nos móveis, em coordenadas do mundo. */
  joints() {
    this.root.updateWorldMatrix(true, true);
    const at = (name: string) => {
      const { x, y, z } = this.skeleton.getBoneByName(`mixamorig${name}`)!.getWorldPosition(new Vector3());
      return { x, y, z };
    };
    return {
      hips: at("Hips"),
      head: at("Head"),
      leftHand: at("LeftHand"),
      rightHand: at("RightHand"),
      leftFinger: at("LeftHandMiddle4"),
      rightFinger: at("RightHandMiddle4"),
      leftFoot: at("LeftFoot"),
      rightFoot: at("RightFoot"),
      leftToe: at("LeftToeBase"),
      rightToe: at("RightToeBase"),
    };
  }

  /** Para o QA conferir o que está vestido de verdade, não o que o estado pediu. */
  snapshot() {
    return {
      parts: Object.fromEntries([...this.worn].map(([category, worn]) => [category, worn.itemId])) as Partial<Record<CategoryId, string>>,
      skin: `#${this.skin.color.getHexString()}`,
      colors: Object.fromEntries([...this.worn].map(([category, worn]) => [category, worn.own[0] ? `#${worn.own[0].color.getHexString()}` : null])) as Partial<Record<CategoryId, string | null>>,
      expression: this.expression,
      motion: this.motion,
      missing: this.missing,
      bones: this.skeleton.bones.length,
      triangles: [...this.worn.values()].flatMap((worn) => worn.meshes).reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? 0) / 3, 0),
    };
  }

  dispose() {
    this.disposed = true;
    for (const category of [...this.worn.keys()]) this.takeOff(category);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.skin.dispose();
    this.skeleton.dispose();
    this.root.removeFromParent();
  }
}
