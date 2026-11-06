#!/usr/bin/env node
/**
 * Prova do prédio na demonstração: exterior, cada andar, volta ao exterior, seleção de quem está
 * em outro andar, rótulos e Tab só do andar em tela, celular e movimento reduzido.
 *
 * Uso: HQ_URL=http://127.0.0.1:5231 HQ_ANGLE=metal node scripts/visual-qa/office-building.mjs [pasta]
 * Cada página usa um perfil novo: nada toca no que você salvou no navegador.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
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
  // A prova nunca fala com um Hermes de verdade, mesmo abrindo a frota real.
  await context.route("**/api/hq/**", (route) => route.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.location().url.includes("/api/hq/")) return;
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
    const { view, goal } = window.__HQ_OFFICE_QA__.state();
    return Math.abs(view.x - goal.x) + Math.abs(view.z - goal.z) < 0.01 && Math.abs(view.zoom - goal.zoom) < 0.2;
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

const FLOORS = (process.env.HQ_FLOORS ?? "diretoria,operacao,terreo").split(",");

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
  assert.ok(!tags.includes("sala-chefe") && !tags.includes("recepcao"), `vazou: ${tags}`);
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

await check("o chefe existe uma vez só, e só tem corpo na Diretoria", async () => {
  await goTo(page, "operacao");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().rigs.length === 7, null, { timeout: 30000 });
  let chiefs = (await state(page)).humans.filter((human) => human.id === "chefe");
  assert.equal(chiefs.length, 1);
  assert.equal(chiefs[0].floor, "diretoria");
  assert.equal(chiefs[0].mounted, false);
  assert.ok(!(await sceneFocusables(page)).includes("chefe"));
  await goTo(page, "diretoria");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().scenery.length === 2 && window.__HQ_OFFICE_QA__.state().humans.find((human) => human.id === "chefe")?.worn?.parts, null, { timeout: 30000 });
  chiefs = (await state(page)).humans.filter((human) => human.id === "chefe");
  assert.equal(chiefs.length, 1);
  assert.equal(chiefs[0].mounted, true);
  const now = await state(page);
  assert.deepEqual(now.rigs, []);
  assert.ok(now.scenery.every((person) => ["diretora-simulada", "diretor-simulado"].includes(person.id)));
  assert.equal(now.scenery.find((person) => person.id === "diretor-simulado").phase, "seated");
  assert.ok((await page.textContent('[data-scenery="diretor-simulado"]')).includes("simulado"));
  assert.ok(!(await sceneFocusables(page)).some((tag) => /diretora-|diretor-/.test(tag)));
});

await check("clicar num diretor simulado não abre nada", async () => {
  for (const id of ["diretora-simulada", "diretor-simulado"]) {
    const point = await page.evaluate((who) => window.__HQ_OFFICE_QA__.sceneryPoint(who), id);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(250);
    assert.equal(await page.locator("[data-human-panel], [data-demo-panel]").count(), 0, id);
    assert.equal((await state(page)).selectedHumanId, null);
    await page.keyboard.press("Escape");
    await settled(page);
  }
});

await check("escolher o chefe na lista, de outro andar, leva à sala dele sentado na cadeira dele", async () => {
  await goTo(page, "terreo");
  await page.click('[data-person-row="chefe"]');
  await settled(page);
  await page.waitForFunction(() => {
    const chief = window.__HQ_OFFICE_QA__.state().humans.find((human) => human.id === "chefe");
    return chief?.mounted && chief.phase === "seated" && chief.visible;
  }, null, { timeout: 45000 });
  const now = await state(page);
  assert.equal(now.buildingView, "diretoria");
  assert.equal(now.focusedRoomId, "sala-chefe");
  assert.equal(now.selectedHumanId, "chefe");
  await page.waitForSelector('[data-human-panel="chefe"]');
  await shot(page, "chefe-selecionado");
});

await check("clicar no chefe na cena abre a gaveta dele; a ronda fica no andar", async () => {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await settled(page);
  await page.mouse.move(4, 4);
  await shot(page, "diretoria");
  const point = await page.evaluate(() => window.__HQ_OFFICE_QA__.humanPoint("chefe"));
  await page.mouse.click(point.x, point.y);
  await page.waitForSelector('[data-human-panel="chefe"]');
  await settled(page);
  await page.click('button:has-text("Andar pela Diretoria")');
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().chiefStatus === "ronda", null, { timeout: 20000 });
  const moved = (await state(page)).humans.find((human) => human.id === "chefe");
  assert.equal(moved.mounted, true);
  // Sair no meio da ronda encerra o passeio: ele não anda por outro andar.
  await goTo(page, "operacao");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().chiefStatus === "mesa", null, { timeout: 5000 });
  await goTo(page, "diretoria");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().humans.find((human) => human.id === "chefe")?.phase === "seated", null, { timeout: 10000 });
});

await check("rever a chegada sai para a rua e devolve o chefe à mesa, uma vez só", async () => {
  await page.click('[data-person-row="chefe"]');
  await page.waitForSelector('[data-human-panel="chefe"]');
  await settled(page);
  await page.click('button:has-text("Rever a chegada")');
  await settled(page);
  assert.equal((await state(page)).buildingView, "exterior");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().chiefStatus === "chegando", null, { timeout: 3000 });
  await goTo(page, "diretoria");
  // Ainda chegando: a cadeira espera, sem etiqueta boiando nem corpo para clicar.
  const away = (await state(page)).humans.find((human) => human.id === "chefe");
  if ((await state(page)).chiefStatus !== "mesa") assert.equal(await page.locator('[data-human="chefe"]').count(), 0, `status ${away.phase}`);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().chiefStatus === "mesa", null, { timeout: 20000 });
  await page.waitForFunction(() => {
    const chief = window.__HQ_OFFICE_QA__.state().humans.find((human) => human.id === "chefe");
    return chief.mounted && chief.visible && chief.phase === "seated";
  }, null, { timeout: 10000 });
  assert.equal(await page.locator('[data-human="chefe"]').count(), 1);
});

await check("o rosto de quem está em cena fica livre de cima: fotos de perto", async () => {
  const closeups = { chefe: "humanPoint", "diretora-simulada": "sceneryPoint", "diretor-simulado": "sceneryPoint" };
  for (const [id, method] of Object.entries(closeups)) {
    await goTo(page, "exterior");
    await goTo(page, "diretoria");
    await page.waitForFunction(([who, how]) => window.__HQ_OFFICE_QA__[how](who), [id, method], { timeout: 30000 });
    await page.waitForTimeout(600);
    const point = await page.evaluate(([who, how]) => window.__HQ_OFFICE_QA__[how](who), [id, method]);
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, -700);
    await settled(page);
    await page.mouse.move(4, 4);
    await shot(page, `perto-${id}`);
  }
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
});

await check("custo de cada vista, para o relatório: não é promessa de quadros por segundo", async () => {
  const numbers = {};
  for (const view of ["exterior", ...FLOORS]) {
    await goTo(page, view);
    await page.mouse.move(4, 4);
    await page.waitForTimeout(1500);
    numbers[view] = await page.evaluate(async () => {
      const { calls, triangles } = window.__HQ_OFFICE_QA__.renderInfo();
      const fps = await new Promise((resolve) => {
        const start = performance.now();
        let frames = 0;
        const tick = () => {
          frames += 1;
          if (performance.now() - start >= 3000) resolve(Math.round((frames * 1000) / (performance.now() - start)));
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return { calls, triangles, fps };
    });
  }
  console.log(JSON.stringify(numbers));
  writeFileSync(path.join(OUT, "custo.json"), JSON.stringify(numbers, null, 2));
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

await check("movimento reduzido: a troca é a mesma, direta", async () => {
  const calm = await open(DEMO, { reducedMotion: "reduce" });
  await settled(calm);
  for (const floor of FLOORS) {
    await calm.click(`[data-floor-selector] [data-view="${floor}"]`);
    assert.equal((await state(calm)).buildingView, floor);
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
