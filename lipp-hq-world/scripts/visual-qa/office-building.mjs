#!/usr/bin/env node
/**
 * Prova do prédio na demonstração: exterior, cada andar, volta ao exterior, seleção de quem está
 * em outro andar, rótulos e Tab só do andar em tela, celular e movimento reduzido.
 *
 * Uso: HQ_URL=http://127.0.0.1:5231 HQ_ANGLE=metal node scripts/visual-qa/office-building.mjs [pasta]
 * Cada página usa um perfil novo: nada toca no que você salvou no navegador.
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const ANGLE = process.env.HQ_ANGLE ?? "metal";
const OUT = process.argv[2] ?? "qa/office-building";
const DEMO = "/?escritorio=completo&modo=demonstracao";
const IGNORED = [/THREE\.Clock/, /GPU stall/, /GL Driver Message/, /Hermes/, /\/api\/hq\//, /Program Info Log/];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: [`--use-angle=${ANGLE}`, "--ignore-gpu-blocklist"] });
const problems = [];
const checks = [];
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log(`  ok  ${name}`);
}

async function open(url, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()) && !IGNORED.some((pattern) => pattern.test(message.text()))) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(String(error)));
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 90000 });
  return page;
}
const state = (page) => page.evaluate(() => window.__HQ_OFFICE_QA__.state());
const settled = (page) =>
  page.waitForFunction(() => {
    const { view, goal, pendingView } = window.__HQ_OFFICE_QA__.state();
    return !pendingView && Math.abs(view.x - goal.x) + Math.abs(view.z - goal.z) < 0.01 && Math.abs(view.zoom - goal.zoom) < 0.2;
  }, null, { timeout: 15000 });
const shot = async (page, name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
};
const goTo = async (page, view) => {
  await page.click(`[data-floor-selector] [data-view="${view}"]`);
  await settled(page);
};
/** Todo controle da cena alcançável por Tab. */
const sceneFocusables = (page) => page.evaluate(() => [...document.querySelectorAll(".office-labels button, .office-labels a")].filter((node) => getComputedStyle(node).visibility !== "hidden").map((node) => node.dataset.room ?? node.dataset.bot ?? node.dataset.human ?? node.textContent));

const FLOORS = (process.env.HQ_FLOORS ?? "operacao,terreo").split(",");

const page = await open(DEMO);

await check("a demonstração abre com o prédio fechado, sem bot nem rótulo", async () => {
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().view.zoom > 0);
  await settled(page);
  const now = await state(page);
  assert.equal(now.buildingView, "exterior");
  assert.deepEqual(now.rigs, []);
  assert.deepEqual(await sceneFocusables(page), []);
  await shot(page, "exterior");
});

for (const floor of FLOORS) {
  await check(`o seletor entra em ${floor} e volta ao exterior sem sobras`, async () => {
    await goTo(page, floor);
    const inside = await state(page);
    assert.equal(inside.buildingView, floor);
    assert.equal(inside.focusedRoomId, null);
    await shot(page, `andar-${floor}`);
    await goTo(page, "exterior");
    const outside = await state(page);
    assert.deepEqual(outside.rigs, []);
    assert.deepEqual(await sceneFocusables(page), []);
  });
}

await check("clicar no pavimento aceso entra no andar; pavimento decorativo não faz nada", async () => {
  const decorative = await page.evaluate(() => window.__HQ_OFFICE_QA__.levelPoint(4));
  await page.mouse.click(decorative.x, decorative.y);
  await page.waitForTimeout(400);
  assert.equal((await state(page)).buildingView, "exterior");
  const level = await page.evaluate(() => window.__HQ_OFFICE_QA__.levelPoint(1));
  await page.mouse.move(level.x, level.y);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, "exterior-pavimento-apontado.png") });
  await page.mouse.click(level.x, level.y);
  await settled(page);
  assert.equal((await state(page)).buildingView, "operacao");
});

await check("na Operação, os sete bots e as etiquetas das salas estão lá", async () => {
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().rigs.length === 7, null, { timeout: 30000 });
  const tags = await sceneFocusables(page);
  for (const id of ["engenharia", "hall", "argos"]) assert.ok(tags.includes(id), `${id} sumiu: ${tags}`);
});

