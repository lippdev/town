import { describe, expect, it } from "vitest";
import { newPreset, parsePreset } from "@/avatar/human/preset";
import { CHIEF_ID, CHIEF_PRESET, withChief } from "@/world/office/officeChief";
import { placeHumans } from "@/world/office/officeHumans";

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
