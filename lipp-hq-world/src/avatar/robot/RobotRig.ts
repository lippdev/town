import { AnimationClip, AnimationMixer, Box3, Group, LoopOnce, Quaternion, Vector3, type AnimationAction, type Mesh, type MeshStandardMaterial, type Object3D, type SkinnedMesh } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { RobotExpression, RobotLook } from "./robotLook";

/** O arquivo tem 4,77 m. Assim o robô passa pela verga das portas voando. */
export const ROBOT_SCALE = 0.22;

export const ROBOT_GESTURES = ["Wave", "Yes", "ThumbsUp"] as const;
export type RobotGesture = (typeof ROBOT_GESTURES)[number];

const REQUIRED_CLIPS = ["Idle", ...ROBOT_GESTURES];
const REQUIRED_BONES = ["Body", "Head", "UpperLegL", "LowerLegL", "FootL", "UpperLegR", "LowerLegR", "FootR"];

/** O que o arquivo precisa ter; o que faltar vira erro explicado, não um robô pela metade. */
export function findRobotProblems(scene: Object3D, clips: AnimationClip[]): string[] {
  const problems: string[] = [];
  for (const name of REQUIRED_BONES) if (!scene.getObjectByName(name)) problems.push(`osso ${name}`);
  for (const name of REQUIRED_CLIPS) if (!clips.some((clip) => clip.name === name)) problems.push(`clipe ${name}`);
  let main = false;
  scene.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.isMesh && (mesh.material as MeshStandardMaterial).name === "Main") main = true;
  });
  if (!main) problems.push("material Main");
  return problems;
}

/** Trilhas que o voo não pode receber: chão, deslocamento e expressão têm outro dono. */
const GROUNDED = /^(Foot|PoleTarget|UpperLeg|LowerLeg|Bone\.|Body\.)|\.morphTargetInfluences$/;

/**
 * Tira do clipe pernas, corpo e morphs. Sem isto, o Idle pisaria no ar, e todo clipe
 * apagaria a expressão escolhida, porque cada um tem trilha dos três morphs.
 */
export function airborneClip(clip: AnimationClip): AnimationClip {
  return new AnimationClip(clip.name, clip.duration, clip.tracks.filter((track) => !GROUNDED.test(track.name)));
}

const axisX = new Vector3(1, 0, 0);
const turn = new Quaternion();
const parentWorld = new Quaternion();
const own = new Quaternion();

/** Gira o osso em torno de um eixo do mundo. */
function swing(bone: Object3D, angle: number) {
  bone.parent!.getWorldQuaternion(parentWorld);
  bone.getWorldQuaternion(own);
  turn.setFromAxisAngle(axisX, angle);
  bone.quaternion.copy(parentWorld.invert().multiply(turn).multiply(own));
  bone.updateWorldMatrix(false, true);
}

/**
 * As pernas soltas de quem está no ar: coxa um pouco à frente, joelho dobrado, ponta do pé
 * para baixo. No arquivo os pés são presos à raiz (eram alvo de IK no Blender), então eles
 * são levados até o fim da canela. É uma pose: as pernas não são cortadas nem redesenhadas.
 */
function hangLegs(root: Object3D) {
  root.updateMatrixWorld(true);
  for (const [side, thigh, knee, toes] of [["L", -0.42, 0.82, 0.62], ["R", -0.24, 0.62, 0.5]] as const) {
    const upper = root.getObjectByName(`UpperLeg${side}`)!;
    const lower = root.getObjectByName(`LowerLeg${side}`)!;
    const foot = root.getObjectByName(`Foot${side}`)!;
    const end = root.getObjectByName(`LowerLeg${side}_end`)!;
    swing(upper, thigh);
    swing(lower, knee);
    root.updateMatrixWorld(true);
    const target = end.getWorldPosition(new Vector3());
    foot.position.copy(foot.parent!.worldToLocal(target));
    foot.updateWorldMatrix(false, true);
    swing(foot, toes);
  }
  root.updateMatrixWorld(true);
}

const MORPHS: readonly Exclude<RobotExpression, "neutral">[] = ["Angry", "Surprised", "Sad"];

/**
 * Um robô vivo. Cada um tem o próprio clone, material do corpo e morphs; a geometria e os
 * outros materiais são divididos e nunca mudam, então a cor de um não passa para outro.
 */
