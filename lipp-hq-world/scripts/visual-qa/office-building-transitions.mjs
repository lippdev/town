#!/usr/bin/env node
/**
 * Prova da troca direta de andar: muda na mesma ação, sem escuro nem espera, sem recriar o Canvas
 * nem navegar, com seleção, teclado e recursos de GPU corretos.
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
/** Quadros até o andar novo estar inteiro em tela: mais que isso já seria espera visível. */
const MAX_FRAMES = 3;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: [`--use-angle=${angle}`, "--ignore-gpu-blocklist"] });
const checks = [];
const errors = [];
const check = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log(`  ok  ${name}`);
};

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/api/hq/**", (route) => route.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
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
  await page.goto(`${base}${DEMO}`);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 90000 });
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().bots.length > 0);
  // Tempo de abrir: a prova é de que a troca não espera, e não de que a primeira carga é instantânea.
  await page.waitForLoadState("networkidle");

  const state = () => page.evaluate(() => window.__HQ_OFFICE_QA__.state());
  const nameOf = (view) => ({ terreo: "andar-terreo", diretoria: "andar-diretoria", operacao: "office-fixed" })[view];

  /** Age e, na mesma tarefa, confere o estado; depois conta os quadros até o andar estar em tela. */
  const switchTo = (view, action) =>
    page.evaluate(async ({ view, action, mesh }) => {
      const qa = window.__HQ_OFFICE_QA__;
      const start = performance.now();
      if (action.startsWith("key:")) document.body.dispatchEvent(new KeyboardEvent("keydown", { key: action.slice(4), bubbles: true, cancelable: true }));
      else document.querySelector(action).click();
      const now = qa.state();
      const same = { view: now.buildingView, framed: Math.abs(now.view.x - now.goal.x) + Math.abs(now.view.z - now.goal.z) + Math.abs(now.view.zoom - now.goal.zoom), pending: "pendingView" in now };
      let frames = 0;
      const ready = () => (mesh ? qa.objectNamed(mesh) : !qa.objectNamed("office-fixed") && !qa.objectNamed("andar-terreo") && !qa.objectNamed("andar-diretoria")) && (view !== "operacao" || qa.state().rigs.length === qa.state().bots.length);
      while (!ready() && frames < 120) {
        await new Promise(requestAnimationFrame);
        frames += 1;
      }
      return { same, frames, ms: Math.round(performance.now() - start) };
    }, { view, action, mesh: nameOf(view) ?? null });
  const click = (view) => switchTo(view, `[data-floor-selector] [data-view="${view}"]`);
  const assertDirect = (result, view) => {
    assert.equal(result.same.view, view, "o andar não mudou na mesma ação");
    assert.equal(result.same.pending, false);
    assert.ok(result.same.framed < 1e-6, `câmera fora do lugar: ${result.same.framed}`);
    assert.ok(result.frames <= MAX_FRAMES, `${view} levou ${result.frames} quadros`);
  };

  await check("não existe mais escuro nem cobertura sobre a cena", async () => {
    assert.equal(await page.locator("[data-floor-fade], .office-floor-fade, [data-switching]").count(), 0);
    assert.equal(await page.evaluate(() => "pendingView" in window.__HQ_OFFICE_QA__.state()), false);
  });

  const timings = {};
  await check("o seletor troca na mesma ação, com o andar pronto em poucos quadros", async () => {
    for (const view of ["operacao", "terreo", "diretoria", "exterior", "diretoria", "operacao", "terreo"]) {
      const result = await click(view);
      assertDirect(result, view);
      (timings[view] ??= []).push(result);
      const url = new URL(page.url()).searchParams.get("andar");
      assert.equal(url, view);
    }
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
    for (const view of ["operacao", "diretoria", "exterior", "terreo", "operacao"]) assertDirect(await click(view), view);
    await page.keyboard.press("PageUp");
    await page.keyboard.press("PageDown");
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

  await check("PageUp e PageDown trocam na mesma tecla", async () => {
    await click("terreo");
    assertDirect(await switchTo("operacao", "key:PageUp"), "operacao");
    assertDirect(await switchTo("terreo", "key:PageDown"), "terreo");
  });

  await check("Esc com o andar inteiro sai do prédio na hora", async () => {
    assertDirect(await switchTo("exterior", "key:Escape"), "exterior");
  });

  await check("clicar num pavimento da fachada entra direto", async () => {
    const level = await page.evaluate(() => window.__HQ_OFFICE_QA__.levelPoint(1));
    await page.mouse.click(level.x, level.y);
    const now = await state();
    assert.equal(now.buildingView, "operacao");
    assert.equal(now.framing, "floor");
  });

  await check("escolher um bot, de fora do prédio, abre a sala dele já aberta e enquadrada", async () => {
    await click("exterior");
    const row = page.locator("[data-agent-row]").first();
    const botId = await row.getAttribute("data-agent-row");
    const result = await switchTo("operacao", `[data-agent-row="${botId}"]`);
    assertDirect(result, "operacao");
    const now = await state();
    assert.equal(now.selectedBotId, botId);
    assert.equal(now.framing, "room");
    assert.ok(now.focusedRoomId);
    await page.waitForSelector(`[data-demo-panel="${botId}"]`);
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.objectVisible("bot-selection-ring"));
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  });

  await check("escolher o chefe, de outro andar, leva à Diretoria com a gaveta dele", async () => {
    await click("terreo");
    const result = await switchTo("diretoria", '[data-person-row="chefe"]');
    assertDirect(result, "diretoria");
    const now = await state();
    assert.equal(now.selectedHumanId, "chefe");
    assert.equal(now.focusedRoomId, "sala-chefe");
    await page.waitForSelector('[data-human-panel="chefe"]');
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  });

  await check("o gesto logo depois da troca vale para o andar novo", async () => {
    const goal = await page.evaluate(() => {
      document.querySelector('[data-view="operacao"]').click();
      document.querySelector(".office-stage").dispatchEvent(new WheelEvent("wheel", { deltaY: -60, bubbles: true, cancelable: true, clientX: 700, clientY: 400 }));
      return window.__HQ_OFFICE_QA__.state();
    });
    assert.equal(goal.buildingView, "operacao");
    assert.equal(goal.framing, "free");
    await click("exterior");
  });

  await check("o teclado não mexe na cena por trás das áreas de trabalho", async () => {
    await click("operacao");
    for (const name of ["Kanban", "Conversas", "Equipe"]) {
      await page.locator(".office-sidebar-nav").getByRole("button", { name: new RegExp(`^${name}`) }).click();
      await page.evaluate(() => document.activeElement.blur());
      await page.keyboard.press("PageUp");
      await page.keyboard.press("Escape");
      assert.equal((await state()).buildingView, "operacao");
      await page.getByRole("button", { name: "Escritório", exact: true }).first().click();
    }
  });

  const memory = () => page.evaluate(() => ({ ...window.__gpuCounts(), geometries: window.__HQ_OFFICE_QA__.renderInfo().geometries }));
  const cycle = async () => { for (const view of ["terreo", "diretoria", "operacao"]) assertDirect(await click(view), view); };
  let before, after;
  const samples = [];
  await check("24 trocas seguidas, depois de aquecer, sem acúmulo na GPU", async () => {
    await cycle();
    await page.waitForTimeout(1500);
    before = await memory();
    for (let round = 0; round < 8; round += 1) {
      await cycle();
      await page.waitForTimeout(120);
      samples.push(await memory());
    }
    await page.waitForTimeout(500);
    after = await memory();
    assert.ok(after.framebuffers <= before.framebuffers, `framebuffers: ${JSON.stringify({ before, after })}`);
    assert.ok(after.textures <= before.textures + 2, `texturas: ${JSON.stringify({ before, after })}`);
    assert.ok(after.geometries <= before.geometries + 2, `geometrias: ${JSON.stringify({ before, after })}`);
  });

  await check("cliques em sequência, na mesma tarefa, ficam no último", async () => {
    const now = await page.evaluate(() => {
      for (const view of ["terreo", "exterior", "diretoria", "operacao", "terreo"]) document.querySelector(`[data-view="${view}"]`).click();
      return window.__HQ_OFFICE_QA__.state();
    });
    assert.equal(now.buildingView, "terreo");
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.objectNamed("andar-terreo"));
    assert.equal(await page.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("office-fixed") || window.__HQ_OFFICE_QA__.objectNamed("andar-diretoria")), false);
  });

  await check("a URL guarda o andar: recarregar de propósito volta a ele", async () => {
    assertDirect(await click("diretoria"), "diretoria");
    assert.equal(new URL(page.url()).searchParams.get("andar"), "diretoria");
    await page.reload();
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready");
    assert.equal((await state()).buildingView, "diretoria");
  });
  await context.close();

  await check("a frota real segue isolada: sem seletor, e nenhum atalho muda de andar", async () => {
    const liveContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await liveContext.route("**/api/hq/**", (route) => route.fulfill({ status: 503, body: "" }));
    const live = await liveContext.newPage();
    await live.goto(`${base}/?escritorio=completo&andar=diretoria`);
    await live.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 90000 });
    assert.equal(await live.locator("[data-floor-selector]").count(), 0);
    await live.keyboard.press("PageUp");
    await live.keyboard.press("Escape");
    assert.equal(await live.evaluate(() => window.__HQ_OFFICE_QA__.state().buildingView), "operacao");
    assert.equal(new URL(live.url()).searchParams.get("andar"), "diretoria", "a frota real não reescreve a URL");
    await liveContext.close();
  });

  assert.deepEqual(errors, []);
  writeFileSync(`${out}/resultado.json`, JSON.stringify({ checks, timings, before, samples, after, errors }, null, 2));
  console.log(JSON.stringify({ timings, before, after }));
  console.log(`\n${checks.length} verificações ok.`);
} finally {
  await browser.close();
}
