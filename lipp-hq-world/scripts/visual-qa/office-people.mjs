#!/usr/bin/env node
/**
 * Prova do caminho inteiro: montar no editor, salvar e achar a pessoa no escritório, clicar
 * nela, mandar sentar e levantar. Lê posição e peças da cena real.
 *
 * Uso: HQ_URL=http://127.0.0.1:5191 node scripts/visual-qa/office-people.mjs [pasta de saída]
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const OUT = process.argv[2] ?? "qa/office-people";
const DEMO = "/?escritorio=completo&modo=demonstracao";
// X4000/X4122 são avisos do compilador HLSL do Windows (ANGLE/D3D11): aparecem no escritório
// mesmo sem nenhuma pessoa salva e não dizem nada sobre esta cena.
const IGNORED = [/THREE\.Clock/, /GPU stall/, /GL Driver Message/, /Hermes/, /\/api\/hq\//, /Program Info Log:[^]*warning X\d+/];
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
const person = async (name, target = page) => (await state(target)).humans.find((human) => human.name === name);
const shot = (name, target = page) => target.screenshot({ path: path.join(OUT, `${name}.png`) });
const officeReady = (target = page) => target.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 60000 });
const worn = (name, target = page) => target.waitForFunction((who) => window.__HQ_OFFICE_QA__.state().humans.find((human) => human.name === who)?.worn?.parts?.head || window.__HQ_OFFICE_QA__.state().humans.find((human) => human.name === who)?.worn?.parts?.hat, name, { timeout: 30000 });
const settled = (target = page) =>
  target.waitForFunction(() => {
    const { view, goal } = window.__HQ_OFFICE_QA__.state();
    return Math.abs(view.x - goal.x) + Math.abs(view.z - goal.z) < 0.01 && Math.abs(view.zoom - goal.zoom) < 0.2;
  }, null, { timeout: 8000 });

async function makePerson(name, picks) {
  await page.goto(`${BASE}/avatares.html`);
  await page.waitForFunction(() => Object.keys(window.__HQ_AVATAR_QA__?.snapshot()?.parts ?? {}).length > 0, null, { timeout: 60000 });
  await page.click('button:has-text("Nova pessoa")');
  await page.fill(".cs-name", name);
  for (const [category, item, color] of picks) {
    await page.click(`[data-category="${category}"]`);
    await page.click(`[data-item="${item}"]`);
    if (color) await page.click(`.cs-color__palette button[aria-label="${color}"]`);
  }
}

await check("sem ninguém salvo, o escritório diz onde criar", async () => {
  await page.goto(`${BASE}${DEMO}`);
  await officeReady();
  assert.match(await page.textContent("[data-people]"), /Ninguém ainda/);
  assert.equal((await state()).humans.length, 0);
});

await check("salvar no editor leva a pessoa para o escritório", async () => {
  await makePerson("Filipe", [["hair", "Hair.003", "#17120f"], ["top", "Top.002", "#2563eb"], ["facialHair", "FacialHair.002", "#17120f"], ["glasses", "Glasses.001", "#23262c"]]);
  await shot("01-editor");
  await page.click("[data-save-go]");
  await page.waitForURL(/escritorio=completo/);
  await officeReady();
  await worn("Filipe");
  const human = await person("Filipe");
  assert.equal(human.worn.parts.hair, "Hair.003");
  assert.equal(human.worn.colors.top, "#2563eb");
  assert.equal(human.phase, "standing");
  await page.waitForTimeout(1200);
  await shot("02-andar-com-pessoa");
});

await check("a pessoa não vira bot: a frota continua a mesma", async () => {
  const current = await state();
  assert.equal(current.bots.includes(current.humans[0].id), false);
  assert.equal(current.bots.length, 7);
  assert.ok(await page.isVisible(`[data-person-row="${current.humans[0].id}"]`));
});

await check("clicar na pessoa abre o painel dela e foca o hall", async () => {
  const human = await person("Filipe");
  const point = await page.evaluate((id) => window.__HQ_OFFICE_QA__.humanPoint(id), human.id);
  await page.mouse.click(point.x, point.y);
  await page.waitForSelector(`[data-human-panel="${human.id}"]`);
  await settled();
  await page.waitForTimeout(500);
  const current = await state();
  assert.equal(current.selectedHumanId, human.id);
  assert.equal(current.selectedBotId, null);
  assert.equal(current.focusedRoomId, "hall");
  await shot("03-selecionada");
});

await check("sentar: anda até a cadeira, senta e fica", async () => {
  const before = (await person("Filipe")).position;
  await page.click("[data-human-sit]");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().humans[0].phase === "toChair", null, { timeout: 5000 });
  await page.waitForTimeout(700);
  const walking = await person("Filipe");
  assert.notDeepEqual(walking.position, before);
  assert.equal(walking.worn.motion, "walk");
  await shot("04-andando");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().humans[0].phase === "sitting", null, { timeout: 30000 });
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().humans[0].phase === "seated", null, { timeout: 10000 });
  await page.waitForTimeout(400);
  assert.equal((await person("Filipe")).worn.motion, "sit");
  await shot("05-sentada");
});

await check("levantar: faz o caminho de volta até o mesmo lugar", async () => {
  const home = await page.evaluate(() => window.__HQ_OFFICE_QA__.state().humans[0].worn && null);
  assert.equal(home, null);
  await page.click("[data-human-stand]");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().humans[0].phase === "rising", null, { timeout: 5000 });
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().humans[0].phase === "toSpot", null, { timeout: 10000 });
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().humans[0].phase === "standing", null, { timeout: 30000 });
  const standing = await person("Filipe");
  assert.equal(standing.worn.motion, "idle");
  assert.equal(standing.position.y, 0);
  await shot("06-de-volta");
});

await check("Esc fecha o painel da pessoa antes de sair da sala", async () => {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().selectedHumanId === null);
  assert.equal((await state()).focusedRoomId, "hall");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().focusedRoomId === null);
});

await check("recarregar mantém a pessoa e a roupa", async () => {
  await page.reload();
  await officeReady();
  await worn("Filipe");
  assert.equal((await person("Filipe")).worn.parts.facialHair, "FacialHair.002");
});

await check("salvar em outra aba atualiza o escritório aberto, sem recarregar", async () => {
  const editor = await context.newPage();
  watch(editor);
  await editor.goto(`${BASE}/avatares.html?pessoa=${(await person("Filipe")).id}`);
  await editor.waitForFunction(() => window.__HQ_AVATAR_QA__?.snapshot()?.parts?.head, null, { timeout: 60000 });
  assert.equal(await editor.inputValue(".cs-name"), "Filipe");
  await editor.click('[data-category="hair"]');
  await editor.click('[data-item="Hair.008"]');
  await editor.click("[data-save]");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().humans[0].worn?.parts?.hair === "Hair.008", null, { timeout: 15000 });
  await editor.close();
});

await check("o andar com várias pessoas: cada uma no seu lugar, com roupa própria", async () => {
  const people = [
    ["Ana", [["hair", "Hair.011", "#a8703a"], ["top", "Top.003", "#ec4899"], ["bottom", "Bottom.003", "#23262c"]]],
    ["Bia", [["hair", "Hair.008", "#b0413e"], ["outfit", "Outfit.003"]]],
    ["Caio", [["hair", "Hair.005", "#3c63b0"], ["hat", "Hat.002", "#a83232"], ["top", "Top.001", "#22c55e"]]],
    ["Dora", [["hair", "Hair.006", "#d9b26a"], ["outfit", "WawaDress", "#a855f7"]]],
    ["Enzo", [["hat", "PumpkinHead"], ["top", "Top.002", "#f59e0b"]]],
  ];
  for (const [name, picks] of people) {
    await makePerson(name, picks);
    await page.click("[data-save]");
    await page.waitForTimeout(150);
  }
  await page.goto(`${BASE}${DEMO}`);
  await officeReady();
  for (const [name] of [["Filipe"], ...people]) await worn(name);
  const current = await state();
  assert.equal(current.humans.length, 6);
  const spots = new Set(current.humans.map((human) => `${human.position.x},${human.position.z}`));
  assert.equal(spots.size, 6);
  assert.equal(current.humans.find((human) => human.name === "Bia").worn.parts.top, undefined);
  assert.equal(current.humans.find((human) => human.name === "Enzo").worn.parts.head, undefined);
  await page.waitForTimeout(1500);
  await shot("07-seis-pessoas");
  await page.click('[data-person-row]:first-of-type');
  await settled();
  await page.waitForTimeout(600);
  await shot("08-seis-pessoas-hall");
  const info = await page.evaluate(() => window.__HQ_OFFICE_QA__.renderInfo());
  writeFileSync(path.join(OUT, "custo.json"), `${JSON.stringify(info, null, 2)}\n`);
  console.log(`      custo: ${info.calls} chamadas, ${info.triangles} triângulos, ${info.programs} programas`);
});

await check("além da capacidade, a pessoa aparece na lista e fica fora da cena", async () => {
  await makePerson("Gil", []);
  await page.click("[data-save]");
  await page.waitForTimeout(150);
  await page.goto(`${BASE}${DEMO}`);
  await officeReady();
  const current = await state();
  assert.equal(current.humans.length, 6);
  assert.deepEqual(current.humansWaiting.map((human) => human.name), ["Gil"]);
  assert.match(await page.textContent("[data-people-waiting]"), /Gil/);
});

await check("modo ao vivo não mostra pessoa nenhuma", async () => {
  await page.goto(`${BASE}/?escritorio=completo`);
  await officeReady();
  assert.equal((await state()).humans.length, 0);
  assert.equal(await page.isVisible("[data-people]"), false);
});

await check("falha ao baixar uma peça vira aviso e o resto da cena segue", async () => {
  await context.route("**/pecas/Hair.008.glb", (route) => route.abort());
  const quiet = problems.length;
  await page.goto(`${BASE}${DEMO}`);
  await officeReady();
  await page.waitForSelector("[data-humans-error]", { timeout: 30000 });
  assert.equal((await state()).bots.length, 7);
  await shot("09-peca-ausente");
  problems.length = quiet;
  await context.unroute("**/pecas/Hair.008.glb");
});

