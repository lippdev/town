import { Vector3, type MeshStandardMaterial, type Object3D, type SkinnedMesh } from "three";
import type * as HumanAssets from "@/avatar/human/humanAssets";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildHumanClips } from "@/avatar/human/humanClips";
import { newPreset, resolveHuman, withColor, withPart, type HumanPreset } from "@/avatar/human/preset";
import { parseGlb as parse } from "../helpers/gltf";

const assets = vi.hoisted(() => ({
  cache: new Map<string, Promise<{ file: string; scene: Object3D; users: number }>>(),
  released: [] as string[],
  fail: new Set<string>(),
  gate: null as Promise<void> | null,
}));

// Os arquivos vêm do disco, não de um servidor; o resto é o módulo real.
vi.mock("@/avatar/human/humanAssets", async (original) => ({
  ...(await original<typeof HumanAssets>()),
  loadPart: async (file: string) => {
    if (assets.fail.has(file)) throw new Error("404");
    if (assets.gate && file === "Hair.005.glb") await assets.gate;
    if (!assets.cache.has(file)) {
      const { parseGlb } = await import("../helpers/gltf");
      assets.cache.set(file, parseGlb(`public/avatares/humano/pecas/${file}`).then((gltf) => ({ file, scene: gltf.scene, users: 0 })));
    }
    return assets.cache.get(file)!;
  },
  releasePart: (asset: { file: string; users: number }) => {
    asset.users -= 1;
    assets.released.push(asset.file);
  },
}));

const { HumanFigure } = await import("@/avatar/human/HumanFigure");
type Figure = InstanceType<typeof HumanFigure>;

const preset = (): HumanPreset => newPreset("p", "Ana", "");

function meshes(figure: Figure) {
  const list: SkinnedMesh[] = [];
  figure.root.traverse((node) => {
    if ((node as SkinnedMesh).isSkinnedMesh) list.push(node as SkinnedMesh);
  });
  return list;
}

