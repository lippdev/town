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
 *
 * HQ_ONLY=visoes roda só o bloco das visões (Projetos e Painel), para iterar nele.
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
const ONLY = process.env.HQ_ONLY ?? "";
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
  // HQ_ONLY=visoes pula a cena e roda só o bloco das visões (para iterar nele).
  if (ONLY !== "visoes") {
    // ─── Abrir ─────────────────────────────────────────────────────────────────
    const page = await open(`${TECH}&velocidade=1&hora_sim=09:20`);

    await check("o cenário abre no prédio, com o selo Simulação e o relógio do dia", async () => {
      assert.equal((await office(page)).buildingView, "exterior");
      await page.waitForFunction(() => window.__HQ_TECH_QA__);
      assert.ok(await page.locator("[data-tech-clock] .tech-chip").isVisible());
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
  }

  // ─── Visões: o prédio e o painel dizem o mesmo ─────────────────────────────
  // Bloco à parte: Projetos e Painel leem o mesmo estado da cena. Relógio sempre parado e levado
  // com jumpToClock antes de cada leitura: nada aposta corrida com o relógio de verdade.
  // 09:00 abre o dia; 09:35 é dentro da daily, com o squad todo na sala e ninguém livre para revisar;
  // 17:55 fecha o dia. O relógio só anda para a frente: a página abre às 09:00.
  const VIEW_TIMES = ["09:00", "09:35", "10:40", "11:21", "14:00", "15:20", "17:55"];
  const sorted = (list) => [...list].sort();
  const panelRead = (page) =>
    page.evaluate(() => {
      const items = (list, attr) => [...document.querySelectorAll(`[data-panel-list="${list}"] > [data-panel-item]`)].map((node) => node.getAttribute(attr));
      const presence = (kind) => [...document.querySelectorAll(`[data-panel-presence="${kind}"] .tv-presence-people > [data-person]`)].map((node) => node.dataset.person);
      return {
        at: document.querySelector("[data-view-clock]")?.textContent,
        travadas: items("travadas", "data-story"),
        paradas: items("paradas", "data-story"),
        revisoes: items("revisoes", "data-pr").map(Number),
        semCriterio: items("sem-criterio", "data-story"),
        semAutor: items("sem-autor", "data-pr").map(Number),
        botsHoje: items("bots", "data-task").length,
        reuniao: presence("reuniao"),
        huddle: presence("huddle"),
        foco: presence("foco"),
        fora: presence("fora"),
        saude: Object.fromEntries([...document.querySelectorAll("[data-panel-epic]")].map((node) => [node.dataset.panelEpic, node.dataset.health])),
        chamada: presence("chamada"),
        mesa: presence("mesa"),
        candidatos: Object.fromEntries([...document.querySelectorAll('[data-panel-list="revisoes"] > [data-panel-item]')].map((node) => [node.dataset.pr, node.dataset.candidates ? node.dataset.candidates.split(",") : []])),
        proximos: Object.fromEntries([...document.querySelectorAll('[data-panel-list="revisoes"] > [data-panel-item]')].map((node) => [node.dataset.pr, node.dataset.upcoming ? node.dataset.upcoming.split(",") : []])),
        motivos: Object.fromEntries([...document.querySelectorAll("[data-panel-epic]")].map((node) => [node.dataset.panelEpic, [...node.querySelectorAll("[data-epic-reasons] > li")].map((item) => `${item.dataset.reasonKind}|${item.dataset.reasonSubject}`)])),
        contagens: Object.fromEntries([...document.querySelectorAll("[data-panel-count]")].map((node) => [node.dataset.panelCount, Number(node.dataset.value)])),
        contextos: Object.fromEntries([...document.querySelectorAll("[data-panel-count]")].map((node) => [node.dataset.panelCount, node.dataset.context])),
        carga: Object.fromEntries([...document.querySelectorAll("[data-panel-load]")].map((node) => [node.dataset.panelLoad, { stories: Number(node.dataset.stories), prs: Number(node.dataset.prs), reviews: Number(node.dataset.reviews) }])),
      };
    });
  const treeRead = (page) =>
    page.evaluate(() => {
      const ids = (flag) => [...document.querySelectorAll(`[data-tree-story][${flag}]`)].map((node) => node.dataset.treeStory);
      return {
        at: document.querySelector("[data-view-clock]")?.textContent,
        travadas: ids("data-blocked"),
        paradas: ids("data-stale"),
        semCriterio: ids("data-no-criteria"),
        saude: Object.fromEntries([...document.querySelectorAll("[data-tree-epic]")].map((node) => [node.dataset.treeEpic, node.dataset.health])),
        motivosDoEpico: Object.fromEntries([...document.querySelectorAll("[data-tree-epic]")].map((node) => [node.dataset.treeEpic, [...node.querySelectorAll(":scope > .tv-row [data-epic-reason]")].map((flag) => flag.dataset.epicReason)])),
        hus: [...document.querySelectorAll("[data-tree-story]")].map((node) => node.dataset.treeStory),
      };
    });
  const viewIs = (page, view) => page.waitForFunction((name) => window.__HQ_TECH_QA__.view() === name && document.querySelector(`[data-view-tab="${name}"]`)?.getAttribute("aria-selected") === "true" && (name === "predio" ? !document.querySelector("[data-tech-view]") : Boolean(document.querySelector(`[data-tech-view="${name}"]`))), view);
  const urlView = (page) => page.evaluate(() => new URLSearchParams(window.location.search).get("visao"));
  report.visoes = { horas: VIEW_TIMES, leituras: [] };

  // Movimento reduzido: cada pessoa aparece já no lugar. A prova é de conteúdo, não de animação, e
  // assim não depende de quantos quadros por segundo a máquina sem GPU consegue desenhar.
  const views = await open(`${TECH}&andar=expansao-2&hora_sim=09:00&visao=painel`, { reducedMotion: "reduce" });
  await check("?visao=painel abre direto no Painel, por cima da cena, com o render parado", async () => {
    await views.waitForFunction(() => window.__HQ_TECH_QA__);
    await tech(views, "pause", true);
    await viewIs(views, "painel");
    assert.equal(await views.getAttribute("[data-tech-view]", "role"), "tabpanel");
    assert.equal(await views.getAttribute("[data-tech-view]", "aria-labelledby"), "tech-tab-painel");
    // Os comandos da cena somem com ela coberta.
    assert.equal(await views.locator(".office-floors").isVisible(), false);
    await views.waitForFunction(() => window.__HQ_TECH_QA__.render().paused);
    const before = (await tech(views, "render")).frames;
    await views.waitForTimeout(2000);
    const after2s = (await tech(views, "render")).frames;
    report.visoes.quadrosComPainel = after2s - before;
    assert.equal(after2s - before, 0, "com o Painel aberto a cena não desenha nenhum quadro");
  });

  const focused = (page) => page.evaluate(() => {
    const node = document.activeElement;
    return { tag: node?.tagName ?? null, tab: node?.dataset?.viewTab ?? null, item: node?.closest("[data-panel-item]")?.dataset.story ?? null, load: node?.closest("[data-panel-load]")?.dataset.panelLoad ?? null, inView: Boolean(node?.closest("[data-tech-view]")) };
  });
  await check("Esc fecha a gaveta antes de trocar a visão, e o foco volta a quem abriu; o X também", async () => {
    await viewIs(views, "painel");
    const story = await views.locator('[data-panel-list="paradas"] > [data-panel-item]').first().getAttribute("data-story");
    await views.locator('[data-panel-list="paradas"] > [data-panel-item] .tv-item-main').first().click();
    const epicId = (await tech(views, "story", story)).epicId;
    await views.waitForSelector(`[data-tech-epic="${epicId}"] .tech-story.highlight`);
    assert.equal(await views.locator("[data-tech-epic]").count(), 1, "uma gaveta só, a do prédio");
    await views.keyboard.press("Escape");
    await views.waitForFunction(() => !document.querySelector("[data-tech-epic]"));
    assert.equal(await tech(views, "view"), "painel", "o primeiro Esc fecha só a gaveta");
    assert.equal((await focused(views)).item, story, "depois do Esc o foco está no item que abriu a gaveta");
    // Pelo X: a gaveta da pessoa, aberta pelo nome na carga, fecha e o foco volta ao nome.
    await views.click(`[data-panel-load="${EMAIL("diego.martins")}"] th [data-person]`);
    await views.waitForSelector(`[data-tech-person="${EMAIL("diego.martins")}"]`);
    await shot(views, "visoes-painel-gaveta-pessoa-1440");
    await views.click(`[data-tech-person="${EMAIL("diego.martins")}"] .panel-close`);
    await views.waitForFunction(() => !document.querySelector("[data-tech-person]"));
    assert.equal(await tech(views, "view"), "painel");
    const afterClose = await focused(views);
    assert.equal(afterClose.load, EMAIL("diego.martins"), `depois do X o foco volta ao nome que abriu a gaveta: ${JSON.stringify(afterClose)}`);
    // Os números de PR na carga também abrem a pessoa.
    const loadPr = views.locator("[data-panel-load] [data-load-pr]").first();
    const loadOwner = await loadPr.evaluate((node) => node.closest("[data-panel-load]").dataset.panelLoad);
    await loadPr.click();
    await views.waitForSelector(`[data-tech-person="${loadOwner}"]`);
    await views.keyboard.press("Escape");
    await views.waitForFunction(() => !document.querySelector("[data-tech-person]"));
    // Com o foco no body e o Painel aberto, PageDown e as setas não mexem na cena escondida.
    const before = await office(views);
    await views.evaluate(() => document.activeElement?.blur());
    for (const key of ["PageDown", "PageUp", "ArrowLeft", "+"]) await views.keyboard.press(key);
    await views.waitForTimeout(after(600));
    const still = await office(views);
    assert.equal(still.buildingView, before.buildingView, "PageDown com o Painel aberto não troca de andar");
    assert.deepEqual(still.goal, before.goal, "setas e zoom não mexem a câmera por baixo do Painel");
    // Tab da aba vai para o painel dela, não para a navegação lateral; Shift+Tab volta à aba.
    await views.locator('[data-view-tab="painel"]').focus();
    await views.keyboard.press("Tab");
    assert.equal(await views.evaluate(() => document.activeElement?.dataset.techView), "painel", "o Tab da aba entra no painel");
    await views.keyboard.press("Shift+Tab");
    assert.equal((await focused(views)).tab, "painel", "o Shift+Tab do painel volta à aba");
    // Esc com o foco no painel volta ao prédio, e o foco vai para a aba Prédio.
    await views.locator('[data-panel-count="travadas"]').focus();
    await views.keyboard.press("Escape");
    await viewIs(views, "predio");
    assert.equal((await focused(views)).tab, "predio", "saindo da visão pelo Esc, o foco fica na aba Prédio");
    // Projetos com a gaveta do épico aberta ao lado.
    await views.click('[data-view-tab="projetos"]');
    await viewIs(views, "projetos");
    await views.click("[data-tree-expand-all]");
    await views.click('[data-tree-story="HU-34"] .tv-open');
    await views.waitForSelector('[data-tech-epic="E-2"] .tech-story.highlight');
    const overflow = await views.evaluate(() => {
      const scroll = document.querySelector(".tv-scroll");
      return scroll.scrollWidth - scroll.clientWidth;
    });
    assert.ok(overflow <= 0, `a árvore não corta embaixo da gaveta (${overflow}px)`);
    await shot(views, "visoes-projetos-gaveta-1440");
    await views.click('[data-tech-epic="E-2"] .panel-close');
    await views.waitForFunction(() => !document.querySelector("[data-tech-epic]"));
    assert.equal(await views.evaluate(() => document.activeElement?.closest("[data-tree-story]")?.dataset.treeStory), "HU-34", "fechando pelo X, o foco volta à HU que abriu");
    // Sem papel de árvore: lista aninhada com botões de expandir.
    assert.equal(await views.locator('[data-tree] [role="tree"], [data-tree] [role="treeitem"]').count(), 0);
    assert.equal(await views.locator('[data-tree-epic] > .tv-row .tv-toggle[aria-expanded]').count() > 0, true);
  });

  for (const clock of VIEW_TIMES) {
    await check(`${clock}: o Painel mostra exatamente as respostas de trackingAnswers`, async () => {
      if ((await tech(views, "view")) !== "painel") {
        await views.click('[data-view-tab="painel"]');
        await viewIs(views, "painel");
      }
      await tech(views, "jumpToClock", clock);
      await views.waitForFunction((value) => document.querySelector("[data-view-clock]")?.textContent === value, clock);
      const answers = await tech(views, "answers");
      assert.equal(answers.at, clock);
      const panel = await panelRead(views);
      for (const key of ["travadas", "paradas", "revisoes", "semCriterio", "semAutor", "reuniao", "huddle", "foco", "fora"]) assert.deepEqual(panel[key], answers[key], `${clock} · painel.${key}`);
      assert.equal(panel.botsHoje, answers.botsHoje, `${clock} · bots hoje`);
      assert.deepEqual(panel.saude, answers.saude, `${clock} · saúde dos épicos`);
      const presence = await tech(views, "presence");
      assert.deepEqual(panel.chamada, presence.chamada, `${clock} · painel.chamada`);
      assert.deepEqual(panel.mesa, presence.mesa, `${clock} · painel.mesa`);
      assert.equal(panel.contagens.time, presence.mesa.length, `${clock} · disponíveis agora`);
      assert.match(panel.contextos.time, new RegExp(`de \\d+ · ${presence.reuniao.length + presence.chamada.length} em reunião, ${presence.huddle.length} em huddle, ${presence.foco.length} em foco, ${presence.fora.length} fora`), `${clock} · resumo do time`);
      for (const number of answers.revisoes) {
        const candidates = await tech(views, "candidates", number);
        assert.deepEqual(panel.candidatos[number], candidates, `${clock} · quem pode revisar o #${number}`);
        assert.deepEqual(panel.proximos[number], candidates.length ? [] : await tech(views, "upcoming", number), `${clock} · quem fica livre para o #${number}`);
      }
      for (const epicId of Object.keys(answers.saude)) assert.deepEqual(panel.motivos[epicId], await tech(views, "reasonKeys", epicId), `${clock} · motivos do ${epicId}, tipo e sujeito`);
      assert.deepEqual(panel.carga, await tech(views, "load"), `${clock} · carga por pessoa`);
      if (clock === "09:35") {
        // Dentro da daily: ninguém livre agora, e o painel diz quem fica livre e quando.
        assert.ok(answers.revisoes.length > 0);
        for (const number of answers.revisoes) {
          assert.deepEqual(panel.candidatos[number], [], `09:35 · ninguém livre para o #${number}`);
          assert.ok(panel.proximos[number].length > 0, `09:35 · alguém fica livre para o #${number}`);
        }
        assert.match(panel.contextos.revisoes, /ninguém livre agora · próxima às 09:45/);
        await views.locator('[data-panel-list="revisoes"]').scrollIntoViewIfNeeded();
        await shot(views, "visoes-painel-0935-1440");
      }
      assert.equal(panel.contagens.travadas, answers.travadas.length);
      assert.equal(panel.contagens.revisoes, answers.revisoes.length);
      assert.equal(panel.contagens.paradas, answers.paradas.length);
      assert.equal(panel.contagens["sem-criterio"], answers.semCriterio.length);
      assert.equal(panel.contagens.epicos, Object.values(answers.saude).filter((level) => level !== "no-prazo").length);
      report.visoes.leituras.push({ hora: clock, ...answers });
      if (clock === "11:21") await shot(views, "visoes-painel-1440");
    });

    await check(`${clock}: a árvore de Projetos marca as mesmas HUs travadas, paradas e sem critério`, async () => {
      await views.click('[data-view-tab="projetos"]');
      await viewIs(views, "projetos");
      assert.equal(await urlView(views), "projetos", "a URL acompanha a visão");
      await views.click("[data-tree-expand-all]");
      const answers = await tech(views, "answers");
      const tree = await treeRead(views);
      assert.equal(tree.at, clock);
      assert.deepEqual(sorted(tree.hus), sorted(await tech(views, "stories")), `${clock} · toda HU está na árvore, uma vez`);
      assert.deepEqual(sorted(tree.travadas), sorted(answers.travadas), `${clock} · árvore travadas`);
      assert.deepEqual(sorted(tree.paradas), sorted(answers.paradas), `${clock} · árvore paradas`);
      assert.deepEqual(sorted(tree.semCriterio), sorted(answers.semCriterio), `${clock} · árvore sem critério`);
      assert.deepEqual(tree.saude, answers.saude, `${clock} · árvore saúde`);
      for (const epicId of Object.keys(answers.saude)) {
        const own = (await tech(views, "reasonKeys", epicId)).filter((key) => key.endsWith(`|epic:${epicId}`)).map((key) => key.split("|")[0]);
        assert.deepEqual(tree.motivosDoEpico[epicId], own, `${clock} · motivo do próprio ${epicId} na linha dele`);
      }
      if (clock === "10:40") await shot(views, "visoes-projetos-1440");
    });

    await check(`${clock}: o prédio diz o mesmo onde ele diz (quadro, lugares, não perturbe)`, async () => {
      // Teclado: da aba Projetos, seta para a esquerda volta ao Prédio.
      await views.locator('[data-view-tab="projetos"]').focus();
      await views.keyboard.press("ArrowLeft");
      await viewIs(views, "predio");
      assert.equal(await urlView(views), null, "o prédio não deixa ?visao= na URL");
      assert.equal(await views.evaluate(() => document.activeElement?.dataset.viewTab), "predio", "o foco acompanha a aba");
      await views.waitForFunction(() => !window.__HQ_TECH_QA__.render().paused);
      // De volta ao prédio, a cena volta a desenhar sozinha, sem depender de outra coisa mexer nela.
      const resumed = (await tech(views, "render")).frames;
      await views.waitForFunction((count) => window.__HQ_TECH_QA__.render().frames > count, resumed, { timeout: after(20000) });
      const answers = await tech(views, "answers");
      // Quadro dos épicos: a mesma saúde, no DOM e no que a cena desenhou.
      await views.waitForFunction((saude) => Object.entries(saude).every(([epicId, level]) => document.querySelector(`[data-epic-card="${epicId}"]`)?.dataset.health === level), answers.saude);
      await views.waitForFunction((saude) => window.__HQ_TECH_QA__.board().every((card) => card.health === saude[card.epicId]), answers.saude, { timeout: after(20000) });
      // Lugares: o plano que a cena segue põe cada um onde a presença manda.
      const plans = Object.fromEntries((await tech(views, "plans")).map((plan) => [plan.email, plan]));
      for (const email of answers.reuniao) assert.equal(plans[email].zone, "sala", `${clock} · ${email} em reunião está na sala`);
      for (const email of answers.huddle) assert.equal(plans[email].zone, "huddle", `${clock} · ${email} no canto do huddle`);
      assert.deepEqual(sorted(Object.values(plans).filter((plan) => plan.zone === "huddle").map((plan) => plan.email)), sorted(answers.huddle));
      assert.deepEqual(sorted(Object.values(plans).filter((plan) => plan.place === "fora").map((plan) => plan.email)), sorted(answers.fora), `${clock} · quem está fora sai pelo elevador`);
      // E a cena alcança o plano: quem está fora some, os outros chegam ao lugar.
      await sceneCaughtUp(views, Object.keys(plans), 60000);
      const scene = await tech(views, "scene");
      for (const email of answers.fora) assert.equal(scene[email].hidden, true, `${clock} · ${email} fora não aparece no andar`);
      // Foco: o "não perturbe" sobre a mesa é de quem o painel diz que está em foco.
      const dnd = await views.evaluate(() => [...document.querySelectorAll("[data-dnd]")].map((node) => node.dataset.dnd));
      assert.deepEqual(sorted(dnd), sorted(answers.foco), `${clock} · não perturbe no andar`);
    });
  }

  await check("custo com a visão aberta: quadros por segundo no Prédio e no Painel", async () => {
    await views.click('[data-view-tab="predio"]');
    await viewIs(views, "predio");
    await views.waitForFunction(() => !window.__HQ_TECH_QA__.render().paused);
    const sample = async () => {
      const start = (await tech(views, "render")).frames;
      await views.waitForTimeout(3000);
      return ((await tech(views, "render")).frames - start) / 3;
    };
    report.visoes.quadrosPorSegundo = { predio: await sample() };
    const running = (await tech(views, "render")).loop;
    await views.click('[data-view-tab="painel"]');
    await viewIs(views, "painel");
    await views.waitForFunction(() => window.__HQ_TECH_QA__.render().paused);
    report.visoes.quadrosPorSegundo.painel = await sample();
    const later = await tech(views, "render");
    // pendingAtPause: quadros que o R3F ainda devia em cada pausa (invalidate do modo "always"); a cena os
    // descarta, e nenhum quadro sai com a visão aberta, nem durante a amostra nem entre ela e a pausa.
    report.visoes.pausa = { devidosEmCadaPausa: later.pendingAtPause, quadrosParado: later.pausedFrames, lacoNoPredio: running, lacoNoPainel: later.loop };
    assert.equal(running.frameloop, "always");
    assert.deepEqual({ frameloop: later.loop.frameloop, pending: later.loop.pending }, { frameloop: "never", pending: 0 }, "com o Painel aberto o laço está parado e sem quadro devido");
    assert.ok(report.visoes.quadrosPorSegundo.predio > 0);
    assert.equal(report.visoes.quadrosPorSegundo.painel, 0, `com o Painel aberto saiu quadro: ${JSON.stringify(report.visoes.pausa)}`);
    assert.equal(later.pausedFrames, 0, "nenhum quadro desenhado com a cena pausada, em nenhuma das pausas da página");
    console.log(JSON.stringify({ ...report.visoes.quadrosPorSegundo, ...report.visoes.pausa }));
  });

  await check("com o Painel aberto, o relógio da simulação anda (a cena para, o dia não)", async () => {
    // A única prova das visões com o relógio de verdade: três segundos andando, e de novo parado.
    await viewIs(views, "painel");
    const start = await tech(views, "at");
    const frames = (await tech(views, "render")).frames;
    await tech(views, "pause", false);
    await views.waitForTimeout(3000);
    await tech(views, "pause", true);
    const end = await tech(views, "at");
    report.visoes.relogioComPainel = { segundosSimulados: (end - start) / 1000 };
    assert.ok(end > start, `o relógio andou com o Painel aberto (${start} → ${end})`);
    await views.waitForFunction((label) => document.querySelector("[data-view-clock]")?.textContent === label, await tech(views, "clock"));
    assert.equal((await tech(views, "render")).frames, frames, "e a cena seguiu sem desenhar");
  });
  await views.close();

  const viewsPhone = await open(`${TECH}&andar=expansao-2&hora_sim=09:05&visao=painel`, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await check("no celular: abas na barra sem sobrepor, Painel e Projetos sem rolagem lateral", async () => {
    await viewsPhone.waitForFunction(() => window.__HQ_TECH_QA__);
    await tech(viewsPhone, "pause", true);
    await tech(viewsPhone, "jumpToClock", "11:21");
    await viewIs(viewsPhone, "painel");
    await viewsPhone.waitForFunction(() => document.querySelector("[data-view-clock]")?.textContent === "11:21");
    const layout = () =>
      viewsPhone.evaluate(() => {
        const items = [...document.querySelectorAll(".office-top > *")].filter((node) => getComputedStyle(node).display !== "none").map((node) => node.getBoundingClientRect());
        const scroll = document.querySelector(".tv-scroll");
        return {
          outside: items.some((box) => box.right > window.innerWidth + 1),
          overlap: items.some((box, index) => items.slice(index + 1).some((other) => other.left < box.right - 1 && other.right > box.left + 1)),
          page: document.documentElement.scrollWidth - window.innerWidth,
          view: scroll ? scroll.scrollWidth - scroll.clientWidth : 0,
        };
      });
    let measured = await layout();
    assert.deepEqual(measured, { outside: false, overlap: false, page: 0, view: 0 }, `Painel no celular: ${JSON.stringify(measured)}`);
    assert.ok(await viewsPhone.locator('[data-view-tab="projetos"]').isVisible());
    const panel = await panelRead(viewsPhone);
    const answers = await tech(viewsPhone, "answers");
    assert.deepEqual(panel.travadas, answers.travadas);
    assert.deepEqual(panel.huddle, answers.huddle);
    await shot(viewsPhone, "visoes-painel-390");
    await viewsPhone.locator('[data-view-tab="projetos"]').tap();
    await viewIs(viewsPhone, "projetos");
    measured = await layout();
    assert.deepEqual(measured, { outside: false, overlap: false, page: 0, view: 0 }, `Projetos no celular: ${JSON.stringify(measured)}`);
    await shot(viewsPhone, "visoes-projetos-390");
    await viewsPhone.locator('[data-tree-story="HU-27"] .tv-open').tap();
    await viewsPhone.waitForSelector('[data-tech-epic="E-1"]');
    await shot(viewsPhone, "visoes-projetos-gaveta-390");
  });
  await viewsPhone.close();

  const viewsPlain = await open(`${DEMO}&andar=expansao-2&visao=painel`);
  await check("sem cenario: ?visao= não faz nada e nenhum pedaço das visões é baixado", async () => {
    await viewsPlain.waitForTimeout(2000);
    assert.equal(await viewsPlain.locator("[data-tech-views], [data-tech-view]").count(), 0);
    const downloaded = viewsPlain.requests.filter((file) => /\/assets\/(TechViews|DailyPanel|ProjectsView|viewParts|techViews|tech-views)/i.test(file) || file.includes("/src/tech/"));
    assert.deepEqual(downloaded, []);
  });
  await viewsPlain.close();

  writeFileSync(path.join(OUT, "resultado.json"), JSON.stringify(report, null, 2));
  assert.deepEqual(problems, []);
  console.log(`\ncenário de tecnologia ok: ${report.checks.length} provas`);
} finally {
  await browser.close();
}
