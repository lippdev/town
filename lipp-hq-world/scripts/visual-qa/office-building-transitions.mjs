#!/usr/bin/env node
/**
 * Prova da viagem entre andares: anima sem sair da tela, sem escuro, sem recriar o Canvas nem
 * navegar; muda de rota no meio sem fila; respeita o movimento reduzido; não acumula na GPU.
 *
 * Uso: HQ_URL=http://127.0.0.1:5231 node scripts/visual-qa/office-building-transitions.mjs [pasta]
 * Perfil novo e /api/hq bloqueado: não fala com Hermes nenhum nem toca no navegador de ninguém.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const angle = process.env.HQ_ANGLE ?? "metal";
const out = process.argv[2] ?? "qa/office-building-transitions";
const DEMO = "/?escritorio=completo&modo=demonstracao";
const FLOORS = (process.env.HQ_FLOORS ?? "terreo,operacao,diretoria").split(",");
/** Tempo da viagem. O teto folga por causa da carga do harness: o relógio da cena limita o passo. */
const MIN_MS = 430;
const MAX_MS = 1100;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: [`--use-angle=${angle}`, "--ignore-gpu-blocklist"] });
const checks = [];
const errors = [];
const check = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log(`  ok  ${name}`);
};
const newPage = async (options = {}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await context.route("**/api/hq/**", (route) => route.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  return page;
};
const ready = async (page, url = DEMO) => {
  await page.goto(`${base}${url}`);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 90000 });
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().bots.length > 0);
  await page.waitForLoadState("networkidle");
};

