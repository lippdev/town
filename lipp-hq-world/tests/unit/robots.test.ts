import { Vector3, type AnimationClip, type Mesh, type MeshStandardMaterial, type Object3D } from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { AGENTS } from "@/agents/agents";
import { RobotRig, airborneClip, findRobotProblems, ROBOT_SCALE } from "@/avatar/robot/RobotRig";
import { ROBOT_EXPRESSIONS, ROBOT_STORAGE_KEY, loadRobotLooks, lookFor, saveRobotLooks, type StorageLike } from "@/avatar/robot/robotLook";
import { RobotActor } from "@/world/office/RobotActor";
import { FLOOR_BOUNDS, OFFICE_ROOMS, OFFICE_ROOMS_BY_ID, OFFICE_SEATS } from "@/world/office/officeLayout";
import {
  FLIGHT_CLEARANCE,
  FLIGHT_PERIOD,
  HOVER_Y,
  SELECTED_RETURN_SPEED,
  bobAt,
  buildFlightPlans,
  flightAllowed,
  flightDistanceAt,
  flightPointAt,
  inCorridorLane,
  nextFlightCap,
  solidsOf,
  type FlightPlan,
} from "@/world/office/officeFlights";
import { pathPose } from "@/world/office/officeHumans";
import { buildOffice } from "@/world/office/officeRooms";
import { assignSeats, demoBots } from "@/world/office/officeRoster";
import { parseGlb } from "../helpers/gltf";

function memory(initial: Record<string, string> = {}, failing = false): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      if (failing) throw new Error("cheio");
      data[key] = value;
    },
  };
}

describe("aparência dos robôs", () => {
  it("sem nada salvo, o corpo tem a cor do bot e a expressão é neutra", () => {
    expect(lookFor("#2563eb")).toEqual({ body: "#2563eb", expression: "neutral" });
  });

  it("salvar e ler devolve o mesmo", () => {
    const storage = memory();
    expect(saveRobotLooks(storage, { argos: { body: "#ff0000", expression: "Sad" } })).toBe(true);
    expect(loadRobotLooks(storage)).toEqual({ argos: { body: "#ff0000", expression: "Sad" } });
  });

  it("dado ruim volta ao padrão sem quebrar", () => {
    expect(loadRobotLooks(memory({ [ROBOT_STORAGE_KEY]: "{quebrado" }))).toEqual({});
    expect(loadRobotLooks(memory({ [ROBOT_STORAGE_KEY]: JSON.stringify({ schema: 99, looks: {} }) }))).toEqual({});
    const mixed = loadRobotLooks(memory({ [ROBOT_STORAGE_KEY]: JSON.stringify({ schema: 1, looks: { a: { body: "azul", expression: "Sad" }, b: "lixo" } }) }));
    expect(mixed).toEqual({ a: { expression: "Sad" } });
    expect(lookFor("#111111", { body: "azul" as never, expression: "Dança" as never })).toEqual({ body: "#111111", expression: "neutral" });
  });

  it("sem armazenamento, ou com ele cheio, não quebra", () => {
    expect(loadRobotLooks(null)).toEqual({});
    expect(saveRobotLooks(null, {})).toBe(false);
    expect(saveRobotLooks(memory({}, true), {})).toBe(false);
  });
});