export class RobotRig {
  readonly root = new Group();
  private readonly model: Object3D;
  private readonly mixer: AnimationMixer;
  private readonly idle: AnimationAction;
  private readonly gestures: Partial<Record<RobotGesture, AnimationAction>> = {};
  private readonly faces: Mesh[] = [];
  private readonly body: MeshStandardMaterial;
  private gesture: AnimationAction | null = null;
  private look: RobotLook = { body: "#ca9337", expression: "neutral" };
  /** Altura do robô, da ponta do pé ao alto da cabeça, em metros de cena. */
  readonly height: number;

  constructor(scene: Object3D, clips: AnimationClip[], { reduced = false }: { reduced?: boolean } = {}) {
    this.model = cloneSkinned(scene);
    this.model.scale.setScalar(ROBOT_SCALE);
    this.root.add(this.model);
    hangLegs(this.model);

    let body: MeshStandardMaterial | null = null;
    this.model.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      // A sombra do voo é a marca no chão: a do sol mudaria aos saltos a cada refazer do mapa.
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if ((mesh as SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = false;
      const material = mesh.material as MeshStandardMaterial;
      if (material.name === "Main") {
        body ??= material.clone();
        mesh.material = body;
      }
      if (mesh.morphTargetDictionary?.Sad !== undefined) this.faces.push(mesh);
    });
    this.body = body!;

    // A ponta do pé fica em y = 0: é daí que o voo conta a altitude.
    this.root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(this.model);
    this.model.position.y = -box.min.y;
    this.height = box.max.y - box.min.y;

    this.mixer = new AnimationMixer(this.model);
    this.idle = this.mixer.clipAction(airborneClip(clips.find((clip) => clip.name === "Idle")!));
    this.idle.play();
    if (reduced) this.idle.paused = true;
    for (const name of ROBOT_GESTURES) {
      const clip = clips.find((candidate) => candidate.name === name);
      if (!clip) continue;
      const action = this.mixer.clipAction(airborneClip(clip));
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = false;
      this.gestures[name] = action;
    }
    this.mixer.update(0);
  }

  apply(look: RobotLook) {
    this.look = look;
    this.body.color.set(look.body);
    for (const mesh of this.faces) {
      for (const name of MORPHS) {
        const index = mesh.morphTargetDictionary![name];
        if (index !== undefined) mesh.morphTargetInfluences![index] = look.expression === name ? 1 : 0;
      }
    }
  }

  /**
   * Deixa só a cabeça visível, para retratos. Devolve a caixa dela em metros de cena e
   * para onde o rosto aponta na pose atual: o Idle deixa a cabeça levemente virada.
   */
  isolateHead(): { box: Box3; forward: Vector3 } {
    const head = this.faces[0]!.parent!;
    const parts = new Set<Object3D>();
    head.traverse((node) => parts.add(node));
    this.model.traverse((node) => {
      if ((node as Mesh).isMesh) node.visible = parts.has(node);
    });
    this.root.updateMatrixWorld(true);
    // No GLB, o rosto da cabeça fica no -Y local dela.
    const forward = new Vector3(0, -1, 0).applyQuaternion(head.getWorldQuaternion(new Quaternion())).normalize();
    return { box: new Box3().setFromObject(head), forward };
  }

  /** Um gesto curto em cima do Idle. Só responde a quem clicou: não diz o que o bot faz. */
  play(name: RobotGesture) {
    const action = this.gestures[name];
    if (!action) return;
    this.gesture?.stop();
    action.reset();
    action.setEffectiveWeight(1);
    action.play();
    this.gesture = action;
  }

  update(delta: number) {
    this.mixer.update(Math.min(delta, 1 / 20));
    if (this.gesture && !this.gesture.isRunning()) this.gesture = null;
  }

  get gesturing() {
    return this.gesture?.getClip().name ?? null;
  }

  snapshot() {
    const faces = this.faces.map((mesh) => [...mesh.morphTargetInfluences!]);
    return { ...this.look, material: `#${this.body.color.getHexString()}`, faces, gesture: this.gesturing };
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.body.dispose();
    this.model.traverse((node) => {
      const mesh = node as SkinnedMesh;
      if (mesh.isSkinnedMesh) mesh.skeleton.dispose();
    });
    this.root.removeFromParent();
  }
}
