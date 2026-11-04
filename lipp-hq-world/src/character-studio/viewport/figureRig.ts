import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  CylinderGeometry,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Bone,
  type BufferGeometry,
  type Object3D,
  type SkinnedMesh,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { COLOR_SLOTS, SLOT_MATERIAL, type CharacterSpec, type ColorSlot } from "@/character-studio/model/schema";

export type FigurePose = "standing" | "sitting";

const IDLE_CLIP = "CharacterArmature|Idle";
const SIT_CLIP = "CharacterArmature|SitDown";
/** Cabeça maior usada para medir quanto cada 1% de cabeça soma na altura. */
const HEAD_PROBE = 1.3;
const COVERED_SEAT_OVERLAP = 3;

/** O que a página exige do arquivo; o que faltar vira erro explicado, não um personagem pela metade. */
export function findBaseProblems(scene: Object3D, clips: AnimationClip[]): string[] {
  const problems: string[] = [];
  const materials = new Set<string>();
  scene.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.isMesh) for (const material of [mesh.material].flat()) materials.add(material.name);
  });
  for (const slot of COLOR_SLOTS) {
    if (!materials.has(SLOT_MATERIAL[slot])) problems.push(`material ${SLOT_MATERIAL[slot]}`);
  }
  if (!scene.getObjectByName("Head")) problems.push("osso Head");
  for (const name of [IDLE_CLIP, SIT_CLIP]) {
    if (!clips.some((clip) => clip.name === name)) problems.push(`clipe ${name}`);
  }
  return problems;
}

/**
 * Na conversão FBX → GLB o osso raiz e a malha ficaram com o mesmo nome, "Body", e
 * o exportador ligou as trilhas à malha. Com isso o quadril nunca desce no SitDown
 * (e a cena do protótipo herda isso). Aqui as trilhas voltam para o osso, numa cópia
 * em memória: o arquivo original fica como está.
 */
export function retargetBodyTracks(clip: AnimationClip, root: Object3D): AnimationClip {
  let boneName: string | null = null;
  root.traverse((node) => {
    if ((node as Bone).isBone && /^Body(_\d+)?$/.test(node.name)) boneName = node.name;
  });
  const copy = clip.clone();
  if (!boneName || boneName === "Body") return copy;
  for (const track of copy.tracks) {
    if (track.name.startsWith("Body.")) track.name = `${boneName}${track.name.slice(4)}`;
  }
  return copy;
}

function isSkinned(node: Object3D): node is SkinnedMesh {
  return (node as SkinnedMesh).isSkinnedMesh === true;
}

const scratch = new Vector3();

function meshBounds(mesh: SkinnedMesh, into: Box3) {
  mesh.skeleton.update();
  const count = mesh.geometry.attributes.position!.count;
  for (let index = 0; index < count; index += 1) {
    mesh.getVertexPosition(index, scratch);
    mesh.localToWorld(scratch);
    into.expandByPoint(scratch);
  }
}

export interface FigureSnapshot {
  materials: Record<ColorSlot, { name: string; hex: string; meshes: number }>;
  fileColors: Record<ColorSlot, string>;
  headBoneScale: [number, number, number];
  fileHeadScale: number;
  holderScale: [number, number, number];
  pose: FigurePose;
  animating: boolean;
  glasses: boolean;
  seatVisible: boolean;
  bones: number;
  clips: string[];
  /** Medidas reais dos vértices com esqueleto aplicado, em metros. */
  bounds: { min: [number, number, number]; max: [number, number, number] };
  slotBounds: Record<ColorSlot, { width: number; depth: number; height: number; minY: number; maxY: number }>;
  hipsY: number;
  footY: number;
}

/**
 * O Pulse vivo no estúdio: clone com esqueleto, materiais próprios e clipes
 * corrigidos. Sem React, para o laço sob demanda só avançar quando há o que mostrar.
 */
