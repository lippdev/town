import { readFileSync } from "node:fs";
import { AnimationMixer, Quaternion, Vector3, type AnimationClip, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { beforeAll, describe, expect, it } from "vitest";
import { PULSE_BASE_SPEC } from "@/character-studio/model/presets";
import { findBaseProblems, FigureRig, retargetBodyTracks } from "@/character-studio/viewport/figureRig";

let scene: Object3D;
let clips: AnimationClip[];

beforeAll(async () => {
  const bytes = readFileSync("public/prototipo/pulse.glb");
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const gltf = await loader.parseAsync(buffer, "");
  scene = gltf.scene;
  clips = gltf.animations;
});

const position = (root: Object3D, name: string) => root.getObjectByName(name)!.getWorldPosition(new Vector3());

/** Distância da ponta da canela até o osso do pé: os dois só se encontram na pose autoral. */
function legGap(root: Object3D, clip: AnimationClip, time: number, shinLength: number) {
  const mixer = new AnimationMixer(root);
  mixer.clipAction(clip).play();
  mixer.setTime(time);
  root.updateMatrixWorld(true);
  const shin = root.getObjectByName("LowerLegL")!;
  const axis = new Vector3(0, 1, 0).applyQuaternion(shin.getWorldQuaternion(new Quaternion()));
  const gap = position(root, "LowerLegL").add(axis.multiplyScalar(shinLength)).distanceTo(position(root, "FootL"));
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  return gap;
}

describe("pulse.glb no estúdio", () => {
  it("o arquivo tem tudo que o estúdio exige", () => {
    expect(findBaseProblems(scene, clips)).toEqual([]);
  });

  it("devolver as trilhas ao osso raiz é o que liga a perna ao pé ao sentar", () => {
    scene.updateMatrixWorld(true);
    const shinLength = position(scene, "LowerLegL").distanceTo(position(scene, "FootL"));
    const sit = clips.find((clip) => clip.name.includes("SitDown"))!;
    // Um pouco antes do fim: no tempo exato da duração, o laço padrão volta ao início.
    const end = sit.duration - 0.001;
    const asFile = legGap(scene, sit, end, shinLength);
    const fixed = legGap(scene, retargetBodyTracks(sit, scene), end, shinLength);
    expect(asFile).toBeGreaterThan(30);
    expect(fixed).toBeLessThan(2);
  });

  it("corrigir o clipe não altera o clipe carregado do arquivo", () => {
    const sit = clips.find((clip) => clip.name.includes("SitDown"))!;
    const before = sit.tracks.map((track) => track.name);
    retargetBodyTracks(sit, scene);
    expect(sit.tracks.map((track) => track.name)).toEqual(before);
  });

  it("a figura não mexe nos materiais nem na cabeça da cena em cache", () => {
    const rig = new FigureRig(scene, clips);
    rig.apply({ ...PULSE_BASE_SPEC, colors: { ...PULSE_BASE_SPEC.colors, shirt: "#00ff00" }, proportions: { heightM: 2, width: 1.2, head: 1.3 } });
    expect(rig.snapshot().materials.shirt.hex).toBe("#00ff00");
    expect(scene.getObjectByName("Head")!.scale.y).toBeCloseTo(0.52, 5);
    const original: string[] = [];
    scene.traverse((node) => {
      const material = (node as { material?: { name: string; color: { getHexString: () => string } } }).material;
      if (material?.name === "Shirt") original.push(material.color.getHexString());
    });
    expect(original).toEqual(["3b82f6"]);
    rig.dispose();
  });

  it("altura pedida vale para qualquer tamanho de cabeça e largura", () => {
    const rig = new FigureRig(scene, clips);
    for (const [heightM, width, head] of [[1.5, 0.85, 0.8], [1.76, 1, 1], [2, 1.2, 1.3]] as const) {
      rig.apply({ ...PULSE_BASE_SPEC, proportions: { heightM, width, head } });
      const { bounds } = rig.snapshot();
      expect(bounds.max[1] - bounds.min[1]).toBeCloseTo(heightM, 2);
      expect(bounds.min[1]).toBeCloseTo(0, 2);
    }
    rig.dispose();
  });
});
