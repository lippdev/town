#!/usr/bin/env node
/**
 * Prova do esconderijo: achar a passagem de mouse e de teclado, entrar, voltar, ir e vir rápido,
 * movimento reduzido, URL e frota real sem segredo, figurantes só no andar à mostra, nada novo na
 * barra lateral, efeito real de cada easter egg, kit que falha e memória de GPU depois de aquecer.
 *
 * Uso: HQ_URL=http://127.0.0.1:5237 node scripts/visual-qa/office-hideout.mjs [pasta]
 * Perfil novo e /api/hq bloqueado: não fala com Hermes nenhum nem toca no navegador de ninguém.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const out = process.argv[2] ?? "qa/office-hideout";
const DEMO = "/?escritorio=completo&modo=demonstracao&chegada=carro";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: [`--use-angle=${process.env.HQ_ANGLE ?? "metal"}`, "--ignore-gpu-blocklist"] });
const checks = [];
const errors = [];
const check = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log(`  ok  ${name}`);
};
const open = async (url, options = {}, init, routes) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await context.route("**/api/hq/**", (route) => route.fulfill({ status: 503, body: "" }));
  if (routes) await routes(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  if (init) await page.addInitScript(init);
  await page.goto(`${base}${url}`);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 90000 });
  return page;
};
const state = (page) => page.evaluate(() => window.__HQ_OFFICE_QA__.state());
const arrived = (page) => page.waitForFunction(() => !window.__HQ_OFFICE_QA__.state().traveling, null, { timeout: 15000 });
const go = async (page, view) => {
  await page.click(`[data-floor-selector] [data-view="${view}"]`);
  await arrived(page);
};
/** De mouse, na cena: aponta, confere a legenda, e clica na peça. */
const clickSpot = async (page, id, caption) => {
  const point = await page.evaluate((target) => window.__HQ_OFFICE_QA__.secretPoint(target), id);
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction((target) => window.__HQ_OFFICE_QA__.state().secrets.activeSpot === target, id);
  if (caption) assert.match(await page.textContent(`[data-secret-spot="${id}"]`), caption);
  await page.mouse.click(point.x, point.y);
};
/** De teclado: Tab até o botão do segredo, sem mouse nenhum, e Enter. */
const tabTo = async (page, id) => {
  for (let index = 0; index < 60; index += 1) {
    await page.keyboard.press("Tab");
    if (await page.evaluate((target) => document.activeElement?.dataset.secretSpot === target, id)) return;
  }
  throw new Error(`Tab não chegou em ${id}`);
};
const noSecretAtStart = async (page) => {
  assert.equal(await page.locator('[data-floor-selector] [data-view="esconderijo"], [data-hideout-exit]').count(), 0, "o seletor entrega o segredo");
  assert.equal(await page.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("andar-esconderijo")), false, "esconderijo montado antes da hora");
};
const FORBIDDEN = /batman|morcego|batcaverna|batm[oó]vel/i;

