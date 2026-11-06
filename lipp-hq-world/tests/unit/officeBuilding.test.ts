import { Group, type BufferGeometry } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHQStore } from "@/state/useHQStore";
import { buildFacade } from "@/world/office/buildingFacade";
import { HumanActor, type ActorFigure } from "@/world/office/HumanActor";
import { BUILDING_HEIGHT, BUILDING_LEVELS, BUILDING_ROOMS_BY_ID, sceneryOfView, BUILDING_VIEWS, type BuildingView, CROWN_HEIGHT, CROWN_STEPS, FLOOR_LEVEL, STORY, cityBoundsAt, decorativeLevels, floorAtLevel, viewFit, initialBuildingView, neighborView, viewElevation, viewRoomAt, viewRooms, visibleLevels } from "@/world/office/officeBuilding";
import { TOWER_TOP, cutAt, planTravel, plateOpacity, restCut, sectionAt, shownAt, travelProgress } from "@/world/office/floorTravel";
import { parsePreset } from "@/avatar/human/preset";
import { buildDirectorate, buildExpansion, buildLobby, buildOperationCore } from "@/world/office/buildingInteriors";
import { EXPANSION_CORRIDOR, EXPANSION_FLOORS, expansionFloor, expansionSeats } from "@/world/office/officeExpansion";
import type { Batch } from "@/world/office/officeKit";
import { buildOffice } from "@/world/office/officeRooms";
import { placeChief } from "@/world/office/officeChief";
import { CITY_BOUNDS } from "@/world/office/officeCity";
import { pathLength, pathPose } from "@/world/office/officeHumans";
import { FLOOR_BOUNDS, OFFICE_ROOMS, OFFICE_SEATS, corridorBounds } from "@/world/office/officeLayout";
import { ELEVATOR_CORE, ELEVATOR_CORE_X, ELEVATOR_STOPS, ELEVATOR_XS, LOBBY_SCENERY, LOBBY_WALK, RECEPTION } from "@/world/office/officeLobby";
import { aimCamera, floorFit, stepTravel, zoomStep, officeRuntime, useOfficeStore } from "@/world/office/officeStore";

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

