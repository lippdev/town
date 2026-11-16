#!/usr/bin/env node
/**
 * Prova do cenário Alyx Med (`&cenario=alyxmed`): seis equipes de três bots, cada uma no seu andar,
 * com a marca oficial; organograma e seletor com as equipes; a atividade simulada (gaveta com
 * conversa e tarefas, quadro por equipe, bot na sala de reunião numa hora fixa); e, sem o parâmetro,
 * nada do cenário baixado nem bot da Alyx Med na demonstração de sempre.
 *
 * O relógio da simulação fica pausado e só anda por salto (`__HQ_ALYX_QA__`): nada aqui corre contra
 * o relógio de verdade, por mais lenta que seja a máquina.
 *
 * Uso: HQ_TIMEOUT_SCALE=3 HQ_URL=http://127.0.0.1:5263 node scripts/visual-qa/office-alyxmed.mjs [pasta]
 * Perfil novo e /api/hq bloqueado: não fala com Hermes nenhum nem toca no navegador de ninguém.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const ANGLE = process.env.HQ_ANGLE ?? (process.platform === "darwin" ? "metal" : "swiftshader");
const CHROME = process.env.CHROME_PATH || (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);
/** Numa máquina sem GPU um quadro custa segundos: o relógio do harness acompanha por HQ_TIMEOUT_SCALE. */
const SCALE = Number(process.env.HQ_TIMEOUT_SCALE ?? 1);
const after = (ms) => Math.round(ms * SCALE);
const OUT = process.argv[2] ?? "qa/office-alyxmed";
const [VW, VH] = (process.env.HQ_VIEWPORT ?? "1440x900").split("x").map(Number);
// Hora e chegada fixas: o céu e o roteiro do chefe não mudam de uma rodada para outra.
const DEMO = "/?escritorio=completo&modo=demonstracao&chegada=carro&hora=12:00";
const ALYX = `${DEMO}&cenario=alyxmed`;
const IGNORED = [/THREE\.Clock/, /GPU stall/, /GL Driver Message/, /Hermes/, /\/api\/hq\//, /Program Info Log/, /PCFSoftShadowMap/];
/** O que só o cenário pode baixar: o arquivo de dados dele e as imagens da marca. */
const SCENARIO_FILE = /\/alyxmed\/|\/assets\/scenario-[^/]*\.js/;

/** As seis equipes, de cima para baixo no prédio, com quem senta em cada andar. */
const TEAMS = [
  { floor: "expansao-7", name: "Performance", bots: ["alyx-gael", "alyx-vera", "alyx-dora"] },
  { floor: "expansao-5", name: "Leads", bots: ["alyx-lia", "alyx-davi", "alyx-bia"] },
  { floor: "expansao-4", name: "Tarefas", bots: ["alyx-otto", "alyx-nina", "alyx-rui"] },
  { floor: "expansao-3", name: "Desenvolvimento", bots: ["alyx-theo", "alyx-iris", "alyx-enzo"] },
  { floor: "expansao-2", name: "Social Media", bots: ["alyx-mel", "alyx-caio", "alyx-lara"] },
  // Na Operação, que vira Processos, senta também a direção geral.
  { floor: "operacao", name: "Processos", bots: ["alyx-ana", "alyx-leo", "alyx-clara"], extra: ["alyx-alyx"] },
];
/** A reunião de Social Media das 14h, no lounge do andar 2 (limites da zona em `officeExpansion.ts`). */
const MEETING = { floor: "expansao-2", at: "14:20", after: "15:10", bots: ["alyx-mel", "alyx-caio", "alyx-lara"], room: { minX: 2.4, maxX: 11.2, minZ: 1.6, maxZ: 9 } };
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", `--use-angle=${ANGLE}`, "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--ignore-gpu-blocklist"],
});
const problems = [];
const checks = [];
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log(`  ok  ${name}`);
}

