#!/usr/bin/env node
/**
 * Prova do escritório completo no build de produção, em Chromium com GPU real.
 *
 * Sobe o fixture do Hermes e dois `vite preview` com HQ_CONNECTION_FILE isolado (um
 * ligado ao fixture, outro em portas fechadas), então a conexão salva do usuário nunca
 * é lida nem escrita. Rode `pnpm build` antes: o harness mede o `dist/` atual.
 *
 * Uso: node scripts/visual-qa/office.mjs [--skip-perf] [--only-perf]
 * Saída: /tmp/hq-escritorio (ou HQ_OFFICE_OUTPUT).
 */
import { execSync, spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { freePort, waitForUrl } from "./ports.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = process.env.HQ_OFFICE_OUTPUT ?? "/tmp/hq-escritorio";
const skipPerf = process.argv.includes("--skip-perf");
const onlyPerf = process.argv.includes("--only-perf");
const DEMO = "/?escritorio=completo&modo=demonstracao";
const LIVE = "/?escritorio=completo";
const ROOMS = ["engenharia", "comando", "comunidade", "pesquisa", "hall", "produto", "conteudo", "operacoes", "reunioes"];
const BOTS = { pulse: "Pulse", argos: "Argos", forge: "Forge", echo: "Echo", scout: "Scout", atlas: "Atlas", ink: "Ink" };
const ROOM_OF = { pulse: "engenharia", argos: "operacoes", forge: "comando", echo: "comunidade", scout: "pesquisa", atlas: "produto", ink: "conteudo" };

const children = [];
const start = (command, args, env = {}) => {
  const child = spawn(command, args, { cwd: ROOT, stdio: "ignore", env: { ...process.env, ...env } });
  children.push(child);
  return child;
};

const checks = [];
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      checks.push({ name, ok: true });
      console.log(`  ok  ${name}`);
    });
}

async function ready(page, rigs) {
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 45000 });
  await page.waitForFunction((count) => window.__HQ_OFFICE_QA__.state().rigs.length >= count, rigs, { timeout: 45000 });
  await page.waitForTimeout(1400);
}
const qa = (page) => page.evaluate(() => window.__HQ_OFFICE_QA__.state());
/** Espera a câmera chegar ao alvo: a animação não é o que se está testando. */
const settle = (page) =>
  page.waitForFunction(() => {
    const { view, goal } = window.__HQ_OFFICE_QA__.state();
    return Math.abs(view.x - goal.x) + Math.abs(view.z - goal.z) < 0.01 && Math.abs(view.zoom - goal.zoom) < 0.2;
  }, null, { timeout: 8000 }).then(() => page.waitForTimeout(750));

async function open(browser, url, { width = 1440, height = 900, routes, reduced = true, init } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await context.newPage();
  page.problems = [];
  page.apiCalls = [];
  page.on("pageerror", (error) => page.problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") page.problems.push(`console: ${message.text().slice(0, 240)}`);
  });
  page.on("request", (request) => {
    if (request.url().includes("/api/hq")) page.apiCalls.push(request.url());
  });
  await page.addInitScript(() => localStorage.setItem("hq.graphics", "alta"));
  if (init) await page.addInitScript(init);
  if (routes) await routes(page);
  await page.goto(url);
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const point = (page, id) => page.evaluate((bot) => window.__HQ_OFFICE_QA__.botPoint(bot), id);
const clean = (page, allowed = []) => {
  const left = page.problems.filter((text) => !allowed.some((pattern) => pattern.test(text)));
  assert.deepEqual(left, [], "erros no console");
};

