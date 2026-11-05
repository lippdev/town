#!/usr/bin/env node
/**
 * Prova dos robôs no navegador: flutuam, voam pelos corredores, respondem ao clique, mudam
 * de cor e expressão sem misturar um com o outro, e param com movimento reduzido. Mede fps.
 *
 * Uso: HQ_URL=http://127.0.0.1:5191 node scripts/visual-qa/office-robots.mjs [pasta de saída]
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const OUT = process.argv[2] ?? "qa/office-robots";
const DEMO = "/?escritorio=completo&modo=demonstracao";
// X4000/X4122: compilador HLSL do Windows, com ou sem robô. Ver office-people.mjs.
const IGNORED = [/THREE\.Clock/, /GPU stall/, /GL Driver Message/, /Hermes/, /\/api\/hq\//, /Program Info Log:[^]*warning X\d+/];
const BOTS = ["argos", "atlas", "echo", "forge", "ink", "pulse", "scout"];
const COLOR = { argos: "#2563eb", forge: "#f97316", pulse: "#3b82f6" };
mkdirSync(OUT, { recursive: true });

const checks = [];
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log(`  ok  ${name}`);
}

const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const problems = [];
const watch = (target) => {
  target.on("console", (message) => {
    if (["error", "warning"].includes(message.type()) && !IGNORED.some((pattern) => pattern.test(message.text()))) problems.push(message.text());
  });
  target.on("pageerror", (error) => problems.push(String(error)));
};
watch(page);

const state = (target = page) => target.evaluate(() => window.__HQ_OFFICE_QA__.state());
const shot = (name, target = page) => target.screenshot({ path: path.join(OUT, `${name}.png`) });
const ready = (target = page) => target.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().rigs.length === 7, null, { timeout: 60000 });
const settled = (target = page) =>
  target.waitForFunction(() => {
    const { view, goal } = window.__HQ_OFFICE_QA__.state();
    return Math.abs(view.x - goal.x) + Math.abs(view.z - goal.z) < 0.01 && Math.abs(view.zoom - goal.zoom) < 0.2;
  }, null, { timeout: 8000 });

/** Quadros por segundo de verdade, contados no navegador. */
const fps = (target = page, seconds = 5) =>
  target.evaluate(
    (length) =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now) => {
          frames += 1;
          if (now - start >= length * 1000) resolve(Math.round((frames / (now - start)) * 10000) / 10);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    seconds,
  );

await page.goto(`${BASE}${DEMO}`);
await ready();
await page.waitForTimeout(800);

await check("os sete bots são robôs, com a cor do bot e expressão neutra", async () => {
  const { rigs, robots, bots } = await state();
  assert.deepEqual(rigs, BOTS);
  assert.deepEqual([...bots].sort(), BOTS);
  for (const [bot, color] of Object.entries(COLOR)) assert.equal(robots[bot].look.material, color, bot);
  for (const bot of BOTS) assert.equal(robots[bot].look.expression, "neutral");
  await shot("01-andar");
});

await check("flutuam: a altura muda sozinha, sem encostar na cadeira nem na verga", async () => {
  const first = (await state()).robots;
  await page.waitForTimeout(700);
  const later = (await state()).robots;
  let moved = 0;
  for (const bot of BOTS) {
    if (Math.abs(first[bot].y - later[bot].y) > 0.001) moved += 1;
    assert.ok(later[bot].y > 1.03 && later[bot].y + later[bot].height < 2.25, `${bot} em ${later[bot].y}`);
  }
  assert.equal(moved, BOTS.length);
});

await check("voam pelos corredores, e cada um volta ao próprio posto", async () => {
  const seen = new Set();
  const backHome = new Set();
  for (let index = 0; index < 90; index += 1) {
    const { robots } = await state();
    for (const bot of BOTS) {
      if (robots[bot].flown > 0.5) seen.add(bot);
      else if (seen.has(bot) && robots[bot].flown === 0) backHome.add(bot);
    }
    if (seen.size >= 3 && backHome.size >= 1) break;
    await page.waitForTimeout(500);
  }
  assert.ok(seen.size >= 3, `só ${seen.size} voaram`);
  assert.ok(backHome.size >= 1, "ninguém voltou");
  await shot("02-voando");
});