async function open(url, requests = []) {
  const context = await browser.newContext({ viewport: { width: VW, height: VH } });
  await context.route("**/api/hq/**", (route) => route.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  page.setDefaultTimeout(after(30000));
  page.on("request", (request) => requests.push(request.url()));
  page.on("console", (message) => {
    if (message.location().url.includes("/api/hq/")) return;
    if (["error", "warning"].includes(message.type()) && !IGNORED.some((pattern) => pattern.test(message.text()))) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(String(error)));
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: after(90000) });
  // Meio-dia parado: todos no posto, na pausa do almoço, até alguém pular o relógio.
  await page.evaluate(() => {
    window.__HQ_ALYX_QA__?.pause();
    window.__HQ_ALYX_QA__?.jumpToClock("12:00");
  });
  const collapsed = await page.evaluate(() => document.querySelector(".office-hud")?.dataset.sidebarOpen === "false");
  if (collapsed && VW > 860) await page.click('[aria-label="Abrir navegação"]');
  return page;
}
const state = (page) => page.evaluate(() => window.__HQ_OFFICE_QA__.state());
const settled = (page) =>
  page.waitForFunction(() => {
    const { view, goal, traveling } = window.__HQ_OFFICE_QA__.state();
    return !traveling && Math.abs(view.x - goal.x) + Math.abs(view.z - goal.z) < 0.01 && Math.abs(view.zoom - goal.zoom) < 0.2;
  }, null, { timeout: after(20000) });
const shot = async (page, name) => {
  await page.waitForTimeout(after(700));
  await page.screenshot({ path: path.join(OUT, `${name}.png`), timeout: after(30000) });
};
const goTo = async (page, view) => {
  await page.click(`[data-floor-selector] [data-view="${view}"]`);
  await settled(page);
};
/** A gaveta entra com animação, que nesta máquina leva vários quadros lentos: a foto espera ela parar. */
const drawerShown = (page, id) =>
  page.waitForFunction((target) => {
    const drawer = document.querySelector(`[data-demo-panel="${target}"]`);
    return drawer && getComputedStyle(drawer).opacity === "1" && drawer.getAnimations().every((animation) => animation.playState === "finished");
  }, id, { timeout: after(30000) });
/** Os robôs de um andar estão montados e a imagem da marca está à vista. */
const floorReady = (page, floor, bots) =>
  page.waitForFunction(({ floor, bots }) => {
    const qa = window.__HQ_OFFICE_QA__;
    const rigs = qa.state().rigs;
    return bots.every((id) => rigs.includes(id)) && qa.objectVisible(`marca-${floor}-0`);
  }, { floor, bots }, { timeout: after(30000) });

const page = await open(ALYX);

await check("a navegação mostra a marca e o slogan, e a demonstração diz que os dados são fictícios", async () => {
  const logo = page.locator(".office-workspace-logo");
  assert.equal(await logo.getAttribute("alt"), "Alyx Med");
  await page.waitForFunction(() => document.querySelector(".office-workspace-logo")?.naturalWidth > 0);
  const note = await page.textContent(".office-demo-note");
  assert.match(note, /Da agenda ao DRE, sua clínica em um sistema só\./);
  assert.match(note, /fictícios/);
  assert.equal(await page.textContent(".office-chip.demo"), "Demonstração");
});

await check("o seletor lista as seis equipes com nome, de cima para baixo, sem a linha da Expansão", async () => {
  const names = await page.locator("[data-floor-selector] .office-floor[data-view]").evaluateAll((nodes) =>
    nodes.sort((a, b) => Number(getComputedStyle(a).order) - Number(getComputedStyle(b).order)).map((node) => node.textContent.trim()),
  );
  const teams = names.filter((name) => TEAMS.some((team) => name.endsWith(team.name)));
  assert.deepEqual(teams.map((name) => TEAMS.find((team) => name.endsWith(team.name)).name), TEAMS.map((team) => team.name));
  assert.equal(await page.locator("[data-floor-selector] .office-floor-group").count(), 0);
});

await check("o prédio fechado leva a marca no letreiro do topo", async () => {
  await settled(page);
  assert.equal((await state(page)).buildingView, "exterior");
  await shot(page, "exterior");
});

