import { Vector3, type Object3D } from "three";
import type * as HumanAssets from "@/avatar/human/humanAssets";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildHumanClips } from "@/avatar/human/humanClips";
import { newPreset, resolveHuman, withPart, type HumanPreset } from "@/avatar/human/preset";
import { CHAIR, DESK, SIT, SIT_TIMELINE } from "@/avatar/human/seatFit";
import { solveTwoBone } from "@/avatar/human/seatedPose";
import { HumanActor } from "@/world/office/HumanActor";
import { BENCH, OFFICE_ROOMS_BY_ID, OFFICE_SEATS } from "@/world/office/officeLayout";
import { placeHumans, type OfficeHuman } from "@/world/office/officeHumans";
import { DESK_TOP, SEAT_TOP } from "@/world/office/officeRooms";
import { parseGlb as parse } from "../helpers/gltf";
import { CHAIR_BOXES, deepestInside, inChair, posedVertices, seatFit, type Box } from "../helpers/seatGeometry";

const assets = vi.hoisted(() => ({ cache: new Map<string, Promise<{ file: string; scene: Object3D; users: number }>>() }));

vi.mock("@/avatar/human/humanAssets", async (original) => ({
  ...(await original<typeof HumanAssets>()),
  loadPart: async (file: string) => {
    if (!assets.cache.has(file)) {
      const { parseGlb } = await import("../helpers/gltf");
      assets.cache.set(file, parseGlb(`public/avatares/humano/pecas/${file}`).then((gltf) => ({ file, scene: gltf.scene, users: 0 })));
    }
    return assets.cache.get(file)!;
  },
  releasePart: () => {},
}));

const { HumanFigure } = await import("@/avatar/human/HumanFigure");

const STEP = 1 / 30;
const hall = OFFICE_ROOMS_BY_ID.hall!;
const hallSeats = OFFICE_SEATS.filter((seat) => seat.roomId === "hall");
const benchX = hall.center.x + BENCH.x;
const benchZ = hall.center.z + BENCH.z;
const deskBox: Box = {
  label: "tampo",
  minX: benchX - BENCH.width / 2,
  maxX: benchX + BENCH.width / 2,
  minY: DESK.underside,
  maxY: DESK.top,
  minZ: benchZ - BENCH.depth / 2,
  maxZ: benchZ + BENCH.depth / 2,
};

let base: ConstructorParameters<typeof HumanFigure>[0];

function seatedActor(preset: HumanPreset, human: OfficeHuman) {
  const figure = new HumanFigure(base);
  return figure.wear(resolveHuman(preset)).then(() => {
    const actor = new HumanActor(figure, human, { walkSpeed: base.clips.walkSpeed }, true);
    actor.command("seated");
    actor.holder.updateMatrixWorld(true);
    return { figure, actor };
  });
}

interface Frame {
  phase: string;
  chair: { x: number; z: number; yaw: number };
  yaw: number;
  x: number;
  z: number;
  joints: ReturnType<InstanceType<typeof HumanFigure>["joints"]>;
}

const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

beforeAll(async () => {
  const [armature, poses, robot] = await Promise.all([parse("public/avatares/humano/armature.glb"), parse("public/avatares/humano/poses.glb"), parse("public/avatares/robo/RobotExpressive.glb")]);
  base = {
    armature: armature.scene,
    clips: buildHumanClips({ armature: armature.scene, poses: poses.animations, robot: { scene: robot.scene, clips: robot.animations } }),
  };
}, 60000);

describe("cinemática inversa", () => {
  const root = new Vector3(0, 1, 0);
  const pole = new Vector3(0, 0, 1);

  it("as duas partes mantêm o comprimento e a ponta chega no alvo", () => {
    const target = new Vector3(0.1, 0.5, 0.2);
    const { mid, end } = solveTwoBone(root, target, 0.4, 0.3, pole);
    expect(mid.distanceTo(root)).toBeCloseTo(0.4);
    expect(mid.distanceTo(end)).toBeCloseTo(0.3);
    expect(end.distanceTo(target)).toBeCloseTo(0);
  });

  it("dobra para o lado pedido", () => {
    const { mid } = solveTwoBone(root, new Vector3(0, 0.5, 0), 0.4, 0.3, pole);
    expect(mid.z).toBeGreaterThan(0);
    expect(solveTwoBone(root, new Vector3(0, 0.5, 0), 0.4, 0.3, pole.clone().negate()).mid.z).toBeLessThan(0);
  });

  it("alvo longe demais estica o membro, sem esticar o osso", () => {
    const { mid, end } = solveTwoBone(root, new Vector3(0, -3, 0), 0.4, 0.3, pole);
    expect(mid.distanceTo(root)).toBeCloseTo(0.4);
    expect(mid.distanceTo(end)).toBeCloseTo(0.3);
    expect(end.y).toBeCloseTo(1 - 0.7 * 0.999);
  });
});

