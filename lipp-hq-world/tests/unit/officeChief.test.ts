import { describe, expect, it } from "vitest";
import { newPreset, parsePreset } from "@/avatar/human/preset";
import { ARRIVAL, CHIEF_ID, CHIEF_PRESET, arrivalPath, carTravel, patrolLegs, withChief } from "@/world/office/officeChief";
import { pathLength, pathPose, placeHumans } from "@/world/office/officeHumans";
import { buildOffice } from "@/world/office/officeRooms";

describe("chefe da equipe", () => {
  it("usa só peças e cores que existem no catálogo", () => {
    const { preset, problems } = parsePreset(CHIEF_PRESET);
    expect(problems).toEqual([]);
    expect(preset?.parts).toEqual(CHIEF_PRESET.parts);
    expect(preset?.colors).toEqual(CHIEF_PRESET.colors);
  });

  it("aparece mesmo sem ninguém salvo, com lugar e cadeira", () => {
    const { placed } = placeHumans(withChief([]));
    expect(placed.map((human) => human.id)).toEqual([CHIEF_ID]);
    expect(placed[0]!.chair).not.toBeNull();
  });

  it("vem antes dos salvos e nunca aparece duas vezes", () => {
    const other = newPreset("ana", "Ana", "2026-01-01T00:00:00.000Z");
    const list = withChief([other, { ...other, id: CHIEF_ID }]);
    expect(list.map((preset) => preset.id)).toEqual([CHIEF_ID, "ana"]);
  });
});

describe("roteiro do chefe", () => {
  const spot = placeHumans(withChief([])).placed[0]!.spot;
  const solids = Object.values(buildOffice().footprints).flat();
  const blocked = (point: { x: number; z: number }, margin: number) =>
    solids.find((item) => point.x > item.minX - margin && point.x < item.maxX + margin && point.z > item.minZ - margin && point.z < item.maxZ + margin);
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

  it("chega da porta do carro até o lugar dele sem atravessar móvel", () => {
    const path = arrivalPath(spot);
    expect(path.at(-1)).toEqual(spot);
    walk(path);
  });

  it("a ronda volta ao lugar dele, com trechos ligados e sem atravessar móvel", () => {
    const legs = patrolLegs(spot);
    legs.forEach((leg, index) => {
      if (index > 0) expect(leg[0]).toEqual(legs[index - 1]!.at(-1));
      walk(leg);
    });
    expect(legs.at(-1)!.at(-1)).toEqual(spot);
  });
});