describe("caixa dos elevadores", () => {
  const builds = { terreo: buildLobby(), operacao: buildOperationCore(), diretoria: buildDirectorate() };
  const FLOORS = Object.keys(ELEVATOR_STOPS) as Array<keyof typeof ELEVATOR_STOPS>;

  /** Alguma peça da malha passa por esta caixa? Testa triângulo a triângulo, não só vértice. */
  function crosses(batch: Batch, box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }) {
    for (const geometry of batch.values()) {
      const position = geometry.getAttribute("position");
      const index = geometry.index;
      const count = index ? index.count : position.count;
      for (let at = 0; at < count; at += 3) {
        const vertices = [0, 1, 2].map((corner) => (index ? index.getX(at + corner) : at + corner));
        const xs = vertices.map((vertex) => position.getX(vertex));
        const ys = vertices.map((vertex) => position.getY(vertex));
        const zs = vertices.map((vertex) => position.getZ(vertex));
        if (Math.min(...xs) < box.maxX && Math.max(...xs) > box.minX && Math.min(...ys) < box.maxY && Math.max(...ys) > box.minY && Math.min(...zs) < box.maxZ && Math.max(...zs) > box.minZ) return true;
      }
    }
    return false;
  }
  function deepest(batch: Batch) {
    let z = Infinity;
    for (const geometry of batch.values()) {
      geometry.computeBoundingBox();
      z = Math.min(z, geometry.boundingBox!.min.z);
    }
    return z;
  }
  const { bounds, front, back, pitch, partition, cab } = ELEVATOR_CORE;

  it("cabe uma cabine de verdade no poço, com folga para as paredes", () => {
    expect(front - back).toBeGreaterThanOrEqual(cab.depth + 0.1);
    expect(pitch - partition).toBeGreaterThanOrEqual(cab.width + 0.1);
    expect(cab.width).toBeGreaterThanOrEqual(1.4);
    expect(cab.depth).toBeGreaterThanOrEqual(1.4);
    expect(bounds.maxZ - bounds.minZ).toBeGreaterThan(2);
  });

  it("os três andares têm a mesma caixa: o poço não muda de lugar na torre", () => {
    for (const floor of FLOORS) expect(deepest(builds[floor].fixed), floor).toBeCloseTo(bounds.minZ - 0.1, 1);
    expect(ELEVATOR_STOPS.operacao.doors).toEqual([1]);
    expect(new Set(FLOORS.map((floor) => ELEVATOR_STOPS[floor].openShaft)).size).toBe(FLOORS.length);
  });

  it("a caixa fica fora da laje e não encosta em sala, posto, móvel nem na rua", () => {
    expect(bounds.maxZ).toBeLessThanOrEqual(FLOOR_BOUNDS.minZ);
    expect(bounds.minZ).toBeGreaterThan(-12);
    expect(bounds.minX).toBeGreaterThan(FLOOR_BOUNDS.minX);
    expect(bounds.maxX).toBeLessThan(FLOOR_BOUNDS.maxX);
    for (const room of OFFICE_ROOMS) expect(room.bounds.minZ).toBeGreaterThanOrEqual(bounds.maxZ);
    for (const seat of OFFICE_SEATS) expect(seat.z).toBeGreaterThan(bounds.maxZ);
    for (const floor of FLOORS) for (const item of builds[floor].footprints) expect(item.minZ, `${floor}: ${item.label}`).toBeGreaterThan(bounds.maxZ);
  });

  it("a parede é vazada de verdade na frente de cada porta, e a passagem até ela está livre", () => {
    for (const floor of FLOORS) {
      const { doors, opening, recess } = ELEVATOR_STOPS[floor];
      const full = floor === "operacao" ? buildOffice({ elevatorOpening: true }).fixed : builds[floor].fixed;
      for (const index of doors) {
        const x = ELEVATOR_XS[index]!;
        const passage = { minX: x - opening / 2 + 0.12, maxX: x + opening / 2 - 0.12, minY: 0.2, maxY: ELEVATOR_CORE.doorHeight - 0.05 };
        // Do piso até a porta, atravessando a linha da parede, não há nada no caminho.
        expect(crosses(full, { ...passage, minZ: ELEVATOR_CORE.wallFace - recess + 0.05, maxZ: FLOOR_BOUNDS.minZ + 0.9 }), `${floor}/${index}`).toBe(false);
        for (const item of builds[floor].footprints) expect(item.minZ < FLOOR_BOUNDS.minZ + 1.2 && item.maxX > passage.minX && item.minX < passage.maxX, `${floor}: ${item.label}`).toBe(false);
      }
    }
  });

  it("a porta do escritório cabe no corredor sem estreitá-lo", () => {
    const corridor = corridorBounds().find((item) => item.minZ === FLOOR_BOUNDS.minZ && item.minX > 0)!;
    expect(ELEVATOR_STOPS.operacao.opening).toBeLessThanOrEqual(corridor.maxX - corridor.minX);
  });

  it("a frota real continua com a parede inteira no fim do corredor", () => {
    const x = ELEVATOR_XS[1];
    const wall = { minX: x - 0.3, maxX: x + 0.3, minY: 0.5, maxY: 2, minZ: FLOOR_BOUNDS.minZ - 0.18, maxZ: FLOOR_BOUNDS.minZ + 0.1 };
    expect(crosses(buildOffice().fixed, wall)).toBe(true);
    expect(crosses(buildOffice({ elevatorOpening: true }).fixed, wall)).toBe(false);
    expect(deepest(buildOffice().fixed)).toBeGreaterThan(bounds.maxZ - 0.3);
  });
});

