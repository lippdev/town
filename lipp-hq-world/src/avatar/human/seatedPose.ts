import { AnimationClip, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack, type Object3D } from "three";
import { boneNamed, setWorldQuaternion } from "./retarget";
import { CHAIR, DESK, HUMAN_SCALE, SIT, SIT_TIMELINE } from "./seatFit";

const m = (bone: string) => `mixamorig${bone}`;

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);

/**
 * Onde fica a junta do meio de um membro. `pole` diz para que lado ela dobra. O alvo além do
 * alcance vira o ponto mais distante possível: o membro estica, não cresce.
 */
export function solveTwoBone(root: Vector3, target: Vector3, upper: number, lower: number, pole: Vector3): { mid: Vector3; end: Vector3 } {
  const direction = target.clone().sub(root);
  const wanted = direction.length();
  direction.normalize();
  const distance = Math.min(Math.max(wanted, Math.abs(upper - lower) + 1e-4), (upper + lower) * 0.999);
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const side = pole.clone().addScaledVector(direction, -pole.dot(direction)).normalize();
  return {
    mid: root.clone().addScaledVector(direction, along).addScaledVector(side, height),
    end: root.clone().addScaledVector(direction, distance),
  };
}

/** A pose em T do arquivo, que é simétrica e tem a palma para baixo. */
export type RestPose = Map<string, { local: Quaternion; world: Quaternion; position: Vector3 }>;

export function readRestPose(root: Object3D): RestPose {
  root.updateMatrixWorld(true);
  const pose: RestPose = new Map();
  root.traverse((node) => {
    if (node.name.startsWith("mixamorig")) pose.set(node.name, { local: node.quaternion.clone(), world: node.getWorldQuaternion(new Quaternion()), position: node.getWorldPosition(new Vector3()) });
  });
  return pose;
}

type Vec = readonly [number, number, number];

/** Um instante da coreografia, em metros do andar, no referencial dos pés (+Z à frente). */
interface PoseKey {
  t: number;
  hips: Vec;
  /** Inclinação do tronco para a frente, em radianos. */
  lean: number;
  /** Queda da cabeça para a frente, em radianos. */
  nod: number;
  /** 0 é o tronco do Idle, 1 é o do repouso, reto e simétrico. */
  straight: number;
  /** 0 é a mão solta do Idle, 1 é a palma para baixo, apoiada. */
  flat: number;
  leftFoot: Vec;
  rightFoot: Vec;
  leftHand: Vec;
  rightHand: Vec;
}

const hipsHeightAboveJoint = 0.05;

/**
 * A coreografia inteira. O Idle é o primeiro quadro, e ela termina com a pessoa na cadeira.
 * Enquanto a cadeira gira e é puxada, o corpo fica parado sobre ela, com os pés no apoio.
 */