describe("o robô do arquivo oficial", () => {
  let scene: Object3D;
  let clips: AnimationClip[];

  beforeAll(async () => {
    const gltf = await parseGlb("public/avatares/robo/RobotExpressive.glb");
    scene = gltf.scene;
    clips = gltf.animations;
  });

  const face = (rig: RobotRig) => {
    const found: Mesh[] = [];
    rig.root.traverse((node) => {
      if ((node as Mesh).morphTargetDictionary?.Sad !== undefined) found.push(node as Mesh);
    });
    return found;
  };
  const bodyMaterialOf = (root: Object3D) => {
    let found: MeshStandardMaterial | null = null;
    root.traverse((node) => {
      const material = (node as Mesh).material as MeshStandardMaterial | undefined;
      if (material?.name === "Main") found = material;
    });
    return found as unknown as MeshStandardMaterial;
  };

  it("tem o que a cena exige, e acusa o que faltar", () => {
    expect(findRobotProblems(scene, clips)).toEqual([]);
    expect(findRobotProblems(scene, clips.filter((clip) => clip.name !== "Wave"))).toEqual(["clipe Wave"]);
  });

  it("os clipes do voo não têm pernas, deslocamento nem expressão", () => {
    for (const clip of clips) {
      const names = airborneClip(clip).tracks.map((track) => track.name);
      for (const name of names) {
        expect(name, clip.name).not.toMatch(/^(Foot|PoleTarget|UpperLeg|LowerLeg|Body\.)|morphTargetInfluences/);
      }
    }
    expect(airborneClip(clips.find((clip) => clip.name === "Wave")!).tracks.length).toBeGreaterThan(0);
  });

  it("cor e expressão de um robô não passam para outro nem para o arquivo em cache", () => {
    const original = bodyMaterialOf(scene).color.getHexString();
    const one = new RobotRig(scene, clips);
    const two = new RobotRig(scene, clips);
    one.apply({ body: "#ff0000", expression: "Sad" });
    two.apply({ body: "#00ff00", expression: "Angry" });
    expect(bodyMaterialOf(one.root).color.getHexString()).toBe("ff0000");
    expect(bodyMaterialOf(two.root).color.getHexString()).toBe("00ff00");
    expect(bodyMaterialOf(scene).color.getHexString()).toBe(original);
    const sad = face(one)[0]!.morphTargetDictionary!.Sad!;
    const angry = face(one)[0]!.morphTargetDictionary!.Angry!;
    expect(face(one)[0]!.morphTargetInfluences![sad]).toBe(1);
    expect(face(two)[0]!.morphTargetInfluences![sad]).toBe(0);
    expect(face(two)[0]!.morphTargetInfluences![angry]).toBe(1);
    one.dispose();
    two.dispose();
  });

  it("o Idle não apaga a expressão escolhida", () => {
    const rig = new RobotRig(scene, clips);
    rig.apply({ body: "#123456", expression: "Surprised" });
    for (let index = 0; index < 30; index += 1) rig.update(1 / 30);
    const mesh = face(rig)[0]!;
    expect(mesh.morphTargetInfluences![mesh.morphTargetDictionary!.Surprised!]).toBe(1);
    rig.dispose();
  });

  it("as pernas continuam lá, soltas, com o pé ligado à canela", () => {
    const rig = new RobotRig(scene, clips);
    rig.root.updateMatrixWorld(true);
    const at = (name: string) => rig.root.getObjectByName(name)!.getWorldPosition(new Vector3());
    for (const side of ["L", "R"]) {
      expect(at(`Foot${side}`).distanceTo(at(`LowerLeg${side}_end`)), side).toBeLessThan(0.01);
      // Coxa à frente e canela para trás: o joelho fica mais adiante que quadril e pé.
      expect(at(`LowerLeg${side}`).z, side).toBeGreaterThan(at(`Foot${side}`).z);
    }
    rig.dispose();
  });

  it("o pé é o y zero do robô, e ele cabe voando sob a verga das portas", () => {
    const rig = new RobotRig(scene, clips);
    expect(rig.height).toBeGreaterThan(0.9);
    expect(ROBOT_SCALE).toBeGreaterThan(0);
    // Em toda a flutuação: acima do encosto da cadeira (1,03 m) e abaixo da verga (2,25 m).
    for (let t = 0; t < 60; t += 0.1) {
      const feet = HOVER_Y + bobAt(t, 1.7);
      expect(feet).toBeGreaterThan(1.03);
      expect(feet + rig.height).toBeLessThan(2.25);
    }
    rig.dispose();
  });

  it("gesto termina e volta ao Idle", () => {
    const rig = new RobotRig(scene, clips);
    rig.play("Wave");
    expect(rig.gesturing).toBe("Wave");
    for (let elapsed = 0; elapsed < 3; elapsed += 1 / 30) rig.update(1 / 30);
    expect(rig.gesturing).toBeNull();
    rig.dispose();
  });

  it("sem nenhum clipe, o erro diz o que faltou", () => {
    expect(findRobotProblems(scene, [])).toContain("clipe Idle");
  });
});

