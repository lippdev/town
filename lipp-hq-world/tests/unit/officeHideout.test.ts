// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { Box3, Vector3 } from "three";
import { buildDirectorate, buildHideout, buildHideoutCar, buildSecretShelf } from "@/world/office/buildingInteriors";
import { BUILDING_ROOMS_BY_ID, BUILDING_VIEWS, FLOOR_LEVEL, FLOOR_ORDER, HIDEOUT, decorativeLevels, floorAtLevel, initialBuildingView, isBuildingView, neighborView, sceneryOfView, urlViewOf, viewRoomAt, viewRooms } from "@/world/office/officeBuilding";
import { planTravel, restCut, shownAt } from "@/world/office/floorTravel";
import { batEmblemGeometry, capeGeometry, cowlGeometry } from "@/world/office/hideoutGear";
import { parsePreset } from "@/avatar/human/preset";
import { FLOOR_BOUNDS } from "@/world/office/officeLayout";
import { BAT_OUTLINE, CAR_WHEELS, HIDEOUT_GLOWS, HIDEOUT_KIT, HIDEOUT_LEVEL, TURNTABLE } from "@/world/office/officeHideout";
import { SECRET_SHELF, SECRET_SPOTS, TERMINAL_FILES, secretCaption, secretSpotsOf, useSecretStore } from "@/world/office/officeSecrets";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const triangles = (batch: Map<string, { getAttribute: (name: string) => { count: number } }>) => [...batch.values()].reduce((sum, part) => sum + part.getAttribute("position").count / 3, 0);

describe("o esconderijo fica fora de tudo o que é público", () => {
  it("mora num pavimento só de fachada, que continua sem clique", () => {
    expect(FLOOR_LEVEL[HIDEOUT]).toBe(HIDEOUT_LEVEL);
    expect(floorAtLevel(HIDEOUT_LEVEL)).toBeNull();
    expect(decorativeLevels()).toContain(HIDEOUT_LEVEL);
    expect(decorativeLevels()).toHaveLength(7);
  });

  it("não está no seletor, nas teclas de andar nem nas vistas válidas da URL", () => {
    expect(FLOOR_ORDER).not.toContain(HIDEOUT);
    expect(BUILDING_VIEWS).not.toContain(HIDEOUT);
    expect(isBuildingView(HIDEOUT)).toBe(false);
    let view = BUILDING_VIEWS[0]!;
    for (let step = 0; step < BUILDING_VIEWS.length + 2; step += 1) {
      view = neighborView(view, -1);
      expect(view).not.toBe(HIDEOUT);
    }
  });

  it("a URL nunca abre nem guarda o segredo, e a frota real o ignora", () => {
    expect(initialBuildingView("demo", "?andar=esconderijo")).toBe("exterior");
    expect(initialBuildingView("live", "?andar=esconderijo")).toBe("operacao");
    expect(urlViewOf(HIDEOUT)).toBe("diretoria");
    expect(urlViewOf("expansao-3")).toBe("expansao-3");
    for (const room of viewRooms("diretoria")) expect(room.purpose).not.toMatch(/morcego|batman|batcaverna/i);
  });

  it("de lá, qualquer tecla de andar volta por onde se entrou", () => {
    expect(neighborView(HIDEOUT, 1)).toBe("diretoria");
    expect(neighborView(HIDEOUT, -1)).toBe("diretoria");
  });

  it("a viagem usa o corte de sempre: um andar à mostra, e a troca com a laje fechada", () => {
    const plan = planTravel({ cut: restCut("diretoria"), shown: "diretoria", moving: false, elevation: FLOOR_LEVEL.diretoria * 3.4 }, HIDEOUT);
    expect(plan.arriving).toBe(HIDEOUT);
    expect(plan.points.at(-1)).toBeCloseTo(restCut(HIDEOUT));
    for (const progress of [0, 0.3, 0.6, 0.9, 1]) expect(["diretoria", HIDEOUT, null]).toContain(shownAt(plan, progress));
    const back = planTravel({ cut: restCut(HIDEOUT), shown: HIDEOUT, moving: false, elevation: HIDEOUT_LEVEL * 3.4 }, "diretoria");
    expect(back.points.at(-1)).toBeCloseTo(restCut("diretoria"));
  });
});

