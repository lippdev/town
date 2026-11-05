import type { Quaternion} from "three";
import { AnimationClip, AnimationMixer, Vector3, type Object3D, type SkinnedMesh } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { retargetBodyTracks } from "@/character-studio/viewport/figureRig";
import { retargetClip, type BoneLink } from "./retarget";

/** O pacote só traz o Idle e fotos paradas; andar e sentar vêm de outros modelos do projeto. */
export const PHOTO_POSES = ["Chill", "Cool", "Dram", "King", "Ninja", "Busy", "Punch"] as const;
export type PhotoPose = (typeof PHOTO_POSES)[number];

export interface HumanClips {
  idle: AnimationClip;
  walk: AnimationClip;
  sit: AnimationClip;
  poses: Record<PhotoPose, AnimationClip>;
  /** Metros por segundo, na escala do arquivo, em que o pé de apoio não escorrega. */
  walkSpeed: number;
  /** Onde o quadril fica na pose sentada, em Z, na escala do arquivo. */
  seatedHipsZ: number;
}

const m = (bone: string) => `mixamorig${bone}`;

function aim(target: string, targetEnd: string, source: string, sourceEnd: string): BoneLink {
  return { kind: "aim", target: m(target), targetEnd: m(targetEnd), source, sourceEnd };
}

function delta(target: string, source: string): BoneLink {
  return { kind: "delta", target: m(target), source };
}

const ROBOT_WALK_LINKS: BoneLink[] = [
  delta("Hips", "Body"),
  delta("Neck", "Neck"),
  delta("Head", "Head"),
  aim("LeftArm", "LeftForeArm", "UpperArmL", "LowerArmL"),
  aim("LeftForeArm", "LeftHand", "LowerArmL", "Palm2L"),
  aim("RightArm", "RightForeArm", "UpperArmR", "LowerArmR"),
  aim("RightForeArm", "RightHand", "LowerArmR", "Palm2R"),
  aim("LeftUpLeg", "LeftLeg", "UpperLegL", "LowerLegL"),
  aim("LeftLeg", "LeftFoot", "LowerLegL", "LowerLegL_end"),
  delta("LeftFoot", "FootL"),
  aim("RightUpLeg", "RightLeg", "UpperLegR", "LowerLegR"),
  aim("RightLeg", "RightFoot", "LowerLegR", "LowerLegR_end"),
  delta("RightFoot", "FootR"),
];

const PULSE_SIT_LINKS: BoneLink[] = [
  delta("Hips", "Hips"),
  delta("Spine", "Abdomen"),
  delta("Spine2", "Torso"),
  delta("Neck", "Neck"),
  delta("Head", "Head"),
  aim("LeftArm", "LeftForeArm", "UpperArmL", "LowerArmL"),
  aim("LeftForeArm", "LeftHand", "LowerArmL", "FistL"),
  aim("RightArm", "RightForeArm", "UpperArmR", "LowerArmR"),
  aim("RightForeArm", "RightHand", "LowerArmR", "FistR"),
  aim("LeftUpLeg", "LeftLeg", "UpperLegL", "LowerLegL"),
  aim("LeftLeg", "LeftFoot", "LowerLegL", "FootL"),
  delta("LeftFoot", "FootL"),
  aim("RightUpLeg", "RightLeg", "UpperLegR", "LowerLegR"),
  aim("RightLeg", "RightFoot", "LowerLegR", "FootR"),
  delta("RightFoot", "FootR"),
];

/**
 * O arquivo de poses tem ossos auxiliares do Blender e trilhas de escala que o avatar não
 * usa. Sem isto, o three avisa no console por trilha sem alvo e calcula o que não importa.
 */
export function cleanPoseClip(clip: AnimationClip, armature: Object3D, hips = m("Hips")): AnimationClip {
  const tracks = clip.tracks.filter((track) => {
    const [boneName, property] = track.name.split(".");
    if (!boneName || !armature.getObjectByName(boneName)) return false;
    return property === "quaternion" || (property === "position" && boneName === hips);
  });
  return new AnimationClip(clip.name, clip.duration, tracks);
}

function isBoneName(name: string) {
  return name.startsWith("mixamorig") && !name.endsWith("_end");
}

export interface ClipSources {
  armature: Object3D;
  poses: AnimationClip[];
  robot: { scene: Object3D; clips: AnimationClip[] };
  pulse: { scene: Object3D; clips: AnimationClip[] };
}

/**
 * Monta as animações do avatar. Lança erro se faltar um clipe: quem chama decide o que
 * mostrar, em vez de a figura aparecer em pose de T.
 */
