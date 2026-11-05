import { BufferAttribute } from "three";
import { describe, expect, it } from "vitest";
import { AGENTS } from "@/agents/agents";
import { PULSE_BASE_SPEC } from "@/character-studio/model/presets";
import { parseSpec } from "@/character-studio/model/schema";
import type { BotSnapshot, FleetSnapshot } from "@/integrations/hq/types";
import { ROOMS } from "@/world/rooms/rooms";
import {
  CORRIDOR,
  FLOOR_BOUNDS,
  OFFICE_ROOMS,
  OFFICE_ROOMS_BY_ID,
  OFFICE_SEATS,
  SEAT_CAPACITY,
  corridorBounds,
  roomAt,
  type OfficeBounds,
  type OfficeDoor,
  type OfficeRoom,
} from "@/world/office/officeLayout";
import { buildOffice, wallRuns } from "@/world/office/officeRooms";
import { assignSeats, botsInRoom, demoBots, fleetBots, specForBot } from "@/world/office/officeRoster";
import { OFFICE_DEMO_URL, OFFICE_LIVE_URL, officeConnection, parseOfficeRoute } from "@/world/office/officeRoute";
import {
  fitView,
  panView,
  pickBoxAt,
  screenToGround,
  worldToScreen,
  zoomViewAt,
} from "@/world/office/officeCamera";
import { thinIslands } from "@/world/office/thinIslands";

const overlaps = (a: OfficeBounds, b: OfficeBounds) => a.minX < b.maxX - 1e-6 && a.maxX > b.minX + 1e-6 && a.minZ < b.maxZ - 1e-6 && a.maxZ > b.minZ + 1e-6;

/** Faixa de chão logo depois do vão da porta, que precisa ficar livre. */
function doorApproach(room: OfficeRoom, door: OfficeDoor, depth = 0.8): OfficeBounds {
  const half = door.width / 2 - 0.15;
  const { minX, maxX, minZ, maxZ } = room.bounds;
  const { x, z } = room.center;
  switch (door.side) {
    case "north":
      return { minX: x + door.offset - half, maxX: x + door.offset + half, minZ, maxZ: minZ + depth };
    case "south":
      return { minX: x + door.offset - half, maxX: x + door.offset + half, minZ: maxZ - depth, maxZ };
    case "west":
      return { minX, maxX: minX + depth, minZ: z + door.offset - half, maxZ: z + door.offset + half };
    case "east":
      return { minX: maxX - depth, maxX, minZ: z + door.offset - half, maxZ: z + door.offset + half };
  }
}

describe("planta do escritório", () => {
  it("usa as mesmas nove salas da planta antiga, na mesma posição relativa", () => {
    expect(OFFICE_ROOMS.map((room) => room.id).sort()).toEqual(ROOMS.map((room) => room.id).sort());
    for (const room of ROOMS) {
      const compact = OFFICE_ROOMS_BY_ID[room.id]!;
      expect([compact.name, compact.color, compact.kind, compact.agentId]).toEqual([room.name, room.color, room.kind, room.agentId]);
      for (const other of ROOMS) {
        const b = OFFICE_ROOMS_BY_ID[other.id]!;
        expect(Math.sign(b.center.x - compact.center.x)).toBe(Math.sign(other.bounds.minX - room.bounds.minX));
        expect(Math.sign(b.center.z - compact.center.z)).toBe(Math.sign(other.bounds.minZ - room.bounds.minZ));
      }
    }
  });

  it("salas e corredores cobrem o andar sem se sobrepor", () => {
    const pieces = [...OFFICE_ROOMS.map((room) => room.bounds), ...corridorBounds()];
    pieces.forEach((piece, index) => {
      for (const other of pieces.slice(index + 1)) expect(overlaps(piece, other)).toBe(false);
    });
    const area = pieces.reduce((sum, { minX, maxX, minZ, maxZ }) => sum + (maxX - minX) * (maxZ - minZ), 0);
    const floor = (FLOOR_BOUNDS.maxX - FLOOR_BOUNDS.minX) * (FLOOR_BOUNDS.maxZ - FLOOR_BOUNDS.minZ);
    expect(area).toBeCloseTo(floor, 3);
  });

  it("toda porta cabe na parede e abre para um corredor", () => {
    for (const room of OFFICE_ROOMS) {
      expect(room.doors.length).toBeGreaterThan(0);
      for (const door of room.doors) {
        const horizontal = door.side === "north" || door.side === "south";
        const half = (horizontal ? room.bounds.maxX - room.bounds.minX : room.bounds.maxZ - room.bounds.minZ) / 2;
        expect(Math.abs(door.offset) + door.width / 2).toBeLessThanOrEqual(half);
        const step = CORRIDOR / 2;
        const out = {
          north: [room.center.x + door.offset, room.bounds.minZ - step],
          south: [room.center.x + door.offset, room.bounds.maxZ + step],
          west: [room.bounds.minX - step, room.center.z + door.offset],
          east: [room.bounds.maxX + step, room.center.z + door.offset],
        }[door.side] as [number, number];
        expect(roomAt(out[0], out[1])).toBeNull();
        expect(out[0] >= FLOOR_BOUNDS.minX && out[0] <= FLOOR_BOUNDS.maxX && out[1] >= FLOOR_BOUNDS.minZ && out[1] <= FLOOR_BOUNDS.maxZ, `${room.id} ${door.side}`).toBe(true);
      }
    }
  });

  it("wallRuns deixa o vão da porta aberto", () => {
    expect(wallRuns(3, [{ at: 1, width: 1 }])).toEqual([[-3, 0.5], [1.5, 3]]);
    expect(wallRuns(3, [])).toEqual([[-3, 3]]);
  });
});