describe("fachada", () => {
  const { body, lit, bodyEnds, litEnds } = buildFacade();
  const topOfRange = (geometry: BufferGeometry, end: number) => {
    const position = geometry.getAttribute("position");
    let top = -Infinity;
    for (let index = 0; index < end; index += 1) top = Math.max(top, position.getY(index));
    return top;
  };

  it("são 14 pavimentos: sete de verdade e sete só de fachada", () => {
    expect(BUILDING_LEVELS).toBe(14);
    expect(FLOOR_LEVEL).toEqual({ terreo: 0, operacao: 1, diretoria: 13, "expansao-2": 2, "expansao-3": 3, "expansao-4": 4, "expansao-5": 5, esconderijo: 6 });
    expect(decorativeLevels()).toEqual([6, 7, 8, 9, 10, 11, 12]);
    for (const level of decorativeLevels()) expect(floorAtLevel(level)).toBeNull();
  });

  it("cada pavimento acrescenta vértices e a coroa vem depois de todos: o corte é só parar antes", () => {
    expect(bodyEnds).toHaveLength(BUILDING_LEVELS);
    for (let level = 1; level < BUILDING_LEVELS; level += 1) {
      expect(bodyEnds[level]!).toBeGreaterThan(bodyEnds[level - 1]!);
      expect(litEnds[level]!).toBeGreaterThanOrEqual(litEnds[level - 1]!);
    }
    expect(body.getAttribute("position").count).toBeGreaterThan(bodyEnds.at(-1)!);
    expect(lit.getAttribute("position").count).toBeGreaterThan(litEnds.at(-1)!);
  });

  it("nenhum detalhe passa da laje do seu pavimento: o corte não deixa nada acima do andar em tela", () => {
    for (let level = 0; level < BUILDING_LEVELS; level += 1) {
      expect(topOfRange(body, bodyEnds[level]!), `corpo ${level}`).toBeLessThanOrEqual((level + 1) * STORY + 1e-3);
      expect(topOfRange(lit, litEnds[level]!), `luz ${level}`).toBeLessThanOrEqual((level + 1) * STORY + 1e-3);
    }
  });

  it("o andar habitável é inteiro até a última laje: os recuos só existem na coroa", () => {
    const position = body.getAttribute("position");
    let narrowest = Infinity;
    let widest = -Infinity;
    for (let index = bodyEnds.at(-2)!; index < bodyEnds.at(-1)!; index += 1) {
      narrowest = Math.min(narrowest, position.getX(index));
      widest = Math.max(widest, position.getX(index));
    }
    expect(narrowest).toBeLessThanOrEqual(FLOOR_BOUNDS.minX);
    expect(widest).toBeGreaterThanOrEqual(FLOOR_BOUNDS.maxX);
    for (const step of CROWN_STEPS) expect(step.inset).toBeGreaterThan(0);
    const insets = CROWN_STEPS.map((step) => step.inset);
    expect(insets).toEqual([...insets].sort((a, b) => a - b));
    expect(new Set(insets).size).toBe(3);
  });

  it("a agulha é o ponto mais alto, e o enquadramento do exterior vai até ela", () => {
    const top = topOfRange(body, body.getAttribute("position").count);
    expect(top).toBeCloseTo(BUILDING_HEIGHT + CROWN_HEIGHT, 1);
    expect(viewFit("exterior").top).toBeCloseTo(top, 1);
  });

  it("fica leve: uma malha só por material, sem passar de 60 mil vértices", () => {
    expect(body.getAttribute("position").count + lit.getAttribute("position").count).toBeLessThan(60000);
  });
});

