import { Group } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHQStore } from "@/state/useHQStore";
import { buildFacade } from "@/world/office/buildingFacade";
import { HumanActor, type ActorFigure } from "@/world/office/HumanActor";
import { BUILDING_LEVELS, FLOOR_LEVEL, STORY, cityBoundsAt, floorAtLevel, initialBuildingView, neighborView, viewElevation, viewRoomAt, viewRooms, visibleLevels } from "@/world/office/officeBuilding";
import { parsePreset } from "@/avatar/human/preset";
import { buildLobby } from "@/world/office/buildingInteriors";
import { placeChief } from "@/world/office/officeChief";
import { CITY_BOUNDS } from "@/world/office/officeCity";
import { pathLength, pathPose } from "@/world/office/officeHumans";
import { FLOOR_BOUNDS, OFFICE_SEATS, corridorBounds } from "@/world/office/officeLayout";
import { ELEVATOR_CORE_X, ELEVATOR_XS, LOBBY_SCENERY, LOBBY_WALK, RECEPTION } from "@/world/office/officeLobby";
import { floorFit, officeRuntime, useOfficeStore } from "@/world/office/officeStore";

describe("vistas do prédio", () => {
  it("a frota real sempre fica no escritório, mesmo pedindo outro andar", () => {
    expect(initialBuildingView("live", "?andar=exterior")).toBe("operacao");
    expect(initialBuildingView("live", "")).toBe("operacao");
  });

  it("a demonstração abre fechada e aceita um andar na URL, ignorando o que não existe", () => {
    expect(initialBuildingView("demo", "")).toBe("exterior");
    expect(initialBuildingView("demo", "?andar=operacao")).toBe("operacao");
    expect(initialBuildingView("demo", "?andar=cobertura")).toBe("exterior");
  });

  it("o entorno desce a altura do andar; fechado, fica no chão", () => {
    expect(viewElevation("exterior")).toBe(0);
    expect(viewElevation("operacao")).toBeCloseTo(FLOOR_LEVEL.operacao * STORY);
  });

  it("no corte, só aparecem os pavimentos abaixo do andar", () => {
    expect(visibleLevels("exterior")).toBe(BUILDING_LEVELS);
    expect(visibleLevels("operacao")).toBe(FLOOR_LEVEL.operacao);
  });

  it("o prédio fechado não tem sala para clicar", () => {
    expect(viewRooms("exterior")).toEqual([]);
    expect(viewRoomAt("exterior", 0, 0)).toBeNull();
    expect(viewRoomAt("operacao", 0, 0)?.id).toBe("hall");
  });

  it("só pavimento com interior responde ao clique", () => {
    expect(floorAtLevel(FLOOR_LEVEL.operacao)).toBe("operacao");
    expect(floorAtLevel(FLOOR_LEVEL.terreo)).toBe("terreo");
    expect(floorAtLevel(BUILDING_LEVELS - 1)).toBe("diretoria");
    expect(floorAtLevel(BUILDING_LEVELS - 2)).toBeNull();
  });

  it("descer o chão tira a folga só do lado para onde a cidade anda na tela", () => {
    const moved = cityBoundsAt(CITY_BOUNDS, 10);
    expect(moved.minX).toBeGreaterThan(CITY_BOUNDS.minX);
    expect(moved.minZ).toBeGreaterThan(CITY_BOUNDS.minZ);
    expect(moved.maxX).toBe(CITY_BOUNDS.maxX);
  });

  it("subir e descer param nas pontas", () => {
    expect(neighborView("exterior", 1)).toBe("exterior");
    expect(neighborView("exterior", -1)).not.toBe("exterior");
    expect(neighborView("diretoria", 1)).toBe("exterior");
    expect(neighborView("terreo", -1)).toBe("terreo");
  });
});