describe("mobília compartilhada", () => {
  const office = buildOffice();

  it("o andar inteiro cabe em poucas malhas por material", () => {
    expect(office.fixed.size).toBeLessThanOrEqual(16);
    for (const room of OFFICE_ROOMS) expect(office.raised[room.id]).toBeDefined();
    expect(office.triangles.fixed).toBeLessThan(120000);
  });

  it("limita as plantas pesadas", () => {
    expect(office.props.filter((item) => item.kind === "planta").length).toBeLessThanOrEqual(12);
    expect(office.props.filter((item) => item.kind === "luminaria").length).toBeLessThanOrEqual(4);
  });

  it("móveis ficam dentro da sala e nenhum bloqueia uma porta", () => {
    for (const room of OFFICE_ROOMS) {
      const items = office.footprints[room.id]!;
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.minX, `${room.id}: ${item.label}`).toBeGreaterThanOrEqual(room.bounds.minX - 0.45);
        expect(item.maxX, `${room.id}: ${item.label}`).toBeLessThanOrEqual(room.bounds.maxX + 0.05);
        expect(item.minZ, `${room.id}: ${item.label}`).toBeGreaterThanOrEqual(room.bounds.minZ - 0.45);
        expect(item.maxZ, `${room.id}: ${item.label}`).toBeLessThanOrEqual(room.bounds.maxZ + 0.05);
        for (const door of room.doors) {
          expect(overlaps(item, doorApproach(room, door)), `${room.id}: ${item.label} na porta ${door.side}`).toBe(false);
        }
      }
    }
  });
});

describe("redução da planta", () => {
  it("mantém a maior ilha inteira e tira uma fração das pequenas, sem quebrar triângulo", () => {
    // Uma ilha grande de 4 triângulos e 10 ilhas de 1 triângulo, sem vértice em comum.
    const positions: number[] = [];
    const indices: number[] = [];
    const quad = () => {
      const base = positions.length / 3;
      positions.push(0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0.5, 0.5, 1);
      indices.push(base, base + 1, base + 4, base + 1, base + 2, base + 4, base + 2, base + 3, base + 4, base + 3, base, base + 4);
    };
    quad();
    for (let i = 0; i < 10; i += 1) {
      const base = positions.length / 3;
      positions.push(10, 0, i, 11, 0, i, 10, 1, i);
      indices.push(base, base + 1, base + 2);
    }
    const kept = thinIslands(new BufferAttribute(new Uint32Array(indices), 1), new BufferAttribute(new Float32Array(positions), 3), 0.3);
    expect(kept.length % 3).toBe(0);
    expect([...kept.slice(0, 12)]).toEqual(indices.slice(0, 12));
    const small = (kept.length - 12) / 3;
    expect(small).toBeGreaterThanOrEqual(2);
    expect(small).toBeLessThanOrEqual(4);
  });
});

