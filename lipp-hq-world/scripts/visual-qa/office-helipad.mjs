#!/usr/bin/env node
/**
 * Prova do heliporto: o deque no exterior, chegada e saída de helicóptero com fotos no meio do voo,
 * ida e volta sem duplicar o chefe, interrupções, troca de andar no meio, movimento reduzido, frota
 * real sem helicóptero, celular, dia e noite. Mede o custo do exterior com e sem helicóptero.
 *
 * Uso: HQ_URL=http://127.0.0.1:5251 HQ_ANGLE=metal node scripts/visual-qa/office-helipad.mjs [pasta]
 * Cada página usa um perfil novo: nada toca no que você salvou no navegador.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const ANGLE = process.env.HQ_ANGLE ?? (process.platform === "darwin" ? "metal" : "swiftshader");
const CHROME = process.env.CHROME_PATH || (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);
/** Numa máquina sem GPU um quadro custa segundos: o relógio do harness acompanha por HQ_TIMEOUT_SCALE. */
const SCALE = Number(process.env.HQ_TIMEOUT_SCALE ?? 1);
const after = (ms) => Math.round(ms * SCALE);
const OUT = process.argv[2] ?? "qa/office-helipad";
const DEMO = "/?escritorio=completo&modo=demonstracao";
const HELI = `${DEMO}&chegada=helicoptero`;
const CAR = `${DEMO}&chegada=carro`;
const IGNORED = [/THREE\.Clock/, /GPU stall/, /GL Driver Message/, /Hermes/, /\/api\/hq\//, /Program Info Log/];
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

async function open(url, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  await context.route("**/api/hq/**", (route) => route.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.location().url.includes("/api/hq/")) return;
    if (["error", "warning"].includes(message.type()) && !IGNORED.some((pattern) => pattern.test(message.text()))) problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(String(error)));
  await page.goto(`${BASE}${url}`);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: after(90000) });
  return page;
}
const state = (page) => page.evaluate(() => window.__HQ_OFFICE_QA__.state());
const helipad = async (page) => (await state(page)).helipad;
const settled = (page) =>
  page.waitForFunction(() => {
    const { view, goal, traveling } = window.__HQ_OFFICE_QA__.state();
    return !traveling && Math.abs(view.x - goal.x) + Math.abs(view.z - goal.z) < 0.01 && Math.abs(view.zoom - goal.zoom) < 0.2;
  }, null, { timeout: after(15000) });
const photo = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), timeout: after(30000) });
const goTo = async (page, view) => {
  await page.click(`[data-floor-selector] [data-view="${view}"]`);
  await settled(page);
};
const untilStep = (page, step, timeout = 40000) => page.waitForFunction((wanted) => window.__HQ_OFFICE_QA__.state().helipad.step === wanted, step, { timeout: after(timeout) });
const untilStatus = (page, status, timeout = 45000) => page.waitForFunction((wanted) => window.__HQ_OFFICE_QA__.state().chiefStatus === wanted, status, { timeout: after(timeout) });
/** O helicóptero está num pixel desta janela da cena, a meio voo. */
const untilOnScreen = (page, width, height, timeout = 20000, margin = 80) =>
  page.waitForFunction(({ width, height, margin }) => {
    const point = window.__HQ_OFFICE_QA__.helicopterPoint();
    return point && point.x > margin && point.x < width - margin && point.y > margin && point.y < height - margin;
  }, { width, height, margin }, { timeout: after(timeout) });