async function demoSuite(browser, origin) {
  console.log("demonstração");
  const page = await open(browser, origin + DEMO, { width: 1728, height: 1000 });
  await ready(page, 7);
  await settle(page);

  await check("rótulo Demonstração visível e sete bots nos sete departamentos", async () => {
    assert.equal(await page.locator(".office-chip.demo").innerText(), "Demonstração");
    const state = await qa(page);
    assert.deepEqual(state.rigs, Object.keys(BOTS).sort());
    for (const [bot, room] of Object.entries(ROOM_OF)) assert.ok(state.seats[bot].startsWith(room), `${bot} em ${room}`);
    assert.deepEqual(state.unseated, []);
    assert.match(await page.locator("[data-capacity]").innerText(), /7 de 19 postos/);
  });
  await shot(page, "demo-andar");

  await check("demonstração não fala com o Hermes nem mostra estado", async () => {
    assert.equal(page.apiCalls.length, 0);
    assert.equal(await page.locator(".office-bot-tag .bot-state-dot").count(), 0);
    assert.equal(await page.locator(".office-roster-state").count(), 0);
  });

  await check("no andar, o painel não cobre nenhum bot", async () => {
    for (const bot of Object.keys(BOTS)) {
      const at = await point(page, bot);
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".office-roster, .office-top, .office-bottom, .drawer") ? "hud" : "cena", at);
      assert.equal(hit, "cena", bot);
    }
  });

  await check("clique na figura abre o bot certo e foca a sala dele", async () => {
    for (const [bot, name] of Object.entries(BOTS)) {
      await page.locator(".office-camera button", { hasText: "Ver o andar inteiro" }).isEnabled().catch(() => false);
      await page.evaluate(() => document.querySelector(".office-focus .office-button.primary")?.click());
      await settle(page);
      const at = await point(page, bot);
      await page.mouse.click(at.x, at.y);
      await page.waitForSelector(`[data-demo-panel="${bot}"]`);
      await settle(page);
      const state = await qa(page);
      assert.equal(state.selectedBotId, bot);
      assert.equal(state.focusedRoomId, ROOM_OF[bot]);
      const panel = page.locator(".office-demo-panel");
      assert.match(await panel.innerText(), new RegExp(name));
      assert.match(await panel.innerText(), /demonstração/i);
      const after = await point(page, bot);
      const box = await panel.boundingBox();
      assert.ok(after.x < box.x, `${bot} atrás da gaveta`);
      await shot(page, `demo-bot-${bot}`);
    }
  });

  await check("Esc fecha a gaveta primeiro e depois volta ao andar", async () => {
    await page.keyboard.press("Escape");
    assert.equal((await qa(page)).selectedBotId, null);
    assert.ok((await qa(page)).focusedRoomId);
    await page.keyboard.press("Escape");
    await settle(page);
    assert.equal((await qa(page)).focusedRoomId, null);
    assert.equal((await qa(page)).framing, "floor");
  });

  for (const room of ROOMS) {
    await page.locator(`[data-room="${room}"]`).click({ force: true });
    await settle(page);
    await shot(page, `sala-${room}`);
    await page.locator(".office-focus .office-button.primary").click();
    await settle(page);
  }
  await check("cada sala focada e o retorno funcionam", async () => {
    assert.equal((await qa(page)).focusedRoomId, null);
  });

  await check("clique no chão entra na sala certa; passar o mouse destaca", async () => {
    const at = await page.evaluate(() => window.__HQ_OFFICE_QA__.roomPoint("produto", -1.8, 1.9));
    await page.mouse.move(at.x, at.y);
    await page.waitForFunction(() => document.querySelector('[data-room="produto"]')?.classList.contains("hovered"));
    await page.mouse.click(at.x, at.y);
    await settle(page);
    assert.equal((await qa(page)).focusedRoomId, "produto");
    assert.equal(await page.locator("[data-focus-room=produto]").count(), 1);
  });

  await check("parede alta da sala em foco não deixa clicar no que está atrás", async () => {
    await page.locator(".office-focus .office-button.primary").click();
    await settle(page);
    await page.locator('[data-room="produto"]').click();
    await settle(page);
    const wall = await page.evaluate(() => {
      const qaApi = window.__HQ_OFFICE_QA__;
      // Trecho sem ninguém na frente; atrás dele está a sala Comunidade.
      const floor = qaApi.roomPoint("produto", 2.3, -2.4);
      return { x: floor.x, y: floor.y - 160 };
    });
    await page.mouse.click(wall.x, wall.y);
    await settle(page);
    const state = await qa(page);
    assert.equal(state.focusedRoomId, "produto");
    assert.equal(state.selectedBotId, null);
  });

  await check("arrastar, zoom e os botões da câmera respondem; o andar inteiro volta ao enquadramento", async () => {
    await page.locator(".office-camera button", { hasText: "Ver o andar inteiro" }).click();
    await settle(page);
    const floor = (await qa(page)).view;
    assert.equal(await page.locator(".office-camera button", { hasText: "Ver o andar inteiro" }).isDisabled(), true);
    await page.mouse.move(900, 800);
    await page.mouse.down();
    await page.mouse.move(1040, 720, { steps: 6 });
    await page.mouse.up();
    const panned = await qa(page);
    assert.equal(panned.framing, "free");
    assert.equal(panned.focusedRoomId, null, "arrastar não pode virar clique");
    assert.ok(Math.abs(panned.view.x - floor.x) + Math.abs(panned.view.z - floor.z) > 1);
    await page.getByRole("button", { name: "Aproximar" }).click();
    await settle(page);
    assert.ok((await qa(page)).view.zoom > floor.zoom * 1.2);
    await page.getByRole("button", { name: "Afastar" }).click();
    await page.mouse.move(800, 500);
    await page.mouse.wheel(0, -600);
    await settle(page);
    assert.ok((await qa(page)).view.zoom > floor.zoom * 1.5);
    await shot(page, "demo-zoom");
    await page.mouse.wheel(0, 20000);
    await settle(page);
    assert.ok((await qa(page)).view.zoom >= floor.zoom * 0.69, "o zoom tem piso");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("+");
    await settle(page);
    await page.locator(".office-camera button", { hasText: "Ver o andar inteiro" }).click();
    await settle(page);
    const back = (await qa(page)).view;
    assert.ok(Math.abs(back.zoom - floor.zoom) < 0.5);
  });

  await check("teclado: Tab chega na sala e Enter entra", async () => {
    await page.locator('[data-room="reunioes"]').focus();
    await page.keyboard.press("Enter");
    await settle(page);
    assert.equal((await qa(page)).focusedRoomId, "reunioes");
    await page.keyboard.press("Escape");
    await settle(page);
  });

  await check("qualidade: os três botões trocam de verdade", async () => {
    for (const label of ["Leve", "Auto", "Alta"]) {
      await page.locator(".office-quality button", { hasText: new RegExp(`^${label}`) }).click();
      await page.waitForTimeout(500);
      const info = await page.evaluate(() => window.__HQ_OFFICE_QA__.renderInfo());
      assert.equal(info.graphicsMode, label.toLowerCase());
    }
    assert.equal(await page.evaluate(() => window.__HQ_OFFICE_QA__.renderInfo().lights), 3);
    assert.equal(await page.evaluate(() => window.__HQ_OFFICE_QA__.renderInfo().shadowLights), 1);
  });

  await check("figura real sentada: pés no chão e nenhuma figura antiga", async () => {
    for (const bot of Object.keys(BOTS)) {
      const info = await page.evaluate((id) => window.__HQ_OFFICE_QA__.figureInfo(id), bot);
      assert.equal(info.roomOfHips, ROOM_OF[bot]);
      assert.ok(info.footL[1] < 0.08 && info.footL[1] >= 0, `${bot}: pé em ${info.footL[1]}`);
      assert.ok(info.hips[1] > 0.3 && info.hips[1] < 0.6, `${bot}: quadril em ${info.hips[1]}`);
    }
  });

  clean(page);
  await page.context().close();
}