describe("rotas de voo contra a planta real", () => {
  const build = buildOffice();
  const bots = demoBots();
  const seating = assignSeats(bots.map((bot) => bot.id));
  const seats = Object.fromEntries(OFFICE_SEATS.map((seat) => [seat.id, seat]));
  const seated = bots.map((bot) => ({ botId: bot.id, seat: seats[seating.seats[bot.id]!]! }));
  const plans = buildFlightPlans(seated, build);
  const solids = solidsOf(build);

  it("todo bot da demonstração tem rota", () => {
    expect(plans.map((plan) => plan.botId).sort()).toEqual(AGENTS.map((agent) => agent.id).sort());
  });

  it("a mesma planta dá as mesmas rotas", () => {
    expect(buildFlightPlans(seated, build)).toEqual(plans);
  });

  const samples = (plan: FlightPlan, step = 0.03) => {
    const points: { x: number; z: number; d: number }[] = [];
    for (let d = 0; d <= plan.length; d += step) {
      const { x, z } = pathPose(plan.path, d);
      points.push({ x, z, d });
    }
    return points;
  };

  it("nunca atravessa móvel: a rota mantém distância de todos", () => {
    const margin = FLIGHT_CLEARANCE - 0.11;
    for (const plan of plans) {
      for (const { x, z, d } of samples(plan)) {
        const hit = solids.find((item) => x > item.minX - margin && x < item.maxX + margin && z > item.minZ - margin && z < item.maxZ + margin);
        expect(hit, `${plan.botId} a ${d.toFixed(2)} m`).toBeUndefined();
      }
    }
  });

  it("nunca atravessa parede nem sala alheia: só a própria sala, as portas dela e corredores", () => {
    for (const plan of plans) {
      const home = OFFICE_ROOMS_BY_ID[plan.home.roomId]!;
      for (const { x, z, d } of samples(plan)) {
        expect(flightAllowed(home, x, z, 0.05), `${plan.botId} a ${d.toFixed(2)} m (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(true);
        for (const room of OFFICE_ROOMS) {
          if (room.id === home.id) continue;
          const { minX, maxX, minZ, maxZ } = room.bounds;
          expect(x > minX && x < maxX && z > minZ && z < maxZ, `${plan.botId} entrou em ${room.id}`).toBe(false);
        }
      }
    }
  });

  it("nenhum robô passa pelo hall, onde as pessoas ficam", () => {
    const { bounds } = OFFICE_ROOMS_BY_ID.hall!;
    for (const plan of plans) {
      for (const { x, z } of samples(plan)) expect(x > bounds.minX && x < bounds.maxX && z > bounds.minZ && z < bounds.maxZ).toBe(false);
    }
  });

  it("sai do posto e chega ao corredor", () => {
    for (const plan of plans) {
      expect(plan.path[0]).toEqual({ x: plan.home.x, z: plan.home.z });
      const end = plan.path.at(-1)!;
      expect(inCorridorLane(end.x, end.z), plan.botId).toBe(true);
      expect(end.x).toBeGreaterThan(FLOOR_BOUNDS.minX);
    }
  });

  it("o voo é função do instante: a mesma hora dá o mesmo lugar", () => {
    for (const plan of plans) {
      for (const t of [0, 7.25, 33.1]) {
        const now = flightPointAt(plan, t);
        const later = flightPointAt(plan, t + FLIGHT_PERIOD);
        expect(now).toEqual(flightPointAt(plan, t));
        expect(now.x).toBeCloseTo(later.x, 6);
        expect(now.z).toBeCloseTo(later.z, 6);
        expect(bobAt(t, 1.5)).toBe(bobAt(t, 1.5));
      }
    }
  });

  it("volta e descansa no posto a cada período, sem salto", () => {
    for (const plan of plans) {
      let last = flightDistanceAt(plan, 0);
      let rested = false;
      for (let t = 0; t <= FLIGHT_PERIOD; t += 0.05) {
        const distance = flightDistanceAt(plan, t);
        // Quando o período recomeça, de 0 para 0: nunca há degrau.
        expect(Math.abs(distance - last), `${plan.botId} em ${t.toFixed(2)}`).toBeLessThan(0.2);
        if (distance === 0) rested = true;
        last = distance;
      }
      expect(rested, plan.botId).toBe(true);
    }
  });

  it("nunca há dois robôs no mesmo espaço", () => {
    let closest = Infinity;
    for (let t = 0; t < FLIGHT_PERIOD; t += 0.1) {
      for (let a = 0; a < plans.length; a += 1) {
        for (let b = a + 1; b < plans.length; b += 1) {
          const one = flightPointAt(plans[a]!, t);
          const two = flightPointAt(plans[b]!, t);
          closest = Math.min(closest, Math.hypot(one.x - two.x, one.z - two.z));
        }
      }
    }
    expect(closest).toBeGreaterThan(0.75);
  });

  it("alguém está sempre voando, mas nunca todos de uma vez", () => {
    let most = 0;
    let least = plans.length;
    for (let t = 0; t < FLIGHT_PERIOD; t += 0.5) {
      const flying = plans.filter((plan) => flightDistanceAt(plan, t) > 0.01).length;
      most = Math.max(most, flying);
      least = Math.min(least, flying);
    }
    expect(most).toBeLessThan(plans.length);
    expect(most).toBeGreaterThan(0);
    expect(least).toBeGreaterThanOrEqual(0);
  });
});

describe("selecionar um robô em voo", () => {
  it("volta pelo caminho, sem salto, e ao soltar espera o voo alcançar", () => {
    let cap = Infinity;
    let scheduled = 5;
    let shown = 5;
    for (let frame = 0; frame < 300; frame += 1) {
      cap = nextFlightCap(cap, scheduled, true, 1 / 60);
      const next = Math.min(scheduled, cap);
      expect(Math.abs(next - shown)).toBeLessThanOrEqual(SELECTED_RETURN_SPEED / 60 + 1e-6);
      shown = next;
    }
    expect(shown).toBe(0);
    // Soltou com o voo agendado longe: fica no posto, sem pular até lá.
    cap = nextFlightCap(cap, scheduled, false, 1 / 60);
    expect(Math.min(scheduled, cap)).toBe(0);
    // O agendado voltou a zero: a partir daí, segue o voo normal.
    scheduled = 0;
    cap = nextFlightCap(cap, scheduled, false, 1 / 60);
    expect(cap).toBe(Infinity);
  });
});

describe("ator do robô", () => {
  const build = buildOffice();
  const seat = OFFICE_SEATS.find((item) => item.roomId === "engenharia")!;
  const plan = buildFlightPlans([{ botId: "pulse", seat }], build)[0]!;

  it("com movimento reduzido, fica parado no posto, sem flutuar", () => {
    const actor = new RobotActor(realRig, seat, plan, "pulse", true);
    const start = actor.position;
    actor.update(10, 1 / 60, false);
    actor.update(20, 1 / 60, false);
    expect(actor.position).toEqual(start);
    expect(actor.flown).toBe(0);
  });

  it("sem plano (frota real), flutua no posto e não sai dele", () => {
    const actor = new RobotActor(realRig, seat, null, "pulse", false);
    actor.update(10, 1 / 60, false);
    actor.update(30, 1 / 60, false);
    expect(actor.position.x).toBe(seat.x);
    expect(actor.position.z).toBe(seat.z);
    expect(actor.position.y).toBeCloseTo(HOVER_Y, 0);
    expect(actor.flown).toBe(0);
  });

  it("com plano, a mesma hora dá o mesmo lugar", () => {
    const place = () => {
      const actor = new RobotActor(realRig, seat, plan, "pulse", false);
      actor.update(plan.start + 3, 1 / 60, false);
      return actor.position;
    };
    expect(place()).toEqual(place());
    expect(place().x).not.toBe(seat.x);
  });

  let realRig: RobotRig;
  beforeAll(async () => {
    const gltf = await parseGlb("public/avatares/robo/RobotExpressive.glb");
    realRig = new RobotRig(gltf.scene, gltf.animations);
  });
});

it("as expressões oferecidas existem no arquivo", async () => {
  const gltf = await parseGlb("public/avatares/robo/RobotExpressive.glb");
  let dictionary: Record<string, number> | undefined;
  gltf.scene.traverse((node) => {
    dictionary ??= (node as Mesh).morphTargetDictionary;
  });
  for (const expression of ROBOT_EXPRESSIONS) {
    if (expression !== "neutral") expect(dictionary?.[expression], expression).toBeDefined();
  }
});
