import { existsSync, readdirSync } from "node:fs";
import { AnimationMixer, Matrix4, Vector3, type Material, type Object3D, type SkinnedMesh } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { beforeAll, describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_IDS, ITEMS_BY_ID, itemFile } from "@/avatar/human/catalog";
import { quantizationOf } from "@/avatar/human/HumanFigure";
import { cleanPoseClip, buildHumanClips, PHOTO_POSES, type HumanClips } from "@/avatar/human/humanClips";
import { parseGlb as load } from "../helpers/gltf";

const ROOT = "public/avatares/humano";

function skinnedOf(scene: Object3D) {
  const meshes: SkinnedMesh[] = [];
  scene.traverse((node) => {
    if ((node as SkinnedMesh).isSkinnedMesh) meshes.push(node as SkinnedMesh);
  });
  return meshes;
}

describe("catálogo do pacote de avatar", () => {
  it("cada peça tem arquivo e miniatura, e nada sobra no public", () => {
    const listed = new Set(Object.keys(ITEMS_BY_ID).map(itemFile));
    for (const file of listed) {
      expect(existsSync(`${ROOT}/pecas/${file}`), file).toBe(true);
      expect(existsSync(`${ROOT}/miniaturas/${file.replace(".glb", ".webp")}`), file).toBe(true);
    }
    expect(readdirSync(`${ROOT}/pecas`).filter((file) => !listed.has(file))).toEqual([]);
    expect(readdirSync(`${ROOT}/miniaturas`).filter((file) => !listed.has(file.replace(".webp", ".glb")))).toEqual([]);
  });

  it("toda categoria obrigatória tem peça e toda trava aponta para categoria que existe", () => {
    for (const category of CATEGORIES) {
      expect(category.items.length, category.id).toBeGreaterThan(0);
      for (const item of category.items) {
        for (const lock of item.locks) {
          expect(CATEGORY_IDS).toContain(lock);
          expect(lock, `${item.id} não pode travar a própria categoria`).not.toBe(category.id);
        }
      }
    }
  });

  it("não há id repetido entre categorias", () => {
    const ids = CATEGORIES.flatMap((category) => category.items.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("arquivos do catálogo no disco", () => {
  let armature: GLTF;
  const parts = new Map<string, GLTF>();

  beforeAll(async () => {
    armature = await load(`${ROOT}/armature.glb`);
    await Promise.all(Object.keys(ITEMS_BY_ID).map(async (id) => parts.set(id, await load(`${ROOT}/pecas/${itemFile(id)}`))));
  }, 60000);

  const skeleton = () => skinnedOf(armature.scene)[0]!.skeleton;

  it("toda peça usa os mesmos ossos, na mesma ordem, do esqueleto comum", () => {
    const names = skeleton().bones.map((bone) => bone.name);
    expect(names.length).toBe(75);
    for (const [id, gltf] of parts) {
      const meshes = skinnedOf(gltf.scene);
      expect(meshes.length, id).toBeGreaterThan(0);
      for (const mesh of meshes) expect(mesh.skeleton.bones.map((bone) => bone.name), id).toEqual(names);
    }
  });

  it("a compensação da compressão vale para todos os ossos de cada peça", () => {
    const reference = skeleton();
    const rebuilt = new Matrix4();
    for (const [id, gltf] of parts) {
      const mesh = skinnedOf(gltf.scene)[0]!;
      const correction = quantizationOf(mesh, reference);
      mesh.skeleton.boneInverses.forEach((inverse, index) => {
        rebuilt.copy(reference.boneInverses[index]!).multiply(correction);
        rebuilt.elements.forEach((value, cell) => expect(value, `${id} osso ${index}`).toBeCloseTo(inverse.elements[cell]!, 3));
      });
    }
  });

  it("`colorable` diz a verdade sobre o material Color_ de cada peça", () => {
    for (const [id, gltf] of parts) {
      const names = skinnedOf(gltf.scene).flatMap((mesh) => [mesh.material].flat().map((material: Material) => material.name));
      expect(names.some((name) => name.includes("Color_")), `${id}: ${names.join(",")}`).toBe(ITEMS_BY_ID[id]!.colorable);
    }
  });

  it("a cabeça tem as expressões e os olhos piscam: os morphs que o editor usa existem", () => {
    for (const item of CATEGORIES.find((category) => category.id === "head")!.items) {
      const mesh = skinnedOf(parts.get(item.id)!.scene)[0]!;
      for (const name of ["smile", "sad", "neutral"]) expect(mesh.morphTargetDictionary?.[name], `${item.id} ${name}`).toBeDefined();
    }
    for (const item of CATEGORIES.find((category) => category.id === "eyes")!.items) {
      const mesh = skinnedOf(parts.get(item.id)!.scene)[0]!;
      expect(mesh.morphTargetDictionary?.eyeBlinkLeft, item.id).toBeDefined();
    }
  });
});

describe("animações do avatar", () => {
  let clips: HumanClips;
  let armature: Object3D;
  let posesRaw: GLTF;

  beforeAll(async () => {
    const [arm, poses, robot, pulse] = await Promise.all([load(`${ROOT}/armature.glb`), load(`${ROOT}/poses.glb`), load("public/avatares/robo/RobotExpressive.glb"), load("public/prototipo/pulse.glb")]);
    armature = arm.scene;
    posesRaw = poses;
    clips = buildHumanClips({ armature, poses: poses.animations, robot: { scene: robot.scene, clips: robot.animations }, pulse: { scene: pulse.scene, clips: pulse.animations } });
  }, 60000);

  it("o pacote só tem o Idle animado: as demais são fotos de um quadro", () => {
    const duration = (name: string) => posesRaw.animations.find((clip) => clip.name === name)!.duration;
    expect(duration("Idle")).toBeGreaterThan(1);
    for (const pose of PHOTO_POSES) expect(duration(pose), pose).toBeLessThan(0.1);
    // Nada de andar nem sentar no pacote: é por isso que esses dois são redirecionados.
    expect(posesRaw.animations.map((clip) => clip.name).filter((name) => /walk|sit/i.test(name))).toEqual([]);
  });

  it("os clipes só têm trilhas de ossos que existem, sem escala", () => {
    for (const clip of [clips.idle, clips.walk, clips.sit, ...Object.values(clips.poses)]) {
      for (const track of clip.tracks) {
        const [bone, property] = track.name.split(".");
        expect(armature.getObjectByName(bone!), track.name).toBeTruthy();
        expect(["quaternion", "position"]).toContain(property);
      }
    }
  });

  it("limpar o clipe tira trilhas sem alvo e de escala", () => {
    const raw = posesRaw.animations.find((clip) => clip.name === "Chill")!;
    expect(raw.tracks.length).toBeGreaterThan(cleanPoseClip(raw, armature).tracks.length);
  });

  /** O esqueleto em cada instante do clipe, sem renderizar nada. */
  function sample(clip: HumanClips["walk"], time: number) {
    const root = cloneSkinned(armature);
    const mixer = new AnimationMixer(root);
    const action = mixer.clipAction(clip);
    action.play();
    action.time = time;
    mixer.update(0);
    root.updateMatrixWorld(true);
    const at = (name: string) => root.getObjectByName(name)!.getWorldPosition(new Vector3());
    return { hips: at("mixamorigHips"), toeL: at("mixamorigLeftToeBase"), toeR: at("mixamorigRightToeBase"), head: at("mixamorigHead"), handL: at("mixamorigLeftHand") };
  }

  it("andando, um pé pisa no chão a cada quadro e os dois se alternam", () => {
    const steps = 24;
    const ahead: number[] = [];
    for (let index = 0; index < steps; index += 1) {
      const pose = sample(clips.walk, (index / steps) * clips.walk.duration);
      expect(Math.min(pose.toeL.y, pose.toeR.y), `quadro ${index}`).toBeCloseTo(sample(clips.idle, 0).toeL.y, 2);
      expect(pose.head.y, `a cabeça não some, quadro ${index}`).toBeGreaterThan(1.1);
      ahead.push(pose.toeL.z - pose.toeR.z);
    }
    expect(Math.max(...ahead)).toBeGreaterThan(0.1);
    expect(Math.min(...ahead)).toBeLessThan(-0.1);
  });

  it("sentada, a bacia desce e os pés ficam no chão", () => {
    const standing = sample(clips.idle, 0);
    const seated = sample(clips.sit, clips.sit.duration);
    expect(seated.hips.y).toBeLessThan(standing.hips.y - 0.12);
    expect(Math.min(seated.toeL.y, seated.toeR.y)).toBeCloseTo(standing.toeL.y, 2);
  });
});
