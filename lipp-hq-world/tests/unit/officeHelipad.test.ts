import { describe, expect, it } from "vitest";
import type { BufferGeometry } from "three";
import { buildFacade } from "@/world/office/buildingFacade";
import { TOWER_TOP, sectionAt } from "@/world/office/floorTravel";
import { ROTOR_RADIUS, buildDeckFigure, buildHelicopter } from "@/world/office/helicopter";
import { BUILDING_HEIGHT, CROWN_HEIGHT, CROWN_ROOF, CROWN_STEPS, FACADE_BOUNDS, HELIPAD } from "@/world/office/officeBuilding";
import { chiefIsAway, chiefMenu } from "@/world/office/officeChief";
import { DECK_WALK, INBOUND_SECONDS, OUTBOUND_SECONDS, PARKED_POSE, WALK_SECONDS, advanceFlight, arrivalVia, awayFlight, flightFrame, inboundPose, outboundPose, startArrival, startDeparture, type Flight, type FlightStep } from "@/world/office/officeHelipad";

const stepsOf = (start: Flight) => {
  const seen: FlightStep[] = [start.step];
  let flight = start;
  for (let time = 0; time < 120 && flight.step !== "settled" && flight.step !== "away"; time += 0.05) {
    flight = advanceFlight(flight, 0.05);
    if (seen.at(-1) !== flight.step) seen.push(flight.step);
  }
  return seen;
};

describe("sorteio da chegada", () => {
  it("cai no helicóptero em cerca de uma a cada três aberturas", () => {
    expect(arrivalVia("", () => 0)).toBe("helicoptero");
    expect(arrivalVia("", () => 0.32)).toBe("helicoptero");
    expect(arrivalVia("", () => 0.34)).toBe("carro");
    expect(arrivalVia("", () => 0.99)).toBe("carro");
  });

  it("a URL fixa, para conferir e para o QA, sem sortear", () => {
    const never = () => {
      throw new Error("não devia sortear");
    };
    expect(arrivalVia("?chegada=helicoptero", never)).toBe("helicoptero");
    expect(arrivalVia("?chegada=carro", never)).toBe("carro");
  });

  it("parâmetro inválido cai no sorteio", () => {
    expect(arrivalVia("?chegada=foguete", () => 0)).toBe("helicoptero");
    expect(arrivalVia("?chegada=foguete", () => 0.9)).toBe("carro");
    expect(arrivalVia("?chegada=", () => 0.9)).toBe("carro");
  });
});

describe("roteiro do voo", () => {
  it("chegar: pousa, o rotor desacelera, ele desce do helicóptero e só então vai à mesa", () => {
    expect(stepsOf(startArrival())).toEqual(["inbound", "spinDown", "disembark", "descending", "settled"]);
  });

  it("sair com o helicóptero no deque: ele sobe, embarca, o rotor acelera e decola", () => {
    expect(stepsOf(startDeparture(true))).toEqual(["leaving", "boarding", "spinUp", "outbound", "away"]);
  });

  it("sair tendo chegado de carro: o helicóptero vem buscá-lo antes", () => {
    expect(stepsOf(startDeparture(false))).toEqual(["pickup", "leaving", "boarding", "spinUp", "outbound", "away"]);
  });

  it("um quadro muito longo atravessa os passos sem parar no meio do ar", () => {
    expect(advanceFlight(startArrival(), 1000).step).toBe("settled");
    expect(advanceFlight(startDeparture(false), 1000).step).toBe("away");
  });

  it("fora do prédio fica fora, até alguém pedir a volta", () => {
    const away = advanceFlight(awayFlight(), 1000);
    expect(away.step).toBe("away");
    expect(flightFrame(away)).toMatchObject({ status: "fora", helicopter: null, figure: null, rotor: 0 });
  });

  it("o rotor gira no ar e para antes de o chefe andar sob ele", () => {
    const at = (flight: Flight) => flightFrame(flight).rotor;
    expect(at(startArrival())).toBe(1);
    expect(at({ step: "spinDown", time: 0, running: false })).toBe(1);
    expect(at({ step: "spinDown", time: 2.99, running: false })).toBeLessThan(0.01);
    expect(at({ step: "disembark", time: 0, running: false })).toBe(0);
    expect(at({ step: "boarding", time: 0, running: false })).toBe(0);
    expect(at({ step: "spinUp", time: 0, running: false })).toBe(0);
    expect(at({ step: "outbound", time: 0, running: false })).toBe(1);
  });

  it("vindo só buscar, o rotor não desliga enquanto ele embarca", () => {
    const start = startDeparture(false);
    expect(flightFrame(start).rotor).toBe(1);
    expect(flightFrame({ ...start, step: "boarding", time: 1 }).rotor).toBe(1);
    expect(flightFrame({ ...start, step: "spinUp", time: 0 }).rotor).toBe(1);
  });

  it("o chefe só aparece no deque no caminho entre o helicóptero e a porta", () => {
    const steps: FlightStep[] = ["inbound", "spinDown", "disembark", "descending", "pickup", "leaving", "boarding", "spinUp", "outbound", "away"];
    const shown = steps.filter((step) => flightFrame({ step, time: 0, running: false }).figure !== null);
    expect(shown).toEqual(["disembark", "boarding"]);
    const first = flightFrame({ step: "disembark", time: 0, running: false }).figure!;
    const last = flightFrame({ step: "disembark", time: WALK_SECONDS, running: false }).figure!;
    expect(first).toMatchObject({ x: DECK_WALK[0]!.x, z: DECK_WALK[0]!.z });
    expect(last.x).toBeCloseTo(DECK_WALK.at(-1)!.x, 3);
    expect(last.z).toBeCloseTo(DECK_WALK.at(-1)!.z, 3);
  });

  it("os status dizem o que está acontecendo", () => {
    const status = (step: FlightStep) => flightFrame({ step, time: 0, running: false }).status;
    expect(status("inbound")).toBe("chegandoHeli");
    expect(status("descending")).toBe("descendo");
    expect(status("pickup")).toBe("aguardando");
    expect(status("boarding")).toBe("embarcando");
    expect(status("outbound")).toBe("decolando");
    expect(status("away")).toBe("fora");
  });
});