describe("andares de expansão", () => {
  const ids = EXPANSION_FLOORS.map((floor) => floor.id);
  const walls = (id: string) => [...buildExpansion(id).fixed.values()].reduce((lowest, part) => {
    part.computeBoundingBox();
    return Math.min(lowest, part.boundingBox!.min.z);
  }, Infinity);

  it("têm a mesma caixa dos elevadores dos outros andares", () => {
    const reference = [...buildLobby().fixed.values()].reduce((lowest, part) => {
      part.computeBoundingBox();
      return Math.min(lowest, part.boundingBox!.min.z);
    }, Infinity);
    for (const id of ids) expect(walls(id), id).toBeCloseTo(reference, 3);
  });

  it("são quatro, nos pavimentos 2 a 5, sem mexer na Diretoria", () => {
    expect(EXPANSION_FLOORS.map((floor) => floor.level)).toEqual([2, 3, 4, 5]);
    expect(FLOOR_LEVEL.diretoria).toBe(13);
    for (const floor of EXPANSION_FLOORS) expect(floorAtLevel(floor.level)).toBe(floor.id);
    expect(floorAtLevel(6)).toBeNull();
  });

  it("cada um abre pela URL, e a frota real ignora", () => {
    for (const id of ids) {
      expect(initialBuildingView("demo", `?andar=${id}`)).toBe(id);
      expect(initialBuildingView("live", `?andar=${id}`)).toBe("operacao");
    }
  });

  it("as teclas passam por todos, de cima a baixo", () => {
    const visited: BuildingView[] = ["exterior"];
    for (let step = 0; step < 7; step += 1) visited.push(neighborView(visited.at(-1)!, -1));
    expect(visited).toEqual(["exterior", "diretoria", "expansao-5", "expansao-4", "expansao-3", "expansao-2", "operacao", "terreo"]);
  });

  it("nenhuma zona repete id, nem entre andares", () => {
    const every = [...BUILDING_VIEWS].flatMap((view) => viewRooms(view).map((room) => room.id));
    expect(new Set(every).size).toBe(every.length);
    for (const id of ids) {
      for (const room of viewRooms(id)) {
        expect(room.id.startsWith(`${id}-`)).toBe(true);
        expect(BUILDING_ROOMS_BY_ID[room.id]).toBe(room);
      }
    }
  });

  it("zonas não se sobrepõem, cabem no andar, e clicar em cada uma acha a própria", () => {
    for (const id of ids) {
      for (const room of viewRooms(id)) {
        expect(room.bounds.minX).toBeGreaterThanOrEqual(FLOOR_BOUNDS.minX);
        expect(room.bounds.maxX).toBeLessThanOrEqual(FLOOR_BOUNDS.maxX);
        expect(room.bounds.minZ).toBeGreaterThanOrEqual(FLOOR_BOUNDS.minZ);
        expect(room.bounds.maxZ).toBeLessThanOrEqual(FLOOR_BOUNDS.maxZ);
        expect(viewRoomAt(id, room.center.x, room.center.z)?.id, `${room.id} não acha o próprio centro`).toBe(room.id);
      }
    }
  });

  it("não inventa equipe: as salas seguem reservadas, e quem aparece é figurante", () => {
    for (const id of ids) {
      for (const room of viewRooms(id)) expect(room.purpose).toContain("reservado");
      for (const person of sceneryOfView(id)) expect(person.tag).toBe("Figurante · cenário");
    }
    expect(EXPANSION_FLOORS.map((floor) => floor.title)).toEqual(["Expansão · andar 2", "Expansão · andar 3", "Expansão · andar 4", "Expansão · andar 5"]);
    const fleetNames = /argos|forge|pulse|echo|scout|atlas|\bink\b/i;
    for (const room of ids.flatMap((id) => viewRooms(id))) expect(room.name).not.toMatch(fleetNames);
  });

  it("corredor livre dos elevadores até as zonas, e nada fora do andar", () => {
    const { minX, maxX, minZ, maxZ } = EXPANSION_CORRIDOR;
    expect(maxX - minX).toBeCloseTo(1.5, 6);
    for (const id of ids) {
      for (const item of buildExpansion(id).footprints) {
        const crosses = item.maxX > minX && item.minX < maxX && item.maxZ > minZ && item.minZ < maxZ;
        expect(crosses, `${id}: ${item.label} no corredor`).toBe(false);
        const core = ELEVATOR_CORE.bounds;
        // A caixa dos elevadores fica fora da laje; nada do andar entra nela nem sai da laje pelos lados.
        expect(item.minX, `${id}: ${item.label}`).toBeGreaterThanOrEqual(Math.min(FLOOR_BOUNDS.minX, core.minX));
        expect(item.maxX, `${id}: ${item.label}`).toBeLessThanOrEqual(FLOOR_BOUNDS.maxX);
        expect(item.maxZ, `${id}: ${item.label}`).toBeLessThanOrEqual(FLOOR_BOUNDS.maxZ);
      }
    }
  });

  it("móveis não colidem entre si", () => {
    for (const id of ids) {
      const { footprints } = buildExpansion(id);
      footprints.forEach((a, index) => {
        for (const b of footprints.slice(index + 1)) {
          const hit = a.maxX > b.minX && a.minX < b.maxX && a.maxZ > b.minZ && a.minZ < b.maxZ;
          expect(hit, `${id}: ${a.label} em ${b.label}`).toBe(false);
        }
      });
    }
  });

  it("as quatro plantas são diferentes de verdade, e cada uma custa uma mobília", () => {
    const shapes = ids.map((id) => {
      const floor = expansionFloor(id)!;
      return floor.pieces.map(({ kind }) => kind).join();
    });
    expect(new Set(shapes).size).toBe(4);
    const triangles = (batch: Batch) => [...batch.values()].reduce((sum, part) => sum + part.getAttribute("position").count / 3, 0);
    for (const id of ids) expect(triangles(buildExpansion(id).fixed), id).toBeLessThan(60_000);
  });

  it("as mesas respeitam a planta pedida: ilhas, células, redondas e cabines", () => {
    const kinds = (id: string, kind: string) => expansionFloor(id)!.pieces.filter((piece) => piece.kind === kind).length;
    expect(kinds("expansao-2", "island")).toBe(2);
    expect(kinds("expansao-3", "desk")).toBe(8);
    expect(kinds("expansao-4", "round")).toBe(2);
    expect(kinds("expansao-5", "desk")).toBe(4);
  });

  describe("figurantes", () => {
    const CAMERA_SIDE = [-0.01, Math.PI / 2 + 0.3] as const;
    const figures = ids.flatMap((id) => sceneryOfView(id).map((person) => ({ id, person })));

    it("são de 3 a 5 por andar, com ids sem repetição no prédio", () => {
      for (const id of ids) {
        expect(sceneryOfView(id).length, id).toBeGreaterThanOrEqual(3);
        expect(sceneryOfView(id).length, id).toBeLessThanOrEqual(5);
      }
      const every = [...figures.map(({ person }) => person.id), ...LOBBY_SCENERY.map((person) => person.id)];
      expect(new Set(every).size).toBe(every.length);
    });

    it("têm peças do catálogo e nenhum tem a mesma aparência de outro no andar", () => {
      for (const id of ids) {
        const looks = sceneryOfView(id).map(({ preset }) => JSON.stringify([preset.parts, preset.colors]));
        expect(new Set(looks).size, id).toBe(looks.length);
      }
      for (const { person } of figures) {
        const { preset, problems } = parsePreset(person.preset);
        expect(problems, person.id).toEqual([]);
        expect(preset?.parts, person.id).toEqual(person.preset.parts);
      }
    });

    it("não usam nome de bot, equipe nem frota", () => {
      const fleetNames = /argos|forge|pulse|echo|scout|atlas|\bink\b|equipe|sess[aã]o/i;
      for (const { person } of figures) {
        expect(person.tag, person.id).not.toMatch(fleetNames);
        expect(person.preset.name, person.id).toBe("Figurante");
        expect(person.id, person.id).not.toMatch(fleetNames);
      }
    });

    it("ficam de frente para a câmera, na sala certa do próprio andar", () => {
      for (const { id, person } of figures) {
        const yaw = person.chair?.yaw ?? person.restYaw ?? 0;
        const toCamera = Math.abs(Math.atan2(Math.sin(yaw - Math.PI / 4), Math.cos(yaw - Math.PI / 4)));
        expect(toCamera, `${person.id} de costas`).toBeLessThan(Math.PI / 2 + 0.2);
        expect(yaw, person.id).toBeGreaterThanOrEqual(CAMERA_SIDE[0] - 0.3);
        expect(yaw, person.id).toBeLessThanOrEqual(CAMERA_SIDE[1]);
        expect(person.floor, person.id).toBe(id);
        expect(viewRoomAt(id, person.spot.x, person.spot.z)?.id, person.id).toBe(person.roomId);
      }
    });

    it("sentado: cadeira só dele, com a mesa à frente; em pé: em chão livre e fora do corredor", () => {
      for (const { id, person } of figures) {
        const { footprints } = buildExpansion(id);
        const { x, z } = person.spot;
        const inside = (item: (typeof footprints)[number], px: number, pz: number, margin = 0) => px > item.minX - margin && px < item.maxX + margin && pz > item.minZ - margin && pz < item.maxZ + margin;
        if (person.chair) {
          expect(footprints.filter((item) => item.label === "cadeira" && inside(item, x, z)).length, `${person.id}: cadeira dobrada`).toBe(1);
          const ahead = { x: x + Math.sin(person.chair.yaw) * 0.6, z: z + Math.cos(person.chair.yaw) * 0.6 };
          expect(footprints.some((item) => /mesa/.test(item.label) && inside(item, ahead.x, ahead.z, 0.05)), `${person.id}: sem mesa à frente`).toBe(true);
        } else {
          expect(footprints.find((item) => inside(item, x, z, 0.2))?.label, person.id).toBeUndefined();
          const { minX, maxX, minZ, maxZ } = EXPANSION_CORRIDOR;
          expect(x > minX && x < maxX && z > minZ && z < maxZ, `${person.id} no corredor`).toBe(false);
        }
      }
    });

    it("só o lugar ocupado ganha computador: a mesa dos outros segue sem nada", () => {
      for (const id of ids) {
        const floor = expansionFloor(id)!;
        const seated = expansionSeats(floor).length;
        expect(seated, id).toBeGreaterThan(0);
        expect(seated, id).toBeLessThanOrEqual(floor.pieces.filter((piece) => piece.kind === "desk").length + floor.pieces.filter((piece) => piece.kind === "island").reduce((sum, piece) => sum + (piece.kind === "island" ? piece.seats.length : 0), 0) + floor.pieces.filter((piece) => piece.kind === "round").length * 4);
      }
    });
  });
});