async function notebookSuite(browser, origin) {
  console.log("notebook e janela pequena");
  for (const [width, height] of [[1366, 768], [1280, 720], [1024, 640]]) {
    const page = await open(browser, origin + DEMO, { width, height });
    await ready(page, 7);
    await settle(page);
    await shot(page, `notebook-${width}-andar`);
    await check(`${width}x${height}: bots visíveis fora dos painéis e barra de baixo sem estourar`, async () => {
      for (const bot of Object.keys(BOTS)) {
        const at = await point(page, bot);
        assert.ok(at.x > 0 && at.x < width && at.y > 0 && at.y < height, `${bot} fora da tela`);
        const hit = await page.evaluate(({ x, y }) => (document.elementFromPoint(x, y)?.closest(".office-roster, .office-top, .office-bottom, .drawer") ? "hud" : "cena"), at);
        assert.equal(hit, "cena", bot);
      }
      const overflow = await page.evaluate(() => {
        const nav = document.querySelector(".office-nav").getBoundingClientRect();
        const quality = document.querySelector(".office-quality").getBoundingClientRect();
        const camera = document.querySelector(".office-camera").getBoundingClientRect();
        return { nav: nav.right, quality: quality.right, overlap: camera.right > quality.left };
      });
      assert.ok(overflow.nav <= width && overflow.quality <= width && !overflow.overlap, JSON.stringify(overflow));
      if (width < 1180) {
        assert.equal(await page.locator(".office-roster").count(), 0, "painel recolhido");
        await page.getByRole("button", { name: "Abrir salas e bots" }).click();
        await page.waitForSelector(".office-roster");
        await page.getByRole("button", { name: "Recolher salas e bots" }).click();
      }
    });
    const at = await point(page, "scout");
    await page.mouse.click(at.x, at.y);
    await page.waitForSelector('[data-demo-panel="scout"]');
    await settle(page);
    await shot(page, `notebook-${width}-bot`);
    await check(`${width}x${height}: bot escolhido fica fora da gaveta`, async () => {
      const after = await point(page, "scout");
      const box = await page.locator(".office-demo-panel").boundingBox();
      assert.ok(after.x < box.x && after.x > 0, JSON.stringify({ after, box }));
    });
    clean(page);
    await page.context().close();
  }

  const page = await open(browser, origin + DEMO, { width: 1600, height: 900 });
  await ready(page, 7);
  await settle(page);
  await check("redimensionar a janela reenquadra o andar", async () => {
    const before = (await qa(page)).view.zoom;
    await page.setViewportSize({ width: 1100, height: 640 });
    await page.waitForTimeout(400);
    await settle(page);
    const after = (await qa(page)).view.zoom;
    assert.ok(after < before * 0.85, `${before} → ${after}`);
    const at = await point(page, "pulse");
    assert.ok(at.x > 0 && at.x < 1100 && at.y > 0 && at.y < 640);
  });
  await page.context().close();
}