describe("trajetória do voo", () => {
  const SAMPLES = 400;
  const along = (duration: number, pose: (seconds: number) => typeof PARKED_POSE) => Array.from({ length: SAMPLES + 1 }, (_, index) => pose((index / SAMPLES) * duration));

  it("pousa exatamente no deque, e sai dele exatamente de lá", () => {
    const landed = inboundPose(INBOUND_SECONDS);
    expect(landed.x).toBeCloseTo(PARKED_POSE.x, 6);
    expect(landed.y).toBeCloseTo(PARKED_POSE.y, 6);
    expect(landed.z).toBeCloseTo(PARKED_POSE.z, 6);
    expect(landed.yaw).toBeCloseTo(0, 6);
    expect(outboundPose(0)).toMatchObject({ x: PARKED_POSE.x, y: PARKED_POSE.y, z: PARKED_POSE.z, yaw: 0 });
  });

  it("não dá saltos: fica abaixo de um teto de velocidade, em metros por segundo", () => {
    for (const [duration, pose] of [[INBOUND_SECONDS, inboundPose], [OUTBOUND_SECONDS, outboundPose]] as const) {
      const path = along(duration, pose);
      const seconds = duration / SAMPLES;
      for (let index = 1; index < path.length; index += 1) {
        const a = path[index - 1]!;
        const b = path[index]!;
        expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / seconds).toBeLessThan(110);
      }
    }
  });

  it("nunca desce abaixo do deque: não atravessa a torre nem a cidade", () => {
    for (const [duration, pose] of [[INBOUND_SECONDS, inboundPose], [OUTBOUND_SECONDS, outboundPose]] as const) {
      for (const point of along(duration, pose)) expect(point.y).toBeGreaterThanOrEqual(HELIPAD.top - 1e-6);
    }
  });

  it("começa e termina fora do quadro, mesmo em tela larga com o menor zoom: não aparece do nada", () => {
    // Na tela larga de 1920 x 600 o zoom mínimo mostra cerca de 170 m de cada lado do prédio.
    const sideways = (pose: typeof PARKED_POSE) => Math.abs(pose.x - HELIPAD.x - (pose.z - HELIPAD.z)) * Math.SQRT1_2;
    expect(sideways(inboundPose(0))).toBeGreaterThan(190);
    expect(sideways(outboundPose(OUTBOUND_SECONDS))).toBeGreaterThan(190);
  });
});

describe("gaveta do chefe", () => {
  it("na mesa, tudo menos voltar", () => {
    expect(chiefMenu("mesa")).toEqual({ meeting: true, patrol: true, replay: true, leave: true, comeBack: false });
  });

  it("em reunião, ele pode levantar e sair, mas não entrar em outra reunião", () => {
    expect(chiefMenu("reuniao")).toMatchObject({ meeting: false, patrol: true, leave: true });
  });

  it("fora do prédio, só voltar: nada de reunião nem ronda sem corpo", () => {
    expect(chiefMenu("fora")).toEqual({ meeting: false, patrol: false, replay: false, leave: false, comeBack: true });
    expect(chiefIsAway("fora")).toBe(true);
  });

  it("chegando, dá para refazer a chegada, mas não para sair ou entrar em reunião", () => {
    for (const status of ["chegando", "chegandoHeli", "entrando", "descendo"] as const) {
      expect(chiefMenu(status)).toEqual({ meeting: false, patrol: false, replay: true, leave: false, comeBack: false });
      expect(chiefIsAway(status)).toBe(true);
    }
  });

  it("saindo, a saída pode ser desfeita com uma volta", () => {
    for (const status of ["saindo", "aguardando", "embarcando", "decolando"] as const) {
      expect(chiefMenu(status)).toEqual({ meeting: false, patrol: false, replay: false, leave: false, comeBack: true });
      expect(chiefIsAway(status)).toBe(true);
    }
  });

  it("no prédio ele tem corpo; em cada botão, ninguém fica sem saída", () => {
    for (const status of ["mesa", "reuniao", "levantando", "ronda", "voltando"] as const) expect(chiefIsAway(status)).toBe(false);
    for (const status of ["mesa", "reuniao", "levantando", "ronda", "voltando", "chegando", "chegandoHeli", "entrando", "descendo", "saindo", "aguardando", "embarcando", "decolando", "fora"] as const) {
      const menu = chiefMenu(status);
      expect(menu.replay || menu.leave || menu.comeBack, status).toBe(true);
    }
  });
});