describe("o interior", () => {
  it("tem salas próprias, cada uma achando o próprio centro", () => {
    const rooms = viewRooms(HIDEOUT);
    expect(rooms.length).toBe(5);
    for (const room of rooms) {
      expect(room.id.startsWith("esconderijo-")).toBe(true);
      expect(BUILDING_ROOMS_BY_ID[room.id]).toBe(room);
      expect(viewRoomAt(HIDEOUT, room.center.x, room.center.z)?.id).toBe(room.id);
    }
  });

  it("todo o conteúdo fixo fica dentro da torre e custa pouco", () => {
    const { minX, maxX, minZ, maxZ } = FLOOR_BOUNDS;
    const build = buildHideout();
    for (const [key, geometry] of build.fixed) {
      geometry.computeBoundingBox();
      const box: Box3 = geometry.boundingBox!;
      expect(box.min.x, key).toBeGreaterThanOrEqual(minX - 0.6);
      expect(box.max.x, key).toBeLessThanOrEqual(maxX + 0.6);
      expect(box.min.z, key).toBeGreaterThanOrEqual(minZ - 0.6);
      expect(box.max.z, key).toBeLessThanOrEqual(maxZ + 0.6);
      expect(box.max.y, key).toBeLessThanOrEqual(3.1);
    }
    expect(triangles(build.fixed as never)).toBeLessThan(25_000);
    expect(triangles(buildHideoutCar() as never)).toBeLessThan(2_000);
  });

  it("as peças do kit e a luz falsa ficam dentro da laje", () => {
    const { minX, maxX, minZ, maxZ } = FLOOR_BOUNDS;
    for (const item of HIDEOUT_KIT) {
      expect(item.x, item.node).toBeGreaterThanOrEqual(minX - 0.4);
      expect(item.x, item.node).toBeLessThanOrEqual(maxX + 0.4);
      expect(item.z, item.node).toBeGreaterThanOrEqual(minZ - 0.4);
      expect(item.z, item.node).toBeLessThanOrEqual(maxZ + 0.4);
    }
    for (const pool of HIDEOUT_GLOWS) {
      expect(pool.x).toBeGreaterThanOrEqual(minX);
      expect(pool.x).toBeLessThanOrEqual(maxX);
    }
    expect(HIDEOUT_KIT.length).toBeLessThan(80);
  });

  it("o carro cabe na plataforma, com uma roda em cada canto", () => {
    expect(CAR_WHEELS).toHaveLength(4);
    for (const [x, z] of CAR_WHEELS) expect(Math.hypot(x, z)).toBeLessThan(TURNTABLE.radius);
    const size = new Vector3();
    const whole = new Box3();
    for (const geometry of buildHideoutCar().values()) {
      geometry.computeBoundingBox();
      whole.union(geometry.boundingBox!);
    }
    whole.getSize(size);
    expect(size.z).toBeGreaterThan(4);
    expect(size.z).toBeLessThan(TURNTABLE.radius * 2);
    expect(size.y).toBeGreaterThan(1.3);
    // A aleta é o que faz a silhueta: mais alta que a cabine.
    expect(whole.max.y).toBeGreaterThan(1.5);
  });

  it("o morcego é cenário: peças do catálogo, fora de Pessoas, olhando os monitores", () => {
    const [figure, ...rest] = sceneryOfView(HIDEOUT);
    expect(rest).toEqual([]);
    expect(figure!.tag).toMatch(/cenário/);
    expect(figure!.gear).toBe("morcego");
    expect(figure!.chair).toBeNull();
    const { problems } = parsePreset(figure!.preset);
    expect(problems).toEqual([]);
    expect(viewRoomAt(HIDEOUT, figure!.spot.x, figure!.spot.z)?.id).toBe(figure!.roomId);
    expect(buildHideout().footprints.find((item) => figure!.spot.x > item.minX && figure!.spot.x < item.maxX && figure!.spot.z > item.minZ && figure!.spot.z < item.maxZ)).toBeUndefined();
  });

  it("o morcego, a capa e o capuz têm a forma esperada", () => {
    expect(BAT_OUTLINE.length).toBeGreaterThan(20);
    const emblem = batEmblemGeometry(1);
    emblem.computeBoundingBox();
    expect(emblem.boundingBox!.max.x).toBeCloseTo(0.5);
    expect(emblem.boundingBox!.min.x).toBeCloseTo(-0.5);
    const cowl = cowlGeometry(0.3);
    cowl.computeBoundingBox();
    // As orelhas passam do topo da cabeça.
    expect(cowl.boundingBox!.max.y).toBeGreaterThan(0.3 * 1.4);
    const cape = capeGeometry(0.6, 0.7);
    cape.computeBoundingBox();
    expect(cape.boundingBox!.min.y).toBeCloseTo(-0.7);
    expect(cape.boundingBox!.min.z).toBeLessThan(-0.1);
  });
});