export class FigureRig {
  readonly holder = new Group();
  private readonly root: Object3D;
  private readonly meshes: Partial<Record<ColorSlot, SkinnedMesh[]>> = {};
  private readonly materials = {} as Record<ColorSlot, MeshStandardMaterial>;
  private readonly fileColors = {} as Record<ColorSlot, string>;
  private readonly mixer: AnimationMixer;
  private readonly idle: AnimationAction;
  private readonly sit: AnimationAction;
  private readonly head: Object3D;
  private readonly fileHeadScale: number;
  private readonly standingHeight: number;
  private readonly heightPerHead: number;
  private readonly lift: number;
  private readonly seat = new Group();
  private readonly glasses = new Group();
  private readonly disposables: { dispose: () => void }[] = [];
  private pose: FigurePose = "standing";
  private motion = false;
  private running = false;
  private settle: (() => void) | null = null;
  /** Quanto o corpo recua ao sentar; compensado para a figura seguir no centro do palco. */
  private seatedCenterZ = 0;
  private scaleZ = 1;
  private active: AnimationAction | null = null;

  constructor(scene: Object3D, clips: AnimationClip[]) {
    this.root = cloneSkinned(scene);
    this.holder.name = "figura-pulse";
    this.holder.add(this.root);

    this.root.traverse((node) => {
      if (!isSkinned(node)) return;
      node.castShadow = true;
      node.receiveShadow = true;
      // a caixa de repouso não acompanha a pose
      node.frustumCulled = false;
      const original = node.material as MeshStandardMaterial;
      const slot = COLOR_SLOTS.find((candidate) => SLOT_MATERIAL[candidate] === original.name);
      if (!slot) return;
      if (!this.materials[slot]) {
        this.materials[slot] = original.clone();
        this.fileColors[slot] = `#${original.color.getHexString()}`;
        this.disposables.push(this.materials[slot]);
      }
      node.material = this.materials[slot];
      (this.meshes[slot] ??= []).push(node);
    });

    this.head = this.root.getObjectByName("Head")!;
    this.fileHeadScale = this.head.scale.y;

    this.mixer = new AnimationMixer(this.root);
    const fixed = (name: string) => retargetBodyTracks(clips.find((clip) => clip.name === name)!, this.root);
    this.idle = this.mixer.clipAction(fixed(IDLE_CLIP));
    this.sit = this.mixer.clipAction(fixed(SIT_CLIP));
    this.sit.setLoop(LoopOnce, 1);
    this.sit.clampWhenFinished = true;

    // Medido parado no primeiro quadro do Idle, antes de qualquer ajuste.
    this.hold(this.idle, 0);
    this.root.updateMatrixWorld(true);
    const standing = this.allBounds();
    this.head.scale.setScalar(this.fileHeadScale * HEAD_PROBE);
    this.root.updateMatrixWorld(true);
    const probed = this.allBounds();
    this.head.scale.setScalar(this.fileHeadScale);
    this.standingHeight = standing.max.y - standing.min.y;
    this.heightPerHead = (probed.max.y - standing.max.y) / (HEAD_PROBE - 1);
    this.lift = -standing.min.y;

    this.hold(this.sit, this.sit.getClip().duration);
    this.root.updateMatrixWorld(true);
    const seated = this.allBounds();
    this.seatedCenterZ = (seated.min.z + seated.max.z) / 2;
    this.buildSeat();
    this.buildGlasses(scene);
    this.hold(this.idle, 0);
  }

  private allBounds(): Box3 {
    const box = new Box3();
    for (const slot of COLOR_SLOTS) for (const mesh of this.meshes[slot] ?? []) meshBounds(mesh, box);
    return box;
  }

  /** Banco neutro para a pose sentada, na altura medida do assento. */
  private buildSeat() {
    const pants = new Box3();
    for (const mesh of this.meshes.pants ?? []) meshBounds(mesh, pants);
    const hips = this.root.getObjectByName("Hips")!.getWorldPosition(new Vector3());
    const material = new MeshStandardMaterial({ color: "#a9a7a1", roughness: 0.75 });
    const top = pants.min.y + COVERED_SEAT_OVERLAP + this.lift;
    const parts: [BufferGeometry, number][] = [
      [new CylinderGeometry(33, 33, 7, 28), top - 3.5],
      [new CylinderGeometry(4, 4, top - 10, 12), (top - 7 + 3) / 2],
      [new CylinderGeometry(22, 24, 3, 28), 1.5],
    ];
    for (const [geometry, y] of parts) {
      const mesh = new Mesh(geometry, material);
      mesh.position.set(0, y, hips.z);
      mesh.castShadow = true;
      this.seat.add(mesh);
      this.disposables.push(geometry);
    }
    this.disposables.push(material);
    this.seat.name = "banco";
    this.seat.position.y = -this.lift;
    this.seat.visible = false;
    this.root.parent!.add(this.seat);
  }