const heliVisible = (page) => page.evaluate(() => window.__HQ_OFFICE_QA__.objectVisible("helicoptero"));
const figureVisible = (page) => page.evaluate(() => window.__HQ_OFFICE_QA__.objectVisible("chefe-no-deque"));
/** Aponta e clica no livro da estante, como quem usa o mouse. */
const clickBook = async (page) => {
  const point = await page.evaluate(() => window.__HQ_OFFICE_QA__.secretPoint("livro"));
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().secrets.activeSpot === "livro", null, { timeout: after(5000) });
  await page.mouse.click(point.x, point.y);
};
/** Entra no esconderijo de verdade: a primeira vez abre a estante, a segunda desce. */
const intoHideout = async (page) => {
  await page.mouse.move(4, 4);
  await clickBook(page);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().secrets.doorOpen, null, { timeout: after(5000) });
  await page.waitForTimeout(1100);
  await clickBook(page);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().buildingView === "esconderijo", null, { timeout: after(8000) });
  await settled(page);
};
const chief = async (page) => (await state(page)).humans.find((human) => human.id === "chefe");
/** Quantos corpos dele estão à vista agora: nunca mais de um, nem de relance. */
const chiefBodies = async (page) => {
  const body = await chief(page);
  return (body?.visible ? 1 : 0) + ((await figureVisible(page)) ? 1 : 0);
};
/** Fica de olho enquanto a função roda: se dois corpos aparecerem juntos, a prova falha. */
async function watchBodies(page, fn) {
  let worst = 0;
  let running = true;
  const watcher = (async () => {
    while (running) {
      worst = Math.max(worst, await chiefBodies(page));
      await page.waitForTimeout(120);
    }
  })();
  await fn();
  running = false;
  await watcher;
  assert.ok(worst <= 1, `chefe duplicado: ${worst} corpos`);
}
const openDrawer = async (page) => {
  await page.click('[data-person-row="chefe"]');
  await page.waitForSelector('[data-human-panel="chefe"]');
  await settled(page);
};
const action = (page, name) => page.locator(`[data-chief-action="${name}"]`);
const info = (page) => page.evaluate(() => {
  const { calls, triangles, textures, lights, programs } = window.__HQ_OFFICE_QA__.renderInfo();
  return { calls, triangles, textures, lights, programs };
});

const cost = {};

await check("o deque aparece no exterior, sem helicóptero construído para quem chegou de carro", async () => {
  const page = await open(`${CAR}&hora=12:00`);
  await settled(page);
  await untilStatus(page, "mesa", 30000);
  assert.equal(await page.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("helicoptero")), false);
  const now = await helipad(page);
  assert.equal(now.present, false);
  assert.equal(now.parked, false);
  const spire = await page.evaluate(() => window.__HQ_OFFICE_QA__.spirePoint());
  assert.ok(spire.y > 52 && spire.x > 0 && spire.x < 1440, `mastro fora: ${JSON.stringify(spire)}`);
  await page.mouse.move(4, 4);
  await page.waitForTimeout(600);
  cost.exteriorDeckVazio = await info(page);
  await photo(page, "01-exterior-dia-deck-vazio");
  await page.context().close();
});

await check("de noite as luzes de borda acendem", async () => {
  const page = await open(`${CAR}&hora=22:00`);
  await settled(page);
  await page.waitForTimeout(800);
  await photo(page, "02-exterior-noite-deck-vazio");
  await page.context().close();
});

await check("chegada de helicóptero: entra na tela, pousa, ele desce e fica pousado com o chefe na mesa", async () => {
  const page = await open(`${HELI}&hora=12:00`);
  await settled(page);
  await watchBodies(page, async () => {
    assert.equal((await state(page)).chiefStatus, "chegandoHeli");
    await untilOnScreen(page, 1440, 900);
    assert.equal(await heliVisible(page), true);
    const first = await helipad(page);
    await photo(page, "03-chegada-no-meio-do-voo");
    cost.exteriorEmVoo = await info(page);
    assert.equal(first.rotor, 1);
    assert.ok(first.pose.y > (await page.evaluate(() => 57)), "voa acima da torre");
    await untilStep(page, "spinDown");
    const touched = await helipad(page);
    assert.ok(touched.rotor > 0.5, `rotor já parado no pouso: ${touched.rotor}`);
    await photo(page, "04-chegada-pousou-rotor-girando");
    await untilStep(page, "disembark");
    assert.equal((await helipad(page)).rotor, 0);
    await page.waitForTimeout(1600);
    assert.equal(await figureVisible(page), true);
    await photo(page, "05-chegada-chefe-no-deque");
    await untilStatus(page, "descendo");
    assert.equal(await figureVisible(page), false);
    await untilStatus(page, "mesa");
  });
  const landed = await helipad(page);
  assert.equal(landed.parked, true);
  assert.equal(landed.present, true);
  assert.equal(landed.rotor, 0);
  assert.equal(await heliVisible(page), true);
  await page.waitForTimeout(600);
  cost.exteriorPousado = await info(page);
  await photo(page, "06-exterior-pousado");

  await goTo(page, "diretoria");
  // Com o corte aberto, nada do heliporto em cena, e o chefe de volta ao corpo dele.
  assert.equal(await heliVisible(page), false);
  await page.waitForFunction(() => {
    const body = window.__HQ_OFFICE_QA__.state().humans.find((human) => human.id === "chefe");
    return body?.mounted && body.visible && body.phase === "seated";
  }, null, { timeout: after(20000) });
  assert.equal(await chiefBodies(page), 1);
  cost.diretoriaComHelicoptero = await info(page);
  await photo(page, "07-diretoria-sem-heliporto-a-vista");
  await page.context().close();
});

