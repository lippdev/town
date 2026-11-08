#!/usr/bin/env node
/**
 * Prova do cenário de tecnologia: abre o cenário, o dia simulado anda, gente vai à reunião e volta,
 * huddle, épico muda de saúde, bots visitam, gavetas, celular, movimento reduzido, custo, e a
 * demonstração sem `cenario` continua a de sempre.
 *
 * Uso: HQ_URL=http://127.0.0.1:5271 node scripts/visual-qa/office-tech.mjs [pasta]
 * Cada página usa um perfil novo e /api/hq bloqueado: nenhum Hermes, nada do seu navegador.
 *
 * O relógio da simulação anda com o tempo real (o dia em 15 minutos), e numa máquina lenta só
 * entrar no andar leva minutos. Por isso cada página abre com o relógio pausado no instante em
 * que o cenário monta, e cada prova salta o relógio para a hora do que vai provar e só então
 * espera a cena alcançar o plano. A única prova com o relógio andando é a do próprio relógio.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const ANGLE = process.env.HQ_ANGLE ?? (process.platform === "darwin" ? "metal" : "swiftshader");
const CHROME = process.env.CHROME_PATH || (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);
const SCALE = Number(process.env.HQ_TIMEOUT_SCALE ?? 1);
const after = (ms) => Math.round(ms * SCALE);
const OUT = process.argv[2] ?? "qa/office-tech";
const DEMO = "/?escritorio=completo&modo=demonstracao&chegada=carro";
const TECH = `${DEMO}&cenario=tecnologia`;
// `PCFSoftShadowMap has been removed`: o `shadows="soft"` do prédio, que o three 0.186 troca pelo
// PCFShadowMap (o desenho é o mesmo). Apareceu em máquina sem GPU; vem de antes do cenário e se
// resolve no próprio prédio, fora desta prova.
const IGNORED = [/THREE\.Clock/, /GPU stall/, /GL Driver Message/, /Hermes/, /\/api\/hq\//, /Program Info Log/, /PCFSoftShadowMap has been removed/];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", `--use-angle=${ANGLE}`, "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--ignore-gpu-blocklist"],
});
const problems = [];
const report = { checks: [] };
async function check(name, fn) {
  await fn();
  report.checks.push(name);
  console.log(`  ok  ${name}`);
}

async function open(url, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await context.route("**/api/hq/**", (route) => route.fulfill({ status: 503, body: "" }));
  // Pausa o relógio no mesmo instante em que o cenário abre a ponte da prova, antes do primeiro
  // passo do relógio: a página fica na `hora_sim` pedida, por mais que demore a carregar. E liga o
  // tempo real da cena: sem GPU um quadro passa de um segundo, e sem isso uma caminhada da mesa à
  // sala leva mais de 15 minutos.
  await context.addInitScript(() => {
    let api;
    Object.defineProperty(window, "__HQ_TECH_QA__", {
      configurable: true,
      get: () => api,
      set: (value) => {
        api = value;
        value?.pause(true);
        value?.realTime(true);
      },
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(after(30000));
  const requests = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  page.on("console", (message) => {
    if (message.location().url.includes("/api/hq/")) return;
    if (["error", "warning"].includes(message.type()) && !IGNORED.some((pattern) => pattern.test(message.text()))) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(String(error)));
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: after(120000) });
  const collapsed = await page.evaluate(() => document.querySelector(".office-hud")?.dataset.sidebarOpen === "false");
  if (collapsed && (options.viewport?.width ?? 1440) > 860) await page.click('[aria-label="Abrir navegação"]');
  page.requests = requests;
  return page;
}

const tech = (page, call, ...args) => page.evaluate(([name, values]) => window.__HQ_TECH_QA__[name](...values), [call, args]);
const office = (page) => page.evaluate(() => window.__HQ_OFFICE_QA__.state());
/**
 * Captura com as animações de CSS já no fim: sem GPU a página roda a um quadro por segundo, e a
 * entrada de 180 ms da gaveta ainda estava transparente na foto. O prazo escala com a máquina,
 * porque a captura espera um quadro novo da cena.
 */
const shot = async (page, name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: "disabled", timeout: after(60000) });
};
const settled = (page) =>
  page.waitForFunction(() => {
    const { view, goal, traveling } = window.__HQ_OFFICE_QA__.state();
    return !traveling && Math.abs(view.x - goal.x) + Math.abs(view.z - goal.z) < 0.01 && Math.abs(view.zoom - goal.zoom) < 0.2;
  }, null, { timeout: after(20000) });
