#!/usr/bin/env node
/**
 * Fotos do meio da viagem: congela o tempo em frações fixas e monta uma tira por trajeto, para
 * conferir a olho que a cena nunca some e que nenhum andar flutua.
 *
 * Uso: HQ_URL=http://127.0.0.1:5231 node scripts/visual-qa/office-building-frames.mjs [pasta] [LxA]
 * Perfil novo e /api/hq bloqueado.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const out = process.argv[2] ?? "qa/office-building-frames";
const [width, height] = (process.argv[3] ?? "1440x900").split("x").map(Number);
const trips = (process.env.HQ_TRIPS ?? "exterior>operacao,operacao>diretoria,diretoria>terreo,terreo>operacao,operacao>exterior,exterior>terreo").split(",");
const fractions = [0, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: [`--use-angle=${process.env.HQ_ANGLE ?? "metal"}`, "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width, height } });
await context.route("**/api/hq/**", (route) => route.fulfill({ status: 503, body: "" }));
const page = await context.newPage();
await page.goto(`${base}/?escritorio=completo&modo=demonstracao`);
await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 90000 });
await page.waitForLoadState("networkidle");
const settled = () => page.waitForFunction(() => {
  const { traveling, view, goal } = window.__HQ_OFFICE_QA__.state();
  return !traveling && Math.abs(view.x - goal.x) + Math.abs(view.z - goal.z) < 0.01;
});
for (const trip of trips) {
  const [from, to] = trip.split(">");
  await page.evaluate(() => window.__HQ_OFFICE_QA__.holdTravel(null));
  await page.click(`[data-floor-selector] [data-view="${from}"]`);
  await settled();
  await page.waitForTimeout(500);
  for (const fraction of fractions) {
    await page.evaluate((value) => window.__HQ_OFFICE_QA__.holdTravel(value), fraction);
    if (fraction === 0) await page.click(`[data-floor-selector] [data-view="${to}"]`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(out, `${from}-${to}-${String(Math.round(fraction * 100)).padStart(3, "0")}.png`) });
  }
  await page.evaluate(() => window.__HQ_OFFICE_QA__.holdTravel(null));
  await settled();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, `${from}-${to}-100.png`) });
}
await browser.close();