describe("térreo", () => {
  const { footprints, props } = buildLobby();
  const blocked = (x: number, z: number, margin = 0.12) => footprints.find((item) => x > item.minX - margin && x < item.maxX + margin && z > item.minZ - margin && z < item.maxZ + margin);

  it("a atendente é cenário: etiqueta explícita, com peças do catálogo e sem ações", () => {
    const [attendant] = LOBBY_SCENERY;
    expect(attendant!.tag).toMatch(/cenográfica/);
    const { preset, problems } = parsePreset(attendant!.preset);
    expect(problems).toEqual([]);
    expect(preset?.parts).toEqual(attendant!.preset.parts);
    expect(attendant!.chair).toBeNull();
  });

  it("a atendente fica atrás do balcão, em lugar livre", () => {
    const { spot } = LOBBY_SCENERY[0]!;
    expect(spot.z).toBeLessThan(RECEPTION.z);
    expect(blocked(spot.x, spot.z)?.label).toBeUndefined();
  });

  it("da porta até o balcão não há móvel no caminho", () => {
    for (let walked = 0; walked <= pathLength(LOBBY_WALK); walked += 0.1) {
      const point = pathPose(LOBBY_WALK, walked);
      expect(blocked(point.x, point.z, 0.3)?.label, `${point.x}, ${point.z}`).toBeUndefined();
    }
  });

  it("cada zona é do térreo e não encosta em sala de outro andar", () => {
    expect(viewRooms("terreo").map((room) => room.id)).toEqual(["recepcao", "elevadores", "lounge", "cafe"]);
    expect(viewRoomAt("terreo", RECEPTION.x, RECEPTION.z)?.id).toBe("recepcao");
    expect(viewRoomAt("operacao", RECEPTION.x, RECEPTION.z)?.id).not.toBe("recepcao");
  });

  it("o núcleo dos elevadores fica no eixo do corredor do escritório", () => {
    const corridor = corridorBounds().find((item) => item.minZ === FLOOR_BOUNDS.minZ && item.minX > 0)!;
    expect((corridor.minX + corridor.maxX) / 2).toBeCloseTo(ELEVATOR_CORE_X);
    expect(ELEVATOR_XS[1]).toBe(ELEVATOR_CORE_X);
  });

  it("móveis e plantas ficam dentro do prédio", () => {
    for (const item of props) {
      expect(Math.abs(item.at[0])).toBeLessThan(FLOOR_BOUNDS.maxX);
      expect(Math.abs(item.at[2])).toBeLessThan(FLOOR_BOUNDS.maxZ);
    }
  });
});

describe("fachada", () => {
  it("cada pavimento acrescenta vértices e a coroa vem depois de todos: o corte é só parar antes", () => {
    const { body, lit, bodyEnds, litEnds } = buildFacade();
    expect(bodyEnds).toHaveLength(BUILDING_LEVELS);
    for (let level = 1; level < BUILDING_LEVELS; level += 1) {
      expect(bodyEnds[level]!).toBeGreaterThan(bodyEnds[level - 1]!);
      expect(litEnds[level]!).toBeGreaterThan(litEnds[level - 1]!);
    }
    expect(body.getAttribute("position").count).toBeGreaterThan(bodyEnds.at(-1)!);
    expect(lit.getAttribute("position").count).toBeGreaterThan(litEnds.at(-1)!);
  });

  it("fica leve: uma malha só por material, sem passar de 60 mil vértices", () => {
    const { body, lit } = buildFacade();
    expect(body.getAttribute("position").count + lit.getAttribute("position").count).toBeLessThan(60000);
  });
});