describe("a passagem", () => {
  beforeEach(() => {
    useSecretStore.setState({ doorOpen: false, found: false, clockHint: false, file: 0, signal: false, engine: false, engineTurns: 0, coin: null, coinFlips: 0, activeSpot: null, announcement: "" });
  });

  it("a estante da Diretoria continua inteira, com o trecho que gira no lugar certo", () => {
    const directorate = buildDirectorate();
    const shelves = directorate.footprints.filter((item) => item.label === "estante");
    // Uma por seção; o trecho do meio aparece no mapa mesmo girando, para ninguém parar na frente dele.
    expect(shelves.filter((item) => item.minX < FLOOR_BOUNDS.minX + 1)).toHaveLength(3);
    const { body } = buildSecretShelf();
    expect(body.size).toBeGreaterThan(0);
    const box = new Box3();
    for (const geometry of body.values()) {
      geometry.computeBoundingBox();
      box.union(geometry.boundingBox!);
    }
    expect(box.max.z - box.min.z).toBeCloseTo(SECRET_SHELF.width, 1);
    expect(box.min.z).toBeGreaterThanOrEqual(-0.01);
    expect(box.max.y).toBeLessThanOrEqual(SECRET_SHELF.height + 0.1);
  });

  it("o livro primeiro abre; só o segundo gesto leva para baixo", () => {
    expect(useSecretStore.getState().activate("livro")).toBeNull();
    expect(useSecretStore.getState().doorOpen).toBe(true);
    expect(useSecretStore.getState().found).toBe(false);
    expect(useSecretStore.getState().activate("livro")).toBe("entrar");
  });

  it("entrar marca como achado e mantém aberta; ir para outro lugar fecha sem esquecer", () => {
    const { viewChanged } = useSecretStore.getState();
    viewChanged(HIDEOUT);
    expect(useSecretStore.getState()).toMatchObject({ found: true, doorOpen: true });
    viewChanged("diretoria");
    expect(useSecretStore.getState()).toMatchObject({ found: true, doorOpen: true });
    viewChanged("expansao-2");
    expect(useSecretStore.getState()).toMatchObject({ found: true, doorOpen: false });
  });

  it("a porta do esconderijo sempre volta, em qualquer estado", () => {
    expect(useSecretStore.getState().activate("porta")).toBe("sair");
    useSecretStore.setState({ doorOpen: true, found: true, signal: true });
    expect(useSecretStore.getState().activate("porta")).toBe("sair");
  });

  it("cada easter egg muda algo de verdade e a legenda acompanha; apertar de novo desfaz", () => {
    const get = () => useSecretStore.getState();
    get().activate("relogio");
    expect(get().clockHint).toBe(true);
    expect(secretCaption("relogio", get())).toBe("Meia-noite");
    get().activate("relogio");
    expect(get().clockHint).toBe(false);

    for (let index = 1; index <= TERMINAL_FILES; index += 1) {
      get().activate("terminal");
      expect(get().file).toBe(index % TERMINAL_FILES);
    }

    get().activate("holofote");
    expect(get().signal).toBe(true);
    get().activate("holofote");
    expect(get().signal).toBe(false);

    const turns = get().engineTurns;
    get().activate("carro");
    expect(get()).toMatchObject({ engine: true, engineTurns: turns + 1 });
    get().activate("carro");
    expect(get()).toMatchObject({ engine: false, engineTurns: turns + 1 });

    get().activate("moeda");
    expect(get()).toMatchObject({ coin: "cara", coinFlips: 1 });
    get().activate("moeda");
    expect(get()).toMatchObject({ coin: "coroa", coinFlips: 2 });
    expect(secretCaption("moeda", get())).toMatch(/Coroa/);
    expect(get().announcement).toMatch(/coroa/);
  });

  it("os segredos são só de dois andares, com ids únicos e nome que não entrega o que há atrás", () => {
    expect(new Set(SECRET_SPOTS.map((spot) => spot.id)).size).toBe(SECRET_SPOTS.length);
    expect(secretSpotsOf("diretoria").map((spot) => spot.id)).toEqual(["livro", "relogio"]);
    expect(secretSpotsOf("operacao")).toEqual([]);
    expect(secretSpotsOf("exterior")).toEqual([]);
    expect(secretSpotsOf(HIDEOUT).length).toBe(5);
    for (const spot of secretSpotsOf("diretoria")) expect(spot.label).not.toMatch(/morcego|batman|passagem|esconderijo/i);
  });
});

describe("proveniência do kit", () => {
  it("o arquivo servido é o que o registro diz, e só com licença CC0", () => {
    const record = JSON.parse(readFileSync("public/esconderijo/proveniencia.json", "utf8")) as { output: { file: string; sha256: string; bytes: number }; sources: Array<{ license: string; sha256: string; url: string; used: string[] }> };
    const file = readFileSync(`public/${record.output.file}`);
    expect(createHash("sha256").update(file).digest("hex")).toBe(record.output.sha256);
    expect(file.length).toBe(record.output.bytes);
    expect(file.length).toBeLessThan(500 * 1024);
    for (const source of record.sources) {
      expect(source.license).toBe("CC0-1.0");
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(source.used.length).toBeGreaterThan(0);
    }
  });

  it("toda peça que a cena pede está no registro", () => {
    const record = JSON.parse(readFileSync("public/esconderijo/proveniencia.json", "utf8")) as { sources: Array<{ used: string[] }> };
    const used = new Set(record.sources.flatMap((source) => source.used));
    for (const node of new Set([...HIDEOUT_KIT.map((item) => item.node), "wheel-dark", "Platform_Round1"])) {
      expect(used.has(node === "Chest_Armature" ? "Prop_Chest" : node === "Fan_Armature" ? "Prop_Fan_Small" : node), node).toBe(true);
    }
  });
});
