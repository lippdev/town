import { AnimationClip, AnimationMixer, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack, type Object3D } from "three";

/**
 * Como um osso do destino acompanha a origem:
 * - `aim`: aponta para onde o segmento da origem aponta. Não depende da pose de repouso,
 *   que aqui difere (o Pulse descansa de braços baixos, o avatar em T);
 * - `delta`: recebe a rotação que o osso da origem fez a partir do repouso. Serve para
 *   bacia, coluna, cabeça e pé, em que o repouso das duas figuras coincide.
 */
export type BoneLink =
  | { kind: "aim"; target: string; targetEnd: string; source: string; sourceEnd: string }
  | { kind: "delta"; target: string; source: string };

export interface RetargetOptions {
  name: string;
  /** Cena da origem, na pose de repouso. Volta a ela no fim. */
  source: Object3D;
  clip: AnimationClip;
  /** Esqueleto do destino, na pose de partida. Volta a ela no fim. */
  target: Object3D;
  /** Em ordem hierárquica: pai antes do filho. */
  links: readonly BoneLink[];
  hips: { source: string; target: string };
  /** Ossos sem correspondência (dedos, ombros): entram parados, para não voltar ao T. */
  keep?: readonly string[];
  fps?: number;
  /** Trecho da origem, em segundos. */
  from?: number;
  to?: number;
  /** A bacia sobe ou desce a cada quadro para o pé mais baixo tocar `groundY`. */
  plant?: { feet: readonly string[]; groundY: number };
}

const scratchQ = new Quaternion();
const scratchR = new Quaternion();
const fromDirection = new Vector3();
const toDirection = new Vector3();

export function boneNamed(root: Object3D, name: string): Object3D {
  const found = root.getObjectByName(name);
  if (!found) throw new Error(`Osso ausente: ${name}`);
  return found;
}

const worldPosition = (node: Object3D, into = new Vector3()) => node.getWorldPosition(into);
const worldQuaternion = (node: Object3D, into = new Quaternion()) => node.getWorldQuaternion(into);

/** Põe a rotação de mundo no osso, levando em conta a do pai. */
export function setWorldQuaternion(node: Object3D, world: Quaternion) {
  worldQuaternion(node.parent!, scratchQ).invert();
  node.quaternion.copy(scratchQ).multiply(world);
  node.updateWorldMatrix(false, true);
}

/**
 * Assa um clipe de um esqueleto em outro, por amostragem. O resultado é um clipe comum
 * do destino: tocar não custa nada a mais.
 */
export function retargetClip(options: RetargetOptions): AnimationClip {
  const { name, source, clip, target, links, hips, keep = [], fps = 30, from = 0, to = clip.duration, plant } = options;
  source.updateMatrixWorld(true);
  target.updateMatrixWorld(true);

  const sourceBones = new Map(links.flatMap((link) => (link.kind === "aim" ? [link.source, link.sourceEnd] : [link.source])).map((id) => [id, boneNamed(source, id)]));
  const targetBones = new Map(links.flatMap((link) => (link.kind === "aim" ? [link.target, link.targetEnd] : [link.target])).map((id) => [id, boneNamed(target, id)]));
  const sourceHips = boneNamed(source, hips.source);
  const targetHips = boneNamed(target, hips.target);
  const kept = keep.map((id) => boneNamed(target, id));
  const feet = (plant?.feet ?? []).map((id) => boneNamed(target, id));

  // O repouso da origem é lido antes do mixer tocar nela.
  const sourceRest = new Map(links.filter((link) => link.kind === "delta").map((link) => [link.source, worldQuaternion(sourceBones.get(link.source)!)]));
  const sourceHipsRest = worldPosition(sourceHips);
  const targetRest = new Map(links.filter((link) => link.kind === "delta").map((link) => [link.target, worldQuaternion(targetBones.get(link.target)!)]));
  const targetHipsRest = worldPosition(targetHips);
  const start = links.map((link) => targetBones.get(link.target)!.quaternion.clone());
  const startHips = targetHips.position.clone();
  // Pernas de tamanhos diferentes: o quanto a bacia se move segue a altura de cada uma.
  const hipRatio = targetHipsRest.y / sourceHipsRest.y;

  const mixer = new AnimationMixer(source);
  const action = mixer.clipAction(clip);
  action.play();

  const frames = Math.max(2, Math.round((to - from) * fps) + 1);
  const times = Array.from({ length: frames }, (_, index) => (index / (frames - 1)) * (to - from));
  const rotations = new Map(links.map((link) => [link.target, [] as number[]]));
  const positions: number[] = [];
  const parentInverse = targetHips.parent!.matrixWorld.clone().invert();
  const hipsWorld = new Vector3();

  for (const time of times) {
    action.time = from + time;
    mixer.update(0);
    source.updateMatrixWorld(true);

    links.forEach((link, index) => {
      targetBones.get(link.target)!.quaternion.copy(start[index]!);
    });
    worldPosition(sourceHips, hipsWorld).sub(sourceHipsRest).multiplyScalar(hipRatio).add(targetHipsRest);
    targetHips.position.copy(hipsWorld).applyMatrix4(parentInverse);
    target.updateMatrixWorld(true);

    for (const link of links) {
      const node = targetBones.get(link.target)!;
      if (link.kind === "delta") {
        const delta = worldQuaternion(sourceBones.get(link.source)!, scratchR).multiply(scratchQ.copy(sourceRest.get(link.source)!).invert());
        setWorldQuaternion(node, delta.clone().multiply(targetRest.get(link.target)!));
      } else {
        toDirection.copy(worldPosition(sourceBones.get(link.sourceEnd)!)).sub(worldPosition(sourceBones.get(link.source)!)).normalize();
        fromDirection.copy(worldPosition(targetBones.get(link.targetEnd)!)).sub(worldPosition(node)).normalize();
        const turn = new Quaternion().setFromUnitVectors(fromDirection, toDirection);
        setWorldQuaternion(node, turn.multiply(worldQuaternion(node)));
      }
    }

    if (feet.length) {
      target.updateMatrixWorld(true);
      const lowest = Math.min(...feet.map((foot) => worldPosition(foot).y));
      hipsWorld.y += plant!.groundY - lowest;
      targetHips.position.copy(hipsWorld).applyMatrix4(parentInverse);
      target.updateMatrixWorld(true);
    }

    positions.push(targetHips.position.x, targetHips.position.y, targetHips.position.z);
    for (const link of links) rotations.get(link.target)!.push(...targetBones.get(link.target)!.quaternion.toArray());
  }

  const tracks = [
    new VectorKeyframeTrack(`${hips.target}.position`, times, positions),
    ...links.map((link) => new QuaternionKeyframeTrack(`${link.target}.quaternion`, times, rotations.get(link.target)!)),
    ...kept.map((node) => new QuaternionKeyframeTrack(`${node.name}.quaternion`, [0], node.quaternion.toArray())),
  ];

  links.forEach((link, index) => targetBones.get(link.target)!.quaternion.copy(start[index]!));
  targetHips.position.copy(startHips);
  target.updateMatrixWorld(true);
  mixer.stopAllAction();
  mixer.uncacheRoot(source);
  source.updateMatrixWorld(true);

  return new AnimationClip(name, to - from, tracks);
}