describe("navegação entre andares", () => {
  const seatOf = OFFICE_SEATS.find((seat) => seat.kind === "posto")!;
  const start = useOfficeStore.getState();
  afterEach(() => {
    useOfficeStore.setState({ ...start, seating: { seats: {}, unseated: [] }, mode: "demo", buildingView: "exterior" });
    useHQStore.getState().clearSelection();
    officeRuntime.viewport = { width: 1, height: 1 };
  });

  it("trocar muda o andar na mesma chamada, sem estado de espera e sem cronômetro", () => {
    vi.useFakeTimers();
    try {
      useOfficeStore.setState({ mode: "demo", buildingView: "operacao", focusedRoomId: "hall", framing: "room", hoveredRoomId: "hall", hoveredBotId: "x", selectedHumanId: "y" });
      useOfficeStore.getState().goToView("exterior");
      expect(useOfficeStore.getState()).toMatchObject({ buildingView: "exterior", focusedRoomId: null, framing: "floor", hoveredRoomId: null, hoveredBotId: null, selectedHumanId: null });
      expect(vi.getTimerCount()).toBe(0);
      expect(useOfficeStore.getState()).not.toHaveProperty("pendingView");
      expect(useOfficeStore.getState()).not.toHaveProperty("commitView");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a câmera já está no enquadramento do andar novo quando a chamada volta", () => {
    officeRuntime.viewport = { width: 1440, height: 900 };
    useOfficeStore.setState({ mode: "demo", buildingView: "diretoria", framing: "floor" });
    officeRuntime.view = { x: 99, z: 99, zoom: 3 };
    useOfficeStore.getState().goToView("terreo");
    expect(officeRuntime.view).toEqual(floorFit(officeRuntime.viewport));
    expect(officeRuntime.goal).toEqual(officeRuntime.view);
  });

  it("pedir o andar em tela não troca nada: só volta ao enquadramento dele, sem saltar", () => {
    useOfficeStore.setState({ mode: "demo", buildingView: "operacao", framing: "free" });
    officeRuntime.view = { x: 1, z: 2, zoom: 40 };
    useOfficeStore.getState().goToView("operacao");
    expect(useOfficeStore.getState()).toMatchObject({ buildingView: "operacao", framing: "floor" });
    expect(officeRuntime.view).toEqual({ x: 1, z: 2, zoom: 40 });
  });

  it("na frota real não há troca", () => {
    useOfficeStore.setState({ mode: "live", buildingView: "operacao" });
    useOfficeStore.getState().goToView("exterior");
    expect(useOfficeStore.getState().buildingView).toBe("operacao");
  });

  it("selecionar um bot de fora do prédio leva direto ao andar e à sala dele, sem perder a seleção", () => {
    useOfficeStore.setState({ mode: "demo", buildingView: "exterior", seating: { seats: { argos: seatOf.id }, unseated: [] } });
    useOfficeStore.getState().selectBot("argos");
    expect(useOfficeStore.getState()).toMatchObject({ buildingView: "operacao", focusedRoomId: seatOf.roomId, framing: "room" });
    expect(useHQStore.getState().selectedBotId).toBe("argos");
    expect(officeRuntime.view).toEqual(officeRuntime.goal);
  });

  it("selecionar bot sem posto não muda de andar", () => {
    useOfficeStore.setState({ mode: "demo", buildingView: "terreo", seating: { seats: {}, unseated: ["argos"] } });
    useOfficeStore.getState().selectBot("argos");
    expect(useOfficeStore.getState().buildingView).toBe("terreo");
    expect(useHQStore.getState().selectedBotId).toBe("argos");
  });

  it("selecionar quem está em outro andar leva direto ao andar dessa pessoa", () => {
    const chief = placeChief();
    useOfficeStore.setState({ mode: "demo", buildingView: "terreo", humans: [chief] });
    useOfficeStore.getState().selectHuman(chief.id);
    expect(useOfficeStore.getState()).toMatchObject({ buildingView: "diretoria", selectedHumanId: chief.id, focusedRoomId: chief.roomId, framing: "room" });
  });

  it("selecionar no andar atual não mexe na câmera de uma vez", () => {
    useOfficeStore.setState({ mode: "demo", buildingView: "operacao", seating: { seats: { argos: seatOf.id }, unseated: [] } });
    officeRuntime.view = { x: 1, z: 2, zoom: 40 };
    useOfficeStore.getState().selectBot("argos");
    expect(useOfficeStore.getState()).toMatchObject({ buildingView: "operacao", focusedRoomId: seatOf.roomId });
    expect(officeRuntime.view).toEqual({ x: 1, z: 2, zoom: 40 });
  });

  it("selecionar na frota real nunca muda de andar", () => {
    useOfficeStore.setState({ mode: "live", buildingView: "operacao", seating: { seats: { argos: seatOf.id }, unseated: [] } });
    useOfficeStore.getState().selectBot("argos");
    expect(useOfficeStore.getState().buildingView).toBe("operacao");
    useOfficeStore.getState().selectHuman("chefe");
    expect(useOfficeStore.getState().buildingView).toBe("operacao");
  });
});

describe("pessoa que volta à cena", () => {
  const figure: ActorFigure = { root: new Group(), play: () => undefined, update: () => undefined, settled: true };
  const chair = OFFICE_SEATS.find((seat) => seat.roomId === "hall")!;

  it("sentada continua sentada, sem refazer o caminho", () => {
    const actor = new HumanActor(figure, { spot: { x: 0, z: 0 }, chair }, { walkSpeed: 1 }, false);
    actor.settle("seated");
    expect(actor.phase).toBe("seated");
    actor.command("seated");
    actor.update(0.016);
    expect(actor.phase).toBe("seated");
  });

  it("sem cadeira, fica em pé", () => {
    const actor = new HumanActor(figure, { spot: { x: 0, z: 0 }, chair: null }, { walkSpeed: 1 }, false);
    actor.settle("seated");
    expect(actor.phase).toBe("standing");
  });
});
