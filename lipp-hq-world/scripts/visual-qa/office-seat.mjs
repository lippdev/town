#!/usr/bin/env node
/**
 * Prova do encaixe na cadeira: fotos de perto, de lado e de frente, em cada momento da entrada,
 * e as coordenadas dos ossos e da cadeira lidas da cena real, quadro a quadro, nos seis lugares.
 *
 * Uso: HQ_URL=http://127.0.0.1:5191 node scripts/visual-qa/office-seat.mjs <pasta de saída> [prefixo]
 * Fotos só dos dois primeiros lugares; coordenadas de todos. HQ_SEAT_STEPS troca os instantes
 * das fotos, em segundos desde o começo da fase de sentar.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const OUT = process.argv[2] ?? "qa/office-seat";
const PREFIX = process.argv[3] ?? "depois";
const STEPS = (process.env.HQ_SEAT_STEPS ?? "0.4,0.8,1.2,1.7,2.3,2.8,3.3").split(",").map(Number);
const DEMO = "/?escritorio=completo&modo=demonstracao";
// X4000/X4122 são avisos do compilador HLSL do Windows (ANGLE/D3D11), sem relação com a cena.
const IGNORED = [/THREE\.Clock/, /GPU stall/, /GL Driver Message/, /Hermes/, /\/api\/hq\//, /Program Info Log:[^]*warning X\d+/];
mkdirSync(OUT, { recursive: true });

const PEOPLE = [
  ["Ana", [["hair", "Hair.003", "#17120f"], ["top", "Top.002", "#2563eb"]]],
  ["Bia", [["hair", "Hair.011", "#a8703a"], ["top", "Top.003", "#ec4899"], ["bottom", "Bottom.003", "#23262c"]]],
  ["Caio", [["hair", "Hair.005", "#3c63b0"], ["top", "Top.001", "#22c55e"]]],
  ["Dora", [["hair", "Hair.006", "#d9b26a"], ["outfit", "WawaDress", "#a855f7"]]],
  ["Enzo", [["hair", "Hair.008", "#b0413e"], ["top", "Top.002", "#f59e0b"]]],
  ["Fred", [["hair", "Hair.003", "#17120f"], ["outfit", "Outfit.003"]]],
];

const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await context.newPage();
const problems = [];
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type()) && !IGNORED.some((pattern) => pattern.test(message.text()))) problems.push(message.text());
});
page.on("pageerror", (error) => problems.push(String(error)));

const state = () => page.evaluate(() => window.__HQ_OFFICE_QA__.state());
const phaseIs = (id, phase, timeout = 60000) => page.waitForFunction(([who, wanted]) => window.__HQ_OFFICE_QA__.state().humans.find((item) => item.id === who).phase === wanted, [id, phase], { timeout });

/** De lado, o corte começa antes da cadeira vizinha, que assim não tapa a foto. */
async function closeups(seat, name) {
  const toDesk = seat.yaw === 0 ? 1 : -1;
  const views = {
    lado: { eye: [seat.x - 0.47, 0.72, seat.z], target: [seat.x, 0.72, seat.z], height: 1.9, near: 0.01 },
    frente: { eye: [seat.x, 1.15, seat.z + toDesk * 3], target: [seat.x, 0.72, seat.z], height: 1.9, near: 1.4 },
    costas: { eye: [seat.x, 1.15, seat.z - toDesk * 3], target: [seat.x, 0.72, seat.z], height: 1.9, near: 1.4 },
  };
  for (const [view, camera] of Object.entries(views)) {
    const data = await page.evaluate((options) => window.__HQ_OFFICE_QA__.closeup(options), camera);
    writeFileSync(path.join(OUT, `${PREFIX}-${name}-${view}.png`), Buffer.from(data.split(",")[1], "base64"));
  }
}

await page.goto(`${BASE}/avatares.html`);
await page.waitForFunction(() => Object.keys(window.__HQ_AVATAR_QA__?.snapshot()?.parts ?? {}).length > 0, null, { timeout: 60000 });
for (const [name, picks] of PEOPLE) {
  await page.click('button:has-text("Nova pessoa")');
  await page.fill(".cs-name", name);
  for (const [category, item, color] of picks) {
    await page.click(`[data-category="${category}"]`);
    await page.click(`[data-item="${item}"]`);
    if (color) await page.click(`.cs-color__palette button[aria-label="${color}"]`);
  }
  await page.click("[data-save]");
  await page.waitForTimeout(100);
}
await page.goto(`${BASE}${DEMO}`);
await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 60000 });
for (let index = 0; index < PEOPLE.length; index += 1) await page.waitForFunction((at) => window.__HQ_OFFICE_QA__.state().humans[at]?.worn?.parts?.head, index, { timeout: 60000 });
await page.waitForTimeout(800);

// Lê a cena a cada quadro, na própria página: o caminho até aqui atrasaria a leitura.
const startTape = (id) =>
  page.evaluate((who) => {
    const tape = (window.__seatTape = []);
    window.__seatTapeOn = true;
    const tick = () => {
      if (!window.__seatTapeOn) return;
      const qa = window.__HQ_OFFICE_QA__;
      const human = qa.state().humans.find((item) => item.id === who);
      tape.push({ time: performance.now(), phase: human.phase, position: human.position, heading: human.heading, chair: human.chairPose ?? null, joints: qa.humanJoints(who) });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, id);
const stopTape = () =>
  page.evaluate(() => {
    window.__seatTapeOn = false;
    return window.__seatTape;
  });

const initial = await state();
const report = { prefix: PREFIX, seats: [] };

for (const [index, human] of initial.humans.entries()) {
  const label = human.name.toLowerCase();
  await page.click(`[data-person-row="${human.id}"]`);
  await page.waitForSelector(`[data-human-panel="${human.id}"]`);
  await startTape(human.id);
  await page.click("[data-human-sit]");
  await phaseIs(human.id, "sitting");
  const start = Date.now();
  if (index < 2) {
    for (const [at, stamp] of STEPS.entries()) {
      await page.waitForTimeout(Math.max(0, stamp * 1000 - (Date.now() - start)));
      if ((await state()).humans[index].phase === "sitting") await closeups(human.seat, `${label}-entrando-${at}`);
    }
  }
  await phaseIs(human.id, "seated", 30000);
  await page.waitForTimeout(250);
  if (index < 2) await closeups(human.seat, `${label}-sentada`);
  if (index < 2) await page.screenshot({ path: path.join(OUT, `${PREFIX}-${label}-sentada-cena.png`) });
  const joints = await page.evaluate((id) => window.__HQ_OFFICE_QA__.humanJoints(id), human.id);
  await page.click("[data-human-stand]");
  await phaseIs(human.id, "standing");
  report.seats.push({ name: human.name, seat: human.seat, joints, frames: await stopTape() });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
}

writeFileSync(path.join(OUT, `${PREFIX}-coordenadas.json`), JSON.stringify(report));
assert.deepEqual(problems, [], "console limpo");
await browser.close();
console.log(`  ok  ${report.seats.length} lugares, ${report.seats.reduce((sum, seat) => sum + seat.frames.length, 0)} quadros lidos`);