await check("sair de helicóptero: embarca, decola, sai de cena e a gaveta diz que ele está fora", async () => {
  const page = await open(`${HELI}&hora=12:00`);
  await untilStatus(page, "mesa");
  await goTo(page, "diretoria");
  await openDrawer(page);
  await photo(page, "08-gaveta-no-predio");
  assert.equal(await action(page, "saida").count(), 1);
  assert.equal(await action(page, "volta-heli").count(), 0);
  await watchBodies(page, async () => {
    await action(page, "saida").click();
    await settled(page);
    assert.equal((await state(page)).buildingView, "exterior");
    await untilStatus(page, "embarcando");
    await page.waitForTimeout(1800);
    assert.equal(await figureVisible(page), true);
    await photo(page, "09-saida-embarcando");
    await untilStep(page, "spinUp");
    assert.equal(await figureVisible(page), false);
    await page.waitForTimeout(1400);
    const spinning = await helipad(page);
    assert.ok(spinning.rotor > 0 && spinning.rotor < 1, `rotor ${spinning.rotor}`);
    await untilStep(page, "outbound");
    await page.waitForTimeout(5000);
    await untilOnScreen(page, 1440, 900);
    await photo(page, "10-saida-no-meio-do-voo");
    await untilStatus(page, "fora", 25000);
  });
  const gone = await helipad(page);
  assert.equal(gone.present, false);
  assert.equal(gone.parked, false);
  assert.equal(await page.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("helicoptero")), false);
  await page.waitForTimeout(500);
  await photo(page, "11-exterior-depois-de-sair");

  await openDrawer(page);
  const body = await chief(page);
  assert.equal((await state(page)).buildingView, "diretoria");
  assert.equal(body.visible, false, "fora do prédio, sem corpo na Diretoria");
  assert.equal(await page.locator('[data-human="chefe"]').count(), 0, "sem etiqueta boiando");
  assert.equal(await page.locator("[data-chief-away]").count(), 1);
  assert.equal(await page.evaluate(() => window.__HQ_OFFICE_QA__.objectVisible("placa-do-chefe")), false, "mesa vazia não diz na mesa");
  assert.equal(await action(page, "volta-heli").count(), 1);
  assert.equal(await action(page, "volta-carro").count(), 1);
  assert.equal(await action(page, "saida").count(), 0);
  await page.waitForTimeout(700);
  await photo(page, "12-gaveta-fora-do-predio");

  // E volta: ida e volta sem duplicar.
  await watchBodies(page, async () => {
    await action(page, "volta-heli").click();
    await settled(page);
    await untilOnScreen(page, 1440, 900);
    await untilStatus(page, "mesa");
  });
  assert.equal((await helipad(page)).parked, true);
  await goTo(page, "diretoria");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().humans.find((human) => human.id === "chefe")?.visible === true, null, { timeout: after(15000) });
  assert.equal(await page.locator('[data-human="chefe"]').count(), 1);
  assert.equal((await state(page)).humans.filter((human) => human.id === "chefe").length, 1);
  await page.context().close();
});

