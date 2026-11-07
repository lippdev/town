#!/usr/bin/env node
/**
 * Prova do primeiro carregamento: o que a vista inicial baixa, e que adiar o resto não atrasa ninguém.
 *
 * Uso: HQ_URL=http://127.0.0.1:5173 node scripts/visual-qa/office-first-load.mjs [pasta]
 * Perfil novo e /api/hq bloqueado: não fala com Hermes nenhum nem toca no navegador de ninguém.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const OUT = process.argv[2] ?? "qa/office-first-load";
const DEMO = "/?escritorio=completo&modo=demonstracao";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined),
  args: [`--use-angle=${process.env.HQ_ANGLE ?? (process.platform === "darwin" ? "metal" : "swiftshader")}`, "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const problems = [];
const report = {};
const ok = (name) => console.log(`  ok  ${name}`);

/** Abre a página anotando tudo o que ela pede, com a hora de cada pedido. */
async function open(context, url = DEMO) {
  const page = await context.newPage();
  const requests = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  page.on("pageerror", (error) => problems.push(String(error)));
  const started = Date.now();
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 120000, polling: 50 });
  return { page, requests, atReady: [...requests], readyMs: Date.now() - started };
}

async function newContext() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/api/hq/**", (route) => route.fulfill({ status: 503, body: "" }));
  return context;
}

const isFloorAsset = (file) => /\/escritorio\/texturas\/|\/avatares\/humano\/|\/prototipo\/(planta|luminaria)/.test(file);

try {
  const context = await newContext();
  const first = await open(context);
  report.primeiraVisitaMs = first.readyMs;
  assert.deepEqual(first.atReady.filter(isFloorAsset), [], "a vista inicial não precisa de textura de andar nem de personagem");
  ok(`vista inicial pronta em ${first.readyMs} ms, sem baixar andar nem personagem`);

  await first.page.waitForFunction(() => document.querySelector("[data-agent-row] .office-agent-avatar canvas, [data-agent-row] .office-agent-avatar [style*=background]"), null, { timeout: 60000 }).catch(() => undefined);
  await first.page.waitForTimeout(6000);
  assert.ok(first.requests.some((file) => file.includes("/escritorio/texturas/wood_floor_diff")), "na folga, as texturas vêm sozinhas");
  assert.ok(first.requests.some((file) => file.includes("/avatares/humano/armature")), "na folga, o esqueleto vem sozinho");
  ok("na folga, texturas e personagens chegam sozinhos, antes de alguém entrar");
  const saved = await first.page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("lipp-hq.retrato.")).length);
  assert.equal(saved, 7, "os sete retratos ficam guardados");
  ok("os sete retratos ficam guardados no navegador");
  await first.page.close();

  const again = await open(context);
  report.segundaVisitaMs = again.readyMs;
  assert.equal(again.atReady.filter((file) => file.includes("RobotExpressive")).length, 0, "com os retratos guardados, o robô não pesa na abertura");
  ok(`segunda visita pronta em ${again.readyMs} ms, com os retratos guardados`);
  await again.page.close();
  await context.close();

  // Entrar logo depois de abrir: nada baixou ainda, e o andar precisa aparecer inteiro mesmo assim.
  const hurry = await newContext();
  const eager = await open(hurry);
  await eager.page.locator('[data-floor-selector] [data-view="operacao"]').click();
  await eager.page.waitForFunction(() => {
    const qa = window.__HQ_OFFICE_QA__;
    return qa.state().shownFloor === "operacao" && !qa.state().traveling && qa.objectNamed("office-fixed");
  }, null, { timeout: 60000 });
  await eager.page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().bots.length === 7);
  await eager.page.waitForTimeout(3000);
  await eager.page.screenshot({ path: path.join(OUT, "entrou-logo.png") });
  assert.equal(await eager.page.evaluate(() => window.__HQ_OFFICE_QA__.state().load), "ready");
  ok("entrar na Operação logo ao abrir mostra o andar, sem travar");
  await hurry.close();

  // Abrir direto num andar continua esperando as texturas: nada de andar cinza.
  const direct = await newContext();
  const floor = await open(direct, `${DEMO}&andar=diretoria`);
  assert.ok(floor.atReady.some((file) => file.includes("/escritorio/texturas/wood_floor_diff")), "o andar só fica pronto com as texturas");
  await floor.page.screenshot({ path: path.join(OUT, "direto-diretoria.png") });
  ok("abrir direto num andar espera as texturas dele");
  await direct.close();

  // Sem a textura, o aviso aparece só para quem precisa dela.
  const broken = await newContext();
  await broken.route("**/escritorio/texturas/wood_floor_diff.webp", (route) => route.abort());
  const failed = await broken.newPage();
  await failed.goto(`${BASE}${DEMO}&andar=operacao`);
  await failed.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "failed", null, { timeout: 60000 });
  assert.ok(await failed.getByText("wood_floor_diff").count(), "o aviso nomeia o arquivo");
  ok("textura que não baixa vira aviso com o nome do arquivo");
  await broken.close();

  writeFileSync(path.join(OUT, "resultado.json"), JSON.stringify(report, null, 2));
  const real = problems.filter((message) => !/wood_floor_diff|Could not load/.test(message));
  assert.deepEqual(real, []);
  console.log(`\nprimeiro carregamento ok: ${JSON.stringify(report)}`);
} finally {
  await browser.close();
}
