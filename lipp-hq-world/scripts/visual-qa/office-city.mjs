#!/usr/bin/env node
/**
 * Prova da cidade: exterior ao meio-dia, no entardecer e à noite, térreo e Operação, com o custo do
 * exterior em cada hora. É o que permite comparar a linguagem visual antes e depois de mexer nela.
 *
 * Uso: HQ_URL=http://127.0.0.1:5243 node scripts/visual-qa/office-city.mjs [pasta]
 * Perfil novo e /api/hq bloqueado: não fala com Hermes nenhum nem toca no navegador de ninguém.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const out = process.argv[2] ?? "qa/office-city";
const HOURS = { dia: "12:00", entardecer: "17:30", noite: "22:00" };
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: [`--use-angle=${process.env.HQ_ANGLE ?? "metal"}`, "--ignore-gpu-blocklist"] });
const errors = [];

const open = async (hour) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/api/hq/**", (route) => route.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${base}/?escritorio=completo&modo=demonstracao&hora=${hour}`);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 90000 });
  await page.waitForFunction(() => {
    const { view, goal, traveling } = window.__HQ_OFFICE_QA__.state();
    return view.zoom > 0 && !traveling && Math.abs(view.x - goal.x) + Math.abs(view.z - goal.z) < 0.01 && Math.abs(view.zoom - goal.zoom) < 0.2;
  }, null, { timeout: 15000 });
  await page.mouse.move(4, 4);
  await page.waitForTimeout(1200);
  return page;
};
const arrived = (page) => page.waitForFunction(() => !window.__HQ_OFFICE_QA__.state().traveling, null, { timeout: 15000 });

const cost = {};
for (const [name, hour] of Object.entries(HOURS)) {
  const page = await open(hour);
  await page.screenshot({ path: path.join(out, `exterior-${name}.png`) });
  const { calls, triangles, geometries, textures, lights } = await page.evaluate(() => window.__HQ_OFFICE_QA__.renderInfo());
  cost[name] = { calls, triangles, geometries, textures, lights };
  if (name === "noite") {
    for (const floor of ["terreo", "operacao"]) {
      await page.click(`[data-floor-selector] [data-view="${floor}"]`);
      await arrived(page);
      await page.mouse.move(4, 4);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, `${floor}-${name}.png`) });
    }
  }
  await page.context().close();
}

console.log(JSON.stringify(cost, null, 2));
writeFileSync(path.join(out, "custo.json"), JSON.stringify(cost, null, 2));
await browser.close();
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Fotos em ${out}`);