await check("tendo chegado de carro, o helicóptero vem buscá-lo antes de sair", async () => {
  const page = await open(`${CAR}&hora=22:00`);
  await untilStatus(page, "mesa", 30000);
  assert.equal((await helipad(page)).parked, false);
  await goTo(page, "diretoria");
  await openDrawer(page);
  await action(page, "saida").click();
  await settled(page);
  await untilStatus(page, "aguardando", 5000);
  assert.equal((await helipad(page)).step, "pickup");
  await untilOnScreen(page, 1440, 900);
  await photo(page, "13-noite-buscando-o-chefe");
  await untilStep(page, "leaving");
  const waiting = await helipad(page);
  assert.equal(waiting.rotor, 1, "pousou só para buscar: não desliga");
  await untilStatus(page, "embarcando");
  await page.waitForTimeout(1800);
  await photo(page, "14-noite-embarcando-rotor-girando");
  await untilStatus(page, "fora", 30000);
  await page.context().close();
});

await check("interrupções: pedir outra coisa no meio não trava, não duplica e não deixa nada no ar", async () => {
  const page = await open(`${HELI}&hora=12:00`);
  // No meio do pouso, pede a chegada de carro: abre a gaveta, o que leva à Diretoria, e o voo continua.
  await untilOnScreen(page, 1440, 900);
  await openDrawer(page);
  assert.equal((await state(page)).chiefStatus, "chegandoHeli");
  assert.equal(await heliVisible(page), false, "com o corte aberto o helicóptero não aparece");
  assert.equal(await action(page, "saida").count(), 0, "sem chegar, não sai");
  await action(page, "chegada").click();
  await settled(page);
  await untilStatus(page, "chegando", 3000);
  const dropped = await helipad(page);
  assert.equal(dropped.present, false, "sem helicóptero parado no ar");
  assert.equal(dropped.step, null);
  assert.equal(await page.evaluate(() => window.__HQ_OFFICE_QA__.objectVisible("carro-do-chefe")), true);
  await untilStatus(page, "mesa", 30000);

  // De carro, deque vazio. Pede a saída, e no meio do voo de busca pede para voltar.
  assert.equal((await helipad(page)).parked, false);
  await goTo(page, "diretoria");
  await openDrawer(page);
  await action(page, "saida").click();
  await settled(page);
  await untilStep(page, "pickup", 3000);
  await openDrawer(page);
  await action(page, "volta-carro").click();
  await settled(page);
  await untilStatus(page, "mesa", 30000);
  assert.equal((await helipad(page)).present, false);

  // Sair e, já decolando, pedir a volta de helicóptero: recomeça da chegada, sem dois helicópteros.
  await goTo(page, "diretoria");
  await openDrawer(page);
  await action(page, "chegada-heli").click();
  await settled(page);
  await untilStatus(page, "mesa");
  await goTo(page, "diretoria");
  await openDrawer(page);
  await action(page, "saida").click();
  await settled(page);
  await untilStep(page, "outbound");
  await openDrawer(page);
  assert.equal((await state(page)).chiefStatus, "decolando");
  await action(page, "volta-heli").click();
  await settled(page);
  assert.equal((await helipad(page)).step, "inbound");
  await untilStatus(page, "mesa");
  assert.equal((await helipad(page)).parked, true);

  // Sair no meio de uma ronda: o corpo some na hora, sem ficar andando pela Diretoria.
  await goTo(page, "diretoria");
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().humans.find((human) => human.id === "chefe")?.phase === "seated", null, { timeout: after(10000) });
  await openDrawer(page);
  await page.click('button:has-text("Andar pela Diretoria")');
  await untilStatus(page, "ronda", 15000);
  assert.equal(await action(page, "saida").count(), 1);
  await action(page, "saida").click();
  await settled(page);
  assert.equal((await chief(page))?.visible ?? false, false);
  await untilStatus(page, "fora", 45000);
  assert.deepEqual((await state(page)).humans.filter((human) => human.id === "chefe").map((human) => human.floor), ["diretoria"]);
  assert.equal((await state(page)).humans.filter((human) => human.id === "chefe").length, 1);
  await page.context().close();
});