try {
  await check("antes de achar, nada entrega o segredo: seletor, teclas, fachada, URL e textos", async () => {
    const page = await open(`${DEMO}&andar=exterior`);
    await page.waitForLoadState("networkidle");
    await noSecretAtStart(page);
    const point = await page.evaluate(() => window.__HQ_OFFICE_QA__.levelPoint(6));
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(200);
    assert.equal((await state(page)).buildingView, "exterior", "o pavimento 6 respondeu");
    const seen = [];
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press("PageDown");
      await arrived(page);
      seen.push((await state(page)).buildingView);
    }
    assert.ok(!seen.includes("esconderijo"), seen.join());
    await go(page, "diretoria");
    const text = await page.locator(".office-hud, .office-labels").allInnerTexts();
    assert.ok(!FORBIDDEN.test(text.join(" ")), "texto entrega o segredo");
    assert.equal(await page.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("esconderijo-kit")), false);
    await page.context().close();

    const asked = await open(`${DEMO}&andar=esconderijo`);
    const now = await state(asked);
    assert.equal(now.buildingView, "exterior", "a URL abriu o segredo");
    await noSecretAtStart(asked);
    await asked.context().close();
  });

  await check("de mouse: pista, livro abre a estante, passagem desce, porta sobe; Esc também volta", async () => {
    const page = await open(`${DEMO}&andar=diretoria`);
    await page.waitForLoadState("networkidle");
    await page.mouse.move(4, 4);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, "1-diretoria-fechada.png") });
    await clickSpot(page, "livro", /Um livro fora do lugar/);
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().secrets.doorOpen);
    assert.equal((await state(page)).buildingView, "diretoria", "abrir não pode descer sozinho");
    assert.equal(await page.locator('[data-floor-selector] [data-view="esconderijo"]').count(), 0, "seletor antes de entrar");
    await page.waitForTimeout(1100);
    await page.screenshot({ path: path.join(out, "2-diretoria-aberta.png") });
    await clickSpot(page, "livro", /Descer pela passagem/);
    assert.equal((await state(page)).buildingView, "esconderijo");
    await arrived(page);
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.objectNamed("esconderijo-kit"), null, { timeout: 20000 });
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().scenery.length === 1, null, { timeout: 15000 });
    let now = await state(page);
    assert.deepEqual(now.mountedFloors, ["esconderijo"]);
    assert.equal(new URL(page.url()).searchParams.get("andar"), "diretoria", "a URL não pode ter o segredo");
    assert.equal(now.scenery[0].id, "morcego-cenografico");
    await page.mouse.move(4, 4);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, "3-esconderijo.png") });
    const rooms = await page.locator(".office-labels [data-room]").evaluateAll((nodes) => nodes.map((node) => node.dataset.room));
    assert.equal(rooms.length, 5, rooms.join());
    assert.ok(await page.isVisible("[data-hideout-exit]"), "sem saída clara");

    await clickSpot(page, "porta", /Voltar à Diretoria/);
    await arrived(page);
    now = await state(page);
    assert.equal(now.buildingView, "diretoria");
    assert.deepEqual(now.mountedFloors, ["diretoria"]);
    assert.equal(now.secrets.doorOpen, true, "quem subiu acha a passagem aberta");
    assert.equal(await page.evaluate(() => window.__HQ_OFFICE_QA__.objectVisible("andar-esconderijo")), false);

    await go(page, "esconderijo");
    await page.keyboard.press("Escape");
    await arrived(page);
    assert.equal((await state(page)).buildingView, "diretoria", "Esc no esconderijo saiu para outro lugar");
    await go(page, "esconderijo");
    await page.click("[data-hideout-exit]");
    await arrived(page);
    assert.equal((await state(page)).buildingView, "diretoria");
    await go(page, "esconderijo");
    await page.keyboard.press("PageDown");
    await arrived(page);
    assert.equal((await state(page)).buildingView, "diretoria", "PageDown não voltou");

    await go(page, "expansao-3");
    assert.equal((await state(page)).secrets.doorOpen, false, "ir embora tem de fechar a estante");
    await page.context().close();
  });

  await check("só de teclado: Tab acha o livro, Enter abre, Enter desce, Tab acha a porta, Enter sobe", async () => {
    const page = await open(`${DEMO}&andar=diretoria`);
    await page.waitForLoadState("networkidle");
    await tabTo(page, "livro");
    assert.match(await page.getAttribute('[data-secret-spot="livro"]', "aria-label"), /fora do lugar/);
    await page.waitForFunction(() => getComputedStyle(document.activeElement).opacity === "1", null, { timeout: 2000 });
    await page.screenshot({ path: path.join(out, "4-teclado-foco.png") });
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().secrets.doorOpen);
    assert.match(await page.textContent("[data-secret-live]"), /passagem/);
    await page.keyboard.press("Enter");
    await arrived(page);
    assert.equal((await state(page)).buildingView, "esconderijo");
    await tabTo(page, "porta");
    await page.keyboard.press("Enter");
    await arrived(page);
    assert.equal((await state(page)).buildingView, "diretoria");
    await page.context().close();
  });

  await check("cada easter egg responde de verdade, de mouse e de teclado, e nada fica salvo", async () => {
    const page = await open(`${DEMO}&andar=diretoria`);
    await page.waitForLoadState("networkidle");
    const before = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    await clickSpot(page, "relogio", /10:47/);
    assert.equal((await state(page)).secrets.clockHint, true);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, "5-relogio-pista.png") });
    await clickSpot(page, "livro");
    await clickSpot(page, "livro");
    await arrived(page);
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.objectNamed("esconderijo-kit"), null, { timeout: 20000 });
    const screen = () => page.evaluate(() => window.__HQ_OFFICE_QA__.state().secrets.file);
    assert.equal(await screen(), 0);
    await clickSpot(page, "terminal", /Arquivo 1 de 3/);
    assert.equal(await screen(), 1);
    await tabTo(page, "terminal");
    await page.keyboard.press("Enter");
    assert.equal(await screen(), 2);
    await clickSpot(page, "holofote", /Ligar o holofote/);
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.objectNamed("esconderijo-sinal"));
    await clickSpot(page, "carro", /Ligar o motor/);
    assert.equal((await state(page)).secrets.engine, true);
    await clickSpot(page, "moeda", /Lançar a moeda/);
    let now = await state(page);
    assert.equal(now.secrets.coin, "cara");
    assert.equal(now.secrets.coinFlips, 1);
    await page.mouse.move(4, 4);
    await page.waitForTimeout(1700);
    await page.screenshot({ path: path.join(out, "6-esconderijo-tudo-ligado.png") });
    await go(page, "exterior");
    await page.waitForTimeout(600);
    assert.ok(await page.evaluate(() => window.__HQ_OFFICE_QA__.objectVisible("sinal-no-ceu")), "o sinal não apareceu no céu");
    await page.screenshot({ path: path.join(out, "7-sinal-no-ceu.png") });
    assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })), before, "guardou algo no navegador");
    await page.reload();
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 90000 });
    now = await state(page);
    assert.equal(now.secrets.found, false, "recarregar tem de esquecer");
    assert.equal(now.secrets.signal, false);
    await page.context().close();
  });

  await check("foto de perto: o morcego, o carro e o traje são reconhecíveis", async () => {
    const page = await open(`${DEMO}&andar=diretoria`);
    await page.waitForLoadState("networkidle");
    await clickSpot(page, "livro");
    await clickSpot(page, "livro");
    await arrived(page);
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.objectNamed("esconderijo-kit"), null, { timeout: 20000 });
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().scenery.length === 1, null, { timeout: 15000 });
    await page.waitForTimeout(1800);
    const photo = async (name, options) => {
      const url = await page.evaluate((opts) => window.__HQ_OFFICE_QA__.closeup(opts), options);
      writeFileSync(path.join(out, `${name}.png`), Buffer.from(url.split(",")[1], "base64"));
    };
    await photo("perto-morcego", { eye: [0, 7, 0], target: [-6.3, 1, -6.75], height: 3, far: 40 });
    await photo("perto-carro", { eye: [13.5, 7, 10.2], target: [6.5, 0.6, 3.2], height: 7, far: 40 });
    await photo("perto-traje", { eye: [8.8, 6, 0], target: [1.8, 1.3, -7], height: 4, far: 40 });
    await photo("perto-treino", { eye: [0, 7, 11.6], target: [-7, 0.8, 4.6], height: 9, far: 40 });
    await page.context().close();
  });

  await check("figurante não vai à barra lateral nem responde: o morcego é cenário como os outros", async () => {
    const page = await open(`${DEMO}&andar=diretoria`);
    await page.waitForLoadState("networkidle");
    const sidebar = () => page.locator(".office-roster, [data-people]").allInnerTexts();
    const start = await sidebar();
    await clickSpot(page, "livro");
    await clickSpot(page, "livro");
    await arrived(page);
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().scenery.length === 1, null, { timeout: 15000 });
    assert.deepEqual(await sidebar(), start, "a barra lateral mudou");
    assert.ok(!FORBIDDEN.test((await sidebar()).join(" ")));
    const point = await page.evaluate(() => window.__HQ_OFFICE_QA__.sceneryPoint("morcego-cenografico"));
    await page.mouse.click(point.x, point.y);
    const now = await state(page);
    assert.equal(now.selectedHumanId, null);
    assert.equal(now.selectedBotId, null);
    assert.equal(await page.locator("[data-human-panel], [data-demo-panel]").count(), 0);
    await page.context().close();
  });

  await check("viagens rápidas entre segredo, expansões e Diretoria terminam num andar só, sem ninguém a mais", async () => {
    const page = await open(`${DEMO}&andar=diretoria`);
    await page.waitForLoadState("networkidle");
    await clickSpot(page, "livro");
    await clickSpot(page, "livro");
    await arrived(page);
    const end = await page.evaluate(async (ids) => {
      const qa = window.__HQ_OFFICE_QA__;
      for (const id of ids) {
        document.querySelector(`[data-floor-selector] [data-view="${id}"]`).click();
        await new Promise((resolve) => setTimeout(resolve, 90));
      }
      while (qa.state().traveling) await new Promise(requestAnimationFrame);
      return qa.state();
    }, ["expansao-5", "esconderijo", "diretoria", "esconderijo", "expansao-2", "esconderijo"]);
    assert.equal(end.buildingView, "esconderijo");
    assert.deepEqual(end.mountedFloors, ["esconderijo"]);
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().scenery.every((person) => person.id === "morcego-cenografico"));
    assert.ok(await page.evaluate(() => window.__HQ_OFFICE_QA__.objectVisible("andar-esconderijo")));
    assert.equal(await page.evaluate(() => ["andar-diretoria", "andar-expansao-2", "andar-expansao-5"].some((name) => window.__HQ_OFFICE_QA__.objectNamed(name))), false);
    const back = await page.evaluate(async () => {
      const qa = window.__HQ_OFFICE_QA__;
      document.querySelector('[data-floor-selector] [data-view="expansao-4"]').click();
      await new Promise((resolve) => setTimeout(resolve, 60));
      document.querySelector('[data-floor-selector] [data-view="diretoria"]').click();
      while (qa.state().traveling) await new Promise(requestAnimationFrame);
      return qa.state();
    });
    assert.equal(back.buildingView, "diretoria");
    assert.deepEqual(back.mountedFloors, ["diretoria"]);
    assert.ok(back.scenery.every((person) => !person.id.startsWith("morcego") && !person.id.startsWith("expansao")));
    await page.context().close();
  });

  await check("laje da viagem até o segredo continua alinhada: nenhuma regressão no corte", async () => {
    const page = await open(`${DEMO}&andar=diretoria`);
    await page.waitForLoadState("networkidle");
    await clickSpot(page, "livro");
    await clickSpot(page, "livro");
    await arrived(page);
    await page.evaluate(() => window.__HQ_OFFICE_QA__.holdTravel(0.5));
    await page.click('[data-floor-selector] [data-view="expansao-3"]');
    await page.waitForTimeout(300);
    const held = await page.evaluate(() => ({ plate: window.__HQ_OFFICE_QA__.cutPlateBounds(), travel: window.__HQ_OFFICE_QA__.state().travel }));
    await page.screenshot({ path: path.join(out, "8-laje-na-viagem.png") });
    assert.ok(held.plate, "sem laje no meio da viagem");
    // No mundo, o topo da laje é o corte menos a âncora e a folga da fachada: a âncora só entra uma vez.
    assert.ok(Math.abs(held.plate.top - (held.travel.cut - held.travel.root - 0.05 + 0.005)) < 0.001, JSON.stringify(held));
    await page.evaluate(() => window.__HQ_OFFICE_QA__.holdTravel(null));
    await arrived(page);
    await page.context().close();
  });

  await check("movimento reduzido: troca na hora, sem quadro no caminho, e os segredos respondem parados", async () => {
    const page = await open(`${DEMO}&andar=diretoria`, { reducedMotion: "reduce" });
    await page.waitForLoadState("networkidle");
    await clickSpot(page, "livro");
    await page.waitForTimeout(120);
    assert.equal((await state(page)).secrets.doorOpen, true);
    await page.screenshot({ path: path.join(out, "9-reduzido-aberta.png") });
    await clickSpot(page, "livro");
    const now = await state(page);
    assert.equal(now.buildingView, "esconderijo");
    assert.equal(now.traveling, false, "reduzido não pode viajar");
    assert.deepEqual(now.mountedFloors, ["esconderijo"]);
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.objectNamed("esconderijo-kit"), null, { timeout: 20000 });
    await clickSpot(page, "carro");
    assert.equal((await state(page)).secrets.engine, true);
    await clickSpot(page, "moeda");
    assert.equal((await state(page)).secrets.coin, "cara");
    await page.mouse.move(4, 4);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, "10-reduzido-esconderijo.png") });
    await page.keyboard.press("Escape");
    assert.equal((await state(page)).buildingView, "diretoria");
    await page.context().close();
  });

  await check("a frota real não tem segredo: nem URL, nem botão, nem peça", async () => {
    for (const asked of ["esconderijo", "diretoria"]) {
      const live = await open(`/?escritorio=completo&andar=${asked}`);
      const now = await state(live);
      assert.equal(now.buildingView, "operacao");
      assert.deepEqual(now.mountedFloors, ["operacao"]);
      assert.equal(await live.locator("[data-secret-spot], [data-hideout-exit], [data-floor-selector]").count(), 0);
      assert.equal(await live.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("estante-secreta") || window.__HQ_OFFICE_QA__.objectNamed("andar-esconderijo")), false);
      const requests = await live.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => name.includes("/esconderijo/")));
      assert.deepEqual(requests, [], "a frota real baixou o kit");
      await live.context().close();
    }
  });

  await check("se o kit não baixa, a caverna autoral continua de pé e a saída funciona", async () => {
    const page = await open(`${DEMO}&andar=diretoria`, {}, undefined, (context) => context.route("**/esconderijo/kit.glb", (route) => route.abort()));
    await page.waitForLoadState("networkidle");
    await clickSpot(page, "livro");
    await clickSpot(page, "livro");
    await arrived(page);
    await page.waitForTimeout(1200);
    const now = await state(page);
    assert.equal(now.buildingView, "esconderijo");
    assert.equal(now.load, "ready", "o andar caiu junto");
    assert.ok(await page.evaluate(() => window.__HQ_OFFICE_QA__.objectVisible("andar-esconderijo")));
    await page.mouse.move(4, 4);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, "11-sem-kit.png") });
    await clickSpot(page, "porta");
    await arrived(page);
    assert.equal((await state(page)).buildingView, "diretoria");
    await page.context().close();
    // Abortar o arquivo é o próprio teste: o aviso disso não conta como erro da página.
    const expected = errors.filter((error) => !/kit\.glb|Failed to fetch/i.test(error));
    errors.length = 0;
    errors.push(...expected);
  });

  await check("celular: enquadra o esconderijo, mostra a saída e tocar no segredo funciona", async () => {
    for (const [width, height] of [[390, 844], [844, 390]]) {
      const phone = await open(`${DEMO}&andar=diretoria`, { viewport: { width, height }, hasTouch: true, isMobile: true });
      await phone.waitForLoadState("networkidle");
      const tap = async (id) => {
        const point = await phone.evaluate((target) => window.__HQ_OFFICE_QA__.secretPoint(target), id);
        await phone.touchscreen.tap(point.x, point.y);
      };
      await tap("livro");
      await phone.waitForFunction(() => window.__HQ_OFFICE_QA__.state().secrets.doorOpen);
      await phone.waitForTimeout(900);
      await phone.screenshot({ path: path.join(out, `celular-${width}-aberta.png`) });
      await tap("livro");
      await arrived(phone);
      await phone.waitForFunction(() => window.__HQ_OFFICE_QA__.objectNamed("esconderijo-kit"), null, { timeout: 20000 });
      await phone.waitForTimeout(1500);
      await phone.screenshot({ path: path.join(out, `celular-${width}-esconderijo.png`) });
      const box = await phone.locator("[data-floor-selector]").boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height, `seletor fora: ${JSON.stringify(box)}`);
      const exit = await phone.locator("[data-hideout-exit]").boundingBox();
      assert.ok(exit.width >= 24 && exit.height >= 24, `saída pequena: ${JSON.stringify(exit)}`);
      await phone.tap("[data-hideout-exit]");
      await arrived(phone);
      assert.equal((await state(phone)).buildingView, "diretoria");
      await phone.context().close();
    }
  });

  let before, after;
  const samples = [];
  await check("30 viagens passando pelo segredo, depois de aquecer 48, sem acúmulo na GPU", async () => {
    const page = await open(`${DEMO}&andar=diretoria`, {}, () => {
      const live = { textures: new Set(), framebuffers: new Set() };
      for (const [create, destroy, key] of [["createTexture", "deleteTexture", "textures"], ["createFramebuffer", "deleteFramebuffer", "framebuffers"]]) {
        const proto = WebGL2RenderingContext.prototype;
        const originalCreate = proto[create], originalDestroy = proto[destroy];
        proto[create] = function (...args) { const value = originalCreate.apply(this, args); if (value) live[key].add(value); return value; };
        proto[destroy] = function (value) { live[key].delete(value); return originalDestroy.call(this, value); };
      }
      window.__gpuCounts = () => ({ textures: live.textures.size, framebuffers: live.framebuffers.size });
    });
    await page.waitForLoadState("networkidle");
    await clickSpot(page, "livro");
    await clickSpot(page, "livro");
    await arrived(page);
    await page.waitForFunction(() => window.__HQ_OFFICE_QA__.objectNamed("esconderijo-kit"), null, { timeout: 20000 });
    const memory = () => page.evaluate(() => ({ ...window.__gpuCounts(), geometries: window.__HQ_OFFICE_QA__.renderInfo().geometries }));
    const round = ["diretoria", "esconderijo", "expansao-2", "esconderijo", "expansao-5", "esconderijo"];
    // As peças das figuras chegam aos poucos: até a sétima volta ainda há primeira vez na GPU. Medido à parte.
    for (let lap = 0; lap < 8; lap += 1) for (const view of round) await go(page, view);
    await page.waitForTimeout(1500);
    before = await memory();
    for (let lap = 0; lap < 5; lap += 1) {
      for (const view of round) await go(page, view);
      samples.push(await memory());
    }
    await page.waitForTimeout(500);
    after = await memory();
    assert.ok(after.framebuffers <= before.framebuffers, `framebuffers: ${JSON.stringify({ before, after })}`);
    assert.ok(after.textures <= before.textures + 2, `texturas: ${JSON.stringify({ before, after })}`);
    assert.ok(after.geometries <= before.geometries + 2, `geometrias: ${JSON.stringify({ before, after })}`);
    await page.mouse.move(4, 4);
    await page.waitForTimeout(800);
    const cost = await page.evaluate(() => {
      const { calls, triangles, textures, programs } = window.__HQ_OFFICE_QA__.renderInfo();
      return { calls, triangles, textures, programs };
    });
    writeFileSync(path.join(out, "custo.json"), JSON.stringify(cost, null, 2));
    console.log("  custo no esconderijo:", JSON.stringify(cost));
    await page.context().close();
  });

  assert.deepEqual(errors, []);
  writeFileSync(path.join(out, "resultado.json"), JSON.stringify({ checks, before, samples, after, errors }, null, 2));
  console.log(JSON.stringify({ before, after }));
  console.log(`\n${checks.length} verificações ok. Fotos em ${out}`);
} finally {
  await browser.close();
}