export function buildHumanClips({ armature, poses, robot, pulse }: ClipSources): HumanClips {
  const posed = cloneSkinned(armature);
  const named = (name: string) => {
    const clip = poses.find((candidate) => candidate.name === name);
    if (!clip) throw new Error(`O arquivo de poses não tem o clipe ${name}.`);
    return cleanPoseClip(clip, posed);
  };
  const idle = named("Idle");

  // Tudo parte do primeiro quadro do Idle: dedos e ombros ficam relaxados, não em T.
  holdFirstFrame(posed, idle);

  const unlinked = (links: BoneLink[]) => {
    const linked = new Set(links.map((link) => link.target));
    const names: string[] = [];
    posed.traverse((node) => {
      if (isBoneName(node.name) && !linked.has(node.name)) names.push(node.name);
    });
    return names;
  };

  const toeY = posed.getObjectByName(m("LeftToeBase"))!.getWorldPosition(new Vector3()).y;

  const walkSource = robot.clips.find((clip) => clip.name === "Walking");
  if (!walkSource) throw new Error("O robô não tem o clipe Walking.");
  const robotScene = cloneSkinned(robot.scene);
  const walk = retargetClip({
    name: "Andar",
    source: robotScene,
    clip: withoutMorphs(walkSource),
    target: posed,
    links: ROBOT_WALK_LINKS,
    hips: { source: "Body", target: m("Hips") },
    keep: unlinked(ROBOT_WALK_LINKS),
    plant: { feet: [m("LeftToeBase"), m("RightToeBase")], groundY: toeY },
  });

  const sitSource = pulse.clips.find((clip) => clip.name === "CharacterArmature|SitDown");
  if (!sitSource) throw new Error("O Pulse não tem o clipe SitDown.");
  const pulseScene = cloneSkinned(pulse.scene);
  const sit = retargetClip({
    name: "Sentar",
    source: pulseScene,
    clip: retargetBodyTracks(sitSource, pulseScene),
    target: posed,
    links: PULSE_SIT_LINKS,
    hips: { source: "Hips", target: m("Hips") },
    keep: unlinked(PULSE_SIT_LINKS),
    plant: { feet: [m("LeftToeBase"), m("RightToeBase")], groundY: toeY },
  });

  disposeClone(robotScene);
  disposeClone(pulseScene);
  disposeClone(posed);

  return {
    idle,
    walk,
    sit,
    walkSpeed: measureWalkSpeed(armature, walk),
    seatedHipsZ: sampleBones(armature, sit, [sit.duration], [m("Hips")])[0]![m("Hips")]!.z,
    poses: Object.fromEntries(PHOTO_POSES.map((pose) => [pose, named(pose)])) as Record<PhotoPose, AnimationClip>,
  };
}

function sampleBones(armature: Object3D, clip: AnimationClip, times: readonly number[], bones: readonly string[]) {
  const root = cloneSkinned(armature);
  const mixer = new AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();
  const samples = times.map((time) => {
    action.time = time;
    mixer.update(0);
    root.updateMatrixWorld(true);
    return Object.fromEntries(bones.map((bone) => [bone, root.getObjectByName(bone)!.getWorldPosition(new Vector3())]));
  });
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  disposeClone(root);
  return samples;
}

/**
 * A velocidade sai do próprio clipe: é a do pé que está no chão, indo para trás. Andar mais
 * rápido ou mais devagar que isso faria o pé deslizar.
 */
export function measureWalkSpeed(armature: Object3D, walk: AnimationClip): number {
  const left = m("LeftToeBase");
  const right = m("RightToeBase");
  const steps = 40;
  const dt = walk.duration / steps;
  const samples = sampleBones(armature, walk, Array.from({ length: steps + 1 }, (_, index) => index * dt), [left, right]);
  let total = 0;
  let counted = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const now = samples[index]!;
    const before = samples[index - 1]!;
    const planted = now[left]!.y <= now[right]!.y ? left : right;
    const slide = before[planted]!.z - now[planted]!.z;
    if (slide > 0) {
      total += slide / dt;
      counted += 1;
    }
  }
  return counted > 0 ? total / counted : 0.8;
}

/** Deixa o esqueleto no primeiro quadro: parar o mixer devolveria tudo à pose em T. */
function holdFirstFrame(root: Object3D, clip: AnimationClip) {
  const mixer = new AnimationMixer(root);
  mixer.clipAction(clip).play();
  mixer.update(0);
  const pose: Array<[Object3D, Quaternion, Vector3]> = [];
  root.traverse((node) => pose.push([node, node.quaternion.clone(), node.position.clone()]));
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  for (const [node, quaternion, position] of pose) {
    node.quaternion.copy(quaternion);
    node.position.copy(position);
  }
  root.updateMatrixWorld(true);
}

/** Os pesos de expressão não têm sentido no avatar: só geram aviso de trilha sem alvo. */
function withoutMorphs(clip: AnimationClip) {
  return new AnimationClip(clip.name, clip.duration, clip.tracks.filter((track) => !track.name.endsWith(".morphTargetInfluences")));
}

function disposeClone(root: Object3D) {
  root.traverse((node) => {
    const mesh = node as SkinnedMesh;
    if (mesh.isSkinnedMesh) mesh.skeleton.dispose();
  });
}