await check("trocar de andar e ir ao esconderijo no meio do voo: o roteiro segue pelo relógio", async () => {
  const page = await open(`${HELI}&hora=12:00`);
  await untilOnScreen(page, 1440, 900);
  const before = await helipad(page);
  await goTo(page, "operacao");
  assert.equal(await heliVisible(page), false);
  await photo(page, "15-operacao-durante-o-voo");
  await goTo(page, "terreo");
  assert.equal(await heliVisible(page), false);
  await goTo(page, "exterior");
  const after2 = await helipad(page);
  assert.notDeepEqual(after2.pose, before.pose, "o voo andou com o corte aberto");
  // Volta no ponto certo, sem repetir o começo.
  assert.ok(["inbound", "spinDown", "disembark", "descending"].includes(after2.step) || after2.step === null, after2.step);
  assert.equal(await heliVisible(page), after2.pose !== null);
  await untilStatus(page, "mesa");
  await goTo(page, "diretoria");
  await openDrawer(page);
  await action(page, "saida").click();
  await settled(page);
  await untilStatus(page, "embarcando");
  await page.evaluate(() => document.querySelector('[data-view="diretoria"]').click());
  await settled(page);
  assert.equal(await figureVisible(page), false, "o chefe do deque não vaza para a Diretoria");
  assert.equal(await chiefBodies(page), 0);
  await untilStatus(page, "fora", 30000);
  assert.equal((await helipad(page)).present, false);
  await page.context().close();

  // O esconderijo, de verdade: entra pela estante com o helicóptero a caminho, e sai com ele pousado.
  const hideout = await open(`${HELI}&hora=12:00&andar=diretoria`);
  await settled(hideout);
  await intoHideout(hideout);
  assert.equal(await heliVisible(hideout), false);
  await photo(hideout, "24-esconderijo-durante-o-voo");
  assert.equal(await figureVisible(hideout), false);
  await untilStatus(hideout, "mesa");
  assert.equal((await helipad(hideout)).parked, true);
  assert.equal(await heliVisible(hideout), false, "no esconderijo o deque não está à vista");
  await goTo(hideout, "exterior");
  await hideout.waitForTimeout(300);
  assert.equal(await heliVisible(hideout), true, "de volta ao exterior, pousado");
  await photo(hideout, "25-exterior-depois-do-esconderijo");
  await hideout.context().close();
});

await check("no meio da viagem do exterior para um andar, o helicóptero some com a coroa e a laje fecha", async () => {
  const page = await open(`${HELI}&hora=12:00`);
  await untilStatus(page, "mesa");
  await page.evaluate(() => window.__HQ_OFFICE_QA__.holdTravel(0.12));
  await page.click('[data-floor-selector] [data-view="diretoria"]');
  await page.waitForTimeout(350);
  await photo(page, "16-viagem-cortando-o-deque");
  await page.evaluate(() => window.__HQ_OFFICE_QA__.holdTravel(0.5));
  await page.waitForTimeout(250);
  await photo(page, "17-viagem-no-meio");
  await page.evaluate(() => window.__HQ_OFFICE_QA__.holdTravel(null));
  await settled(page);
  assert.equal((await state(page)).buildingView, "diretoria");
  assert.equal(await heliVisible(page), false);
  await page.context().close();
});

await check("movimento reduzido: sem voo, o estado final entra direto", async () => {
  const page = await open(`${HELI}&hora=12:00`, { reducedMotion: "reduce" });
  await settled(page);
  await untilStatus(page, "mesa", 3000);
  const parked = await helipad(page);
  assert.equal(parked.parked, true);
  assert.equal(parked.step, null);
  assert.equal(parked.rotor, 0);
  await page.waitForTimeout(500);
  assert.equal(await heliVisible(page), true);
  await photo(page, "18-reduzido-pousado");
  await goTo(page, "diretoria");
  await openDrawer(page);
  await action(page, "saida").click();
  await untilStatus(page, "fora", 2000);
  assert.equal((await helipad(page)).present, false);
  await page.waitForTimeout(300);
  await photo(page, "19-reduzido-fora");
  await openDrawer(page);
  await action(page, "volta-heli").click();
  await untilStatus(page, "mesa", 2000);
  assert.equal((await helipad(page)).parked, true);
  await page.context().close();
});

