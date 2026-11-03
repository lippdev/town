import { describe, expect, it } from "vitest";
import { roomTag } from "@/world/rooms/RoomIndicator";
import { ROOMS_BY_ID } from "@/world/rooms/rooms";
import type { FleetSnapshot } from "@/integrations/hq/types";

const fleet: FleetSnapshot = {
  source: "hermes",
  fetchedAt: 0,
  health: { api: "online", dashboard: "online" },
  bots: [{ id: "pulse", name: "Pulse", state: "working", sessionCount: 3, activeSessions: 1, routineCount: 1 }],
};

describe("indicador da sala", () => {
  it("diz o departamento, o bot no posto e o estado", () => {
    const tag = roomTag(ROOMS_BY_ID.engenharia, fleet);
    expect(tag).toMatchObject({ kicker: "Departamento", status: "trabalhando" });
    expect(tag.bot?.id).toBe("pulse");
  });

  it("departamento sem bot mostra posto livre; área comum não inventa estado", () => {
    expect(roomTag(ROOMS_BY_ID.engenharia, null)).toMatchObject({ bot: null, status: "posto livre" });
    expect(roomTag(ROOMS_BY_ID.hall, fleet)).toMatchObject({ kicker: "Área comum", status: null });
    expect(roomTag(ROOMS_BY_ID.reunioes, fleet).kicker).toBe("Reuniões");
  });
});