/** Espera a cena alcançar o plano: cada um na casa que o estado pede, sem nada a meio caminho. */
const sceneCaughtUp = (page, emails, timeout = 60000) =>
  waitSceneFor(page, emails, timeout).catch(async (error) => {
    const dump = await page.evaluate(() => ({ clock: window.__HQ_TECH_QA__.clock(), plans: window.__HQ_TECH_QA__.plans(), scene: window.__HQ_TECH_QA__.scene(), phases: window.__HQ_OFFICE_QA__.state().humans.map((human) => [human.id, human.phase]) }));
    throw new Error(`a cena não alcançou o plano: ${JSON.stringify(dump)}\n${error.message}`);
  });
const waitSceneFor = (page, emails, timeout) =>
  page.waitForFunction((list) => {
    const qa = window.__HQ_TECH_QA__;
    const plans = Object.fromEntries(qa.plans().map((plan) => [plan.email, plan.place]));
    const scene = qa.scene();
    return list.every((email) => scene[email] && scene[email].home === plans[email] && scene[email].pending === null);
  }, emails, { timeout: after(timeout), polling: 250 });
/** A cena terminou de sentar quem devia: ninguém andando nem sentando. */
const everyoneStill = (page) => page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().humans.filter((human) => human.id.startsWith("squad-")).every((human) => ["seated", "standing", null].includes(human.phase)), null, { timeout: after(30000) });
const EMAIL = (name) => `${name}@lipp.example`;