await check("montar e desmontar o helicóptero repetidas vezes não acumula nada na GPU", async () => {
  const page = await open(`${HELI}&hora=12:00`, { reducedMotion: "reduce" });
  await untilStatus(page, "mesa", 3000);
  const memory = () => page.evaluate(() => {
    const { geometries, textures, programs } = window.__HQ_OFFICE_QA__.renderInfo();
    return { geometries, textures, programs };
  });
  const roundTrip = async () => {
    await openDrawer(page);
    await action(page, "saida").click();
    await untilStatus(page, "fora", 2000);
    await page.waitForTimeout(150);
    await openDrawer(page);
    await action(page, "volta-heli").click();
    await untilStatus(page, "mesa", 2000);
    await page.waitForTimeout(150);
  };
  for (let round = 0; round < 3; round += 1) await roundTrip();
  const before = await memory();
  for (let round = 0; round < 8; round += 1) await roundTrip();
  assert.deepEqual(await memory(), before);
  await page.context().close();
});

await check("a frota real não tem heliporto: nem deque, nem helicóptero, nem botão", async () => {
  const live = await open("/?escritorio=completo&chegada=helicoptero");
  await live.waitForTimeout(1500);
  assert.equal((await state(live)).buildingView, "operacao");
  assert.equal(await live.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("fachada")), false);
  assert.equal(await live.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("helicoptero")), false);
  assert.equal(await live.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("heliporto-em-cena")), false);
  assert.equal((await helipad(live)).present, false);
  assert.equal(await live.locator("[data-chief-action]").count(), 0);
  await photo(live, "20-frota-real");
  await live.context().close();
});

await check("celular: o deque e o voo cabem, e o mastro fica na tela", async () => {
  const phone = await open(`${HELI}&hora=12:00`, { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  await settled(phone);
  const spire = await phone.evaluate(() => window.__HQ_OFFICE_QA__.spirePoint());
  assert.ok(spire.x > 0 && spire.x < 390 && spire.y > 40 && spire.y < 800, `mastro fora: ${JSON.stringify(spire)}`);
  // À direita fica o seletor: a foto espera o helicóptero passar dele.
  await phone.waitForFunction(() => {
    const point = window.__HQ_OFFICE_QA__.helicopterPoint();
    return point && point.x > 20 && point.x < 300 && point.y > 40 && point.y < 780;
  }, null, { timeout: after(20000) });
  await photo(phone, "21-celular-no-voo");
  await untilStatus(phone, "mesa");
  await phone.waitForTimeout(400);
  await photo(phone, "22-celular-pousado");
  await phone.context().close();
});

await check("tela larga: o mastro cabe e o voo passa pelo quadro", async () => {
  const wide = await open(`${HELI}&hora=12:00`, { viewport: { width: 1920, height: 600 } });
  await settled(wide);
  await wide.waitForTimeout(200);
  const spire = await wide.evaluate(() => window.__HQ_OFFICE_QA__.spirePoint());
  assert.ok(spire.x > 0 && spire.x < 1920 && spire.y > 40 && spire.y < 600, `mastro fora: ${JSON.stringify(spire)}`);
  await untilOnScreen(wide, 1920, 600);
  await photo(wide, "23-tela-larga-no-voo");
  await wide.context().close();
});

await check("o parâmetro inválido da chegada cai no sorteio, sem erro", async () => {
  const page = await open(`${DEMO}&chegada=foguete`);
  await page.waitForTimeout(600);
  assert.ok(["chegando", "chegandoHeli"].includes((await state(page)).chiefStatus));
  await page.context().close();
});

console.log(JSON.stringify(cost));
writeFileSync(path.join(OUT, "custo.json"), JSON.stringify(cost, null, 2));
await browser.close();
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`\n${checks.length} verificações ok. Fotos em ${OUT}`);
