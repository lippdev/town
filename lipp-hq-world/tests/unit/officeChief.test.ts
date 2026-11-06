import { describe, expect, it } from "vitest";
import { newPreset, parsePreset } from "@/avatar/human/preset";
import { buildDirectorate } from "@/world/office/buildingInteriors";
import { ARRIVAL, CHIEF_ID, CHIEF_PRESET, carTravel, placeChief, placeEveryone } from "@/world/office/officeChief";
import { AXIS, CHIEF_DOOR, CHIEF_ROOM, CHIEF_SEAT, DIRECTORATE_SCENERY, directoratePatrol } from "@/world/office/officeDirectorate";
import { pathLength, pathPose, placeHumans, standPoint } from "@/world/office/officeHumans";
import { FLOOR_BOUNDS, OFFICE_SEATS } from "@/world/office/officeLayout";

describe("chefe da equipe", () => {
  const other = newPreset("ana", "Ana", "2026-01-01T00:00:00.000Z");

  it("usa só peças e cores que existem no catálogo", () => {
    const { preset, problems } = parsePreset(CHIEF_PRESET);
    expect(problems).toEqual([]);
    expect(preset?.parts).toEqual(CHIEF_PRESET.parts);
    expect(preset?.colors).toEqual(CHIEF_PRESET.colors);
  });

  it("aparece mesmo sem ninguém salvo, na Diretoria, com a cadeira dele", () => {
    const { placed } = placeEveryone([]);
    expect(placed.map((human) => human.id)).toEqual([CHIEF_ID]);
    expect(placed[0]).toMatchObject({ floor: "diretoria", roomId: "sala-chefe", chair: CHIEF_SEAT });
  });

  it("nunca aparece duas vezes, nem com um preset salvo com o id dele", () => {
    const { placed } = placeEveryone([other, { ...other, id: CHIEF_ID }]);
    expect(placed.map((human) => human.id)).toEqual([CHIEF_ID, "ana"]);
  });

  it("não ocupa lugar nem cadeira no hall, e os salvos seguem lá", () => {
    const { placed } = placeEveryone([other]);
    const ana = placed.find((human) => human.id === "ana")!;
    expect(ana).toMatchObject({ floor: "operacao", roomId: "hall" });
    expect(ana.chair?.roomId).toBe("hall");
    expect(ana).toEqual(placeHumans([other]).placed[0]);
    expect(OFFICE_SEATS.map((seat) => seat.id)).not.toContain(CHIEF_SEAT.id);
  });
});

describe("roteiro do chefe na Diretoria", () => {
  const chief = placeChief();
  const { footprints } = buildDirectorate();
  const blocked = (point: { x: number; z: number }, margin: number) =>
    footprints.find((item) => point.x > item.minX - margin && point.x < item.maxX + margin && point.z > item.minZ - margin && point.z < item.maxZ + margin);
  const walk = (path: readonly { x: number; z: number }[]) => {
    for (let distance = 0; distance <= pathLength(path); distance += 0.05) {
      const point = pathPose(path, distance);
      const hit = blocked(point, 0.12);
      expect(hit, `${point.x.toFixed(2)}, ${point.z.toFixed(2)}: ${hit?.label}`).toBeUndefined();
    }
  };

  it("o carro anda sempre para a frente e para na entrada", () => {
    let last = -Infinity;
    for (let t = 0; t < 12; t += 0.05) {
      const { x } = carTravel(t);
      expect(x).toBeGreaterThanOrEqual(last);
      last = x;
    }
    expect(carTravel(30)).toEqual({ x: ARRIVAL.stopX, done: true });
  });

  it("da beira da mesa até a cadeira não atravessa móvel", () => {
    const path = chief.route!;
    expect(path[0]).toEqual(chief.spot);
    expect(path.at(-1)).toEqual(standPoint(CHIEF_SEAT));
    // A última parte encosta na cadeira dele, que é o destino.
    const clear = footprints.filter((item) => !(item.label === "cadeira" && Math.abs(item.minX + 0.31 - CHIEF_SEAT.x) < 0.01));
    for (let distance = 0; distance <= pathLength(path); distance += 0.05) {
      const point = pathPose(path, distance);
      const hit = clear.find((item) => point.x > item.minX - 0.1 && point.x < item.maxX + 0.1 && point.z > item.minZ - 0.1 && point.z < item.maxZ + 0.1);
      expect(hit, `${point.x.toFixed(2)}, ${point.z.toFixed(2)}: ${hit?.label}`).toBeUndefined();
    }
  });

  it("anda pela Diretoria e volta ao lugar, com trechos ligados e sem atravessar móvel", () => {
    const legs = directoratePatrol(chief.spot);
    legs.forEach((leg, index) => {
      if (index > 0) expect(leg[0]).toEqual(legs[index - 1]!.at(-1));
      walk(leg);
    });
    expect(legs.at(-1)!.at(-1)).toEqual(chief.spot);
  });

  it("só cruza a parede da sala pela porta", () => {
    for (const leg of directoratePatrol(chief.spot)) {
      for (let distance = 0; distance <= pathLength(leg); distance += 0.05) {
        const { x, z } = pathPose(leg, distance);
        if (Math.abs(x - CHIEF_DOOR.x) < 0.1) expect(Math.abs(z - CHIEF_DOOR.z)).toBeLessThan(CHIEF_DOOR.width / 2);
      }
    }
  });
});