describe("as medidas da pose são as do móvel desenhado", () => {
  it("assento e tampo", () => {
    expect(CHAIR.seatTop).toBe(SEAT_TOP);
    expect(DESK.top).toBe(DESK_TOP);
  });

  it("a borda da mesa fica onde a cadeira puxada espera", () => {
    const chair = hallSeats.find((seat) => seat.yaw === 0)!;
    const edge = deskBox.minZ - chair.z - SIT.tuck;
    expect(edge).toBeCloseTo(SIT.deskEdge);
  });
});

describe("sentada, contra a malha de verdade", () => {
  const human = placeHumans([newPreset("a", "A", "")]).placed[0]!;

  it("quadril no assento, costas no encosto, mãos no tampo, pés no apoio", async () => {
    const { figure, actor } = await seatedActor(newPreset("a", "A", ""), human);
    const fit = seatFit(posedVertices(actor.holder, 2), actor.chair!);
    // Encostar é ficar a menos de 2 cm, e a roupa não afunda mais que 1,5 cm no móvel.
    expect(Math.abs(fit.seatGap)).toBeLessThan(0.015);
    expect(Math.abs(fit.backGap)).toBeLessThan(0.02);
    for (const gap of [fit.handGapLeft, fit.handGapRight, fit.footGapLeft, fit.footGapRight]) expect(Math.abs(gap)).toBeLessThan(0.015);
    expect(fit.deepestSeat).toBeLessThan(0.015);
    expect(fit.deepestBack).toBeLessThan(0.015);
    // Metade da mão, ao menos, está sobre o tampo; o resto do corpo cabe sob a mesa.
    expect(fit.handOverDeskLeft).toBeGreaterThan(0.12);
    expect(fit.handOverDeskRight).toBeGreaterThan(0.12);
    expect(fit.thighTopClear).toBeGreaterThan(0.01);
    expect(fit.bellyToEdge).toBeGreaterThan(0);
    figure.dispose();
  });

  it("os ossos ficam nos dois lados, e o corpo no meio da cadeira", async () => {
    const { figure, actor } = await seatedActor(newPreset("a", "A", ""), human);
    const joints = figure.joints();
    const chair = actor.chair!;
    const local = Object.fromEntries(Object.entries(joints).map(([name, point]) => [name, inChair(point, chair)]));
    expect(local.hips!.x).toBeCloseTo(0, 2);
    expect(local.leftHand!.x).toBeCloseTo(-local.rightHand!.x, 2);
    expect(local.leftHand!.y).toBeGreaterThan(DESK.top);
    expect(local.leftFoot!.x).toBeCloseTo(-local.rightFoot!.x, 2);
    expect(local.leftFoot!.y).toBeCloseTo(local.rightFoot!.y, 2);
    expect(local.leftFoot!.y).toBeLessThan(CHAIR.seatTop);
    figure.dispose();
  });

  it("nenhuma roupa de calça ou blusa muda o encaixe", async () => {
    for (const preset of [withPart(newPreset("a", "A", ""), "top", "Top.001"), withPart(newPreset("a", "A", ""), "top", "Top.002"), withPart(newPreset("a", "A", ""), "shoes", "Shoes.001")]) {
      const { figure, actor } = await seatedActor(preset, human);
      const fit = seatFit(posedVertices(actor.holder, 2), actor.chair!);
      expect(Math.abs(fit.seatGap)).toBeLessThan(0.02);
      expect(fit.deepestBack).toBeLessThan(0.02);
      expect(Math.abs(fit.handGapLeft)).toBeLessThan(0.02);
      figure.dispose();
    }
  });
});

