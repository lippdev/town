import { Group } from "three";
import { describe, expect, it } from "vitest";
import { newPreset } from "@/avatar/human/preset";
import { buildHumanClips } from "@/avatar/human/humanClips";
import { HumanActor, type ActorFigure } from "@/world/office/HumanActor";
import { FACING, OFFICE_ROOMS_BY_ID, OFFICE_SEATS } from "@/world/office/officeLayout";
import { buildOffice } from "@/world/office/officeRooms";
import { HUMAN_CAPACITY, HUMAN_SEAT_LIFT, chairRoute, pathLength, pathPose, placeHumans, seatedRoot, turnToward } from "@/world/office/officeHumans";
import { demoBots } from "@/world/office/officeRoster";
import { parseGlb } from "../helpers/gltf";

const people = (count: number) => Array.from({ length: count }, (_, index) => newPreset(`p${index}`, `Pessoa ${index}`, ""));
const hallSeats = OFFICE_SEATS.filter((seat) => seat.roomId === "hall").map((seat) => seat.id);

describe("pessoas no hall", () => {
  it("cada uma ganha um lugar e uma cadeira próprios", () => {
    const { placed } = placeHumans(people(HUMAN_CAPACITY));
    expect(new Set(placed.map((human) => `${human.spot.x},${human.spot.z}`)).size).toBe(HUMAN_CAPACITY);
    expect(new Set(placed.map((human) => human.chair?.id)).size).toBe(HUMAN_CAPACITY);
  });

  it("os lugares se separam na diagonal da câmera: uma cabeça não cobre a outra", () => {
    const { placed } = placeHumans(people(HUMAN_CAPACITY));
    const front = placed.slice(0, 5).map((human) => human.spot.x - human.spot.z).sort((a, b) => a - b);
    for (let index = 1; index < front.length; index += 1) expect(front[index]! - front[index - 1]!).toBeGreaterThan(0.6);
  });

  it("recarregar dá os mesmos lugares", () => {
    expect(placeHumans(people(4))).toEqual(placeHumans(people(4)));
  });

  it("primeiro as cadeiras de frente para a câmera", () => {
    const { placed } = placeHumans(people(4));
    expect(placed.slice(0, 3).every((human) => human.chair!.yaw === FACING.south)).toBe(true);
    expect(placed[3]!.chair!.yaw).toBe(FACING.north);
  });

  it("além da capacidade, fica na espera e não some", () => {
    const { placed, waiting } = placeHumans(people(HUMAN_CAPACITY + 2));
    expect(placed.length).toBe(HUMAN_CAPACITY);
    expect(waiting.map((preset) => preset.id)).toEqual([`p${HUMAN_CAPACITY}`, `p${HUMAN_CAPACITY + 1}`]);
  });

  it("não senta em cadeira de bot e, sem cadeira livre, fica em pé", () => {
    const { placed } = placeHumans(people(2), hallSeats.slice(0, 5));
    expect(hallSeats.slice(0, 5)).not.toContain(placed[0]!.chair!.id);
    expect(placed[1]!.chair).toBeNull();
  });

  it("pessoa nunca entra na lista de bots", () => {
    const ids = new Set(demoBots().map((bot) => bot.id));
    for (const human of placeHumans(people(HUMAN_CAPACITY)).placed) expect(ids.has(human.id)).toBe(false);
  });
});

