#!/usr/bin/env node
/**
 * Prova dos quatro andares de expansão: chega-se a eles por seletor, tecla, fachada e URL; têm salas
 * e etiqueta dizendo que são cenário; os figurantes só existem no andar à mostra, fora de Pessoas e
 * do clique; e ir e vir não acumula na GPU.
 *
 * Uso: HQ_URL=http://127.0.0.1:5231 node scripts/visual-qa/office-building-expansion.mjs [pasta]
 * Perfil novo e /api/hq bloqueado: não fala com Hermes nenhum nem toca no navegador de ninguém.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const out = process.argv[2] ?? "qa/office-building-expansion";
const DEMO = "/?escritorio=completo&modo=demonstracao&chegada=carro";
const FLOORS = [2, 3, 4, 5].map((level) => ({ id: `expansao-${level}`, level }));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: [`--use-angle=${process.env.HQ_ANGLE ?? "metal"}`, "--ignore-gpu-blocklist"] });
const checks = [];
const errors = [];
const check = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log(`  ok  ${name}`);
};
const open = async (url, options = {}, init) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await context.route("**/api/hq/**", (route) => route.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  if (init) await page.addInitScript(init);
  await page.goto(`${base}${url}`);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 90000 });
  return page;
};
const state = (page) => page.evaluate(() => window.__HQ_OFFICE_QA__.state());
const arrived = (page) => page.waitForFunction(() => !window.__HQ_OFFICE_QA__.state().traveling, null, { timeout: 15000 });
const go = async (page, view) => {
  await page.click(`[data-floor-selector] [data-view="${view}"]`);
  await arrived(page);
};
/** Só os figurantes deste andar: nem robô, nem pessoa, nem gente de outro andar, nem etiqueta sem pedir. */
const assertOnlyCast = async (page, id) => {
  await page.mouse.move(4, 4);
  await page.waitForFunction((floor) => {
    const { scenery } = window.__HQ_OFFICE_QA__.state();
    return scenery.length >= 3 && scenery.every((person) => person.id.startsWith(`${floor}-`));
  }, id, { timeout: 15000 });
  const now = await state(page);
  assert.deepEqual(now.rigs, [], `${id}: robô fantasma`);
  assert.ok(now.scenery.length <= 5, `${id}: ${now.scenery.length} figurantes`);
  assert.equal(new Set(now.scenery.map((person) => person.id)).size, now.scenery.length, `${id}: figurante duplicado`);
  assert.deepEqual(now.humans.filter((human) => human.mounted).map((human) => human.id), [], `${id}: pessoa fantasma`);
  assert.equal(await page.locator(".office-labels [data-bot], .office-labels [data-human], .office-labels [data-scenery]").count(), 0, `${id}: etiqueta sem pedir`);
};