describe("figura humana", () => {
  let base: ConstructorParameters<typeof HumanFigure>[0];

  beforeAll(async () => {
    const [armature, poses, robot] = await Promise.all([parse("public/avatares/humano/armature.glb"), parse("public/avatares/humano/poses.glb"), parse("public/avatares/robo/RobotExpressive.glb")]);
    base = {
      armature: armature.scene,
      clips: buildHumanClips({ armature: armature.scene, poses: poses.animations, robot: { scene: robot.scene, clips: robot.animations } }),
    };
  }, 60000);

  it("veste exatamente o que o preset pede, tudo no mesmo esqueleto", async () => {
    const figure = new HumanFigure(base);
    await figure.wear(resolveHuman(preset()));
    expect(figure.snapshot().parts).toMatchObject({ head: "Head.001", top: "Top.001", shoes: "Shoes.003" });
    const skeletons = new Set(meshes(figure).map((mesh) => mesh.skeleton));
    expect(skeletons.size).toBe(1);
    figure.dispose();
  });

  it("cor de uma pessoa não vaza para outra nem para o arquivo em cache", async () => {
    const one = new HumanFigure(base);
    const two = new HumanFigure(base);
    await one.wear(resolveHuman(withColor(preset(), "top", "#ff0000")));
    await two.wear(resolveHuman(withColor(preset(), "top", "#00ff00")));
    expect(one.snapshot().colors.top).toBe("#ff0000");
    expect(two.snapshot().colors.top).toBe("#00ff00");
    const asset = await assets.cache.get("Top.001.glb")!;
    const originals: string[] = [];
    asset.scene.traverse((node) => {
      const mesh = node as SkinnedMesh;
      if (mesh.isMesh && (mesh.material as MeshStandardMaterial).name.includes("Color_")) originals.push(`#${(mesh.material as MeshStandardMaterial).color.getHexString()}`);
    });
    expect(originals).not.toContain("#ff0000");
    expect(originals).not.toContain("#00ff00");
    one.dispose();
    two.dispose();
  });

  it("a pele de duas pessoas é independente", async () => {
    const one = new HumanFigure(base);
    const two = new HumanFigure(base);
    await one.wear(resolveHuman(withColor(preset(), "head", "#111111")));
    await two.wear(resolveHuman(withColor(preset(), "head", "#eeeeee")));
    expect(one.snapshot().skin).toBe("#111111");
    expect(two.snapshot().skin).toBe("#eeeeee");
    one.dispose();
    two.dispose();
  });

  it("os morphs da cabeça são desta figura: expressão não muda a outra", async () => {
    const one = new HumanFigure(base);
    const two = new HumanFigure(base);
    await one.wear(resolveHuman({ ...preset(), expression: "smile" }));
    await two.wear(resolveHuman({ ...preset(), expression: "sad" }));
    const headOf = (figure: Figure) => meshes(figure).find((mesh) => mesh.morphTargetDictionary?.smile !== undefined)!;
    const smile = headOf(one).morphTargetDictionary!.smile!;
    const sad = headOf(one).morphTargetDictionary!.sad!;
    expect(headOf(one).morphTargetInfluences![smile]).toBe(1);
    expect(headOf(two).morphTargetInfluences![smile]).toBe(0);
    expect(headOf(two).morphTargetInfluences![sad]).toBe(1);
    one.dispose();
    two.dispose();
  });

  it("trocar de peça tira a anterior e devolve a dela ao cache", async () => {
    const figure = new HumanFigure(base);
    await figure.wear(resolveHuman(preset()));
    const before = meshes(figure).length;
    assets.released.length = 0;
    await figure.wear(resolveHuman(withPart(preset(), "hair", "Hair.003")));
    expect(assets.released).toEqual(["Hair.002.glb"]);
    expect(figure.snapshot().parts.hair).toBe("Hair.003");
    expect(meshes(figure).length).toBe(before);
    figure.dispose();
  });

  it("vestir a fantasia remove a roupa de baixo: nunca roupa sobre roupa", async () => {
    const figure = new HumanFigure(base);
    await figure.wear(resolveHuman(preset()));
    await figure.wear(resolveHuman(withPart(preset(), "outfit", "Outfit.001")));
    const parts = figure.snapshot().parts;
    expect(parts.outfit).toBe("Outfit.001");
    expect(parts.top).toBeUndefined();
    expect(parts.bottom).toBeUndefined();
    figure.dispose();
  });

  it("peça que não baixou fica de fora sem derrubar o resto", async () => {
    const figure = new HumanFigure(base);
    assets.fail.add("Hair.004.glb");
    await figure.wear(resolveHuman(withPart(preset(), "hair", "Hair.004")));
    assets.fail.clear();
    const snapshot = figure.snapshot();
    expect(snapshot.missing).toEqual(["Hair.004"]);
    expect(snapshot.parts.hair).toBeUndefined();
    expect(snapshot.parts.head).toBe("Head.001");
    figure.dispose();
  });

  it("uma troca lenta que chega depois de outra mais nova é ignorada", async () => {
    const figure = new HumanFigure(base);
    let open = () => {};
    assets.gate = new Promise((resolve) => {
      open = resolve;
    });
    const slow = figure.wear(resolveHuman(withPart(preset(), "hair", "Hair.005")));
    await figure.wear(resolveHuman(withPart(preset(), "hair", "Hair.003")));
    open();
    await slow;
    assets.gate = null;
    expect(figure.snapshot().parts.hair).toBe("Hair.003");
    figure.dispose();
  });

  it("descartar a figura solta as peças e não aceita mais roupa", async () => {
    const figure = new HumanFigure(base);
    const worn = figure.wear(resolveHuman(preset()));
    await worn;
    assets.released.length = 0;
    figure.dispose();
    expect(assets.released.length).toBe(resolveHuman(preset()).parts.length);
    await figure.wear(resolveHuman(preset()));
    expect(figure.snapshot().parts).toEqual({});
  });

  it("a matriz de ligação coloca a peça no lugar: a figura em pé tem 2 m e pisa no chão", async () => {
    const figure = new HumanFigure(base);
    await figure.wear(resolveHuman(preset()));
    figure.root.updateMatrixWorld(true);
    const mesh = meshes(figure).find((candidate) => candidate.name.startsWith("Shoes"))!;
    mesh.skeleton.update();
    const point = new Vector3();
    let lowest = Infinity;
    for (let index = 0; index < mesh.geometry.attributes.position!.count; index += 1) {
      mesh.getVertexPosition(index, point);
      mesh.localToWorld(point);
      lowest = Math.min(lowest, point.y);
    }
    expect(Math.abs(lowest)).toBeLessThan(0.05);
    figure.dispose();
  });
});
