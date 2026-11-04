import { beforeEach, describe, expect, it } from "vitest";
import { botRoomId, drawerSubject } from "@/components/hud/selection";
import { insetViewWindow } from "@/world/camera/ViewportInset";
import { useHQStore } from "@/state/useHQStore";
import type { FleetSnapshot } from "@/integrations/hq/types";

function fleetOf(ids: string[]): FleetSnapshot {
  return {
    source: "hermes",
    fetchedAt: 0,
    health: { api: "online", dashboard: "online" },
    bots: ids.map((id) => ({ id, name: id, state: "idle", sessionCount: 0, activeSessions: 0, routineCount: 0 })),
  };
}

describe("o que a gaveta mostra", () => {
  const fleet = fleetOf(["pulse", "novato"]);

  it("bot escolhido vence a sala", () => {
    const subject = drawerSubject(fleet, "pulse", "comando");
    expect(subject?.kind === "bot" && subject.bot.id).toBe("pulse");
  });

  it("sala abre o bot que ocupa o posto, inclusive bot fora do cadastro Lipp", () => {
    const room = botRoomId(fleet, "novato");
    expect(room).toBeTruthy();
    const subject = drawerSubject(fleet, null, room);
    expect(subject?.kind === "bot" && subject.bot.id).toBe("novato");
  });

  it("sala sem bot mostra a sala; nada escolhido fecha", () => {
    const subject = drawerSubject(fleetOf([]), null, "engenharia");
    expect(subject?.kind).toBe("room");
    expect(drawerSubject(fleet, null, null)).toBeNull();
    expect(drawerSubject(fleet, "sumiu", null)).toBeNull();
  });
});

describe("fechar a gaveta", () => {
  beforeEach(() => useHQStore.setState({ selectedBotId: null, selectedRoomId: null, selectedAgentId: null }));

  it("o × limpa também o bot escolhido pela lista", () => {
    useHQStore.getState().selectBot("pulse");
    useHQStore.getState().clearSelection();
    expect(useHQStore.getState().selectedBotId).toBeNull();
  });

  it("escolher uma sala solta o bot anterior", () => {
    useHQStore.getState().selectBot("pulse");
    useHQStore.getState().selectRoom("comando");
    expect(useHQStore.getState().selectedBotId).toBeNull();
  });
});

describe("câmera ao lado da gaveta", () => {
  it("centro da projeção cai no meio da área visível", () => {
    const view = insetViewWindow(1536, 960, 416);
    // centro virtual menos o deslocamento = meio do que sobra à esquerda
    expect(view.fullWidth / 2 - view.offsetX).toBe((1536 - 416) / 2);
    // escala horizontal igual à vertical: nada estica
    expect(view.aspect).toBeCloseTo(view.fullWidth / view.fullHeight);
  });

  it("gaveta maior que a tela não vira o frustum do avesso", () => {
    expect(insetViewWindow(500, 800, 480).offsetX).toBe(300);
  });
});