describe("caminho do corte", () => {
  const rest = (view: BuildingView) => ({ cut: restCut(view), shown: view === "exterior" ? null : view, moving: false, elevation: viewElevation(view) });
  const pathOf = (from: BuildingView, to: BuildingView) => planTravel(rest(from), to);
  const samples = Array.from({ length: 201 }, (_, index) => index / 200);

  it("sai e chega exatamente no descanso das duas vistas", () => {
    for (const from of BUILDING_VIEWS) {
      for (const to of BUILDING_VIEWS) {
        if (from === to) continue;
        const plan = pathOf(from, to);
        expect(cutAt(plan, 0)).toBeCloseTo(restCut(from), 6);
        expect(cutAt(plan, 1)).toBeCloseTo(restCut(to), 6);
      }
    }
  });

  it("a laje está fechada sempre que o andar à mostra muda: nada aparece de repente", () => {
    for (const from of BUILDING_VIEWS) {
      for (const to of BUILDING_VIEWS) {
        if (from === to) continue;
        const plan = pathOf(from, to);
        let last = shownAt(plan, 0);
        for (const progress of samples) {
          const shown = shownAt(plan, progress);
          if (shown !== last) {
            expect(plateOpacity(cutAt(plan, progress - 1 / 200), last), `${from}>${to} em ${progress}`).toBeGreaterThan(0.95);
            expect(plateOpacity(cutAt(plan, progress), shown), `${from}>${to} em ${progress}`).toBeGreaterThan(0.95);
          }
          last = shown;
        }
      }
    }
  });

  it("andar à mostra nunca fica acima do corte: nenhum piso flutua sobre a laje", () => {
    for (const from of BUILDING_VIEWS) {
      for (const to of BUILDING_VIEWS) {
        if (from === to) continue;
        const plan = pathOf(from, to);
        for (const progress of samples) {
          const shown = shownAt(plan, progress);
          if (shown) expect(cutAt(plan, progress)).toBeGreaterThanOrEqual(FLOOR_LEVEL[shown] * STORY - 1e-6);
        }
      }
    }
  });

  it("o tempo fica entre 480 e 650 ms, e o progresso nunca anda para trás", () => {
    for (const to of ["terreo", "diretoria"] as const) {
      const plan = pathOf("exterior", to);
      expect(plan.duration).toBeGreaterThanOrEqual(480);
      expect(plan.duration).toBeLessThanOrEqual(650);
      let last = 0;
      for (const t of samples) {
        const progress = travelProgress(plan, t * plan.duration);
        expect(progress).toBeGreaterThanOrEqual(last);
        last = progress;
      }
      expect(last).toBe(1);
    }
  });

  it("voltar ao andar ainda à mostra só desfaz o caminho, sem subir até a laje", () => {
    const plan = planTravel({ cut: 4.4, shown: "operacao", moving: true, elevation: 8 }, "operacao");
    expect(plan.points).toEqual([4.4, STORY]);
    expect(shownAt(plan, 0)).toBe("operacao");
    expect(shownAt(plan, 0.5)).toBe("operacao");
  });

  it("a seção acompanha a coroa em degraus e some na agulha", () => {
    const body = sectionAt(10)!;
    const firstStep = sectionAt(BUILDING_HEIGHT + 1)!;
    const lastStep = sectionAt(BUILDING_HEIGHT + 9)!;
    expect(firstStep.maxX - firstStep.minX).toBeLessThan(body.maxX - body.minX);
    expect(lastStep.maxX - lastStep.minX).toBeLessThan(firstStep.maxX - firstStep.minX);
    expect(sectionAt(TOWER_TOP)).toBeNull();
  });
});