describe("caminhos das pessoas contra a mobília real", () => {
  const { footprints } = buildOffice();
  const hall = OFFICE_ROOMS_BY_ID.hall!;
  const solid = footprints.hall!;
  const CLEARANCE = 0.1;

  const blocker = (x: number, z: number) => solid.find((item) => x > item.minX - CLEARANCE && x < item.maxX + CLEARANCE && z > item.minZ - CLEARANCE && z < item.maxZ + CLEARANCE);

  it("nenhum lugar de pé está dentro de um móvel", () => {
    for (const human of placeHumans(people(HUMAN_CAPACITY)).placed) {
      expect(blocker(human.spot.x, human.spot.z)?.label, `${human.id}`).toBeUndefined();
    }
  });

  it("todo caminho até o lado da cadeira fica dentro do hall e fora dos móveis", () => {
    const { placed } = placeHumans(people(HUMAN_CAPACITY));
    for (const human of placed) {
      const route = chairRoute(human.spot, human.chair!);
      const total = pathLength(route);
      expect(total).toBeGreaterThan(0.3);
      for (let walked = 0; walked <= total; walked += 0.05) {
        const { x, z } = pathPose(route, walked);
        expect(x, `${human.id} em ${walked}`).toBeGreaterThan(hall.bounds.minX);
        expect(x).toBeLessThan(hall.bounds.maxX);
        expect(z).toBeGreaterThan(hall.bounds.minZ);
        expect(z).toBeLessThan(hall.bounds.maxZ);
        expect(blocker(x, z)?.label, `${human.id} em ${walked.toFixed(2)} m de ${human.chair!.id}`).toBeUndefined();
      }
    }
  });

  it("o caminho termina ao lado da cadeira", () => {
    for (const seat of OFFICE_SEATS.filter((item) => item.roomId === "hall")) {
      const end = chairRoute({ x: hall.center.x, z: hall.center.z + 1 }, seat).at(-1)!;
      expect(end.z).toBeCloseTo(seat.z);
      expect(Math.abs(end.x - seat.x)).toBeCloseTo(0.5);
    }
  });
});

describe("percorrer um caminho", () => {
  const path = [{ x: 0, z: 0 }, { x: 0, z: 2 }, { x: 3, z: 2 }];

  it("soma os trechos", () => {
    expect(pathLength(path)).toBeCloseTo(5);
  });

  it("segue o trecho certo, com o rumo certo", () => {
    expect(pathPose(path, 1)).toMatchObject({ x: 0, z: 1 });
    expect(pathPose(path, 1).yaw).toBeCloseTo(0);
    expect(pathPose(path, 3)).toMatchObject({ x: 1, z: 2 });
    expect(pathPose(path, 3).yaw).toBeCloseTo(Math.PI / 2);
  });

  it("fica nas pontas fora da faixa", () => {
    expect(pathPose(path, -1)).toMatchObject({ x: 0, z: 0 });
    expect(pathPose(path, 99)).toMatchObject({ x: 3, z: 2 });
  });

  it("vira pelo lado mais curto, sem passar do alvo", () => {
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1);
    expect(turnToward(0, 0.05, 1)).toBeCloseTo(0.05);
  });
});

/** Figura de mentira: o ator só precisa do que ela diz. */
function fakeFigure() {
  const played: string[] = [];
  const figure: ActorFigure & { played: string[] } = {
    played,
    root: new Group(),
    play: (motion) => played.push(motion),
    update: () => {},
    settled: true,
  };
  return figure;
}

const CLIPS = { walkSpeed: 1, sitDuration: 1, seatedHipsZ: -0.2 };

function run(actor: HumanActor, seconds: number, step = 1 / 30) {
  const seen = new Set<string>();
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    actor.update(step);
    seen.add(actor.phase);
  }
  return seen;
}