  /**
   * Óculos presos ao osso da cabeça, na altura dos olhos medida no material Face.
   * Por serem filhos do osso, seguem a pose e o tamanho da cabeça sem cálculo extra.
   */
  private buildGlasses(source: Object3D) {
    source.updateMatrixWorld(true);
    const faceBox = new Box3();
    source.traverse((node) => {
      const mesh = node as SkinnedMesh;
      if (mesh.isSkinnedMesh && (mesh.material as MeshStandardMaterial).name === SLOT_MATERIAL.face) meshBounds(mesh, faceBox);
    });
    const sourceHead = source.getObjectByName("Head")!;
    const headPosition = sourceHead.getWorldPosition(new Vector3());
    const headScale = sourceHead.getWorldScale(new Vector3()).y;
    const headRotation = sourceHead.getWorldQuaternion(new Quaternion()).invert();
    const toLocal = (world: Vector3) => world.clone().sub(headPosition).applyQuaternion(headRotation).divideScalar(headScale);
    const center = toLocal(faceBox.getCenter(new Vector3()));
    const size = faceBox.getSize(new Vector3()).divideScalar(headScale);
    const front = toLocal(faceBox.max.clone()).z;

    // Largura real da cabeça na altura dos olhos, para as hastes encostarem nela.
    let halfWidth = size.x / 2;
    const skinPoint = new Vector3();
    source.traverse((node) => {
      const mesh = node as SkinnedMesh;
      if (!mesh.isSkinnedMesh || (mesh.material as MeshStandardMaterial).name !== SLOT_MATERIAL.skin) return;
      const count = mesh.geometry.attributes.position!.count;
      for (let index = 0; index < count; index += 1) {
        mesh.getVertexPosition(index, skinPoint);
        mesh.localToWorld(skinPoint);
        if (skinPoint.y >= faceBox.min.y && skinPoint.y <= faceBox.max.y) halfWidth = Math.max(halfWidth, Math.abs(toLocal(skinPoint).x));
      }
    });

    const radius = size.x * 0.185;
    const tube = radius * 0.1;
    const spacing = size.x * 0.33;
    const material = new MeshStandardMaterial({ color: "#23252a", roughness: 0.45, name: "Oculos" });
    this.disposables.push(material);
    const add = (geometry: BufferGeometry, x: number, y: number, z: number) => {
      const mesh = new Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      this.disposables.push(geometry);
      this.glasses.add(mesh);
    };
    const z = front + tube * 2;
    const y = center.y;
    const bar = tube * 1.5;
    add(new TorusGeometry(radius, tube, 8, 28), -spacing, y, z);
    add(new TorusGeometry(radius, tube, 8, 28), spacing, y, z);
    add(new BoxGeometry((spacing - radius) * 2, bar, bar), 0, y + radius * 0.25, z);
    const armLength = front * 1.1;
    const hingeStart = spacing + radius;
    // Um pouco para dentro: a haste entra sob o cabelo em vez de sobrar para fora dele.
    const armX = halfWidth * 0.97;
    for (const side of [-1, 1]) {
      add(new BoxGeometry(armX - hingeStart + bar, bar, bar), (side * (armX + hingeStart)) / 2, y + radius * 0.25, z);
      add(new BoxGeometry(bar, bar, armLength), side * armX, y + radius * 0.25, z - armLength / 2);
    }
    this.glasses.name = "oculos";
    this.glasses.visible = false;
    this.head.add(this.glasses);
  }

  private hold(action: AnimationAction, time: number) {
    this.mixer.stopAllAction();
    action.reset();
    action.time = time;
    action.timeScale = 1;
    action.paused = false;
    action.play();
    this.active = action;
    this.mixer.update(0);
    this.syncSeatedShift();
  }

  private syncSeatedShift() {
    const progress = this.active === this.sit ? this.sit.time / this.sit.getClip().duration : 0;
    this.holder.position.z = -this.seatedCenterZ * progress * this.scaleZ;
  }