try {
  const page = await open(DEMO, {}, () => {
    const live = { textures: new Set(), framebuffers: new Set() };
    for (const [create, destroy, key] of [["createTexture", "deleteTexture", "textures"], ["createFramebuffer", "deleteFramebuffer", "framebuffers"]]) {
      const proto = WebGL2RenderingContext.prototype;
      const originalCreate = proto[create], originalDestroy = proto[destroy];
      proto[create] = function (...args) { const value = originalCreate.apply(this, args); if (value) live[key].add(value); return value; };
      proto[destroy] = function (value) { live[key].delete(value); return originalDestroy.call(this, value); };
    }
    window.__gpuCounts = () => ({ textures: live.textures.size, framebuffers: live.framebuffers.size });
  });
  await page.waitForLoadState("networkidle");
  const costs = {};

  await check("o seletor leva a cada andar, com salas, placa e etiqueta de cenário, e só os figurantes dele", async () => {
    for (const { id, level } of FLOORS) {
      await go(page, id);
      await page.waitForFunction((name) => window.__HQ_OFFICE_QA__.objectNamed(name), `andar-${id}`);
      await assertOnlyCast(page, id);
      const rooms = await page.locator(".office-labels [data-room]").evaluateAll((nodes) => nodes.map((node) => node.dataset.room));
      assert.ok(rooms.length >= 4, `${id}: ${rooms}`);
      for (const room of rooms) assert.ok(room.startsWith(`${id}-`), `${room} sem o andar na frente`);
      assert.match(await page.textContent(`[data-floor-title="${id}"]`), new RegExp(`Expansão · andar ${level} · cenário simulado`));
      assert.equal(new URL(page.url()).searchParams.get("andar"), id);
      await page.mouse.move(4, 4);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(out, `${id}.png`) });
      costs[id] = await page.evaluate(() => {
        const { calls, triangles } = window.__HQ_OFFICE_QA__.renderInfo();
        return { calls, triangles };
      });
    }
  });

  await check("figurante não entra em Pessoas, não abre gaveta e não troca de sala por conta própria", async () => {
    for (const { id } of FLOORS) {
      await go(page, id);
      await assertOnlyCast(page, id);
      const people = await page.locator("[data-people]").innerText().catch(() => "");
      assert.ok(!/figurante/i.test(people), `${id}: figurante em Pessoas: ${people}`);
      const cast = (await state(page)).scenery;
      for (const person of cast) {
        const point = await page.evaluate((target) => window.__HQ_OFFICE_QA__.sceneryPoint(target), person.id);
        await page.mouse.click(point.x, point.y);
        const after = await state(page);
        assert.equal(after.selectedHumanId, null, `${person.id} abriu pessoa`);
        assert.equal(after.selectedBotId, null, `${person.id} abriu bot`);
        // Clicar nela é clicar no chão atrás dela: no máximo foca a sala. Já no andar inteiro, Esc sairia do prédio.
        if (after.framing !== "floor") await page.keyboard.press("Escape");
        await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().framing === "floor");
        await page.waitForTimeout(350);
        assert.equal((await state(page)).buildingView, id);
      }
      assert.equal(await page.locator("[data-human-panel], [data-demo-panel]").count(), 0, `${id}: abriu gaveta`);
    }
  });

  await check("a etiqueta de figurante só aparece com a sala em foco", async () => {
    const { id } = FLOORS[0];
    await go(page, id);
    await assertOnlyCast(page, id);
    const room = `${id}-bancadas`;
    const point = await page.evaluate((target) => window.__HQ_OFFICE_QA__.roomPoint(target, 0.2, 0.2), room);
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction((target) => window.__HQ_OFFICE_QA__.state().focusedRoomId === target, room);
    await page.waitForSelector(".office-labels [data-scenery]");
    const tags = await page.locator(".office-labels [data-scenery]").allTextContents();
    assert.equal(tags.length, 3, tags.join());
    for (const tag of tags) assert.equal(tag, "Figurante · cenário");
    await page.keyboard.press("Escape");
  });

  await check("clicar numa sala aproxima e abre o rótulo dela; clicar não abre gaveta", async () => {
    for (const { id } of FLOORS) {
      await go(page, id);
      const room = await page.locator(".office-labels [data-room]").nth(1).getAttribute("data-room");
      const point = await page.evaluate((target) => window.__HQ_OFFICE_QA__.roomPoint(target, 0.2, 0.2), room);
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction((target) => window.__HQ_OFFICE_QA__.state().focusedRoomId === target, room);
      assert.equal(await page.locator("[data-human-panel], [data-demo-panel]").count(), 0, `${id}: abriu gaveta`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(out, `${id}-sala.png`) });
      await page.keyboard.press("Escape");
      assert.equal((await state(page)).framing, "floor");
    }
  });

  await check("a fachada reconhece os quatro, e os pavimentos decorativos seguem sem resposta", async () => {
    await go(page, "exterior");
    for (const level of [6, 9, 12]) {
      const point = await page.evaluate((target) => window.__HQ_OFFICE_QA__.levelPoint(target), level);
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(150);
      assert.equal((await state(page)).buildingView, "exterior", `pavimento ${level} respondeu`);
    }
    for (const { id, level } of FLOORS) {
      await go(page, "exterior");
      await page.waitForTimeout(500);
      const point = await page.evaluate((target) => window.__HQ_OFFICE_QA__.levelPoint(target), level);
      await page.mouse.move(point.x, point.y);
      await page.waitForFunction(() => document.querySelector(".office-floor-tag"));
      assert.match(await page.textContent(".office-floor-tag"), new RegExp(`andar ${level}`));
      await page.mouse.click(point.x, point.y);
      assert.equal((await state(page)).buildingView, id, `pavimento ${level}`);
      await arrived(page);
      await assertOnlyCast(page, id);
    }
  });

  await check("PageUp e PageDown passam por todos, na ordem do prédio", async () => {
    await go(page, "exterior");
    await page.mouse.move(4, 4);
    const visited = [];
    for (let step = 0; step < 7; step += 1) {
      await page.keyboard.press("PageDown");
      await arrived(page);
      visited.push((await state(page)).buildingView);
    }
    assert.deepEqual(visited, ["diretoria", "expansao-5", "expansao-4", "expansao-3", "expansao-2", "operacao", "terreo"]);
  });

  await check("trocas rápidas entre eles terminam no último, com um andar só montado", async () => {
    const end = await page.evaluate(async (ids) => {
      const qa = window.__HQ_OFFICE_QA__;
      for (const id of ids) {
        document.querySelector(`[data-view="${id}"]`).click();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      while (qa.state().traveling) await new Promise(requestAnimationFrame);
      return qa.state();
    }, ["expansao-5", "operacao", "expansao-2", "expansao-4"]);
    assert.equal(end.buildingView, "expansao-4");
    assert.deepEqual(end.mountedFloors, ["expansao-4"]);
    assert.deepEqual(end.rigs, []);
    assert.ok(end.scenery.every((person) => person.id.startsWith("expansao-4-")), `figurante de outro andar: ${end.scenery.map((person) => person.id)}`);
    assert.equal(await page.evaluate(() => ["office-fixed", "andar-expansao-2", "andar-expansao-5"].some((name) => window.__HQ_OFFICE_QA__.objectNamed(name))), false);
  });

  let before, after;
  const samples = [];
  await check("28 viagens passando pelas expansões, depois de aquecer, sem acúmulo na GPU", async () => {
    const memory = () => page.evaluate(() => ({ ...window.__gpuCounts(), geometries: window.__HQ_OFFICE_QA__.renderInfo().geometries }));
    const round = ["expansao-2", "expansao-3", "operacao", "expansao-4", "expansao-5", "terreo", "exterior"];
    for (const view of round) await go(page, view);
    await page.waitForTimeout(1500);
    before = await memory();
    for (let lap = 0; lap < 4; lap += 1) {
      for (const view of round) await go(page, view);
      samples.push(await memory());
    }
    await page.waitForTimeout(500);
    after = await memory();
    assert.ok(after.framebuffers <= before.framebuffers, `framebuffers: ${JSON.stringify({ before, after })}`);
    assert.ok(after.textures <= before.textures + 2, `texturas: ${JSON.stringify({ before, after })}`);
    assert.ok(after.geometries <= before.geometries + 2, `geometrias: ${JSON.stringify({ before, after })}`);
  });
  await page.context().close();

  await check("a URL abre direto no andar, parado, e só monta o que está em tela", async () => {
    const direct = await open(`${DEMO}&andar=expansao-3`);
    const now = await state(direct);
    assert.equal(now.buildingView, "expansao-3");
    assert.equal(now.traveling, false);
    assert.deepEqual(now.mountedFloors, ["expansao-3"]);
    assert.equal(await direct.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("andar-expansao-2") || window.__HQ_OFFICE_QA__.objectNamed("andar-expansao-5")), false);
    await direct.context().close();
  });

  await check("celular em paisagem e em pé: seletor cabe, e todo botão dá para tocar", async () => {
    for (const [width, height] of [[844, 390], [390, 844]]) {
      const phone = await open(DEMO, { viewport: { width, height }, hasTouch: true, isMobile: true });
      const box = await phone.locator("[data-floor-selector]").boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= height, `${width}x${height}: ${JSON.stringify(box)}`);
      for (const { id } of FLOORS) {
        await phone.tap(`[data-floor-selector] [data-view="${id}"]`);
        await arrived(phone);
        const button = await phone.locator(`[data-view="${id}"]`).boundingBox();
        assert.ok(button.width >= 20 && button.height >= 24, `botão de ${id} pequeno: ${JSON.stringify(button)}`);
      }
      await phone.waitForTimeout(400);
      await phone.screenshot({ path: path.join(out, `celular-${width}.png`) });
      await phone.context().close();
    }
  });

  await check("a frota real não vê expansão nenhuma, nem pedindo na URL", async () => {
    const live = await open("/?escritorio=completo&andar=expansao-2");
    const now = await state(live);
    assert.equal(now.buildingView, "operacao");
    assert.deepEqual(now.mountedFloors, ["operacao"]);
    assert.equal(await live.locator("[data-floor-selector]").count(), 0);
    assert.equal(await live.locator("[data-floor-title]").count(), 0);
    assert.equal(await live.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("andar-expansao-2")), false);
    await live.context().close();
  });

  await check("o navegador não guardou nada simulado dos andares", async () => {
    const fresh = await open(DEMO);
    await go(fresh, "expansao-2");
    const stored = await fresh.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    assert.ok(!/expansao/i.test(stored), `guardou: ${stored}`);
    await fresh.context().close();
  });

  assert.deepEqual(errors, []);
  writeFileSync(path.join(out, "resultado.json"), JSON.stringify({ checks, costs, before, samples, after, errors }, null, 2));
  console.log(JSON.stringify({ costs, before, after }));
  console.log(`\n${checks.length} verificações ok. Fotos em ${out}`);
} finally {
  await browser.close();
}