for (const team of TEAMS) {
  await check(`${team.name}: os três bots no andar ${team.floor}, com nome, marca e tela`, async () => {
    await goTo(page, team.floor);
    const here = [...team.bots, ...(team.extra ?? [])];
    await floorReady(page, team.floor, here);
    const now = await state(page);
    assert.deepEqual([...now.rigs].sort(), [...here].sort(), `${team.floor}: robôs ${now.rigs}`);
    assert.deepEqual(now.scenery, [], `${team.floor}: figurante no andar de equipe`);
    // Ninguém flutua dentro de outro: cada robô tem o próprio lugar.
    for (const a of here) for (const b of here) {
      if (a < b) assert.ok(Math.hypot(now.robots[a].x - now.robots[b].x, now.robots[a].z - now.robots[b].z) > 0.8, `${a} sobre ${b}`);
    }
    const tags = await page.locator(".office-labels [data-bot]").evaluateAll((nodes) => nodes.map((node) => node.dataset.bot).sort());
    assert.deepEqual(tags, [...here].sort());
    if (team.floor !== "operacao") assert.match(await page.textContent(`[data-floor-title="${team.floor}"]`), new RegExp(`Equipe ${team.name} · demonstração`));
    assert.ok(await page.evaluate((floor) => window.__HQ_OFFICE_QA__.objectVisible(`marca-${floor}-1`), team.floor), "tela do sistema");
    await page.mouse.move(4, 4);
    await shot(page, `andar-${team.floor}`);
  });
}

await check("clicar num bot abre a gaveta dele, com a equipe, o andar, o estado, as tarefas e a conversa", async () => {
  const team = TEAMS[1];
  await goTo(page, team.floor);
  await floorReady(page, team.floor, team.bots);
  const point = await page.evaluate((id) => window.__HQ_OFFICE_QA__.botPoint(id), team.bots[0]);
  await page.mouse.click(point.x, point.y);
  await drawerShown(page, team.bots[0]);
  const drawer = await page.textContent(`[data-demo-panel="${team.bots[0]}"]`);
  assert.match(drawer, /Lia/);
  assert.match(drawer, /Qualificação de leads/);
  assert.match(drawer, new RegExp(team.name));
  assert.match(drawer, /fictíci/);
  // Ao meio-dia parado, a Lia está na pausa; as tarefas e a última mensagem vêm do cenário.
  assert.equal(await page.getAttribute(`[data-demo-panel="${team.bots[0]}"] [data-activity]`, "data-activity"), "ocioso");
  assert.match(drawer, /Pausa do meio-dia · 12:00/);
  const tasks = await page.locator(`[data-demo-panel="${team.bots[0]}"] [data-demo-tasks] li`).count();
  assert.ok(tasks >= 3, `tarefas na gaveta: ${tasks}`);
  assert.match(await page.textContent("[data-demo-tasks]"), /Clínica Bem Viver/);
  assert.match(await page.textContent("[data-demo-talk]"), /Lia: .*desconto|Lia: Das 12 clínicas/);
  await settled(page);
  await shot(page, "gaveta-bot");
  await page.click("[data-open-conversation]");
  await page.waitForSelector("[data-conversations]");
  const talk = await page.textContent("[data-conversations]");
  assert.match(talk, /Das 12 clínicas que pediram teste ontem/);
  assert.match(talk, /Clínica Bem Viver/);
  await shot(page, "conversa-bot");
  await page.getByRole("button", { name: "Escritório", exact: true }).click();
  await page.keyboard.press("Escape");
});

await check("às 14h20, a equipe de Social Media está no lounge, em reunião; às 15h10, de volta ao posto", async () => {
  await goTo(page, MEETING.floor);
  await floorReady(page, MEETING.floor, MEETING.bots);
  const before = (await state(page)).robots;
  await page.evaluate((at) => window.__HQ_ALYX_QA__.jumpToClock(at), MEETING.at);
  const { minX, maxX, minZ, maxZ } = MEETING.room;
  await page.waitForFunction(({ bots, box }) => {
    const robots = window.__HQ_OFFICE_QA__.state().robots;
    return bots.every((id) => robots[id] && robots[id].x > box.minX && robots[id].x < box.maxX && robots[id].z > box.minZ && robots[id].z < box.maxZ);
  }, { bots: MEETING.bots, box: { minX, maxX, minZ, maxZ } }, { timeout: after(30000) });
  await page.waitForFunction((bots) => bots.every((id) => document.querySelector(`.office-labels [data-bot="${id}"] [data-activity]`)?.dataset.activity === "reuniao"), MEETING.bots, { timeout: after(15000) });
  assert.match(await page.textContent("[data-scenario-clock]"), /14:20/);
  const meeting = (await state(page)).robots;
  for (const a of MEETING.bots) for (const b of MEETING.bots) {
    if (a < b) assert.ok(Math.hypot(meeting[a].x - meeting[b].x, meeting[a].z - meeting[b].z) > 0.8, `${a} sobre ${b} na reunião`);
  }
  await page.mouse.move(4, 4);
  await shot(page, "reuniao-expansao-2");
  await page.evaluate((at) => window.__HQ_ALYX_QA__.jumpToClock(at), MEETING.after);
  await page.waitForFunction(({ bots, before }) => {
    const robots = window.__HQ_OFFICE_QA__.state().robots;
    return bots.every((id) => Math.hypot(robots[id].x - before[id].x, robots[id].z - before[id].z) < 0.05);
  }, { bots: MEETING.bots, before }, { timeout: after(15000) });
  await page.evaluate(() => window.__HQ_ALYX_QA__.jumpToClock("12:00"));
});