await check("a etiqueta acompanha o robô no voo", async () => {
  let checked = false;
  for (let index = 0; index < 60 && !checked; index += 1) {
    const { robots } = await state();
    const flyer = BOTS.find((bot) => robots[bot].flown > 1);
    if (flyer) {
      const [tag, point] = await page.evaluate((id) => {
        const rect = document.querySelector(`[data-bot="${id}"]`).getBoundingClientRect();
        return [{ x: rect.left + rect.width / 2, y: rect.bottom }, window.__HQ_OFFICE_QA__.botPoint(id)];
      }, flyer);
      assert.ok(Math.abs(tag.x - point.x) < 45, `${flyer}: etiqueta a ${Math.abs(tag.x - point.x)}px`);
      assert.ok(tag.y < point.y, `${flyer}: etiqueta abaixo do meio do robô`);
      checked = true;
    } else await page.waitForTimeout(500);
  }
  assert.ok(checked, "nenhum robô voou o bastante para conferir");
});

await check("clicar no robô em voo abre o painel certo, ele acena e volta ao posto", async () => {
  let flyer = null;
  for (let index = 0; index < 60 && !flyer; index += 1) {
    const { robots } = await state();
    flyer = BOTS.find((bot) => robots[bot].flown > 1.5) ?? null;
    if (!flyer) await page.waitForTimeout(400);
  }
  assert.ok(flyer, "ninguém em voo para clicar");
  const point = await page.evaluate((id) => window.__HQ_OFFICE_QA__.botPoint(id), flyer);
  await page.mouse.click(point.x, point.y);
  await page.waitForSelector(`[data-demo-panel="${flyer}"]`, { timeout: 5000 });
  const after = await state();
  assert.equal(after.selectedBotId, flyer);
  assert.equal(after.robots[flyer].look.gesture, "Wave");
  await page.waitForFunction((id) => window.__HQ_OFFICE_QA__.state().robots[id].flown === 0, flyer, { timeout: 15000 });
  await settled();
  await page.waitForTimeout(400);
  await shot("03-selecionado");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().focusedRoomId === null);
});

await check("identidade e painéis continuam: nome, função e sala do bot", async () => {
  await page.click('[data-bot="forge"]');
  await page.waitForSelector('[data-demo-panel="forge"]');
  const text = await page.textContent('[data-demo-panel="forge"]');
  assert.match(text, /Forge/);
  assert.match(text, /Coordenação operacional/);
  assert.match(text, /Comando/);
  assert.match(text, /só desenho/);
  assert.equal((await state()).focusedRoomId, "comando");
  await settled();
  await page.waitForTimeout(500);
  await shot("04-sala-focada");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
});

await check("cor e expressão mudam só o robô escolhido e sobrevivem ao recarregar", async () => {
  const editor = await context.newPage();
  watch(editor);
  await editor.goto(`${BASE}/avatares.html?aba=robos`);
  await editor.waitForFunction(() => window.__HQ_ROBOT_QA__?.snapshot(), null, { timeout: 30000 });
  await editor.click('[data-robot="argos"]');
  await editor.click('.cs-chip[aria-label="#22c55e"]');
  await editor.click('[data-expression="Surprised"]');
  await editor.waitForFunction(() => window.__HQ_ROBOT_QA__.snapshot().material === "#22c55e" && window.__HQ_ROBOT_QA__.snapshot().expression === "Surprised");
  await editor.waitForTimeout(400);
  await shot("05-editor-robo", editor);
  // Sem recarregar: a outra aba recebe pelo evento de armazenamento.
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().robots.argos.look.material === "#22c55e", null, { timeout: 8000 });
  const { robots } = await state();
  assert.equal(robots.argos.look.expression, "Surprised");
  assert.equal(robots.forge.look.material, COLOR.forge);
  assert.equal(robots.forge.look.expression, "neutral");
  await editor.close();
  await page.reload();
  await ready();
  assert.equal((await state()).robots.argos.look.material, "#22c55e");
  await page.evaluate(() => localStorage.removeItem("hq.robos.v1"));
  await page.reload();
  await ready();
  assert.equal((await state()).robots.argos.look.material, COLOR.argos);
});

await check("sem o arquivo do robô, a planta e a lista continuam, com aviso", async () => {
  const broken = await context.newPage();
  await broken.route("**/avatares/robo/RobotExpressive.glb", (route) => route.abort());
  await broken.goto(`${BASE}${DEMO}`);
  await broken.waitForSelector(".office-notice.figures", { timeout: 30000 });
  const current = await state(broken);
  assert.equal(current.load, "ready");
  assert.equal(current.rigs.length, 0);
  assert.equal(current.bots.length, 7);
  await broken.close();
});