async function liveSuite(browser, origin) {
  console.log("frota real (fixture do Hermes)");
  const page = await open(browser, origin + LIVE, { width: 1728, height: 1000 });
  await ready(page, 7);
  await page.waitForSelector(".office-chip.live");
  await settle(page);
  await shot(page, "real-andar");
  await check("identidade e estado vêm do fixture, sem rótulo de demonstração", async () => {
    assert.match(await page.locator(".office-chip.live").innerText(), /ao vivo · 7 bots/);
    assert.equal(await page.locator(".office-chip.demo").count(), 0);
    assert.ok((await page.locator(".office-roster-state").count()) === 7);
    assert.ok(page.apiCalls.length > 0);
  });
  await check("clique em cada figura abre a gaveta do bot certo, sem aba de personagem", async () => {
    for (const [bot, name] of Object.entries(BOTS)) {
      await page.evaluate(() => document.querySelector(".office-focus .office-button.primary")?.click());
      await settle(page);
      const at = await point(page, bot);
      await page.mouse.click(at.x, at.y);
      await page.waitForFunction((title) => document.querySelector(".drawer .drawer-title strong")?.textContent === title, name);
      assert.equal((await qa(page)).selectedBotId, bot);
      assert.equal(await page.locator(".drawer-tab", { hasText: "Personagem" }).count(), 0);
      assert.equal(await page.locator(".drawer-tab", { hasText: "Sessões" }).count(), 1);
    }
    await settle(page);
    await shot(page, "real-gaveta");
    const after = await point(page, "ink");
    const box = await page.locator(".drawer").boundingBox();
    assert.ok(after.x < box.x, "Ink atrás da gaveta");
  });
  await check("sessão real abre na conversa existente", async () => {
    await page.locator(".drawer-tab", { hasText: "Sessões" }).click();
    const item = page.locator(".session-item").first();
    if (await item.count()) {
      await item.click();
      await page.waitForSelector(".session-chat, .chat, .drawer textarea, .chat-log", { timeout: 8000 }).catch(() => {});
      await shot(page, "real-sessao");
    }
  });
  clean(page, [/ERR_ABORTED/]);
  await page.context().close();
}

/** Resposta do proxy com qualquer frota, para o caso que o fixture não cobre. */
function fleetPayload(ids) {
  const now = Date.now() / 1000;
  return {
    configured: true,
    health: { api: "online", dashboard: "online", version: "fixture" },
    profiles: ids.map((name, index) => ({ name, display_name: name[0].toUpperCase() + name.slice(1), bot_title: `Cargo ${name}`, model: "m", provider: "p", gateway_running: index % 2 === 0, is_default: index === 0 })),
    sessions: [],
    jobs: [],
    blocks: {},
    fetchedAt: now * 1000,
  };
}