  apply(spec: CharacterSpec) {
    for (const slot of COLOR_SLOTS) this.materials[slot]?.color.set(spec.colors[slot]);
    const { heightM, width, head } = spec.proportions;
    // A largura vale para o corpo: a cabeça é desfeita no próprio osso para não achatar.
    const headScale = this.fileHeadScale * head;
    this.head.scale.set(headScale / width, headScale, headScale / width);
    const scale = heightM / (this.standingHeight + this.heightPerHead * (head - 1));
    this.holder.scale.set(scale * width, scale, scale * width);
    this.holder.position.y = this.lift * scale;
    this.glasses.visible = spec.accessories.glasses;
    this.scaleZ = scale * width;
    this.syncSeatedShift();
  }

  /** Devolve verdadeiro quando há animação a acompanhar quadro a quadro. */
  setPose(pose: FigurePose, motion: boolean, instant: boolean): boolean {
    const changed = pose !== this.pose;
    this.motion = motion;
    this.pose = pose;
    this.settle = null;

    if (pose === "sitting") {
      this.seat.visible = true;
      const duration = this.sit.getClip().duration;
      if (changed && !instant) {
        this.hold(this.sit, 0);
        this.running = true;
      } else {
        this.hold(this.sit, duration);
        this.sit.paused = true;
        this.running = false;
      }
      return this.running;
    }

    this.idle.setLoop(LoopRepeat, Infinity);
    const standUp = () => {
      this.seat.visible = false;
      this.hold(this.idle, 0);
      this.running = this.motion && !instant;
      this.idle.paused = !this.running;
    };
    if (changed && !instant) {
      // Levantar é o clipe de sentar de trás para a frente.
      this.hold(this.sit, this.sit.getClip().duration);
      this.sit.timeScale = -1;
      // chegar ao fim do clipe o deixou preso em clampWhenFinished
      this.sit.paused = false;
      this.running = true;
      this.settle = standUp;
      return true;
    }
    standUp();
    return this.running;
  }

  /** Avança a animação; o retorno diz se o laço deve pedir outro quadro. */
  update(delta: number): boolean {
    if (!this.running) return false;
    this.mixer.update(Math.min(delta, 1 / 20));
    if (this.pose === "sitting" && this.sit.time >= this.sit.getClip().duration - 1e-3) {
      this.sit.paused = true;
      this.running = false;
    }
    if (this.settle && this.sit.time <= 1e-3) {
      const settle = this.settle;
      this.settle = null;
      settle();
    }
    this.syncSeatedShift();
    return this.running;
  }

  get animating() {
    return this.running;
  }

  snapshot(): FigureSnapshot {
    // updateMatrixWorld, não updateWorldMatrix: só ele renova o bindMatrixInverse das malhas.
    this.holder.updateMatrixWorld(true);
    const materials = {} as FigureSnapshot["materials"];
    const slotBounds = {} as FigureSnapshot["slotBounds"];
    for (const slot of COLOR_SLOTS) {
      const meshes = this.meshes[slot] ?? [];
      const box = new Box3();
      for (const mesh of meshes) meshBounds(mesh, box);
      const size = box.getSize(new Vector3());
      slotBounds[slot] = { width: size.x, depth: size.z, height: size.y, minY: box.min.y, maxY: box.max.y };
      // Lê o material que está de fato na malha, não o que o estado pediu.
      const material = meshes[0]!.material as MeshStandardMaterial;
      materials[slot] = { name: material.name, hex: `#${material.color.getHexString()}`, meshes: meshes.length };
    }
    const all = this.allBounds();
    const worldY = (name: string) => this.root.getObjectByName(name)!.getWorldPosition(new Vector3()).y;
    const anyMesh = this.meshes.skin![0]!;
    return {
      materials,
      slotBounds,
      fileColors: { ...this.fileColors },
      fileHeadScale: this.fileHeadScale,
      headBoneScale: this.head.scale.toArray() as [number, number, number],
      holderScale: this.holder.scale.toArray() as [number, number, number],
      pose: this.pose,
      animating: this.running,
      glasses: this.glasses.visible,
      seatVisible: this.seat.visible,
      bones: anyMesh.skeleton.bones.length,
      clips: [this.idle.getClip().name, this.sit.getClip().name],
      bounds: { min: all.min.toArray() as [number, number, number], max: all.max.toArray() as [number, number, number] },
      hipsY: worldY("Hips"),
      footY: worldY("FootL"),
    };
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    for (const item of this.disposables) item.dispose();
    this.root.traverse((node) => {
      if (isSkinned(node)) node.skeleton.dispose();
    });
    this.holder.removeFromParent();
  }
}