describe("navegação entre andares", () => {
  const seatOf = OFFICE_SEATS.find((seat) => seat.kind === "posto")!;
  const start = useOfficeStore.getState();
  afterEach(() => {
    useOfficeStore.setState({ ...start, seating: { seats: {}, unseated: [] }, mode: "demo", buildingView: "exterior", traveling: false });
    Object.assign(officeRuntime.travel, { flight: null, cut: restCut("exterior"), elevation: 0, root: 0, shown: null, plate: 0, hold: null });
    useHQStore.getState().clearSelection();
    officeRuntime.viewport = { width: 1, height: 1 };
  });

  it("o destino vale na mesma chamada, sem cronômetro: só o quadro faz a viagem andar", () => {
    vi.useFakeTimers();
    try {
      useOfficeStore.setState({ mode: "demo", buildingView: "operacao", focusedRoomId: "hall", framing: "room", hoveredRoomId: "hall", hoveredBotId: "x", selectedHumanId: "y" });
      useOfficeStore.getState().goToView("exterior");
      expect(useOfficeStore.getState()).toMatchObject({ buildingView: "exterior", traveling: true, focusedRoomId: null, framing: "floor", hoveredRoomId: null, hoveredBotId: null, selectedHumanId: null });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a câmera sai de onde está e chega exatamente no enquadramento do andar novo", () => {
    officeRuntime.viewport = { width: 1440, height: 900 };
    useOfficeStore.setState({ mode: "demo", buildingView: "diretoria", framing: "floor" });
    officeRuntime.view = { x: 9, z: 9, zoom: 20 };
    useOfficeStore.getState().goToView("terreo");
    expect(officeRuntime.view).toEqual({ x: 9, z: 9, zoom: 20 });
    let frames = 0;
    while (officeRuntime.travel.flight && frames < 200) {
      aimCamera();
      stepTravel(1 / 60);
      frames += 1;
    }
    expect(frames).toBeGreaterThan(20);
    expect(officeRuntime.view).toEqual(floorFit(officeRuntime.viewport));
    expect(useOfficeStore.getState()).toMatchObject({ traveling: false, mountedFloors: ["terreo"] });
  });

  it("num aparelho lento a viagem dura o mesmo relógio, não o mesmo número de quadros", () => {
    // 1,3 quadro por segundo é o que um celular fraco entrega no modo Leve.
    const frames = (delta: number) => {
      officeRuntime.viewport = { width: 1440, height: 900 };
      useOfficeStore.setState({ mode: "demo", buildingView: "exterior", framing: "floor" });
      officeRuntime.view = { x: 9, z: 9, zoom: 20 };
      useOfficeStore.getState().goToView("diretoria");
      let count = 0;
      while (officeRuntime.travel.flight && count < 400) {
        aimCamera();
        stepTravel(delta);
        count += 1;
      }
      return { count };
    };
    const slow = frames(0.75);
    // Com o teto de 50 ms por quadro a mesma viagem pedia 14 quadros: dez segundos parada.
    expect(slow.count).toBeLessThanOrEqual(2);
    const fast = frames(1 / 60);
    expect(fast.count).toBeGreaterThan(20);
    expect(officeRuntime.view).toEqual(floorFit({ width: 1440, height: 900 }));
  });

  it("no meio do caminho, a câmera está entre a saída e a chegada, e a tela mudada no caminho vale", () => {
    officeRuntime.viewport = { width: 1440, height: 900 };
    useOfficeStore.setState({ mode: "demo", buildingView: "operacao", framing: "floor" });
    officeRuntime.view = { x: 0, z: 0, zoom: 30 };
    useOfficeStore.getState().goToView("exterior");
    for (let frame = 0; frame < 15; frame += 1) {
      aimCamera();
      stepTravel(1 / 60);
    }
    const middle = officeRuntime.view.zoom;
    const arrival = floorFit(officeRuntime.viewport).zoom;
    expect(middle).toBeLessThan(30);
    expect(middle).toBeGreaterThan(arrival);
    officeRuntime.viewport = { width: 844, height: 390 };
    while (officeRuntime.travel.flight) {
      aimCamera();
      stepTravel(1 / 60);
    }
    expect(officeRuntime.view).toEqual(floorFit({ width: 844, height: 390 }));
  });

  it("pedir outro andar no meio redireciona do ponto em que está, sem fila", () => {
    officeRuntime.viewport = { width: 1440, height: 900 };
    useOfficeStore.setState({ mode: "demo", buildingView: "operacao", framing: "floor" });
    useOfficeStore.getState().goToView("diretoria");
    for (let frame = 0; frame < 12; frame += 1) {
      aimCamera();
      stepTravel(1 / 60);
    }
    const { cut } = officeRuntime.travel;
    useOfficeStore.getState().goToView("terreo");
    expect(officeRuntime.travel.flight!.plan.points[0]).toBe(cut);
    expect(officeRuntime.travel.flight!.plan.target).toBe("terreo");
    expect(officeRuntime.travel.flight!.plan.redirected).toBe(true);
    while (officeRuntime.travel.flight) {
      aimCamera();
      stepTravel(1 / 60);
    }
    expect(useOfficeStore.getState()).toMatchObject({ buildingView: "terreo", mountedFloors: ["terreo"] });
    expect(officeRuntime.travel.cut).toBe(restCut("terreo"));
  });

  it("gesto de zoom no botão espera a chegada", () => {
    officeRuntime.viewport = { width: 1440, height: 900 };
    useOfficeStore.setState({ mode: "demo", buildingView: "operacao", framing: "floor" });
    useOfficeStore.getState().goToView("terreo");
    zoomStep(2);
    expect(useOfficeStore.getState().framing).toBe("floor");
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
    expect(useOfficeStore.getState().traveling).toBe(true);
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

  it("seleções entre andares limpam o hover da cena anterior", () => {
    useOfficeStore.setState({ mode: "demo", buildingView: "operacao", humans: [placeChief()], hoveredRoomId: "comando", hoveredBotId: "argos", hoveredLevel: 1 });
    useOfficeStore.getState().selectHuman("chefe");
    expect(useOfficeStore.getState()).toMatchObject({ hoveredRoomId: null, hoveredBotId: null, hoveredHumanId: null, hoveredLevel: null });
    useOfficeStore.setState({ hoveredRoomId: "sala-chefe", hoveredHumanId: "chefe", seating: { seats: { argos: seatOf.id }, unseated: [] } });
    useOfficeStore.getState().selectBot("argos");
    expect(useOfficeStore.getState()).toMatchObject({ buildingView: "operacao", hoveredRoomId: null, hoveredHumanId: null });
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