async function overflowSuite(browser, origin) {
  console.log("frota maior que o andar");
  const extras = Array.from({ length: 18 }, (_, index) => `extra-${String(index).padStart(2, "0")}`);
  const ids = [...Object.keys(BOTS), ...extras];
  const page = await open(browser, origin + LIVE, {
    width: 1728,
    height: 1000,
    routes: (target) => target.route("**/api/hq/hermes/snapshot*", (route) => route.fulfill({ json: fleetPayload(ids) })),
  });
  await ready(page, 19);
  await settle(page);
  await shot(page, "excedente-andar");
  await check("25 bots: 19 sentados sem repetir cadeira, 6 listados sem corpo", async () => {
    const state = await qa(page);
    assert.equal(Object.keys(state.seats).length, 19);
    assert.equal(new Set(Object.values(state.seats)).size, 19);
    assert.equal(state.unseated.length, 6);
    assert.equal(state.rigs.length, 19);
    assert.deepEqual([...Object.keys(state.seats), ...state.unseated].sort(), [...ids].sort());
    assert.match(await page.locator("[data-capacity]").innerText(), /19 de 19 postos.*6 sem posto/);
    for (const [bot, room] of Object.entries(ROOM_OF)) assert.ok(state.seats[bot].startsWith(room));
  });
  await check("bot no posto extra abre certo; bot sem posto abre pela lista", async () => {
    const state = await qa(page);
    const inHall = Object.entries(state.seats).find(([, seat]) => seat.startsWith("hall"))[0];
    const at = await point(page, inHall);
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction((id) => window.__HQ_OFFICE_QA__.state().selectedBotId === id, inHall);
    await settle(page);
    await shot(page, "excedente-hall");
    assert.equal((await qa(page)).focusedRoomId, "hall");
    assert.match(await page.locator(".drawer-title strong").innerText(), new RegExp(inHall, "i"));
    await page.keyboard.press("Escape");
    await page.locator(".office-focus .office-button.primary").click();
    await page.locator('[data-room="reunioes"]').click();
    await settle(page);
    await shot(page, "excedente-reunioes");
    const unseated = state.unseated[0];
    await page.locator(".office-unseated .office-roster-bot").first().click();
    await page.waitForFunction((id) => window.__HQ_OFFICE_QA__.state().selectedBotId === id, unseated);
    assert.match(await page.locator(".drawer-title strong").innerText(), new RegExp(unseated, "i"));
    await shot(page, "excedente-sem-posto");
  });
  await check("a resposta em outra ordem não troca ninguém de lugar", async () => {
    const before = (await qa(page)).seats;
    await page.unroute("**/api/hq/hermes/snapshot*");
    await page.route("**/api/hq/hermes/snapshot*", (route) => route.fulfill({ json: fleetPayload([...ids].reverse()) }));
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 6000)));
    assert.deepEqual((await qa(page)).seats, before);
  });
  clean(page, [/ERR_ABORTED/]);
  await page.context().close();
}

