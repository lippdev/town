import { Group } from "three";
import { afterEach, describe, expect, it } from "vitest";
import { useHQStore } from "@/state/useHQStore";
import { buildFacade } from "@/world/office/buildingFacade";
import { HumanActor, type ActorFigure } from "@/world/office/HumanActor";
import { BUILDING_LEVELS, FLOOR_LEVEL, STORY, cityBoundsAt, floorAtLevel, initialBuildingView, neighborView, viewElevation, viewRoomAt, viewRooms, visibleLevels } from "@/world/office/officeBuilding";
import { CITY_BOUNDS } from "@/world/office/officeCity";
import { OFFICE_SEATS } from "@/world/office/officeLayout";
import { useOfficeStore } from "@/world/office/officeStore";

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
    expect(neighborView("operacao", 1)).toBe("exterior");
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
    useOfficeStore.setState({ ...start, seating: { seats: {}, unseated: [] }, mode: "demo", buildingView: "exterior", pendingView: null });
    useHQStore.getState().clearSelection();
  });

  it("trocar limpa foco, seleção e o que estava apontado", () => {
    useOfficeStore.setState({ mode: "demo", buildingView: "operacao", focusedRoomId: "hall", framing: "room", hoveredRoomId: "hall", hoveredBotId: "x", selectedHumanId: "y" });
    useOfficeStore.getState().goToView("exterior");
    const now = useOfficeStore.getState();
    expect(now).toMatchObject({ pendingView: "exterior", focusedRoomId: null, framing: "floor", hoveredRoomId: null, hoveredBotId: null, selectedHumanId: null });
    expect(now.buildingView).toBe("operacao");
    useOfficeStore.getState().commitView();
    expect(useOfficeStore.getState()).toMatchObject({ buildingView: "exterior", pendingView: null });
  });

  it("pedir o andar em tela não troca nada", () => {
    useOfficeStore.setState({ mode: "demo", buildingView: "operacao", pendingView: "exterior" });
    useOfficeStore.getState().goToView("operacao");
    expect(useOfficeStore.getState()).toMatchObject({ buildingView: "operacao", pendingView: null });
  });

  it("na frota real não há troca", () => {
    useOfficeStore.setState({ mode: "live", buildingView: "operacao" });
    useOfficeStore.getState().goToView("exterior");
    expect(useOfficeStore.getState().pendingView).toBeNull();
  });

  it("selecionar um bot de fora do prédio leva ao andar e à sala dele, sem perder a seleção", () => {
    useOfficeStore.setState({ mode: "demo", buildingView: "exterior", seating: { seats: { argos: seatOf.id }, unseated: [] } });
    useOfficeStore.getState().selectBot("argos");
    expect(useOfficeStore.getState()).toMatchObject({ pendingView: "operacao", focusedRoomId: seatOf.roomId, framing: "room" });
    useOfficeStore.getState().commitView();
    expect(useOfficeStore.getState()).toMatchObject({ buildingView: "operacao", focusedRoomId: seatOf.roomId });
    expect(useHQStore.getState().selectedBotId).toBe("argos");
  });

  it("selecionar na frota real nunca pede troca", () => {
    useOfficeStore.setState({ mode: "live", buildingView: "operacao", seating: { seats: { argos: seatOf.id }, unseated: [] } });
    useOfficeStore.getState().selectBot("argos");
    expect(useOfficeStore.getState().pendingView).toBeNull();
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