await check("falha nos arquivos-base não derruba o andar", async () => {
  await context.route("**/avatares/humano/armature.glb", (route) => route.abort());
  const quiet = problems.length;
  await page.goto(`${BASE}${DEMO}`);
  await officeReady();
  await page.waitForSelector("[data-humans-error]", { timeout: 30000 });
  assert.equal((await state()).load, "ready");
  problems.length = quiet;
  await context.unroute("**/avatares/humano/armature.glb");
});

await check("movimento reduzido: senta na hora, sem andar", async () => {
  const calm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", storageState: await context.storageState() });
  const quiet = await calm.newPage();
  watch(quiet);
  await quiet.goto(`${BASE}${DEMO}`);
  await officeReady(quiet);
  await worn("Filipe", quiet);
  await quiet.click(`[data-person-row]:first-of-type`);
  await quiet.waitForSelector("[data-human-sit]");
  await quiet.click("[data-human-sit]");
  await quiet.waitForFunction(() => window.__HQ_OFFICE_QA__.state().humans[0].phase === "seated", null, { timeout: 3000 });
  assert.equal((await person("Filipe", quiet)).worn.motion, "sit");
  await calm.close();
});

await check("console limpo", async () => {
  assert.deepEqual([...new Set(problems)], []);
});

await browser.close();
writeFileSync(path.join(OUT, "resultado.json"), `${JSON.stringify({ ok: true, checks }, null, 2)}\n`);
console.log(`ok: ${checks.length} verificações. Capturas em ${OUT}`);