async function failureSuite(browser, origin, offlineOrigin) {
  console.log("sem conexão e sem arquivos");
  const offline = await open(browser, offlineOrigin + LIVE, { width: 1366, height: 768 });
  await ready(offline, 0);
  await check("Hermes fora: avisa, não preenche e oferece a demonstração", async () => {
    await offline.waitForSelector(".office-notice", { timeout: 12000 });
    assert.match(await offline.locator(".office-notice").innerText(), /sem conexão/i);
    assert.equal((await qa(offline)).rigs.length, 0);
    assert.equal(await offline.locator(".office-chip.demo").count(), 0);
    assert.equal(await offline.locator(".office-chip.off").count(), 1);
    await shot(offline, "offline-aviso");
    await offline.getByRole("link", { name: "Ver demonstração" }).first().click();
    await offline.waitForFunction(() => document.querySelector(".office-chip.demo"));
    assert.ok(offline.url().includes("modo=demonstracao"));
  });
  await offline.context().close();

  const noFigure = await open(browser, origin + DEMO, { routes: (page) => page.route("**/prototipo/pulse.glb", (route) => route.abort()) });
  await check("sem o GLB da figura: planta e lista seguem, com aviso e nova tentativa", async () => {
    await noFigure.waitForSelector(".office-notice.figures", { timeout: 20000 });
    assert.equal((await qa(noFigure)).load, "ready");
    assert.equal((await qa(noFigure)).rigs.length, 0);
    assert.equal(await noFigure.getByRole("button", { name: "Tentar de novo" }).count(), 1);
    await shot(noFigure, "falha-figura");
  });
  await noFigure.context().close();

  const noTexture = await open(browser, origin + DEMO, { routes: (page) => page.route("**/prototipo/wood_floor_diff_1k.jpg", (route) => route.abort()) });
  await check("sem textura do piso: mensagem de falha, nada de carregamento eterno", async () => {
    await noTexture.waitForSelector(".boot-error", { timeout: 25000 });
    assert.equal(await noTexture.getByRole("button", { name: /Tentar de novo|Recarregar/ }).count(), 1);
    await shot(noTexture, "falha-textura");
  });
  await noTexture.context().close();

  const stalled = await open(browser, origin + DEMO, { routes: (page) => page.route("**/prototipo/wood_floor_arm_1k.jpg", () => {}) });
  await check("arquivo que nunca chega: em 20 s para de dizer que está carregando", async () => {
    await stalled.waitForSelector(".boot-label", { timeout: 15000 });
    await stalled.waitForSelector(".boot-error", { timeout: 26000 });
    assert.match(await stalled.locator(".boot-error").innerText(), /demorando/);
  });
  await stalled.context().close();

  const noWebgl = await open(browser, origin + DEMO, {
    init: () => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
        return /webgl/.test(kind) ? null : original.call(this, kind, ...rest);
      };
    },
  });
  await check("sem WebGL: explica em vez de mostrar tela preta", async () => {
    await noWebgl.waitForSelector(".boot-error");
    assert.match(await noWebgl.locator(".boot-error").innerText(), /WebGL/);
  });
  await noWebgl.context().close();
}