describe("postos", () => {
  it("cada departamento tem o posto do próprio bot", () => {
    for (const agent of AGENTS) {
      const seat = OFFICE_SEATS.find((candidate) => candidate.roomId === agent.roomId && candidate.kind === "posto");
      expect(seat, agent.id).toBeDefined();
    }
  });

  it("nenhum posto fica fora da sala nem em cima de outro", () => {
    for (const seat of OFFICE_SEATS) {
      expect(roomAt(seat.x, seat.z)?.id, seat.id).toBe(seat.roomId);
      for (const other of OFFICE_SEATS) {
        if (other !== seat) expect(Math.hypot(other.x - seat.x, other.z - seat.z), `${seat.id}/${other.id}`).toBeGreaterThan(0.7);
      }
    }
  });

  it("os sete conhecidos vão para os seus departamentos, em qualquer ordem", () => {
    const ids = AGENTS.map((agent) => agent.id);
    const forward = assignSeats(ids);
    const backward = assignSeats([...ids].reverse());
    expect(forward).toEqual(backward);
    expect(forward.unseated).toEqual([]);
    for (const agent of AGENTS) expect(botsInRoom(forward, agent.roomId)).toEqual([agent.id]);
  });

  it("frota maior que o andar não some nem empilha corpos", () => {
    const ids = Array.from({ length: SEAT_CAPACITY + 6 }, (_, index) => `bot-${String(index).padStart(2, "0")}`);
    const { seats, unseated } = assignSeats(ids);
    expect(Object.keys(seats).length).toBe(SEAT_CAPACITY);
    expect(unseated.length).toBe(6);
    expect(new Set(Object.values(seats)).size).toBe(SEAT_CAPACITY);
    expect([...Object.keys(seats), ...unseated].sort()).toEqual(ids);
  });

  it("bot novo fica onde sentou quando a frota muda, e o conhecido retoma o posto dele", () => {
    const first = assignSeats(["zeta", "yara"]);
    const second = assignSeats(["alpha", "yara", "zeta"], undefined, first.seats);
    expect(second.seats.zeta).toBe(first.seats.zeta);
    expect(second.seats.yara).toBe(first.seats.yara);
    const pulseHome = "engenharia-0";
    const taken = Object.entries(first.seats).find(([, seat]) => seat === pulseHome)?.[0];
    expect(taken).toBeDefined();
    const third = assignSeats(["pulse", "yara", "zeta"], undefined, first.seats);
    expect(third.seats.pulse).toBe(pulseHome);
    expect(third.seats[taken!]).not.toBe(pulseHome);
    expect(new Set(Object.values(third.seats)).size).toBe(3);
  });

  it("ignora id repetido", () => {
    expect(Object.keys(assignSeats(["pulse", "pulse"]).seats)).toEqual(["pulse"]);
  });
});