try {
  // ─── Abrir ─────────────────────────────────────────────────────────────────
  const page = await open(`${TECH}&velocidade=1&hora_sim=09:20`);

  await check("o cenário abre no prédio, com o selo Simulação e o relógio do dia", async () => {
    assert.equal((await office(page)).buildingView, "exterior");
    await page.waitForFunction(() => window.__HQ_TECH_QA__);
    // O relógio mora num pedaço de JS à parte: pode chegar depois do gancho da prova.
    await page.locator("[data-tech-clock] .tech-chip").waitFor({ state: "visible", timeout: after(30000) });
    assert.match(await page.locator("[data-sim-time]").textContent(), /ter 10\/11 · 09:20/);
    assert.ok(await page.locator('[data-floor-selector] [data-view="expansao-2"]').isVisible(), "a Tecnologia tem botão próprio no seletor");
    await shot(page, "exterior-cenario");
  });

  await check("entra na Tecnologia: squad nas mesas, Tiago e Bianca fora, quadro dos épicos na parede", async () => {
    await page.click('[data-floor-selector] [data-view="expansao-2"]');
    await settled(page);
    await sceneCaughtUp(page, [EMAIL("renata.okabe"), EMAIL("bianca.sales"), EMAIL("tiago.nunes")]);
    const scene = await tech(page, "scene");
    assert.equal(scene[EMAIL("bianca.sales")].hidden, true);
    assert.equal(scene[EMAIL("tiago.nunes")].hidden, true);
    assert.ok(await page.evaluate(() => window.__HQ_OFFICE_QA__.objectVisible("quadro-epicos")));
    assert.equal((await tech(page, "board")).length, 6);
    assert.equal(await page.locator("[data-epic-card]").count(), 6);
    await shot(page, "tecnologia-manha");
  });

  await check("a daily leva o squad à sala, e cada um volta à mesa depois", async () => {
    const present = ["marina.lopes", "caio.rezende", "renata.okabe", "diego.martins", "luana.ferraz", "rafael.coutinho"].map(EMAIL);
    // Daily das 9h30 às 9h45: no meio dela, o plano de todos já é a sala.
    await tech(page, "jumpToClock", "09:35");
    assert.equal((await tech(page, "plans")).find((plan) => plan.email === EMAIL("renata.okabe")).zone, "sala");
    await sceneCaughtUp(page, present, 90000);
    await everyoneStill(page);
    const homes = await tech(page, "scene");
    assert.ok(present.every((email) => homes[email].home.startsWith("sala-")), JSON.stringify(homes));
    await page.click('[data-room="expansao-2-sala"]', { force: true }).catch(() => undefined);
    await settled(page);
    await shot(page, "daily-na-sala");
    await page.click(".office-focus .office-button.primary");
    await settled(page);
    await tech(page, "jumpToClock", "09:47");
    await sceneCaughtUp(page, present, 90000);
    const back = await tech(page, "scene");
    assert.equal(back[EMAIL("renata.okabe")].home, "mesa-3");
    await everyoneStill(page);
    await shot(page, "depois-da-daily");
  });

  // O relógio andando fica para depois da daily: o tempo que ele anda aqui não estraga nada.
  await check("a simulação avança, pausa e muda de velocidade", async () => {
    const pause = page.locator("[data-sim-pause]");
    assert.equal(await pause.getAttribute("aria-pressed"), "true", "a prova abre com o relógio pausado");
    await page.click('[data-sim-speed="4"]');
    assert.equal(await tech(page, "speed"), 4);
    await page.click('[data-sim-speed="1"]');
    assert.equal(await tech(page, "speed"), 1);
    await pause.click();
    const first = await tech(page, "at");
    const startedAt = Date.now();
    // Na velocidade 1, 3 s reais são quase 2 min do dia; cada passo do relógio vale no máximo 1 s
    // real, então a máquina lenta espera mais para provar o mesmo.
    await page.waitForTimeout(after(3000));
    const second = await tech(page, "at");
    const real = Date.now() - startedAt;
    assert.ok(second - first > 60_000, `o relógio deve passar mais de 1 min do dia (${second - first} ms em ${real} ms reais)`);
    await pause.click();
    assert.equal(await pause.getAttribute("aria-pressed"), "true");
    const paused = await tech(page, "at");
    await page.waitForTimeout(1500);
    assert.equal(await tech(page, "at"), paused, "pausado, o relógio não anda");
    report.relogio = { simMs: second - first, realMs: real };
  });

  await check("huddle junta quem entrou no canto do huddle", async () => {
    await tech(page, "jumpToClock", "11:21");
    const people = ["renata.okabe", "diego.martins", "rafael.coutinho"].map(EMAIL);
    await sceneCaughtUp(page, people, 90000);
    const scene = await tech(page, "scene");
    assert.ok(people.every((email) => scene[email].home.startsWith("huddle-")), JSON.stringify(scene));
    await everyoneStill(page);
    await shot(page, "huddle");
  });

  await check("o épico muda de saúde no quadro: Login sem senha destrava depois da decisão", async () => {
    assert.equal((await tech(page, "board")).find((card) => card.epicId === "E-1").health, "travado");
    assert.equal(await page.getAttribute('[data-epic-card="E-1"]', "data-health"), "travado");
    await tech(page, "jumpToClock", "15:20");
    await page.waitForFunction(() => window.__HQ_TECH_QA__.board().find((card) => card.epicId === "E-1").health === "no-prazo");
    assert.equal(await page.getAttribute('[data-epic-card="E-1"]', "data-health"), "no-prazo");
    // O cartão é um botão de verdade sobre o quadro: o ponteiro chega nele (o que está por cima é ele).
    const onTop = await page.evaluate(() => {
      const card = document.querySelector('[data-epic-card="E-1"]').getBoundingClientRect();
      return document.elementFromPoint(card.x + card.width / 2, card.y + card.height / 2)?.dataset.epicCard ?? null;
    });
    if (onTop === "E-1") await page.mouse.click(...(await page.evaluate(() => { const card = document.querySelector('[data-epic-card="E-1"]').getBoundingClientRect(); return [card.x + card.width / 2, card.y + card.height / 2]; })));
    else {
      report.cartaoCoberto = onTop;
      await page.locator('[data-epic-card="E-1"]').focus();
      await page.keyboard.press("Enter");
    }
    await page.waitForSelector('[data-tech-epic="E-1"] [data-epic-health="no-prazo"]');
    await shot(page, "epico-destravado");
    await page.keyboard.press("Escape");
  });

  await check("clicar na pessoa abre a gaveta dela com agora, HUs, PRs e o dia", async () => {
    await sceneCaughtUp(page, [EMAIL("diego.martins")], 60000);
    await everyoneStill(page);
    const point = await page.evaluate(() => window.__HQ_OFFICE_QA__.humanPoint("squad-diego-martins"));
    await page.mouse.click(point.x, point.y);
    await page.waitForSelector(`[data-tech-person="${EMAIL("diego.martins")}"]`);
    const text = await page.locator(`[data-tech-person="${EMAIL("diego.martins")}"]`).textContent();
    assert.match(text, /HU-27/);
    assert.match(text, /Agenda de hoje/);
    await shot(page, "gaveta-pessoa");
    await page.keyboard.press("Escape");
  });

  await page.close();

  // ─── Bots ──────────────────────────────────────────────────────────────────
  const bots = await open(`${TECH}&andar=expansao-2&hora_sim=09:11`);
  await check("o bot da rotina sai do elevador, vai até o trabalho e volta", async () => {
    await settled(bots);
    // O Forge prepara a pauta da daily das 9h12 às 9h24.
    assert.equal((await tech(bots, "robots")).length, 0, "antes da rotina, nenhum robô no andar");
    await tech(bots, "jumpToClock", "09:13");
    assert.ok((await tech(bots, "tasks")).some((task) => task.kind === "pauta_daily" && task.doneAt === null));
    await bots.waitForFunction(() => window.__HQ_TECH_QA__.robots().some((robot) => robot.botId === "forge" && robot.arrived), null, { timeout: after(60000) });
    await shot(bots, "bot-na-sala");
    await tech(bots, "jumpToClock", "09:25");
    assert.ok((await tech(bots, "tasks")).some((task) => task.kind === "pauta_daily" && task.doneAt));
    const messages = await tech(bots, "messages");
    assert.ok(messages.some((message) => message.from.kind === "bot" && message.text.startsWith("Pauta da daily")));
    await bots.waitForFunction(() => window.__HQ_TECH_QA__.robots().filter((robot) => robot.botId === "forge").every((robot) => robot.gone), null, { timeout: after(60000) });
  });
  await bots.close();

  // ─── Movimento reduzido ────────────────────────────────────────────────────
  const still = await open(`${TECH}&andar=expansao-2&hora_sim=09:20`, { reducedMotion: "reduce" });
  await check("movimento reduzido: ninguém anda, cada um aparece já no lugar", async () => {
    await tech(still, "jumpToClock", "09:35");
    await sceneCaughtUp(still, [EMAIL("renata.okabe"), EMAIL("marina.lopes")], 4000);
    const moving = await still.evaluate(() => window.__HQ_OFFICE_QA__.state().humans.filter((human) => human.id.startsWith("squad-") && !["seated", "standing", null].includes(human.phase)).length);
    assert.equal(moving, 0);
    await shot(still, "reduzido-daily");
  });
  await still.close();

  // ─── Celular ───────────────────────────────────────────────────────────────
  const phone = await open(`${TECH}&andar=expansao-2&hora_sim=10:20`, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await check("no celular: relógio à vista, sem rolagem lateral, gaveta do épico abre", async () => {
    assert.ok(await phone.locator("[data-sim-time]").isVisible());
    assert.ok(await phone.locator("[data-tech-clock] .tech-chip").isVisible(), "o selo Simulação não some no celular");
    // Nada da barra de cima passa da borda nem fica embaixo de outro item.
    const crowded = await phone.evaluate(() => {
      const items = [...document.querySelectorAll(".office-top > *")].filter((node) => getComputedStyle(node).display !== "none").map((node) => node.getBoundingClientRect());
      return items.some((box) => box.right > window.innerWidth + 1) || items.some((box, index) => items.slice(index + 1).some((other) => other.left < box.right - 1 && other.right > box.left + 1));
    });
    assert.equal(crowded, false, "a barra de cima se sobrepõe no celular");
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `rolagem lateral de ${overflow}px`);
    await shot(phone, "celular-andar");
    await phone.locator('[data-epic-card="E-2"]').focus();
    await phone.keyboard.press("Enter");
    await phone.waitForSelector('[data-tech-epic="E-2"]');
    await shot(phone, "celular-epico");
  });
  await phone.close();

  // ─── Sem cenário, nada muda ────────────────────────────────────────────────
  const plain = await open(`${DEMO}&andar=expansao-2`);
  await check("sem cenario: o andar 2 é a expansão de sempre, sem nada da Tecnologia", async () => {
    await plain.waitForTimeout(2500);
    assert.equal(await plain.evaluate(() => Boolean(window.__HQ_TECH_QA__)), false);
    assert.equal(await plain.locator("[data-tech-clock]").count(), 0);
    const state = await office(plain);
    assert.equal(state.scenery.filter((person) => person.id.startsWith("expansao-2-")).length, 5);
    assert.ok(!plain.requests.some((file) => file.includes("/src/tech/") || /\/assets\/Tech/.test(file)), "nenhum arquivo do cenário baixado");
    assert.match(await plain.locator('[data-floor-title="expansao-2"]').textContent(), /Expansão · andar 2 · cenário simulado/);
    await shot(plain, "sem-cenario-andar-2");
  });
  await plain.close();

  // ─── Custo ─────────────────────────────────────────────────────────────────
  async function cost(url) {
    const measured = await open(url);
    await measured.waitForTimeout(6000);
    const samples = [];
    for (let index = 0; index < 12; index += 1) {
      samples.push(await measured.evaluate(() => window.__HQ_OFFICE_QA__.renderInfo()));
      await measured.waitForTimeout(250);
    }
    await measured.close();
    const median = (key) => samples.map((sample) => sample[key]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    return { calls: median("calls"), triangles: median("triangles"), geometries: median("geometries"), textures: median("textures") };
  }
  await check("custo medido: andar 2 e exterior, com e sem o cenário", async () => {
    report.custo = {
      andar2SemCenario: await cost(`${DEMO}&andar=expansao-2`),
      andar2Tecnologia: await cost(`${TECH}&andar=expansao-2&hora_sim=10:20`),
      exteriorSemCenario: await cost(DEMO),
      exteriorTecnologia: await cost(`${TECH}&hora_sim=10:20`),
    };
    console.log(JSON.stringify(report.custo));
  });

  writeFileSync(path.join(OUT, "resultado.json"), JSON.stringify(report, null, 2));
  assert.deepEqual(problems, []);
  console.log(`\ncenário de tecnologia ok: ${report.checks.length} provas`);
} finally {
  await browser.close();
}