describe("ator de uma pessoa", () => {
  const human = placeHumans(people(1)).placed[0]!;
  const chair = human.chair!;

  it("parada, não anda sozinha", () => {
    const figure = fakeFigure();
    const actor = new HumanActor(figure, human, CLIPS, false);
    const start = { ...actor.position };
    run(actor, 30);
    expect(actor.position).toEqual(start);
    expect(actor.phase).toBe("standing");
    expect(figure.played).toEqual([]);
  });

  it("sentar passa por andar e sentar, nessa ordem, e termina na cadeira", () => {
    const figure = fakeFigure();
    const actor = new HumanActor(figure, human, CLIPS, false);
    actor.command("seated");
    const seen = run(actor, 30);
    expect([...seen]).toEqual(["toChair", "sitting", "seated"]);
    expect(figure.played).toEqual(["walk", "sit"]);
    const target = seatedRoot(chair, CLIPS.seatedHipsZ);
    expect(actor.position.x).toBeCloseTo(target.x);
    expect(actor.position.z).toBeCloseTo(target.z);
    expect(actor.position.y).toBeCloseTo(HUMAN_SEAT_LIFT);
    expect(Math.atan2(Math.sin(actor.heading - chair.yaw), Math.cos(actor.heading - chair.yaw))).toBeCloseTo(0);
  });

  it("o quadril assenta no centro da cadeira", () => {
    const south = seatedRoot({ ...chair, yaw: FACING.south }, -0.2, 1);
    expect(south.z).toBeCloseTo(chair.z + 0.2);
    const north = seatedRoot({ ...chair, yaw: FACING.north }, -0.2, 1);
    expect(north.z).toBeCloseTo(chair.z - 0.2);
  });

  it("levantar refaz o caminho e volta exatamente ao lugar", () => {
    const figure = fakeFigure();
    const actor = new HumanActor(figure, human, CLIPS, false);
    actor.command("seated");
    run(actor, 30);
    actor.command("standing");
    const seen = run(actor, 30);
    expect([...seen]).toEqual(["rising", "toSpot", "standing"]);
    expect(figure.played).toEqual(["walk", "sit", "stand", "walk", "idle"]);
    expect(actor.position.x).toBeCloseTo(human.spot.x);
    expect(actor.position.z).toBeCloseTo(human.spot.z);
    expect(actor.position.y).toBe(0);
  });

  it("levantar no meio do caminho termina de sentar antes de voltar", () => {
    const figure = fakeFigure();
    const actor = new HumanActor(figure, human, CLIPS, false);
    actor.command("seated");
    run(actor, 0.5);
    actor.command("standing");
    run(actor, 60);
    expect(actor.phase).toBe("standing");
    expect(figure.played).toEqual(["walk", "sit", "stand", "walk", "idle"]);
  });

  it("o mesmo comando dá sempre o mesmo movimento, sem sorteio nem relógio", () => {
    const sample = () => {
      const actor = new HumanActor(fakeFigure(), human, CLIPS, false);
      actor.command("seated");
      run(actor, 2.5);
      return actor.position;
    };
    expect(sample()).toEqual(sample());
  });

  it("um quadro muito longo não faz a pessoa pular a cadeira", () => {
    const actor = new HumanActor(fakeFigure(), human, CLIPS, false);
    actor.command("seated");
    actor.update(10);
    expect(actor.phase).toBe("toChair");
  });

  it("movimento reduzido vai direto ao fim, sem andar", () => {
    const figure = fakeFigure();
    const actor = new HumanActor(figure, human, CLIPS, true);
    actor.command("seated");
    expect(actor.phase).toBe("seated");
    expect(figure.played).toEqual(["sit"]);
    expect(actor.position.y).toBeCloseTo(HUMAN_SEAT_LIFT);
    actor.command("standing");
    expect(actor.phase).toBe("standing");
    expect(actor.position.x).toBeCloseTo(human.spot.x);
  });

  it("sem cadeira, o comando de sentar não faz nada", () => {
    const figure = fakeFigure();
    const actor = new HumanActor(figure, { spot: human.spot, chair: null }, CLIPS, false);
    actor.command("seated");
    run(actor, 5);
    expect(actor.phase).toBe("standing");
    expect(figure.played).toEqual([]);
  });
});

describe("velocidade de andar", () => {
  it("sai do clipe e é a de uma pessoa andando", async () => {
    const [armature, poses, robot, pulse] = await Promise.all([parseGlb("public/avatares/humano/armature.glb"), parseGlb("public/avatares/humano/poses.glb"), parseGlb("public/avatares/robo/RobotExpressive.glb"), parseGlb("public/prototipo/pulse.glb")]);
    const clips = buildHumanClips({ armature: armature.scene, poses: poses.animations, robot: { scene: robot.scene, clips: robot.animations }, pulse: { scene: pulse.scene, clips: pulse.animations } });
    expect(clips.walkSpeed).toBeGreaterThan(0.3);
    expect(clips.walkSpeed).toBeLessThan(2);
    expect(clips.seatedHipsZ).toBeLessThan(0);
  });
});