describe("quem está em cena", () => {
  const bot = (id: string, patch: Partial<BotSnapshot> = {}): BotSnapshot => ({ id, name: id.toUpperCase(), state: "working", sessionCount: 0, activeSessions: 0, routineCount: 0, ...patch });
  const fleet = (bots: BotSnapshot[]): FleetSnapshot => ({ source: "hermes", health: { api: "online", dashboard: "online" }, bots, fetchedAt: 1 });

  it("a demonstração são os sete, sem estado nem origem real", () => {
    const bots = demoBots();
    expect(bots.map((item) => item.id).sort()).toEqual(AGENTS.map((agent) => agent.id).sort());
    for (const item of bots) {
      expect(item.live).toBe(false);
      expect(item.state).toBeUndefined();
    }
  });

  it("a frota real mantém ids, nomes e estados, e nunca completa com os de referência", () => {
    const bots = fleetBots(fleet([bot("pulse", { name: "Pulso Real", state: "blocked" }), bot("novo", { state: "idle", title: "Bot novo" })]));
    expect(bots.map((item) => item.id).sort()).toEqual(["novo", "pulse"]);
    expect(bots.find((item) => item.id === "pulse")).toMatchObject({ name: "Pulso Real", state: "blocked", live: true });
    expect(bots.find((item) => item.id === "novo")).toMatchObject({ role: "Bot novo", state: "idle" });
    expect(fleetBots(null)).toEqual([]);
    expect(fleetBots(fleet([]))).toEqual([]);
  });

  it("aparências ficam dentro do que o estúdio aceita; o Pulse é o modelo aprovado", () => {
    expect(specForBot("pulse", "#000000")).toEqual(PULSE_BASE_SPEC);
    const specs = [...AGENTS.map((agent) => specForBot(agent.id, agent.color)), specForBot("qualquer", "#123456"), specForBot("outro-bot-longo", "#654321")];
    for (const spec of specs) expect(parseSpec(spec).errors).toEqual([]);
    expect(specForBot("qualquer", "#123456")).toEqual(specForBot("qualquer", "#123456"));
    expect(specForBot("qualquer", "#123456").colors.shirt).toBe("#123456");
    // Ids em sequência não podem virar uma turma de gêmeos.
    const sequence = Array.from({ length: 12 }, (_, index) => specForBot(`extra-${index}`, "#123456"));
    expect(new Set(sequence.map((spec) => spec.colors.hair)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(sequence.map((spec) => spec.colors.skin)).size).toBeGreaterThanOrEqual(3);
    for (const spec of sequence) expect(parseSpec(spec).errors).toEqual([]);
  });
});

describe("rota e conexão", () => {
  it("só entra no escritório pela query exata", () => {
    expect(parseOfficeRoute("")).toBeNull();
    expect(parseOfficeRoute("?escritorio=outro")).toBeNull();
    expect(parseOfficeRoute("?prototipo=engenharia")).toBeNull();
    expect(parseOfficeRoute(OFFICE_LIVE_URL.slice(1))).toBe("live");
    expect(parseOfficeRoute(OFFICE_DEMO_URL.slice(1))).toBe("demo");
    expect(parseOfficeRoute("?escritorio=completo&modo=outro")).toBe("live");
  });

  it("sem resposta, para de dizer conectando; nunca oferece dado falso como vivo", () => {
    const base = { source: "hermes" as const, bots: [], fetchedAt: 1 };
    expect(officeConnection(null, false).kind).toBe("connecting");
    expect(officeConnection(null, true).kind).toBe("offline");
    expect(officeConnection({ ...base, health: { api: "offline", dashboard: "offline" } }, false).kind).toBe("offline");
    expect(officeConnection({ ...base, health: { api: "online", dashboard: "online" } }, false).kind).toBe("empty");
    const one = [{ id: "a", name: "A", state: "idle" as const, sessionCount: 0, activeSessions: 0, routineCount: 0 }];
    expect(officeConnection({ ...base, bots: one, health: { api: "online", dashboard: "online" } }, false)).toEqual({ kind: "live", bots: 1 });
    expect(officeConnection({ ...base, bots: one, stale: true, health: { api: "offline", dashboard: "offline" } }, false).kind).toBe("stale");
  });
});

describe("câmera", () => {
  const viewport = { width: 1400, height: 800 };
  const insets = { left: 240, right: 400, top: 52, bottom: 56 };

  it("enquadra a sala inteira só na área livre", () => {
    for (const room of OFFICE_ROOMS) {
      const view = fitView(room.bounds, viewport, insets);
      for (const x of [room.bounds.minX, room.bounds.maxX]) {
        for (const z of [room.bounds.minZ, room.bounds.maxZ]) {
          for (const y of [0, 3]) {
            const point = worldToScreen([x, y, z], view, viewport);
            expect(point.x).toBeGreaterThanOrEqual(insets.left - 0.5);
            expect(point.x).toBeLessThanOrEqual(viewport.width - insets.right + 0.5);
            expect(point.y).toBeGreaterThanOrEqual(insets.top - 0.5);
            expect(point.y).toBeLessThanOrEqual(viewport.height - insets.bottom + 0.5);
          }
        }
      }
    }
  });

  it("a gaveta aberta desloca o foco sem mudar a escala além do que a largura pede", () => {
    const room = OFFICE_ROOMS_BY_ID.engenharia!;
    const free = fitView(room.bounds, viewport);
    const covered = fitView(room.bounds, viewport, { left: 0, right: 500, top: 0, bottom: 0 });
    const center: [number, number, number] = [room.center.x, 1, room.center.z];
    expect(worldToScreen(center, covered, viewport).x).toBeLessThan(worldToScreen(center, free, viewport).x);
  });

  it("tela e chão fazem ida e volta", () => {
    const view = { x: 2, z: -1, zoom: 70 };
    const point = worldToScreen([3.2, 0, -4.1], view, viewport);
    const ground = screenToGround(point.x, point.y, view, viewport);
    expect(ground.x).toBeCloseTo(3.2, 6);
    expect(ground.z).toBeCloseTo(-4.1, 6);
  });

  it("arrastar leva o chão junto e o zoom segura o ponto sob o ponteiro", () => {
    const view = { x: 0, z: 0, zoom: 50 };
    const before = worldToScreen([4, 0, 2], view, viewport);
    const after = worldToScreen([4, 0, 2], panView(view, 30, -20), viewport);
    expect(after.x - before.x).toBeCloseTo(30, 6);
    expect(after.y - before.y).toBeCloseTo(-20, 6);
    const zoomed = zoomViewAt(view, 120, 500, 300, viewport);
    const under = screenToGround(500, 300, view, viewport);
    const still = worldToScreen([under.x, 0, under.z], zoomed, viewport);
    expect(still.x).toBeCloseTo(500, 5);
    expect(still.y).toBeCloseTo(300, 5);
  });

  it("o clique acerta a caixa mais próxima da câmera", () => {
    const view = { x: 0, z: 0, zoom: 60 };
    const front = { id: "frente", minX: 0.5, maxX: 1.3, minY: 0, maxY: 2, minZ: 0.5, maxZ: 1.3 };
    const back = { id: "fundo", minX: -0.9, maxX: -0.1, minY: 0, maxY: 2, minZ: -0.9, maxZ: -0.1 };
    const aim = worldToScreen([0.9, 0.3, 0.9], view, viewport);
    expect(pickBoxAt(aim.x, aim.y, view, viewport, [back, front])).toBe("frente");
    const away = worldToScreen([-4, 0, 4], view, viewport);
    expect(pickBoxAt(away.x, away.y, view, viewport, [back, front])).toBeNull();
  });
});
