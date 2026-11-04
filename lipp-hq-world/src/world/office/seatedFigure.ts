import type { ActorPose } from "./officeVisit";
import { Group, Quaternion, Vector3, type AnimationClip, type Object3D } from "three";
import type { CharacterSpec } from "@/character-studio/model/schema";
import { FigureRig } from "@/character-studio/viewport/figureRig";

const scratchA = new Vector3();
const scratchB = new Vector3();
const delta = new Quaternion();
const parentRotation = new Quaternion();
const boneRotation = new Quaternion();

function worldPosition(bone: Object3D, into = new Vector3()) {
  return bone.getWorldPosition(into);
}

/** Gira o osso, no referencial do mundo, para levar a direção `from` até `to`. */
function aimBone(bone: Object3D, from: Vector3, to: Vector3) {
  delta.setFromUnitVectors(from.normalize(), to.normalize());
  bone.parent!.getWorldQuaternion(parentRotation);
  bone.getWorldQuaternion(boneRotation);
  bone.quaternion.copy(parentRotation.invert().multiply(delta).multiply(boneRotation));
  bone.updateWorldMatrix(false, true);
}

/** Solução analítica de duas juntas: o cotovelo sai para o lado de `pole`. */
export function solveTwoBones(upper: Object3D, lower: Object3D, end: Object3D, target: Vector3, pole: Vector3) {
  upper.updateWorldMatrix(true, true);
  const shoulder = worldPosition(upper);
  const elbow = worldPosition(lower);
  const hand = worldPosition(end);
  const upperLength = shoulder.distanceTo(elbow);
  const lowerLength = elbow.distanceTo(hand);
  const toTarget = target.clone().sub(shoulder);
  const reach = Math.min(toTarget.length(), (upperLength + lowerLength) * 0.995);
  const direction = toTarget.clone().normalize();
  const along = (upperLength ** 2 + reach ** 2 - lowerLength ** 2) / (2 * reach);
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  const side = pole.clone().sub(direction.clone().multiplyScalar(pole.dot(direction))).normalize();
  const nextElbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(side, height);
  aimBone(upper, scratchA.copy(elbow).sub(shoulder), scratchB.copy(nextElbow).sub(shoulder));
  const movedElbow = worldPosition(lower);
  const movedHand = worldPosition(end);
  aimBone(lower, scratchA.copy(movedHand).sub(movedElbow), scratchB.copy(target).sub(movedElbow));
}

interface Transform { node: Object3D; position: Vector3; rotation: Quaternion }
function capture(root: Object3D): Transform[] {
  const result: Transform[] = [];
  root.traverse((node) => result.push({ node, position: node.position.clone(), rotation: node.quaternion.clone() }));
  return result;
}

interface Sway {
  bone: Object3D;
  base: Quaternion;
  axis: Vector3;
}

function swayOn(bone: Object3D, worldAxis: Vector3): Sway {
  bone.updateWorldMatrix(true, false);
  const inverse = bone.getWorldQuaternion(new Quaternion()).invert();
  return { bone, base: bone.quaternion.clone(), axis: worldAxis.clone().applyQuaternion(inverse).normalize() };
}

const turn = new Quaternion();

function applySway(sway: Sway, angle: number) {
  sway.bone.quaternion.copy(sway.base).multiply(turn.setFromAxisAngle(sway.axis, angle));
}

export interface SeatOptions {
  /** Altura do tampo em unidades da figura (já sem a escala da cena). */
  handY: number;
  /** Distância do quadril até onde a mão pousa. */
  handZ: number;
  phase: number;
}

/**
 * Figura do estúdio sentada numa cadeira do escritório. A pose vem do `SitDown`
 * corrigido; só os braços são refeitos para as mãos pousarem no tampo, e a cabeça
 * olha um pouco para baixo. Isto é uma pose, não uma animação de digitar.
 */
export class SeatedFigure {
  readonly root = new Group();
  private readonly rig: FigureRig;
  private readonly offset = new Group();
  private readonly head: Sway;
  private readonly torso: Sway;
  private readonly phase: number;
  private readonly seated: Transform[];
  private readonly standing: Transform[];
  private readonly seatedOffset: Vector3;
  private readonly standingOffset: Vector3;