describe("Diretoria", () => {
  const { footprints, props } = buildDirectorate();
  const blocked = (x: number, z: number) => footprints.find((item) => x > item.minX - 0.12 && x < item.maxX + 0.12 && z > item.minZ - 0.12 && z < item.maxZ + 0.12);

  it("os dois diretores são cenário: etiqueta explícita, sem função, com peças do catálogo", () => {
    expect(DIRECTORATE_SCENERY).toHaveLength(2);
    for (const person of DIRECTORATE_SCENERY) {
      expect(person.tag).toMatch(/simulad[ao]/);
      const { preset, problems } = parsePreset(person.preset);
      expect(problems, person.id).toEqual([]);
      expect(preset?.parts).toEqual(person.preset.parts);
    }
  });

  it("nenhum diretor é pessoa da lista nem pega cadeira dos bots", () => {
    const ids = placeEveryone([]).placed.map((human) => human.id);
    for (const person of DIRECTORATE_SCENERY) {
      expect(ids).not.toContain(person.id);
      if (person.chair) expect(OFFICE_SEATS.map((seat) => seat.id)).not.toContain(person.chair.id);
    }
  });

  it("quem fica em pé tem lugar livre", () => {
    for (const person of DIRECTORATE_SCENERY) {
      if (!person.chair) expect(blocked(person.spot.x, person.spot.z)?.label, person.id).toBeUndefined();
    }
  });

  it("o eixo principal tem pelo menos 1,7 m livres de ponta a ponta", () => {
    expect(AXIS.maxZ - AXIS.minZ).toBeGreaterThanOrEqual(1.7);
    for (let x = CHIEF_ROOM.minX + 0.2; x < CHIEF_ROOM.minX + 22; x += 0.25) {
      const hit = footprints.find((item) => x > item.minX && x < item.maxX && item.maxZ > AXIS.minZ && item.minZ < AXIS.maxZ);
      expect(hit?.label, `x=${x}`).toBeUndefined();
    }
  });

  it("a sala do chefe fica no canto do fundo, com mesa, reunião e lounge", () => {
    expect(CHIEF_ROOM.minX).toBe(FLOOR_BOUNDS.minX);
    expect(CHIEF_ROOM.minZ).toBe(FLOOR_BOUNDS.minZ);
    const inside = footprints.filter((item) => item.minX >= CHIEF_ROOM.minX && item.maxX <= CHIEF_ROOM.maxX && item.minZ >= CHIEF_ROOM.minZ && item.maxZ <= CHIEF_ROOM.maxZ).map((item) => item.label);
    for (const label of ["mesa", "mesa redonda", "sofá", "poltrona", "estante"]) expect(inside).toContain(label);
  });

  it("móveis e plantas ficam dentro do prédio", () => {
    for (const item of props) {
      expect(Math.abs(item.at[0])).toBeLessThan(FLOOR_BOUNDS.maxX);
      expect(Math.abs(item.at[2])).toBeLessThan(FLOOR_BOUNDS.maxZ);
    }
  });
});
