import { newPreset, type HumanPreset } from "@/avatar/human/preset";
import { EMAIL, SQUAD } from "@/activity/squad";
import type { OfficeHuman } from "@/world/office/officeHumans";
import { TECH_FLOOR_ID, deskPlace, roomId } from "./techPlaces";

/** A aparência de cada pessoa do squad: as mesmas peças do editor, com cores próprias. */
const LOOK: Record<string, { parts: Partial<HumanPreset["parts"]>; colors: Partial<HumanPreset["colors"]>; expression?: HumanPreset["expression"] }> = {
  [EMAIL.marina]: { parts: { hair: "Hair.009", glasses: "Glasses.001" }, colors: { hair: "#3b2417", eyebrow: "#3b2417", head: "#eab08c", nose: "#eab08c", top: "#7c2d3a", bottom: "#23262c" }, expression: "smile" },
  [EMAIL.caio]: { parts: { hair: "Hair.008", facialHair: "FacialHair.002" }, colors: { hair: "#17120f", eyebrow: "#17120f", facialHair: "#17120f", head: "#8d5a3c", nose: "#8d5a3c", top: "#f2efe8", bottom: "#2f4256" } },
  [EMAIL.renata]: { parts: { hair: "Hair.011", glasses: "Glasses.003" }, colors: { hair: "#17120f", eyebrow: "#17120f", head: "#f5c6a5", nose: "#f5c6a5", top: "#2f4256", bottom: "#23262c" } },
  [EMAIL.diego]: { parts: { hair: "Hair.003", facialHair: "FacialHair.005" }, colors: { hair: "#6b4426", eyebrow: "#6b4426", facialHair: "#6b4426", head: "#d4966e", nose: "#d4966e", top: "#22c55e", bottom: "#7a8087" } },
  [EMAIL.luana]: { parts: { hair: "Hair.004", top: "Top.003" }, colors: { hair: "#a8703a", eyebrow: "#a8703a", head: "#eab08c", nose: "#eab08c", top: "#a855f7", bottom: "#2f4256" }, expression: "smile" },
  [EMAIL.tiago]: { parts: { hair: "Hair.005", hat: "Hat.007" }, colors: { hair: "#3b2417", eyebrow: "#3b2417", head: "#b97a52", nose: "#b97a52", top: "#f59e0b", bottom: "#23262c" } },
  [EMAIL.bianca]: { parts: { hair: "Hair.010", bow: "Bow.001" }, colors: { hair: "#b0413e", eyebrow: "#6b4426", head: "#f5c6a5", nose: "#f5c6a5", bow: "#2563eb", top: "#2563eb", bottom: "#23262c" } },
  [EMAIL.rafael]: { parts: { hair: "Hair.001", top: "Top.002" }, colors: { hair: "#17120f", eyebrow: "#17120f", head: "#5f3b28", nose: "#5f3b28", top: "#a83232", bottom: "#2f4256" } },
};

const LOOK_DATE = "2026-11-10T00:00:00.000Z";

export const squadHumanId = (email: string) => `squad-${email.split("@")[0]!.replace(/\./g, "-")}`;
export const emailOfHuman = (id: string) => SQUAD.find((person) => squadHumanId(person.email) === id)?.email ?? null;

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = (result * 31 + value.charCodeAt(index)) % 100000;
  return result;
}

/** O squad como pessoas da cena: casa na mesa de cada um, no andar da Tecnologia. */
export function squadHumans(): OfficeHuman[] {
  return SQUAD.map((person) => {
    const id = squadHumanId(person.email);
    const base = newPreset(id, person.name, LOOK_DATE);
    const look = LOOK[person.email] ?? { parts: {}, colors: {} };
    const desk = deskPlace(person.email);
    return {
      id,
      name: person.name,
      preset: { ...base, expression: look.expression ?? "neutral", parts: { ...base.parts, ...look.parts }, colors: { ...base.colors, ...look.colors } },
      floor: TECH_FLOOR_ID,
      roomId: roomId("squad"),
      spot: desk.spot,
      chair: desk.chair,
      ...(desk.route ? { route: desk.route } : {}),
      phase: (hash(id) % 100) / 25,
      squad: person.email,
    };
  });
}