  constructor(scene: Object3D, clips: AnimationClip[], spec: CharacterSpec, options: SeatOptions) {
    this.phase = options.phase;
    this.rig = new FigureRig(scene, clips, { bench: false });
    // A pose é calculada sem a largura: escala desigual distorce as rotações do mundo.
    this.rig.apply({ ...spec, proportions: { ...spec.proportions, width: 1 } });
    this.standing = capture(this.rig.holder);
    this.standingOffset = new Vector3();
    this.rig.holder.updateMatrixWorld(true);
    const standingHips = this.rig.holder.getObjectByName("Hips")!.getWorldPosition(new Vector3());
    this.standingOffset.set(-standingHips.x, 0, -standingHips.z);
    this.rig.setPose("sitting", false, true);
    this.offset.add(this.rig.holder);
    this.root.add(this.offset);
    this.root.updateMatrixWorld(true);

    const holder = this.rig.holder;
    const bone = (name: string) => holder.getObjectByName(name)!;
    const hips = worldPosition(bone("Hips"));
    this.offset.position.set(-hips.x, 0, -hips.z);
    this.root.updateMatrixWorld(true);

    for (const [suffix, side] of [["L", 1], ["R", -1]] as const) {
      solveTwoBones(
        bone(`UpperArm${suffix}`),
        bone(`LowerArm${suffix}`),
        bone(`Fist${suffix}`),
        new Vector3(side * 0.2, options.handY, options.handZ),
        new Vector3(side * 0.7, -0.5, -0.4),
      );
    }
    this.torso = swayOn(bone("Torso"), new Vector3(1, 0, 0));
    const neck = swayOn(bone("Neck"), new Vector3(1, 0, 0));
    applySway(neck, 0.14);
    this.head = swayOn(bone("Head"), new Vector3(0, 1, 0));

    this.seated = capture(this.rig.holder);
    this.seatedOffset = this.offset.position.clone();
    this.rig.apply(spec);
    this.root.traverse((node) => {
      if ((node as { isMesh?: boolean }).isMesh) node.castShadow = true;
    });
  }

  /** Respiração e um olhar lento: sinal de vida, sem dizer nada sobre o que o bot faz. */
  sway(seconds: number) {
    const t = seconds + this.phase;
    applySway(this.torso, Math.sin(t * 1.5) * 0.008);
    applySway(this.head, Math.sin(t * 0.37) * 0.09 + Math.sin(t * 0.91) * 0.025);
  }

  /** Pose procedural da demonstração; restaura a base a cada quadro, sem acumular rotações. */
  perform(standing: number, walk: number, talk: number, seconds: number, reduced: boolean, movement?: ActorPose) {
    this.seated.forEach((base, index) => {
      const target = this.standing[index]!;
      base.node.position.lerpVectors(base.position, target.position, standing);
      base.node.quaternion.slerpQuaternions(base.rotation, target.rotation, standing);
    });
    this.offset.position.lerpVectors(this.seatedOffset, this.standingOffset, standing);
    if (standing < 0.99) {
      if (!reduced && talk > 0 && standing < 0.01) {
        this.sway(seconds);
        this.rig.holder.getObjectByName("Head")!.rotateX(Math.sin(seconds * 2.5) * 0.04 * talk);
        this.rig.holder.getObjectByName("UpperArmR")!.rotateX(Math.sin(seconds * 3) * 0.10 * talk);
        this.rig.holder.getObjectByName("LowerArmR")!.rotateX(-0.12 * talk);
      }
      return;
    }
    const bone = (name: string) => this.rig.holder.getObjectByName(name)!;
    const cycle = movement?.gaitPhase ?? 0;
    const stride = reduced ? 0 : walk;
    this.root.updateWorldMatrix(true, true);
    const orientation = this.root.getWorldQuaternion(new Quaternion());
    const forward = new Vector3(0, 0, 1).applyQuaternion(orientation);
    const up = new Vector3(0, 1, 0).applyQuaternion(orientation);
    // FootL/R são alvos independentes no GLB: mover só a coxa separaria as pernas.
    for (const [suffix, sign] of [["L", 1], ["R", -1]] as const) {
      const foot = bone(`Foot${suffix}`);
      const wave = Math.sin(cycle + (sign === 1 ? 0 : Math.PI));
      const base = foot.getWorldPosition(new Vector3());
      const target = base.clone();
      const step = !reduced ? movement?.feet?.[suffix] : undefined;
      const footRotation = foot.getWorldQuaternion(new Quaternion());
      if (step) {
        // Retire apenas a translação/rotação atual do ator: a largura e a altura
        // do personagem continuam incorporadas no deslocamento natural do pé.
        const local = base.clone().sub(this.root.getWorldPosition(new Vector3()))
          .applyQuaternion(orientation.clone().invert());
        const heading = new Quaternion().setFromAxisAngle(up, step.yaw);
        local.applyQuaternion(heading);
        target.set(step.x + local.x, base.y + step.lift, step.z + local.z);
        footRotation.premultiply(new Quaternion().setFromAxisAngle(up, step.yaw - movement!.yaw));
      }
      solveTwoBones(bone(`UpperLeg${suffix}`), bone(`LowerLeg${suffix}`), foot, target, forward);
      foot.position.copy(foot.parent!.worldToLocal(target.clone()));
      foot.quaternion.copy(foot.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(footRotation));
      const arm = bone(`UpperArm${suffix}`);
      arm.rotateX(-wave * 0.22 * stride);
      if (!reduced && talk > 0) {
        arm.rotateX(-0.15 * talk + Math.sin(seconds * 3 + sign) * 0.12 * talk);
        bone(`LowerArm${suffix}`).rotateX(-0.25 * talk);
      }
    }
    if (!reduced && talk > 0) bone("Head").rotateX(Math.sin(seconds * 2.5) * 0.045 * talk);
  }

  get pose() {
    return this.rig.snapshot();
  }

  dispose() {
    this.root.removeFromParent();
    this.rig.dispose();
  }
}