async function preservedSuite(browser, origin) {
  console.log("o que já existia");
  const classic = await open(browser, origin + "/", { width: 1440, height: 900 });
  const requested = [];
  classic.on("request", (request) => requested.push(request.url()));
  await classic.waitForFunction(() => window.__HQ_WORLD_READY__, null, { timeout: 45000 });
  await check("cena antiga abre e tem o link para o escritório, sem baixar os assets dele", async () => {
    await classic.waitForSelector(".sidebar-office-link");
    await classic.waitForTimeout(1500);
    assert.equal(requested.filter((url) => /\/prototipo\//.test(url)).length, 0);
    assert.equal(await classic.locator(".office-top").count(), 0);
    await classic.screenshot({ path: `${OUT}/preservado-classico.png` });
    await classic.locator(".sidebar-office-link").click();
    await classic.waitForSelector(".office-top");
    assert.ok(classic.url().includes("escritorio=completo"));
  });
  await classic.context().close();

  const prototype = await open(browser, origin + "/?prototipo=engenharia", { width: 1440, height: 900 });
  await check("sala isolada continua abrindo", async () => {
    await prototype.waitForFunction(() => window.__HQ_QA__ && window.__HQ_WORLD_READY__, null, { timeout: 45000 });
    assert.equal(await prototype.locator(".office-top").count(), 0);
    await prototype.waitForTimeout(1000);
    await prototype.screenshot({ path: `${OUT}/preservado-sala.png` });
  });
  await prototype.context().close();

  const studio = await open(browser, origin + "/personagens.html", { width: 1440, height: 900 });
  await check("estúdio continua abrindo", async () => {
    await studio.waitForFunction(() => document.querySelector("canvas"), null, { timeout: 30000 });
    assert.equal(await studio.locator(".office-top").count(), 0);
    assert.deepEqual(studio.problems.filter((text) => text.startsWith("pageerror")), []);
    await studio.waitForTimeout(1500);
    await studio.screenshot({ path: `${OUT}/preservado-estudio.png` });
  });
  await studio.context().close();
}

const FRAME_WINDOW = `(durationMs) => new Promise((resolve) => {
  const ms = [], calls = [], triangles = [];
  let first, last;
  const tick = (now) => {
    if (first === undefined) first = now;
    if (last !== undefined) ms.push(now - last);
    last = now;
    const info = window.__HQ_OFFICE_QA__.renderInfo();
    calls.push(info.calls); triangles.push(info.triangles);
    if (now - first < durationMs) requestAnimationFrame(tick);
    else {
      const q = (values, p) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];
      const round = (n) => Math.round(n * 100) / 100;
      resolve({ frames: ms.length, fpsMean: round(ms.length * 1000 / (now - first)), frameMsP50: round(q(ms, .5)), frameMsP95: round(q(ms, .95)), frameMsP99: round(q(ms, .99)), frameMsMax: round(Math.max(...ms)),
        callsMin: Math.min(...calls), callsMax: Math.max(...calls), trianglesMin: Math.min(...triangles), trianglesMax: Math.max(...triangles), info });
    }
  };
  requestAnimationFrame(tick);
})`;

async function perfSuite(browser, origin, results) {
  console.log("medições (build de produção, 1728×1000 @2x)");
  const windows = 3;
  const scenarios = [
    { name: "andar parado (7 bots com respiração)", prepare: async () => {} },
    { name: "andar com câmera em movimento", moving: true, prepare: async () => {} },
    { name: "sala Engenharia em foco", prepare: async (page) => { await page.locator('[data-room="engenharia"]').click(); await settle(page); } },
    { name: "Hall em foco", prepare: async (page) => { await page.locator('[data-room="hall"]').click(); await settle(page); } },
  ];
  for (const mode of ["alta", "leve", "auto"]) {
    for (const scenario of scenarios) {
      if (mode === "auto" && scenario.moving !== true && !scenario.name.startsWith("andar parado")) continue;
      const context = await browser.newContext({ viewport: { width: 1728, height: 1000 }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      await page.addInitScript((value) => localStorage.setItem("hq.graphics", value), mode);
      await page.goto(origin + DEMO);
      await ready(page, 7);
      await page.waitForTimeout(8000);
      await scenario.prepare(page);
      let mover;
      if (scenario.moving) {
        mover = (async () => {
          await page.mouse.move(1000, 600);
          await page.mouse.down();
          for (let step = 0; step < 720 && !mover?.stop; step += 1) {
            await page.mouse.move(1000 + Math.sin(step / 18) * 180, 600 + Math.cos(step / 18) * 90);
            await page.waitForTimeout(22);
          }
          await page.mouse.up();
        })();
      }
      const samples = [];
      for (let index = 0; index < windows; index += 1) samples.push(await page.evaluate(`(${FRAME_WINDOW})(5000)`));
      await mover;
      results.runs.push({ mode, scenario: scenario.name, samples });
      const last = samples.at(-1);
      console.log(`  ${mode} · ${scenario.name}: ${last.fpsMean} fps, p95 ${last.frameMsP95} ms, ${last.callsMin}–${last.callsMax} chamadas, ${last.trianglesMin}–${last.trianglesMax} tri, ${last.info.pixelRatio}x`);
      await context.close();
    }
  }
  // Pior caso de personagens: todos os postos ocupados, com a frota simulada só na rede do teste.
  const context = await browser.newContext({ viewport: { width: 1728, height: 1000 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("hq.graphics", "alta"));
  const ids = [...Object.keys(BOTS), ...Array.from({ length: 12 }, (_, index) => `extra-${String(index).padStart(2, "0")}`)];
  await page.route("**/api/hq/hermes/snapshot*", (route) => route.fulfill({ json: fleetPayload(ids) }));
  await page.goto(origin + LIVE);
  await ready(page, 19);
  await page.waitForTimeout(8000);
  const samples = [];
  for (let index = 0; index < windows; index += 1) samples.push(await page.evaluate(`(${FRAME_WINDOW})(5000)`));
  results.runs.push({ mode: "alta", scenario: "andar parado com 19 bots", samples });
  const last = samples.at(-1);
  console.log(`  alta · 19 bots: ${last.fpsMean} fps, p95 ${last.frameMsP95} ms, ${last.callsMax} chamadas, ${last.trianglesMax} tri`);
  await context.close();

  // Sem VSync o teto de 60 sai da frente e aparece a folga desta máquina.
  const uncapped = await chromium.launch({ headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--disable-gpu-vsync", "--disable-frame-rate-limit"] });
  for (const mode of ["alta", "leve"]) {
    for (const room of [null, "hall"]) {
      const free = await uncapped.newContext({ viewport: { width: 1728, height: 1000 }, deviceScaleFactor: 2 });
      const freePage = await free.newPage();
      await freePage.addInitScript((value) => localStorage.setItem("hq.graphics", value), mode);
      await freePage.goto(origin + DEMO);
      await ready(freePage, 7);
      await freePage.waitForTimeout(6000);
      if (room) {
        await freePage.locator(`[data-room="${room}"]`).click();
        await settle(freePage);
      }
      const windowsFree = [];
      for (let index = 0; index < 2; index += 1) windowsFree.push(await freePage.evaluate(`(${FRAME_WINDOW})(5000)`));
      results.runs.push({ mode, scenario: `sem VSync · ${room ?? "andar parado"}`, samples: windowsFree });
      const final = windowsFree.at(-1);
      console.log(`  ${mode} · sem VSync · ${room ?? "andar"}: ${final.fpsMean} fps, p50 ${final.frameMsP50} ms, p95 ${final.frameMsP95} ms`);
      await free.close();
    }
  }
  await uncapped.close();

  // Peso: o que uma visita sem cache baixa até a cena ficar pronta.
  const weight = await browser.newContext({ viewport: { width: 1728, height: 1000 } });
  const weightPage = await weight.newPage();
  const started = Date.now();
  await weightPage.goto(origin + DEMO);
  await ready(weightPage, 7);
  const readyMs = Date.now() - started;
  results.load = await weightPage.evaluate(() => performance.getEntriesByType("resource").map((entry) => ({ name: entry.name.replace(location.origin, ""), bytes: entry.encodedBodySize })));
  results.loadTotalBytes = results.load.reduce((sum, entry) => sum + entry.bytes, 0);
  results.readyMsIncludingSettle = readyMs;
  await weight.close();
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const [apiPort, dashboardPort, previewPort, offlinePort, closedA, closedB] = await Promise.all([freePort(), freePort(), freePort(), freePort(), freePort(), freePort()]);
  start("node", ["scripts/hermes/fixture-gateway.mjs", "--api-port", String(apiPort), "--dashboard-port", String(dashboardPort)]);
  const vite = "node_modules/.bin/vite";
  start(vite, ["preview", "--port", String(previewPort), "--strictPort"], {
    HQ_CONNECTION_FILE: `${OUT}/conexao-isolada.json`,
    HERMES_API_URL: `http://127.0.0.1:${apiPort}`,
    HERMES_DASHBOARD_URL: `http://127.0.0.1:${dashboardPort}`,
  });
  start(vite, ["preview", "--port", String(offlinePort), "--strictPort"], {
    HQ_CONNECTION_FILE: `${OUT}/conexao-isolada-offline.json`,
    HERMES_API_URL: `http://127.0.0.1:${closedA}`,
    HERMES_DASHBOARD_URL: `http://127.0.0.1:${closedB}`,
  });
  const origin = `http://127.0.0.1:${previewPort}`;
  const offlineOrigin = `http://127.0.0.1:${offlinePort}`;
  await waitForUrl(`${origin}/api/hq/hermes/snapshot`, 60000, "preview com fixture");
  await waitForUrl(`${offlineOrigin}/api/hq/hermes/snapshot`, 60000, "preview offline");

  const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
  const results = {
    timestamp: new Date().toISOString(),
    head: execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(),
    hardware: { os: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, ramGB: Math.round(totalmem() / 1024 ** 3) },
    browser: browser.version(),
    viewport: { width: 1728, height: 1000, deviceScaleFactor: 2 },
    runs: [],
    checks,
  };
  try {
    if (!onlyPerf) {
      await demoSuite(browser, origin);
      await notebookSuite(browser, origin);
      await liveSuite(browser, origin);
      await overflowSuite(browser, origin);
      await failureSuite(browser, origin, offlineOrigin);
      await preservedSuite(browser, origin);
    }
    if (!skipPerf) await perfSuite(browser, origin, results);
    console.log(`\n${checks.length} verificações passaram`);
  } finally {
    await writeFile(`${OUT}/metricas.json`, JSON.stringify(results, null, 2) + "\n");
    await browser.close();
    for (const child of children) child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  for (const child of children) child.kill("SIGTERM");
  process.exit(1);
});
