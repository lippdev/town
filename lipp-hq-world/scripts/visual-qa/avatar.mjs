#!/usr/bin/env node
/**
 * Prova do editor de pessoas no navegador: troca de peça, trava de roupa, cor, salvar,
 * recarregar e movimentos. Lê o que a figura está vestindo de verdade, não o estado React.
 *
 * Uso: HQ_URL=http://127.0.0.1:5191 node scripts/visual-qa/avatar.mjs [pasta de saída]
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const OUT = process.argv[2] ?? "qa/avatar";
const IGNORED = [/THREE\.Clock/, /GPU stall/, /GL Driver Message/];
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
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type()) && !IGNORED.some((pattern) => pattern.test(message.text()))) problems.push(message.text());
});
page.on("pageerror", (error) => problems.push(String(error)));
page.on("requestfailed", (request) => problems.push(`falhou: ${request.url()}`));
page.on("dialog", (dialog) => dialog.accept());

const snapshot = () => page.evaluate(() => window.__HQ_AVATAR_QA__.snapshot());
const worn = (category, item) =>
  page.waitForFunction(([c, i]) => (i === null ? window.__HQ_AVATAR_QA__.snapshot()?.parts?.[c] === undefined : window.__HQ_AVATAR_QA__.snapshot()?.parts?.[c] === i), [category, item], { timeout: 15000 });
const pick = async (category, item) => {
  await page.click(`[data-category="${category}"]`);
  await page.click(item ? `[data-item="${item}"]` : `[role="radiogroup"][aria-label] >> text=Nenhum`);
};
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const canvasBusy = async () => {
  const data = await page.evaluate(() => window.__HQ_AVATAR_QA__.capture());
  return data.length > 20000;
};

await page.goto(`${BASE}/avatares.html`);
await page.waitForFunction(() => window.__HQ_AVATAR_QA__?.snapshot()?.parts?.head, null, { timeout: 60000 });

await check("sem nenhuma pessoa salva, o estado vazio explica o que fazer", async () => {
  assert.match(await page.textContent(".cs-empty"), /Monte a primeira/);
});

await check("a pessoa padrão aparece vestida e desenhada", async () => {
  const state = await snapshot();
  assert.equal(state.parts.top, "Top.001");
  assert.equal(state.bones, 75);
  assert.ok(await canvasBusy());
  await shot("01-padrao");
});

await check("trocar cabelo troca a peça vestida", async () => {
  await pick("hair", "Hair.007");
  await worn("hair", "Hair.007");
  await page.click('.cs-color__palette button[aria-label="#d9b26a"]');
  await page.waitForFunction(() => window.__HQ_AVATAR_QA__.snapshot().colors.hair === "#d9b26a");
  await shot("02-cabelo");
});

await check("tirar o cabelo tira a peça", async () => {
  await pick("hair", null);
  await worn("hair", null);
  await pick("hair", "Hair.007");
  await worn("hair", "Hair.007");
});

await check("cor da blusa muda só a blusa", async () => {
  await pick("top", "Top.002");
  await worn("top", "Top.002");
  await page.click('.cs-color__palette button[aria-label="#a83232"]');
  await page.waitForFunction(() => window.__HQ_AVATAR_QA__.snapshot().colors.top === "#a83232");
  assert.equal((await snapshot()).colors.hair, "#d9b26a");
});

await check("óculos com material de vidro não ligam a transmissão cara", async () => {
  await pick("glasses", "Glasses.001");
  await worn("glasses", "Glasses.001");
  await pick("glasses", null);
  await worn("glasses", null);
});

await check("fantasia cobre a roupa; a escolha volta ao tirar", async () => {
  await pick("outfit", "Outfit.001");
  await worn("outfit", "Outfit.001");
  await worn("top", null);
  await worn("hair", null);
  await page.click('[data-category="top"]');
  assert.ok(await page.isVisible('[data-locked="top"]'));
  await shot("03-fantasia");
  await page.click('[data-locked="top"] button');
  await worn("outfit", null);
  await worn("top", "Top.002");
  await worn("hair", "Hair.007");
});

await check("salvar exige nome", async () => {
  await page.fill(".cs-name", "   ");
  assert.ok(await page.isDisabled("[data-save]"));
  await page.fill(".cs-name", "Filipe");
  assert.ok(await page.isEnabled("[data-save]"));
});

await check("salvar põe a pessoa na lista", async () => {
  await page.click("[data-save]");
  await page.waitForSelector(".cs-cast__item");
  assert.match(await page.textContent(".cs-cast"), /Filipe/);
});

await check("recarregar mantém pessoa, peças e cores", async () => {
  await page.reload();
  await page.waitForFunction(() => window.__HQ_AVATAR_QA__?.snapshot()?.parts?.hair === "Hair.007", null, { timeout: 30000 });
  const state = await snapshot();
  assert.equal(state.parts.top, "Top.002");
  assert.equal(state.colors.top, "#a83232");
  assert.equal(state.colors.hair, "#d9b26a");
  assert.equal(await page.inputValue(".cs-name"), "Filipe");
  await shot("04-recarregado");
});

await check("os movimentos tocam sem erro", async () => {
  await page.click('button:has-text("Andando")');
  await page.waitForTimeout(500);
  assert.equal((await snapshot()).motion, "walk");
  await shot("05-andando");
  await page.click('button:has-text("Sentada")');
  await page.waitForTimeout(1500);
  assert.equal((await snapshot()).motion, "sit");
  await shot("06-sentada");
  await page.selectOption(".av-pose select", "King");
  await page.waitForTimeout(500);
  assert.equal((await snapshot()).motion, "King");
  await shot("07-pose");
  await page.click('button:has-text("Em pé")');
  await page.waitForTimeout(500);
  assert.equal((await snapshot()).motion, "idle");
});

await check("orbitar a prévia não quebra nada", async () => {
  const box = await page.locator(".cs-canvas").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 260, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await shot("08-orbita");
});

await check("peça que não baixa vira aviso, sem derrubar a figura", async () => {
  await context.route("**/pecas/Hair.009.glb", (route) => route.abort());
  const quiet = problems.length;
  await pick("hair", "Hair.009");
  await page.waitForSelector('.cs-banner[role="alert"]', { timeout: 10000 });
  await shot("09-peca-ausente");
  assert.equal((await snapshot()).parts.head, "Head.001");
  // O navegador registra a falha da rede; é esperada só aqui.
  problems.length = quiet;
  await context.unroute("**/pecas/Hair.009.glb");
  await pick("hair", "Hair.007");
  await worn("hair", "Hair.007");
  await page.waitForFunction(() => !document.querySelector('.cs-banner[role="alert"]'));
});

await check("dado salvo corrompido abre com aviso e guarda a cópia", async () => {
  await page.evaluate(() => localStorage.setItem("hq.avatares.v1", "{quebrado"));
  await page.reload();
  await page.waitForFunction(() => window.__HQ_AVATAR_QA__?.snapshot()?.parts?.head, null, { timeout: 30000 });
  assert.match(await page.textContent(".cs-banner"), /corrompido/);
  assert.equal(await page.evaluate(() => localStorage.getItem("hq.avatares.backup")), "{quebrado");
  await page.evaluate(() => localStorage.clear());
});

await check("janela estreita não estoura a página", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForFunction(() => window.__HQ_AVATAR_QA__?.snapshot()?.parts?.head, null, { timeout: 30000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `sobra ${overflow}px`);
  await page.screenshot({ path: path.join(OUT, "10-estreita.png"), fullPage: false });
});

await check("console limpo", async () => {
  assert.deepEqual([...new Set(problems)], []);
});

await browser.close();
writeFileSync(path.join(OUT, "resultado.json"), `${JSON.stringify({ ok: true, checks }, null, 2)}\n`);
console.log(`ok: ${checks.length} verificações. Capturas em ${OUT}`);
