#!/usr/bin/env node
/** Regressões da revisão: interrupções de transição, foco, teclado e recursos GPU. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const base = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const out = process.argv[2] ?? "/tmp/hq-building-transitions";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const checks = [];
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", error => errors.push(String(error)));
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
  await page.goto(`${base}/?escritorio=completo&modo=demonstracao`);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 90000 });
  const state = () => page.evaluate(() => window.__HQ_OFFICE_QA__.state());
  const settle = async view => {
    await page.waitForFunction(view => {
      const s = window.__HQ_OFFICE_QA__.state();
      return s.buildingView === view && !s.pendingView && Math.abs(s.view.zoom - s.goal.zoom) < .2;
    }, view, { timeout: 20000 });
    await page.waitForTimeout(450);
  };
  const go = async view => { await page.locator(`[data-floor-selector] [data-view="${view}"]`).click(); await settle(view); };
  await page.locator('[data-floor-selector] [data-view="diretoria"]').click();
  await page.keyboard.press("Escape");
  await settle("exterior");
  assert.equal(await page.locator('[data-floor-fade]').getAttribute('data-floor-fade'), 'false');
  assert.equal(await page.locator('[data-floor-fade]').evaluate(el => getComputedStyle(el).opacity), '0');
  checks.push("Esc durante fade cancela e revela exterior");
  await go("operacao");
  await page.evaluate(() => { document.querySelector('[data-view="terreo"]').click(); document.querySelector('[data-agent-row]').click(); });
  await settle("operacao");
  assert.equal((await state()).selectedBotId, "argos");
  checks.push("selecionar bot do andar atual cancela saída");
  await go("exterior");
  await page.locator('[data-agent-row]').first().click();
  await settle("operacao");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.objectVisible("bot-selection-ring"));
  checks.push("anel aparece ao selecionar bot a partir do exterior");
  await go("operacao");
  for (const name of ["Kanban", "Conversas", "Equipe"]) {
    await page.locator('.office-sidebar-nav').getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("PageUp");
    await page.waitForTimeout(250);
    assert.equal((await state()).buildingView, "operacao");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    assert.equal((await state()).buildingView, "operacao");
    await page.getByRole('button', { name: "Escritório", exact: true }).first().click();
  }
  checks.push("teclado com foco no body não altera cena por trás das áreas de trabalho");
  await go("exterior");
  await page.evaluate(() => {
    document.querySelector('[data-view="diretoria"]').click();
    document.querySelector('.office-stage').dispatchEvent(new WheelEvent('wheel', { deltaY: -30, bubbles: true, cancelable: true, clientX: 700, clientY: 400 }));
  });
  await settle("diretoria");
  assert.equal((await state()).framing, "floor");
  checks.push("wheel durante fade não altera enquadramento de destino");
  const cycle = async () => { for (const floor of ["terreo", "diretoria", "operacao"]) await go(floor); };
  await cycle();
  await page.waitForTimeout(1500);
  const memory = () => page.evaluate(() => ({ ...window.__gpuCounts(), geometries: window.__HQ_OFFICE_QA__.renderInfo().geometries }));
  const before = await memory();
  const samples = [];
  for (let i = 0; i < 8; i++) { await cycle(); samples.push(await memory()); }
  const after = samples.at(-1);
  assert.ok(after.framebuffers <= before.framebuffers, `framebuffers: ${JSON.stringify({before, after})}`);
  assert.ok(after.textures <= before.textures + 2, `texturas: ${JSON.stringify({before, after})}`);
  assert.ok(after.geometries <= before.geometries + 2, `geometrias: ${JSON.stringify({before, after})}`);
  checks.push("24 trocas após aquecimento sem acúmulo de texturas/framebuffers/geometrias");
  await go("diretoria");
  assert.equal(new URL(page.url()).searchParams.get("andar"), "diretoria");
  await page.reload();
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready");
  await settle("diretoria");
  checks.push("URL preserva andar ao recarregar a página");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${out}/diretoria-final.png` });
  writeFileSync(`${out}/resultado.json`, JSON.stringify({ checks, before, samples, after, errors }, null, 2));
  console.log(JSON.stringify({ checks, before, after }, null, 2));
} finally { await browser.close(); }