await check("modo ao vivo: sem Hermes, ninguém voa nem aparece de mentira", async () => {
  const live = await context.newPage();
  await live.goto(`${BASE}/?escritorio=completo`);
  await live.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 60000 });
  await live.waitForTimeout(1000);
  const current = await state(live);
  assert.equal(current.rigs.length, current.bots.length);
  for (const robot of Object.values(current.robots)) assert.equal(robot.flown, 0);
  await live.close();
});

await check("movimento reduzido: todos parados no posto, e seleção sem gesto", async () => {
  const calm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const quiet = await calm.newPage();
  watch(quiet);
  await quiet.goto(`${BASE}${DEMO}`);
  await ready(quiet);
  const first = (await state(quiet)).robots;
  await quiet.waitForTimeout(2500);
  const later = (await state(quiet)).robots;
  for (const bot of BOTS) {
    assert.equal(later[bot].x, first[bot].x);
    assert.equal(later[bot].y, first[bot].y);
    assert.equal(later[bot].flown, 0);
  }
  await quiet.click('[data-bot="pulse"]');
  await quiet.waitForSelector('[data-demo-panel="pulse"]');
  assert.equal((await state(quiet)).robots.pulse.look.gesture, null);
  await shot("06-movimento-reduzido", quiet);
  await calm.close();
});

await check("custo medido: sete robôs e seis pessoas", async () => {
  const gpu = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "desconhecida";
  });
  const robotsOnly = { fps: await fps(), info: await page.evaluate(() => window.__HQ_OFFICE_QA__.renderInfo()) };
  await page.evaluate(() => {
    const base = { head: "Head.001", hair: "Hair.008", eyes: "Eyes.001", eyebrow: "EyeBrow.005", nose: "Nose.001", face: null, facialHair: null, glasses: null, hat: null, bow: null, earring: null, top: "Top.003", bottom: "Bottom.001", shoes: "Shoes.001", outfit: null };
    const colors = { head: "#eab08c", hair: "#3b2417", eyes: "#23262c", eyebrow: "#3b2417", nose: "#eab08c", face: "#a83232", facialHair: "#3b2417", glasses: "#23262c", hat: "#2f4256", bow: "#a83232", earring: "#23262c", top: "#2563eb", bottom: "#2f4256", shoes: "#23262c", outfit: "#2f4256" };
    const presets = Array.from({ length: 6 }, (_, index) => ({ id: `custo-${index}`, name: `Pessoa ${index + 1}`, parts: base, colors, expression: "neutral", updatedAt: "" }));
    localStorage.setItem("hq.avatares.v1", JSON.stringify({ schema: 1, presets, selectedId: "custo-0" }));
  });
  await page.reload();
  await ready();
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().humans.every((human) => human.worn?.parts?.head) && window.__HQ_OFFICE_QA__.state().humans.length === 6, null, { timeout: 30000 });
  await page.waitForTimeout(5000);
  const full = { fps: await fps(), info: await page.evaluate(() => window.__HQ_OFFICE_QA__.renderInfo()) };
  await shot("07-seis-pessoas-sete-robos");
  await page.evaluate(() => localStorage.removeItem("hq.avatares.v1"));
  const report = { gpu, robotsOnly, full };
  writeFileSync(path.join(OUT, "custo.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`      GPU: ${gpu}`);
  console.log(`      só robôs: ${robotsOnly.fps} fps, ${robotsOnly.info.calls} chamadas, ${robotsOnly.info.triangles} triângulos`);
  console.log(`      robôs e 6 pessoas pesadas: ${full.fps} fps, ${full.info.calls} chamadas, ${full.info.triangles} triângulos (qualidade ${full.info.autoQuality})`);
  assert.ok(full.fps > 15, `só ${full.fps} fps`);
});

await check("console limpo", async () => {
  assert.deepEqual([...new Set(problems)], []);
});

await browser.close();
writeFileSync(path.join(OUT, "resultado.json"), `${JSON.stringify({ ok: true, checks }, null, 2)}\n`);
console.log(`ok: ${checks.length} verificações. Capturas em ${OUT}`);