describe("o deque no prédio", () => {
  const { body, lit, bodyEnds, litEnds } = buildFacade();
  const crownRange = (geometry: BufferGeometry, from: number) => {
    const position = geometry.getAttribute("position");
    const out = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (let index = from; index < position.count; index += 1) {
      out.minX = Math.min(out.minX, position.getX(index));
      out.maxX = Math.max(out.maxX, position.getX(index));
      out.minY = Math.min(out.minY, position.getY(index));
      out.maxY = Math.max(out.maxY, position.getY(index));
      out.minZ = Math.min(out.minZ, position.getZ(index));
      out.maxZ = Math.max(out.maxZ, position.getZ(index));
    }
    return out;
  };

  it("fica toda depois do último pavimento: abrir o corte tira o deque, e nada vaza para a Diretoria", () => {
    expect(crownRange(body, bodyEnds.at(-1)!).minY).toBeGreaterThanOrEqual(BUILDING_HEIGHT - 0.05);
    expect(crownRange(lit, litEnds.at(-1)!).minY).toBeGreaterThanOrEqual(BUILDING_HEIGHT - 0.05);
  });

  it("cabe no degrau de baixo: o balanço não sai da silhueta em degraus", () => {
    const lower = CROWN_STEPS.at(-2)!;
    const halfDepth = (FACADE_BOUNDS.maxZ - FACADE_BOUNDS.minZ) / 2 - lower.inset;
    const halfWidth = (FACADE_BOUNDS.maxX - FACADE_BOUNDS.minX) / 2 - lower.inset;
    expect(HELIPAD.half).toBeLessThan(halfWidth);
    expect(HELIPAD.half - 0.3).toBeLessThan(halfDepth);
    expect(HELIPAD.bottom).toBeGreaterThan(CROWN_ROOF);
  });

  it("o rotor gira livre: não alcança o mastro nem a casinha da escada", () => {
    const { mast, kiosk } = HELIPAD;
    expect(Math.hypot(mast.x, mast.z) - 0.5).toBeGreaterThan(ROTOR_RADIUS);
    expect(Math.hypot(Math.abs(kiosk.x) - kiosk.size / 2, Math.abs(kiosk.z) - kiosk.size / 2)).toBeGreaterThan(ROTOR_RADIUS);
    expect(ROTOR_RADIUS).toBeLessThan(HELIPAD.half);
  });

  it("o mastro segue sendo o ponto mais alto: o enquadramento não mudou", () => {
    const helicopterTop = HELIPAD.top + 2.9;
    expect(helicopterTop).toBeLessThan(BUILDING_HEIGHT + CROWN_HEIGHT);
  });

  it("no corte, a laje tampa o deque na altura dele, e acima dele não há o que tampar", () => {
    const section = sectionAt(HELIPAD.top - 0.1)!;
    expect(section.maxX - section.minX).toBeCloseTo(HELIPAD.half * 2);
    expect(section.maxZ - section.minZ).toBeCloseTo(HELIPAD.half * 2);
    expect(sectionAt(HELIPAD.top + 0.5)).toBeNull();
    expect(sectionAt(TOWER_TOP)).toBeNull();
  });
});

describe("o helicóptero", () => {
  it("são poucas malhas, de poucos vértices, e sem textura", () => {
    const build = buildHelicopter();
    const parts = Object.values(build);
    expect(parts).toHaveLength(6);
    const vertices = parts.reduce((sum, part) => sum + part.getAttribute("position").count, 0);
    expect(vertices).toBeLessThan(6000);
    for (const part of parts) expect(part.getAttribute("uv") ?? null, "sem UV, não há textura").toSatisfy((uv) => uv === null || part === build.blur);
  });

  it("o boneco do deque tem a altura das pessoas da cena", () => {
    const { body } = buildDeckFigure();
    body.computeBoundingBox();
    expect(body.boundingBox!.max.y).toBeGreaterThan(1.2);
    expect(body.boundingBox!.max.y).toBeLessThan(1.5);
  });
});