describe("entrada e saída, nos seis lugares da bancada", () => {
  const placed = placeHumans(Array.from({ length: 6 }, (_, index) => newPreset(`p${index}`, `P${index}`, ""))).placed;

  it("os seis lugares são os da bancada, um para cada pessoa", () => {
    expect(new Set(placed.map((human) => human.chair!.id)).size).toBe(6);
    expect(hallSeats).toHaveLength(6);
  });

  it.each(placed.map((human) => [human.chair!.id, human] as const))(
    "%s: sem pulo, sem deslizar e sem atravessar móvel",
    async (_id, human) => {
      const figure = new HumanFigure(base);
      await figure.wear(resolveHuman(newPreset(human.id, human.name, "")));
      const actor = new HumanActor(figure, human, { walkSpeed: base.clips.walkSpeed }, false);
      const neighbors = hallSeats.filter((seat) => seat.id !== human.chair!.id);
      const frames: Frame[] = [];

      const collisions = { seat: 0, back: 0, desk: 0, neighbor: 0 };
      const worst = { seat: "", back: "", desk: "", neighbor: "" };
      const note = (key: keyof typeof collisions, depth: number) => {
        if (depth <= collisions[key]) return;
        collisions[key] = depth;
        worst[key] = `${actor.phase} no quadro ${frames.length}`;
      };
      const check = () => {
        const vertices = posedVertices(actor.holder, 5);
        const own = vertices.map((vertex) => inChair(vertex, actor.chair!));
        note("seat", deepestInside(own, CHAIR_BOXES[0]!));
        note("back", deepestInside(own, CHAIR_BOXES[1]!));
        note("desk", deepestInside(vertices, deskBox));
        for (const seat of neighbors) {
          const local = vertices.map((vertex) => inChair(vertex, { x: seat.x, z: seat.z, yaw: seat.yaw }));
          for (const box of CHAIR_BOXES) note("neighbor", deepestInside(local, box));
        }
      };

      actor.command("seated");

      // Grava e confere as colisões a cada 4 quadros, em todo o caminho de ida e volta.
      const advanceTo = (phase: string) => {
        for (let count = 0; count < 1800; count += 1) {
          actor.update(STEP);
          actor.holder.updateMatrixWorld(true);
          frames.push({ phase: actor.phase, chair: { ...actor.chair! }, yaw: actor.heading, x: actor.holder.position.x, z: actor.holder.position.z, joints: figure.joints() });
          // A mão cruza a borda da mesa perto do fim: ali, a conferência é quadro a quadro.
          if (count % 4 === 0 || actor.phase === "sitting" || actor.phase === "rising") check();
          if (actor.phase === phase) return;
        }
        throw new Error(`não chegou em ${phase}`);
      };

      advanceTo("seated");
      const seatedAt = frames.length;
      actor.command("standing");
      advanceTo("standing");
      const homing = frames.at(-1)!;

      // Termina onde começou, com a cadeira no lugar dela.
      expect(homing.chair.x).toBeCloseTo(human.chair!.x, 5);
      expect(homing.chair.z).toBeCloseTo(human.chair!.z, 5);
      expect(Math.cos(homing.chair.yaw - human.chair!.yaw)).toBeCloseTo(1, 5);
      expect(homing.x).toBeCloseTo(human.spot.x, 5);
      expect(homing.z).toBeCloseTo(human.spot.z, 5);

      // Sem pulo: nenhum osso anda mais que um passo largo entre dois quadros.
      for (let index = 1; index < frames.length; index += 1) {
        for (const bone of ["hips", "head", "leftHand", "rightHand", "leftFoot", "rightFoot"] as const) {
          const jump = distance(frames[index]!.joints[bone], frames[index - 1]!.joints[bone]);
          expect(jump, `${bone} em ${frames[index]!.phase}, quadro ${index}`).toBeLessThan(0.14);
        }
        expect(Math.hypot(frames[index]!.chair.x - frames[index - 1]!.chair.x, frames[index]!.chair.z - frames[index - 1]!.chair.z)).toBeLessThan(0.03);
        expect(Math.abs(frames[index]!.chair.yaw - frames[index - 1]!.chair.yaw)).toBeLessThan(0.2);
      }

      // Em cima da cadeira, a pessoa não desliza: bacia e pés ficam parados em relação a ela.
      const sitting = frames.slice(0, seatedAt).filter((frame) => frame.phase === "sitting");
      const onSeat = sitting.filter((_, index) => index * STEP > SIT_TIMELINE.climbEnd);
      const reference = inChair(onSeat[0]!.joints.hips, onSeat[0]!.chair);
      for (const frame of onSeat) {
        expect(distance(inChair(frame.joints.hips, frame.chair), reference)).toBeLessThan(1e-3);
        expect(distance(inChair(frame.joints.leftFoot, frame.chair), inChair(onSeat[0]!.joints.leftFoot, onSeat[0]!.chair))).toBeLessThan(1e-3);
      }

      // Enquanto sobe, a cadeira está parada: os dois movimentos não se somam.
      const climbing = sitting.filter((_, index) => index * STEP < SIT_TIMELINE.climbEnd);
      for (const frame of climbing) {
        expect(frame.chair.x).toBeCloseTo(climbing[0]!.chair.x, 5);
        expect(frame.chair.z).toBeCloseTo(climbing[0]!.chair.z, 5);
      }

      // Antes de tirar o pé do chão, o pé fica plantado (o começo é a transição do clipe).
      const planted = sitting.filter((_, index) => index * STEP > 0.26 && index * STEP < 0.3);
      for (const frame of planted) expect(frame.joints.leftFoot.y).toBeLessThan(0.08);

      // Levantar é a mesma coreografia ao contrário, com a mesma cadeira a cada instante.
      const rising = frames.slice(seatedAt).filter((frame) => frame.phase === "rising");
      const mirrored = rising.at(-Math.round(0.5 / STEP))!;
      const twin = sitting[Math.min(sitting.length - 1, Math.round(0.5 / STEP) - 1)]!;
      expect(distance({ x: mirrored.chair.x, y: 0, z: mirrored.chair.z }, { x: twin.chair.x, y: 0, z: twin.chair.z })).toBeLessThan(0.02);
      expect(mirrored.joints.hips.y).toBeCloseTo(twin.joints.hips.y, 1);

      // Atravessar: roupa no assento ou encosto até 2 cm (é mole), nada no tampo nem na vizinha.
      expect(collisions.seat, `assento: ${worst.seat}`).toBeLessThan(0.02);
      expect(collisions.back, `encosto: ${worst.back}`).toBeLessThan(0.02);
      expect(collisions.desk, `tampo: ${worst.desk}`).toBeLessThan(0.01);
      expect(collisions.neighbor, `cadeira vizinha: ${worst.neighbor}`).toBeLessThan(0.01);
      figure.dispose();
    },
    60000,
  );
});