await check("o quadro filtra por equipe, e cada uma tem cartões de exemplo", async () => {
  await page.getByRole("button", { name: "Kanban", exact: true }).click();
  await page.waitForSelector("[data-kanban]");
  assert.match(await page.textContent("[data-kanban]"), /fictíci/);
  const counts = {};
  for (const id of ["leads", "tarefas", "social", "dev", "performance", "processos"]) {
    await page.click(`[data-kanban-filter="equipe:${id}"]`);
    counts[id] = await page.locator("[data-kanban-card]").count();
    assert.ok(counts[id] >= 5, `${id}: ${counts[id]} cartões`);
  }
  await page.click('[data-kanban-filter="equipe:leads"]');
  assert.match(await page.textContent("[data-kanban]"), /Clínica Vida\+ pediu demo do prontuário com IA, agendada qui 14h/);
  await shot(page, "kanban-leads");
  await page.getByRole("button", { name: "Escritório", exact: true }).click();
});

await check("o térreo recebe com a marca no lugar da placa do Lipp HQ", async () => {
  await goTo(page, "terreo");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.objectVisible("marca-terreo-0"));
  assert.equal(await page.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("placa-LIPP HQ")), false);
  await shot(page, "terreo");
});

await check("o organograma tem o Filipe no topo, a direção e as seis equipes de três", async () => {
  await page.click("[data-nav-equipe]");
  await page.waitForSelector("[data-org]");
  assert.match(await page.textContent("[data-org-owner]"), /Filipe.*Alyx Med/);
  const teams = await page.locator("[data-org-team]").evaluateAll((nodes) => nodes.map((node) => [node.querySelector("h3").firstChild.textContent.trim(), node.querySelectorAll("[data-org-node]").length]));
  assert.deepEqual(teams, [["Leads", 3], ["Tarefas", 3], ["Social Media", 3], ["Desenvolvimento", 3], ["Performance", 3], ["Processos", 3]]);
  assert.equal(await page.locator(".org-tier:not(.org-team-tier) [data-org-node]").count(), 1);
  assert.equal(await page.locator("[data-org-unassigned]").count(), 0);
  await shot(page, "organograma");
});

await page.context().close();

await check("sem cenário, nenhum arquivo dele é baixado e não há bot da Alyx Med", async () => {
  const requests = [];
  const plain = await open(DEMO, requests);
  await goTo(plain, "operacao");
  await plain.waitForFunction(() => window.__HQ_OFFICE_QA__.state().rigs.length === 7, null, { timeout: after(30000) });
  await goTo(plain, "expansao-2");
  await plain.waitForLoadState("networkidle");
  const now = await state(plain);
  assert.ok(!now.bots.some((id) => id.startsWith("alyx-")), now.bots.join());
  assert.equal(await plain.evaluate(() => "__HQ_ALYX_QA__" in window), false, "relógio do cenário fora do cenário");
  assert.equal(await plain.locator("[data-scenario-clock], .office-labels [data-activity]").count(), 0);
  assert.equal(now.bots.length, 7);
  assert.ok(now.scenery.length >= 3, "os figurantes da expansão continuam");
  const leaked = requests.filter((url) => SCENARIO_FILE.test(url));
  assert.deepEqual(leaked, []);
  assert.equal(await plain.locator("[data-floor-selector] .office-floor-group").count(), 1);
  assert.match(await plain.textContent(".office-demo-note"), /Sete bots de exemplo/);
  await shot(plain, "sem-cenario-expansao-2");
  await plain.context().close();
});

await browser.close();
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`\n${checks.length} verificações ok. Fotos em ${OUT}`);