export function seatKeys(idle: Pick<PoseKey, "hips" | "leftFoot" | "rightFoot" | "leftHand" | "rightHand">): PoseKey[] {
  const { climbEnd, swivelEnd, tuckEnd, duration } = SIT_TIMELINE;
  const chairZ = -SIT.standOff;
  const hipsY = SIT.hipJointY + hipsHeightAboveJoint;
  const hipsZ = chairZ + SIT.hipsZ;
  const barAnkleY = CHAIR.footBar.y + CHAIR.footBar.radius + 0.05;
  const barZ = chairZ + CHAIR.footBar.z - 0.02;
  const leftBar: Vec = [0.15, barAnkleY, barZ];
  const rightBar: Vec = [-0.15, barAnkleY, barZ];
  const leftLap: Vec = [0.2, 0.6, hipsZ + 0.13];
  const rightLap: Vec = [-0.2, 0.6, hipsZ + 0.13];
  const edge = chairZ + SIT.deskEdge;
  const leftDesk: Vec = [0.295, DESK.top + 0.077, edge - 0.015];
  const rightDesk: Vec = [-0.295, DESK.top + 0.077, edge - 0.015];
  const midway = (a: Vec, b: Vec, lift: number): Vec => [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + lift, (a[2] + b[2]) / 2];

  const start: PoseKey = { t: 0, lean: 0, nod: 0, straight: 0, flat: 0, ...idle };
  const shifted: PoseKey = { ...start, t: 0.28, lean: 0.1, straight: 0.3, hips: [0.035, idle.hips[1] - 0.02, idle.hips[2] - 0.03] };
  const lifted: PoseKey = { ...shifted, t: 0.42, lean: 0.18, hips: [0.04, idle.hips[1] - 0.025, idle.hips[2] - 0.07], rightFoot: midway(idle.rightFoot, rightBar, 0.04) };
  const onBar: PoseKey = {
    ...lifted,
    t: 0.64,
    lean: 0.3,
    hips: [0.03, idle.hips[1] - 0.015, idle.hips[2] - 0.13],
    rightFoot: rightBar,
    leftHand: [idle.leftHand[0] - 0.03, idle.leftHand[1] + 0.03, idle.leftHand[2] + 0.06],
    rightHand: [idle.rightHand[0] + 0.03, idle.rightHand[1] + 0.03, idle.rightHand[2] + 0.06],
  };
  const pushing: PoseKey = {
    ...onBar,
    t: 0.86,
    lean: 0.26,
    straight: 0.6,
    hips: [0.012, hipsY - 0.03, hipsZ + 0.1],
    leftFoot: midway(idle.leftFoot, leftBar, 0.02),
    leftHand: [0.26, 0.56, hipsZ + 0.2],
    rightHand: [-0.26, 0.56, hipsZ + 0.2],
  };
  const landed: PoseKey = { ...pushing, t: 1.16, lean: 0.06, straight: 0.9, hips: [0, hipsY, hipsZ], leftFoot: leftBar, leftHand: leftLap, rightHand: rightLap };
  const settled: PoseKey = { ...landed, t: climbEnd, lean: 0, straight: 1 };
  const swiveled: PoseKey = { ...settled, t: swivelEnd };
  const tucked: PoseKey = { ...settled, t: tuckEnd };
  // Os dedos só cruzam a borda da mesa depois que a mão está acima do tampo.
  const raised: PoseKey = {
    ...tucked,
    t: tuckEnd + 0.16,
    lean: 0.04,
    flat: 0.2,
    leftHand: [leftDesk[0] - 0.02, DESK.top + 0.13, hipsZ + 0.06],
    rightHand: [rightDesk[0] + 0.02, DESK.top + 0.13, hipsZ + 0.06],
  };
  const over: PoseKey = { ...raised, t: tuckEnd + 0.3, lean: 0.08, flat: 0.9, leftHand: [leftDesk[0] - 0.01, DESK.top + 0.12, hipsZ + 0.09], rightHand: [rightDesk[0] + 0.01, DESK.top + 0.12, hipsZ + 0.09] };
  const reaching: PoseKey = {
    ...over,
    t: tuckEnd + 0.46,
    lean: 0.13,
    flat: 0.97,
    leftHand: [leftDesk[0], leftDesk[1] + 0.05, leftDesk[2] - 0.02],
    rightHand: [rightDesk[0], rightDesk[1] + 0.05, rightDesk[2] - 0.02],
  };
  const resting: PoseKey = { ...reaching, t: duration, lean: 0.17, nod: 0.03, flat: 1, leftHand: leftDesk, rightHand: rightDesk };
  return [start, shifted, lifted, onBar, pushing, landed, settled, swiveled, tucked, raised, over, reaching, resting];
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerpVec = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A pose num instante: entre um instante e outro, parte e chega devagar. */
export function poseAt(keys: readonly PoseKey[], time: number): PoseKey {
  const after = keys.findIndex((key) => key.t >= time);
  if (after <= 0) return after === 0 ? keys[0]! : keys[keys.length - 1]!;
  const from = keys[after - 1]!;
  const to = keys[after]!;
  const k = smooth((time - from.t) / (to.t - from.t));
  const mix = (a: number, b: number) => a + (b - a) * k;
  return {
    t: time,
    hips: lerpVec(from.hips, to.hips, k),
    lean: mix(from.lean, to.lean),
    nod: mix(from.nod, to.nod),
    straight: mix(from.straight, to.straight),
    flat: mix(from.flat, to.flat),
    leftFoot: lerpVec(from.leftFoot, to.leftFoot, k),
    rightFoot: lerpVec(from.rightFoot, to.rightFoot, k),
    leftHand: lerpVec(from.leftHand, to.leftHand, k),
    rightHand: lerpVec(from.rightHand, to.rightHand, k),
  };
}

const TORSO: ReadonlyArray<[string, number]> = [["Hips", 0.3], ["Spine", 0.55], ["Spine1", 0.75], ["Spine2", 1], ["Neck", 0.5]];
const SHOULDER_REACH = 0.38;
const HAND_INWARD = 0.15;
const HAND_DROP = -0.05;

interface Limb {
  upper: Object3D;
  lower: Object3D;
  end: Object3D;
  upperLength: number;
  lowerLength: number;
  /** Rumo do osso na pose de partida. */
  upperDirection: Vector3;
  lowerDirection: Vector3;
  upperIdle: Quaternion;
  lowerIdle: Quaternion;
  upperRest: Quaternion;
  lowerRest: Quaternion;
}

/**
 * Assa a entrada na cadeira no esqueleto do avatar, a partir do primeiro quadro do Idle. Pernas
 * e braços saem de cinemática inversa, contra as medidas reais do móvel, e não de uma pose
 * pronta de outra figura. O resultado é um clipe comum: tocar não custa nada a mais.
 */
export function bakeSitClip(posed: Object3D, rest: RestPose, unlinked: readonly string[], fps = 30): AnimationClip {
  posed.updateMatrixWorld(true);
  const node = (name: string) => boneNamed(posed, m(name));
  const worldOf = (object: Object3D) => object.getWorldPosition(new Vector3());
  const restWorld = (name: string) => rest.get(m(name))!.world;

  const limb = (upper: string, lower: string, end: string): Limb => {
    const [a, b, c] = [node(upper), node(lower), node(end)];
    const upperDirection = worldOf(b).sub(worldOf(a));
    const lowerDirection = worldOf(c).sub(worldOf(b));
    return {
      upper: a,
      lower: b,
      end: c,
      upperLength: upperDirection.length(),
      lowerLength: lowerDirection.length(),
      upperDirection: upperDirection.normalize(),
      lowerDirection: lowerDirection.normalize(),
      upperIdle: a.getWorldQuaternion(new Quaternion()),
      lowerIdle: b.getWorldQuaternion(new Quaternion()),
      upperRest: restWorld(upper),
      lowerRest: restWorld(lower),
    };
  };

  const hipsBone = node("Hips");
  const leftArm = limb("LeftArm", "LeftForeArm", "LeftHand");
  const rightArm = limb("RightArm", "RightForeArm", "RightHand");
  const leftLeg = limb("LeftUpLeg", "LeftLeg", "LeftFoot");
  const rightLeg = limb("RightUpLeg", "RightLeg", "RightFoot");

  const toMeters = (object: Object3D): Vec => {
    const { x, y, z } = worldOf(object).multiplyScalar(HUMAN_SCALE);
    return [x, y, z];
  };
  const keys = seatKeys({ hips: toMeters(hipsBone), leftFoot: toMeters(leftLeg.end), rightFoot: toMeters(rightLeg.end), leftHand: toMeters(leftArm.end), rightHand: toMeters(rightArm.end) });

  const torso = TORSO.map(([name, share]) => ({ bone: node(name), share, idle: node(name).getWorldQuaternion(new Quaternion()), rest: restWorld(name) }));
  const headBone = node("Head");
  const headIdle = headBone.getWorldQuaternion(new Quaternion());
  const shoulders = (["Left", "Right"] as const).map((side) => ({ bone: node(`${side}Shoulder`), sign: side === "Left" ? -1 : 1, idle: node(`${side}Shoulder`).getWorldQuaternion(new Quaternion()), rest: restWorld(`${side}Shoulder`) }));
  const feet = [leftLeg, rightLeg].map((leg, index) => {
    const name = index === 0 ? "LeftFoot" : "RightFoot";
    return { bone: leg.end, idle: leg.end.getWorldQuaternion(new Quaternion()), rest: restWorld(name) };
  });
  const hands = [leftArm, rightArm].map((arm, index) => {
    const name = index === 0 ? "LeftHand" : "RightHand";
    const side = index === 0 ? -1 : 1;
    // A mão do repouso aponta para fora e para baixo: aqui, para a frente, deitada no tampo.
    const prefix = index === 0 ? "Left" : "Right";
    const knuckle = rest.get(m(`${prefix}HandMiddle1`))!.position;
    const pointing = knuckle.clone().sub(rest.get(m(name))!.position).normalize();
    const along = new Vector3(side * Math.sin(HAND_INWARD), HAND_DROP, Math.cos(HAND_INWARD)).normalize();
    const aim = new Quaternion().setFromUnitVectors(pointing, along);
    // No repouso a palma é torta: o lado do mindinho fica abaixo. Aqui as juntas ficam niveladas.
    const across = rest.get(m(`${prefix}HandIndex1`))!.position.clone().sub(rest.get(m(`${prefix}HandPinky1`))!.position).applyQuaternion(aim);
    const tilted = across.clone().addScaledVector(along, -across.dot(along)).normalize();
    const flatAcross = new Vector3().crossVectors(Y, along).multiplyScalar(Math.sign(tilted.dot(new Vector3().crossVectors(Y, along)))).normalize();
    const flat = new Quaternion().setFromUnitVectors(tilted, flatAcross).multiply(aim).multiply(restWorld(name));
    return { bone: arm.end, idle: arm.end.getWorldQuaternion(new Quaternion()), flat };
  });

  const start = [hipsBone, ...torso.map((part) => part.bone), headBone, ...shoulders.map((part) => part.bone), leftArm.upper, leftArm.lower, leftArm.end, rightArm.upper, rightArm.lower, rightArm.end, leftLeg.upper, leftLeg.lower, leftLeg.end, rightLeg.upper, rightLeg.lower, rightLeg.end];
  const baked = [...new Set(start)];
  const startRotations = baked.map((bone) => bone.quaternion.clone());
  const startHips = hipsBone.position.clone();
  const parentInverse = hipsBone.parent!.matrixWorld.clone().invert();

  const frames = Math.max(2, Math.round(SIT_TIMELINE.duration * fps) + 1);
  const times = Array.from({ length: frames }, (_, index) => (index / (frames - 1)) * SIT_TIMELINE.duration);
  const rotations = new Map(baked.map((bone) => [bone, [] as number[]]));
  const positions: number[] = [];

  const scratch = new Quaternion();
  const pitch = new Quaternion();
  const turn = new Quaternion();
  const target = new Vector3();
  const place = (bone: Object3D, world: Quaternion) => setWorldQuaternion(bone, world);

  /** Aponta o osso da base para o rumo pedido, sem acrescentar giro em torno dele. */
  const aimed = (idle: Quaternion, rest: Quaternion, blend: number, idleDirection: Vector3, wanted: Vector3) => {
    const base = idle.clone().slerp(rest, blend);
    const direction = idleDirection.clone().applyQuaternion(scratch.copy(idle).invert()).applyQuaternion(base);
    return turn.setFromUnitVectors(direction, wanted).clone().multiply(base);
  };

  const pose = (arm: Limb, wanted: Vector3, poleOf: Vector3, blend: number) => {
    const root = worldOf(arm.upper);
    const { mid, end } = solveTwoBone(root, wanted, arm.upperLength, arm.lowerLength, poleOf);
    place(arm.upper, aimed(arm.upperIdle, arm.upperRest, blend, arm.upperDirection, mid.clone().sub(root).normalize()));
    place(arm.lower, aimed(arm.lowerIdle, arm.lowerRest, blend, arm.lowerDirection, end.clone().sub(mid).normalize()));
  };

  const inFile = (value: Vec) => target.set(value[0], value[1], value[2]).divideScalar(HUMAN_SCALE).clone();

  for (const time of times) {
    const key = poseAt(keys, time);
    hipsBone.position.copy(inFile(key.hips)).applyMatrix4(parentInverse);
    hipsBone.updateWorldMatrix(true, false);

    for (const part of torso) {
      pitch.setFromAxisAngle(X, key.lean * part.share);
      place(part.bone, pitch.clone().multiply(part.idle.clone().slerp(part.rest, key.straight)));
    }
    // A cabeça compensa o tronco: quem se inclina continua olhando para a frente.
    pitch.setFromAxisAngle(X, key.nod);
    place(headBone, pitch.clone().multiply(headIdle.clone().slerp(rest.get(m("Head"))!.world, key.straight)));
    for (const shoulder of shoulders) {
      pitch.setFromAxisAngle(Y, shoulder.sign * SHOULDER_REACH * key.flat);
      place(shoulder.bone, pitch.clone().multiply(shoulder.idle.clone().slerp(shoulder.rest, key.straight)));
    }

    pose(leftArm, inFile(key.leftHand), new Vector3(0.7, -0.6, -0.35), key.flat);
    pose(rightArm, inFile(key.rightHand), new Vector3(-0.7, -0.6, -0.35), key.flat);
    pose(leftLeg, inFile(key.leftFoot), new Vector3(0.12, 0.1, 1), 0);
    pose(rightLeg, inFile(key.rightFoot), new Vector3(-0.12, 0.1, 1), 0);

    for (const foot of feet) place(foot.bone, foot.idle.clone().slerp(foot.rest, key.straight));
    for (const hand of hands) place(hand.bone, hand.idle.clone().slerp(hand.flat, key.flat));

    positions.push(hipsBone.position.x, hipsBone.position.y, hipsBone.position.z);
    for (const bone of baked) rotations.get(bone)!.push(...bone.quaternion.toArray());
  }

  baked.forEach((bone, index) => bone.quaternion.copy(startRotations[index]!));
  hipsBone.position.copy(startHips);
  posed.updateMatrixWorld(true);

  const bakedNames = new Set(baked.map((bone) => bone.name));
  const reachStart = SIT_TIMELINE.tuckEnd;
  const fingers = unlinked.filter((name) => /Hand(Thumb|Index|Middle|Ring|Pinky)/.test(name));
  const tracks = [
    new VectorKeyframeTrack(`${hipsBone.name}.position`, times, positions),
    ...baked.map((bone) => new QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, rotations.get(bone)!)),
    // Dedos relaxados caem abaixo da palma: abrem um pouco quando a mão pousa.
    ...fingers.map((name) => {
      const idle = boneNamed(posed, name).quaternion;
      const open = idle.clone().slerp(rest.get(name)!.local, 0.8);
      return new QuaternionKeyframeTrack(`${name}.quaternion`, [reachStart + 0.12, reachStart + 0.42], [...idle.toArray(), ...open.toArray()]);
    }),
    ...unlinked.filter((name) => !bakedNames.has(name) && !fingers.includes(name)).map((name) => new QuaternionKeyframeTrack(`${name}.quaternion`, [0], boneNamed(posed, name).quaternion.toArray())),
  ];
  return new AnimationClip("Sentar", SIT_TIMELINE.duration, tracks);
}