/** Olha o quadro de verdade: quanto da imagem é só o fundo vazio, sem cena nenhuma. */
const measureEmpty = async (data) => {
  const image = new Image();
  image.src = `data:image/png;base64,${data}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const { data: pixels } = context.getImageData(0, 0, image.width, image.height);
  let empty = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (Math.abs(pixels[index] - 17) + Math.abs(pixels[index + 1] - 24) + Math.abs(pixels[index + 2] - 40) < 8 || pixels[index] + pixels[index + 1] + pixels[index + 2] < 12) empty += 1;
  }
  return empty / (pixels.length / 4);
};
const emptyShare = async (page, width = 1440, height = 900) => {
  const png = (await page.screenshot({ clip: { x: 240, y: 0, width: width - 240, height } })).toString("base64");
  return page.evaluate(measureEmpty, png);
};
const landscape = {};

try {
  const page = await newPage();
  let documents = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents += 1;
  });
  await page.addInitScript(() => {
    const live = { textures: new Set(), framebuffers: new Set() };
    for (const [create, destroy, key] of [["createTexture", "deleteTexture", "textures"], ["createFramebuffer", "deleteFramebuffer", "framebuffers"]]) {
      const proto = WebGL2RenderingContext.prototype;
      const originalCreate = proto[create], originalDestroy = proto[destroy];
      proto[create] = function (...args) { const value = originalCreate.apply(this, args); if (value) live[key].add(value); return value; };
      proto[destroy] = function (value) { live[key].delete(value); return originalDestroy.call(this, value); };
    }
    window.__gpuCounts = () => ({ textures: live.textures.size, framebuffers: live.framebuffers.size });
  });
  await ready(page);

  const state = () => page.evaluate(() => window.__HQ_OFFICE_QA__.state());
  const arrived = () => page.waitForFunction(() => !window.__HQ_OFFICE_QA__.state().traveling, null, { timeout: 15000 });

  /** Age e registra cada quadro até chegar; devolve o que a tela e o estado fizeram. */
  const trip = (action) =>
    page.evaluate(async (action) => {
      const qa = window.__HQ_OFFICE_QA__;
      const start = performance.now();
      if (action.startsWith("key:")) document.body.dispatchEvent(new KeyboardEvent("keydown", { key: action.slice(4), bubbles: true, cancelable: true }));
      else document.querySelector(action).click();
      const first = qa.state();
      const frames = [];
      while (qa.state().traveling && frames.length < 600) {
        await new Promise(requestAnimationFrame);
        const now = qa.state();
        frames.push({ t: performance.now() - start, ...now.travel, shown: now.shownFloor, x: now.view.x, z: now.view.z, zoom: now.view.zoom });
      }
      const last = qa.state();
      return { first: { view: first.buildingView, traveling: first.traveling, url: new URL(location.href).searchParams.get("andar") }, frames, ms: performance.now() - start, end: { view: last.buildingView, mounted: last.mountedFloors, shown: last.shownFloor, away: Math.abs(last.view.x - last.goal.x) + Math.abs(last.view.z - last.goal.z) + Math.abs(last.view.zoom - last.goal.zoom), travel: last.travel } };
    }, action);
  const click = (view) => trip(`[data-floor-selector] [data-view="${view}"]`);

  /** A viagem é um movimento só: partiu, teve quadros no caminho, sem salto, e chegou exata. */
  const assertSmooth = (result, view) => {
    assert.equal(result.first.view, view, "o destino não valeu na mesma ação");
    assert.equal(result.first.traveling, true);
    assert.ok(result.ms >= MIN_MS && result.ms <= MAX_MS, `${view} levou ${Math.round(result.ms)} ms`);
    assert.ok(result.frames.length >= 8, `só ${result.frames.length} quadros`);
    const moving = result.frames.slice(1, -1);
    const middle = moving.filter(({ progress }) => progress > 0.05 && progress < 0.95);
    assert.ok(middle.length >= 3, "sem quadro no meio do caminho");
    for (let index = 1; index < result.frames.length; index += 1) {
      const a = result.frames[index - 1];
      const b = result.frames[index];
      // Sem salto: em pixels da tela, um passo nunca é a viagem inteira de uma vez.
      const scale = Math.max(a.zoom, b.zoom);
      const stepPx = (Math.abs(a.elevation - b.elevation) * 0.87 + Math.hypot(a.x - b.x, a.z - b.z)) * scale;
      assert.ok(stepPx < 620, `salto de ${Math.round(stepPx)} px no quadro ${index}`);
      assert.ok(b.progress >= a.progress - 1e-9, "o progresso voltou");
      // O andar à mostra só troca com a laje fechada.
      if (a.shown !== b.shown) assert.ok(a.plate > 0.95 || b.plate > 0.95, `troca à vista: ${a.plate}/${b.plate}`);
    }
    assert.equal(result.end.view, view);
    assert.ok(result.end.away < 1e-6, `parou fora do destino: ${result.end.away}`);
    assert.deepEqual(result.end.mounted, view === "exterior" ? [] : [view]);
    assert.equal(result.end.shown, view === "exterior" ? null : view);
  };

  await check("não há cobertura sobre a cena, e a câmera ainda não chegou na mesma ação", async () => {
    assert.equal(await page.locator("[data-floor-fade], .office-floor-fade, [data-switching]").count(), 0);
    const now = await page.evaluate(() => {
      const before = window.__HQ_OFFICE_QA__.state().view;
      document.querySelector('[data-view="operacao"]').click();
      const after = window.__HQ_OFFICE_QA__.state();
      return { before, after };
    });
    assert.equal(now.after.buildingView, "operacao");
    assert.equal(now.after.traveling, true);
    assert.deepEqual(now.after.view, now.before);
    await arrived();
  });

  const timings = {};
  await check("cada trajeto é um movimento suave e termina exato no enquadramento", async () => {
    await click("exterior");
    const route = ["exterior", ...FLOORS, ...[...FLOORS].reverse().slice(1), "exterior", FLOORS.at(-1), "exterior", FLOORS[0]];
    for (let index = 1; index < route.length; index += 1) {
      const view = route[index];
      const result = await click(view);
      assertSmooth(result, view);
      const gaps = result.frames.slice(1).map((frame, gap) => frame.t - result.frames[gap].t).sort((a, b) => a - b);
      (timings[`${route[index - 1]}>${view}`] ??= []).push({ ms: Math.round(result.ms), frames: result.frames.length, medianFrameMs: Math.round(gaps[gaps.length >> 1]), worstFrameMs: Math.round(gaps.at(-1)) });
      assert.equal(new URL(page.url()).searchParams.get("andar"), view);
    }
  });

  await check("a tela nunca fica vazia nem escura em nenhum ponto do caminho", async () => {
    for (const [from, to] of [["exterior", FLOORS.at(-1)], [FLOORS.at(-1), FLOORS[0]], [FLOORS[0], FLOORS[1]], [FLOORS[1], "exterior"]]) {
      await click(from);
      await page.waitForTimeout(200);
      for (const fraction of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        await page.evaluate((value) => window.__HQ_OFFICE_QA__.holdTravel(value), fraction);
        if (fraction === 0.1) await page.click(`[data-floor-selector] [data-view="${to}"]`);
        await page.waitForTimeout(120);
        const empty = await emptyShare(page);
        assert.ok(empty < 0.02, `${from}>${to} em ${fraction}: ${(empty * 100).toFixed(1)}% vazio`);
      }
      await page.evaluate(() => window.__HQ_OFFICE_QA__.holdTravel(null));
      await arrived();
    }
  });

  await check("na viagem, rótulos saem do Tab e a cena não responde; o painel responde", async () => {
    await click("operacao");
    await page.evaluate(() => window.__HQ_OFFICE_QA__.holdTravel(0.4));
    await page.click('[data-floor-selector] [data-view="terreo"]');
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".office-labels")).visibility), "hidden");
    const before = await state();
    await page.mouse.move(800, 500);
    await page.mouse.wheel(0, -400);
    await page.mouse.down();
    await page.mouse.move(900, 600);
    await page.mouse.up();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("+");
    const during = await state();
    assert.equal(during.framing, "floor", "um gesto escapou");
    assert.deepEqual(during.goal, before.goal, "a chegada mudou");
    assert.equal(during.hoveredRoomId ?? null, null);
    // O painel segue valendo: pedir outro andar no meio funciona, mesmo congelado.
    await page.click('[data-floor-selector] [data-view="diretoria"]');
    assert.equal((await state()).buildingView, "diretoria");
    await page.evaluate(() => window.__HQ_OFFICE_QA__.holdTravel(null));
    await arrived();
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".office-labels")).visibility), "visible");
    await page.mouse.move(800, 500);
    await page.mouse.wheel(0, -200);
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().framing === "free");
  });

  await check("o Canvas e o resto da tela seguem os mesmos; nada navega nem recarrega", async () => {
    await page.evaluate(() => {
      window.__markCanvas = document.querySelector(".office-stage canvas");
      window.__markStage = document.querySelector(".office-stage");
      window.__markHud = document.querySelector("[data-floor-selector]");
      window.__markGl = window.__markCanvas.getContext("webgl2");
      window.__sameDocument = performance.timeOrigin;
    });
    const before = documents;
    const length = await page.evaluate(() => history.length);
    for (const view of ["operacao", "diretoria", "exterior", "terreo", "operacao"]) assertSmooth(await click(view), view);
    await page.keyboard.press("PageUp");
    await page.keyboard.press("PageDown");
    await arrived();
    const same = await page.evaluate(() => ({
      canvas: document.querySelector(".office-stage canvas") === window.__markCanvas,
      stage: document.querySelector(".office-stage") === window.__markStage,
      hud: document.querySelector("[data-floor-selector]") === window.__markHud,
      gl: !window.__markGl.isContextLost(),
      time: window.__sameDocument === performance.timeOrigin,
      navigations: performance.getEntriesByType("navigation").length,
    }));
    assert.deepEqual(same, { canvas: true, stage: true, hud: true, gl: true, time: true, navigations: 1 });
    assert.equal(documents, before, "houve navegação");
    assert.equal(await page.evaluate(() => history.length), length, "o histórico cresceu");
  });

  await check("PageUp, PageDown e Esc viajam do mesmo jeito", async () => {
    await click("terreo");
    const up = await trip("key:PageUp");
    assert.notEqual(up.first.view, "terreo");
    assertSmooth(up, up.first.view);
    assertSmooth(await trip("key:PageDown"), "terreo");
    assertSmooth(await trip("key:Escape"), "exterior");
  });

  await check("clicar num pavimento da fachada entra pelo mesmo caminho", async () => {
    const level = await page.evaluate(() => window.__HQ_OFFICE_QA__.levelPoint(1));
    await page.mouse.move(level.x, level.y);
    await page.waitForFunction(() => document.querySelector(".office-floor-tag"));
    await page.mouse.click(level.x, level.y);
    const now = await state();
    assert.equal(now.buildingView, "operacao");
    assert.equal(now.traveling, true);
    assert.equal(await page.locator(".office-floor-tag").count(), 0, "o hover do andar ficou");
    await arrived();
    assert.equal((await state()).framing, "floor");
  });

  await check("escolher um bot, de fora do prédio, chega na sala dele com a gaveta aberta", async () => {
    await click("exterior");
    const row = page.locator("[data-agent-row]").first();
    const botId = await row.getAttribute("data-agent-row");
    const result = await trip(`[data-agent-row="${botId}"]`);
    assert.equal(result.first.view, "operacao");
    assert.ok(result.end.away < 1e-6);
    const now = await state();
    assert.equal(now.selectedBotId, botId);
    assert.equal(now.framing, "room");
    await page.waitForSelector(`[data-demo-panel="${botId}"]`);
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.objectVisible("bot-selection-ring"));
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  });

  await check("escolher o chefe, de outro andar, leva à Diretoria com a gaveta dele", async () => {
    await click("terreo");
    const result = await trip('[data-person-row="chefe"]');
    assert.equal(result.first.view, "diretoria");
    const now = await state();
    assert.equal(now.selectedHumanId, "chefe");
    assert.equal(now.focusedRoomId, "sala-chefe");
    await page.waitForSelector('[data-human-panel="chefe"]');
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  });

  await check("redimensionar no meio chega no enquadramento do tamanho novo", async () => {
    await click("operacao");
    await page.evaluate(() => window.__HQ_OFFICE_QA__.holdTravel(0.5));
    await page.click('[data-floor-selector] [data-view="exterior"]');
    await page.waitForTimeout(120);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__HQ_OFFICE_QA__.holdTravel(null));
    await arrived();
    const spire = await page.evaluate(() => window.__HQ_OFFICE_QA__.spirePoint());
    assert.ok(spire.y >= 40 && spire.y < 390 && spire.x > 0 && spire.x < 844, `coroa fora: ${JSON.stringify(spire)}`);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(250);
  });

  await check("paisagem e tela larga: a coroa cabe parada e a tela não fica vazia no caminho", async () => {
    await click("exterior");
    for (const [width, height] of [[844, 390], [1920, 600], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(300);
      const spire = await page.evaluate(() => window.__HQ_OFFICE_QA__.spirePoint());
      assert.ok(spire.y >= 40 && spire.y < height && spire.x > 0 && spire.x < width, `${width}x${height}: coroa em ${JSON.stringify(spire)}`);
      const shares = [];
      for (const fraction of [0.2, 0.5, 0.8]) {
        await page.evaluate((value) => window.__HQ_OFFICE_QA__.holdTravel(value), fraction);
        if (fraction === 0.2) await page.evaluate(() => document.querySelector('[data-view="diretoria"]').click());
        await page.waitForTimeout(150);
        const clipX = width > 900 ? 240 : 0;
        const png = (await page.screenshot({ clip: { x: clipX, y: 52, width: width - clipX, height: height - 52 } })).toString("base64");
        shares.push(await page.evaluate(measureEmpty, png));
      }
      await page.evaluate(() => window.__HQ_OFFICE_QA__.holdTravel(null));
      await arrived();
      // A coroa inteira vale mais que a cidade nestes formatos: o fundo pode aparecer um pouco, sem dominar.
      assert.ok(shares.every((share) => share < 0.2), `${width}x${height}: ${shares.map((share) => (share * 100).toFixed(1))}% vazio`);
      landscape[`${width}x${height}`] = shares.map((share) => Number((share * 100).toFixed(1)));
      await click("exterior");
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(250);
  });

  const memory = () => page.evaluate(() => ({ ...window.__gpuCounts(), geometries: window.__HQ_OFFICE_QA__.renderInfo().geometries }));
  const cycle = async () => { for (const view of [...FLOORS, "exterior"].slice(0, 3)) await click(view); };
  let before, after;
  const samples = [];
  await check("24 viagens seguidas, depois de aquecer, sem acúmulo na GPU", async () => {
    await cycle();
    await page.waitForTimeout(1500);
    before = await memory();
    for (let round = 0; round < 8; round += 1) {
      await cycle();
      samples.push(await memory());
    }
    await page.waitForTimeout(500);
    after = await memory();
    assert.ok(after.framebuffers <= before.framebuffers, `framebuffers: ${JSON.stringify({ before, after })}`);
    assert.ok(after.textures <= before.textures + 2, `texturas: ${JSON.stringify({ before, after })}`);
    assert.ok(after.geometries <= before.geometries + 2, `geometrias: ${JSON.stringify({ before, after })}`);
  });

  await check("cliques na mesma tarefa ficam no último, sem fila", async () => {
    const now = await page.evaluate(() => {
      for (const view of ["terreo", "exterior", "diretoria", "operacao", "terreo"]) document.querySelector(`[data-view="${view}"]`).click();
      return window.__HQ_OFFICE_QA__.state();
    });
    assert.equal(now.buildingView, "terreo");
    await arrived();
    const end = await state();
    assert.deepEqual(end.mountedFloors, ["terreo"]);
    assert.equal(await page.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("office-fixed") || window.__HQ_OFFICE_QA__.objectNamed("andar-diretoria")), false);
  });

  await check("trocar de rota no meio redireciona do ponto em que está, sem voltar a saltar", async () => {
    await click("operacao");
    const result = await page.evaluate(async () => {
      const qa = window.__HQ_OFFICE_QA__;
      const frames = [];
      const start = performance.now();
      const watch = async (until) => {
        while (performance.now() - start < until) {
          await new Promise(requestAnimationFrame);
          const now = qa.state();
          frames.push({ t: performance.now() - start, zoom: now.view.zoom, x: now.view.x, z: now.view.z, elevation: now.travel.elevation });
        }
      };
      document.querySelector('[data-view="diretoria"]').click();
      await watch(180);
      document.querySelector('[data-view="exterior"]').click();
      await watch(320);
      document.querySelector('[data-view="terreo"]').click();
      const askedAt = performance.now() - start;
      while (qa.state().traveling) {
        await new Promise(requestAnimationFrame);
        const now = qa.state();
        frames.push({ t: performance.now() - start, zoom: now.view.zoom, x: now.view.x, z: now.view.z, elevation: now.travel.elevation });
      }
      return { frames, askedAt, done: performance.now() - start, end: qa.state() };
    });
    assert.equal(result.end.buildingView, "terreo");
    assert.deepEqual(result.end.mountedFloors, ["terreo"]);
    assert.ok(result.done - result.askedAt < MAX_MS, `levou ${result.done - result.askedAt} ms depois do último pedido`);
    for (let index = 1; index < result.frames.length; index += 1) {
      const a = result.frames[index - 1];
      const b = result.frames[index];
      assert.ok(Math.abs(a.elevation - b.elevation) * Math.max(a.zoom, b.zoom) < 620, `salto no quadro ${index}`);
    }
    // Nada de cronômetro sobrando: parada, a câmera fica parada.
    const view = result.end.view;
    await page.waitForTimeout(700);
    assert.deepEqual((await state()).view, view);
  });

  await check("quatro pedidos a cada 100 ms terminam no último, a partir de onde já estava", async () => {
    await click("operacao");
    const end = await page.evaluate(async (views) => {
      const qa = window.__HQ_OFFICE_QA__;
      for (const view of views) {
        document.querySelector(`[data-view="${view}"]`).click();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const middle = qa.state().travel.progress;
      while (qa.state().traveling) await new Promise(requestAnimationFrame);
      return { middle, state: qa.state() };
    }, ["diretoria", "terreo", "exterior", "diretoria"]);
    assert.equal(end.state.buildingView, "diretoria");
    assert.deepEqual(end.state.mountedFloors, ["diretoria"]);
    assert.ok(Math.abs(end.state.view.zoom - end.state.goal.zoom) < 1e-6);
  });

  await check("voltar ao andar de saída no meio só desfaz o caminho", async () => {
    await click("diretoria");
    const end = await page.evaluate(async () => {
      const qa = window.__HQ_OFFICE_QA__;
      document.querySelector('[data-view="terreo"]').click();
      await new Promise((resolve) => setTimeout(resolve, 70));
      document.querySelector('[data-view="diretoria"]').click();
      const shownBack = [];
      while (qa.state().traveling) {
        await new Promise(requestAnimationFrame);
        shownBack.push(qa.state().shownFloor);
      }
      return { state: qa.state(), shownBack };
    });
    assert.equal(end.state.buildingView, "diretoria");
    assert.deepEqual(end.state.mountedFloors, ["diretoria"]);
    assert.ok(end.shownBack.every((floor) => floor === "diretoria"), `outro andar apareceu: ${[...new Set(end.shownBack)]}`);
  });

  await check("a URL guarda o andar: recarregar de propósito volta a ele, parado", async () => {
    await click("diretoria");
    assert.equal(new URL(page.url()).searchParams.get("andar"), "diretoria");
    await page.reload();
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready");
    const now = await state();
    assert.equal(now.buildingView, "diretoria");
    assert.equal(now.traveling, false);
  });
  await page.context().close();

  await check("movimento reduzido: a troca é na hora, sem nenhum quadro no caminho", async () => {
    const calm = await newPage({ reducedMotion: "reduce" });
    await ready(calm);
    for (const view of ["operacao", "diretoria", "exterior", "terreo"]) {
      const now = await calm.evaluate((target) => {
        document.querySelector(`[data-view="${target}"]`).click();
        return window.__HQ_OFFICE_QA__.state();
      }, view);
      assert.equal(now.buildingView, view);
      assert.equal(now.traveling, false);
      assert.deepEqual(now.view, now.goal);
      assert.deepEqual(now.mountedFloors, view === "exterior" ? [] : [view]);
      await calm.waitForTimeout(150);
    }
    await calm.context().close();
  });

  await check("a frota real segue isolada: sem seletor, sem viagem, e nenhum atalho muda de andar", async () => {
    const live = await newPage();
    await ready(live, "/?escritorio=completo&andar=diretoria").catch(() => undefined);
    await live.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 90000 });
    assert.equal(await live.locator("[data-floor-selector]").count(), 0);
    await live.keyboard.press("PageUp");
    await live.keyboard.press("Escape");
    const now = await live.evaluate(() => window.__HQ_OFFICE_QA__.state());
    assert.equal(now.buildingView, "operacao");
    assert.equal(now.traveling, false);
    assert.equal(await live.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("fachada") || window.__HQ_OFFICE_QA__.objectNamed("laje-do-corte")), false);
    assert.equal(new URL(live.url()).searchParams.get("andar"), "diretoria", "a frota real não reescreve a URL");
    await live.context().close();
  });

  assert.deepEqual(errors, []);
  writeFileSync(`${out}/resultado.json`, JSON.stringify({ checks, timings, landscape, before, samples, after, errors }, null, 2));
  console.log(JSON.stringify({ timings, landscape, before, after }));
  console.log(`\n${checks.length} verificações ok.`);
} finally {
  await browser.close();
}