await check("no térreo, a atendente é cenário: etiqueta explícita, sem gaveta e fora do Tab", async () => {
  await goTo(page, "terreo");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().scenery.some((person) => person.id === "atendente"), null, { timeout: 30000 });
  const now = await state(page);
  assert.deepEqual(now.rigs, []);
  assert.equal(now.humans.filter((human) => human.id === "atendente").length, 0);
  assert.match(await page.textContent('[data-scenery="atendente"]'), /cenogr/);
  const tags = await sceneFocusables(page);
  assert.ok(!tags.includes("atendente") && !tags.includes("argos") && !tags.includes("engenharia"), `vazou: ${tags}`);
  assert.ok(tags.includes("recepcao"));
  const point = await page.evaluate(() => window.__HQ_OFFICE_QA__.sceneryPoint("atendente"));
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(300);
  assert.equal(await page.locator("[data-human-panel], [data-demo-panel]").count(), 0);
  assert.equal((await state(page)).selectedHumanId, null);
  await shot(page, "terreo-zona");
  await page.keyboard.press("Escape");
  await settled(page);
  await page.mouse.move(4, 4);
  await shot(page, "terreo");
  const near = await page.evaluate(() => window.__HQ_OFFICE_QA__.sceneryPoint("atendente"));
  await page.mouse.move(near.x, near.y);
  await page.mouse.wheel(0, -900);
  await settled(page);
  await page.mouse.move(4, 4);
  await shot(page, "terreo-atendente");
  await page.keyboard.press("Escape");
  await settled(page);
});

await check("escolher um bot na lista, de fora do prédio, leva à sala dele e abre a gaveta", async () => {
  await goTo(page, "exterior");
  const row = page.locator("[data-agent-row]").first();
  const botId = await row.getAttribute("data-agent-row");
  await row.click();
  await settled(page);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().framing === "room");
  const now = await state(page);
  assert.equal(now.buildingView, "operacao");
  assert.equal(now.selectedBotId, botId);
  assert.ok(now.focusedRoomId);
  await page.waitForSelector(`[data-demo-panel="${botId}"]`);
  await shot(page, "selecao-bot-vinda-do-exterior");
});

await check("Esc fecha a gaveta, depois volta ao andar, depois sai do prédio", async () => {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  assert.equal((await state(page)).framing, "floor");
  await page.keyboard.press("Escape");
  await settled(page);
  assert.equal((await state(page)).buildingView, "exterior");
});

await check("PageDown e PageUp andam pelo prédio", async () => {
  await page.keyboard.press("PageDown");
  await settled(page);
  assert.notEqual((await state(page)).buildingView, "exterior");
  await page.keyboard.press("PageUp");
  await page.waitForTimeout(100);
  await settled(page);
});

await check("trocas repetidas em seguida terminam num estado só", async () => {
  for (let round = 0; round < 3; round += 1) {
    for (const view of ["exterior", ...FLOORS]) await page.click(`[data-floor-selector] [data-view="${view}"]`);
  }
  await settled(page);
  const now = await state(page);
  assert.equal(now.buildingView, FLOORS.at(-1));
  assert.equal(now.pendingView, null);
});

await page.context().close();

await check("a frota real não tem prédio: sem seletor, sem fachada, sem cidade", async () => {
  const live = await open("/?escritorio=completo");
  await live.waitForTimeout(800);
  assert.equal((await state(live)).buildingView, "operacao");
  assert.equal(await live.locator("[data-floor-selector]").count(), 0);
  assert.equal(await live.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("fachada")), false);
  assert.equal(await live.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("cidade")), false);
  await shot(live, "frota-real");
  await live.context().close();
});

await check("celular: o seletor cabe e o enquadramento acompanha", async () => {
  const phone = await open(DEMO, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await settled(phone);
  await shot(phone, "celular-exterior");
  const box = await phone.locator("[data-floor-selector]").boundingBox();
  assert.ok(box && box.x + box.width <= 390 && box.x >= 0);
  for (const floor of FLOORS) {
    await phone.tap(`[data-floor-selector] [data-view="${floor}"]`);
    await settled(phone);
    await shot(phone, `celular-${floor}`);
  }
  await phone.context().close();
});

await check("movimento reduzido: a troca é imediata e sem escuro", async () => {
  const calm = await open(DEMO, { reducedMotion: "reduce" });
  await settled(calm);
  for (const floor of FLOORS) {
    await calm.click(`[data-floor-selector] [data-view="${floor}"]`);
    await calm.waitForFunction((want) => window.__HQ_OFFICE_QA__.state().buildingView === want, floor, { timeout: 500 });
    assert.equal(await calm.getAttribute("[data-floor-fade]", "data-floor-fade"), "false");
    await settled(calm);
    await shot(calm, `reduzido-${floor}`);
  }
  await calm.context().close();
});

await browser.close();
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`\n${checks.length} verificações ok. Fotos em ${OUT}`);
