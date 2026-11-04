/**
 * Testa o estúdio de personagens num navegador de verdade, lendo os materiais e os
 * vértices da cena em vez de confiar no estado da página. Requer Vite no ar:
 *   HQ_ORIGIN=http://127.0.0.1:5198 node scripts/visual-qa/character-studio.mjs
 * Falha com código 1 se algum item não passar.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.HQ_ORIGIN ?? "http://127.0.0.1:5198";
const output = process.env.HQ_STUDIO_OUTPUT ?? "/tmp/hq-personagens";
const url = `${origin}/personagens.html?qa`;
const STORAGE_KEY = "hq.personagens.v1";
const BACKUP_KEY = "hq.personagens.backup";
await mkdir(output, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "ok  " : "FALHA"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
const fixed = (value) => Number(value).toFixed(3);

const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });

async function open({ viewport = { width: 1440, height: 900 }, init, gotoUrl = url, reducedMotion = "reduce", permissions = [] } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion, acceptDownloads: true, permissions });
  const page = await context.newPage();
  const issues = { errors: [], external: [], warnings: [] };
  page.on("pageerror", (error) => issues.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") issues.errors.push(message.text());
    if (message.type() === "warning") issues.warnings.push(message.text());
  });
  page.on("request", (request) => {
    if (!request.url().startsWith(origin) && !request.url().startsWith("blob:") && !request.url().startsWith("data:")) issues.external.push(request.url());
  });
  if (init) await page.addInitScript(init.fn, init.arg);
  await page.goto(gotoUrl);
  return { context, page, issues };
}

const ready = (page) => page.waitForSelector(".cs-dock--view", { timeout: 30_000 });
const snapshot = (page) => page.evaluate(() => window.__CHARACTER_STUDIO_QA__.snapshot());
const frames = (page) => page.evaluate(() => window.__CHARACTER_STUDIO_QA__.frames());
const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
const settle = (page, ms = 350) => page.waitForTimeout(ms);
const slider = (page, label) => page.getByRole("slider", { name: label, exact: true });
async function setSlider(page, label, value) {
  await slider(page, label).fill(String(value));
  await settle(page, 120);
}
const hexField = (page, label) => page.getByRole("textbox", { name: label, exact: true });
async function setHex(page, label, value) {
  await hexField(page, label).fill(value);
  await hexField(page, label).blur();
  await settle(page, 80);
}
const figureHeight = (snap) => snap.bounds.max[1] - snap.bounds.min[1];
const shot = (page, name) => page.screenshot({ path: `${output}/${name}.png` });

/** Conta pixels opacos que passam no teste; lê o PNG que o próprio canvas entrega. */
const countPixels = (page, predicateSource) => page.evaluate(async (source) => {
  const predicate = new Function("r", "g", "b", "a", `return ${source}`);
  const image = new Image();
  image.src = window.__CHARACTER_STUDIO_QA__.capture();
  await image.decode();
  const canvas = Object.assign(document.createElement("canvas"), { width: image.width, height: image.height });
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  let total = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (predicate(data[index], data[index + 1], data[index + 2], data[index + 3])) total += 1;
  }
  return total;
}, predicateSource);

try {
  // ── Base real ─────────────────────────────────────────────────────────────
  {
    const before = createHash("sha256").update(await readFile("public/prototipo/pulse.glb")).digest("hex");
    const { context, page, issues } = await open();
    await ready(page);
    await settle(page);
    const snap = await snapshot(page);
    check("base: cores na malha iguais às do arquivo", Object.entries(snap.fileColors).every(([slot, hex]) => snap.materials[slot].hex === hex), JSON.stringify(snap.fileColors));
    check("base: seis materiais nomeados presos às malhas", Object.values(snap.materials).every((item) => item.meshes === 1 && item.name));
    check("base: esqueleto e clipes preservados", snap.bones === 23 && snap.clips.length === 2, `${snap.bones} ossos, ${snap.clips}`);
    check("base: cabeça do arquivo em 0.52", near(snap.fileHeadScale, 0.52, 1e-6) && near(snap.headBoneScale[1], 0.52, 1e-6));
    check("base: altura medida nos vértices é 1,76 m", near(figureHeight(snap), 1.76, 0.002), fixed(figureHeight(snap)));
    check("base: pés no chão", near(snap.bounds.min[1], 0, 0.002), fixed(snap.bounds.min[1]));
    check("créditos visíveis com autor e licença", await page.getByText("Quaternius").isVisible() && await page.getByText("CC0 1.0").isVisible());
    check("explica que pedidos livres são feitos no chat", await page.getByText("não interpreta texto nem chama IA").count() === 1);
    await shot(page, "01-base");
    for (const [view, file] of [["Frente", "02-frente"], ["Lado", "03-lado"], ["Costas", "04-costas"]]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await settle(page);
      check(`vista ${view}: botão marcado`, await page.getByRole("button", { name: view, exact: true }).getAttribute("aria-pressed") === "true");
      await shot(page, file);
    }
    check("nenhuma requisição externa", issues.external.length === 0, issues.external.join(" "));
    check("sem erro de console na carga", issues.errors.length === 0, issues.errors.join(" | "));
    const after = createHash("sha256").update(await readFile("public/prototipo/pulse.glb")).digest("hex");
    check("pulse.glb intacto", before === after && before === "9312180dcd6e92bd9fc207e74a6eaf1e682a1a71e8089a8a0cb4c8314ba59c1c");
    await context.close();
  }

  // ── Cores aplicadas de verdade ────────────────────────────────────────────
  {
    const { context, page } = await open();
    await ready(page);
    const expected = { Pele: ["skin", "#7a4a2e"], Cabelo: ["hair", "#9a3412"], Camisa: ["shirt", "#00c853"], Bermuda: ["pants", "#7c3aed"], Cinto: ["belt", "#b91c1c"], "Olhos e sobrancelhas": ["face", "#111111"] };
    const greenBefore = await countPixels(page, "a > 200 && g > r * 1.6 && g > b * 1.4");
    for (const [label, [, hex]] of Object.entries(expected)) await setHex(page, label, hex);
    const snap = await snapshot(page);
    check("cores: material de cada malha mudou", Object.values(expected).every(([slot, hex]) => snap.materials[slot].hex === hex), JSON.stringify(Object.fromEntries(Object.entries(snap.materials).map(([k, v]) => [k, v.hex]))));
    const greenAfter = await countPixels(page, "a > 200 && g > r * 1.6 && g > b * 1.4");
    check("cores: a camisa aparece verde nos pixels renderizados", greenBefore < 50 && greenAfter > 5000, `${greenBefore} → ${greenAfter}`);
    const violet = await countPixels(page, "a > 200 && b > g * 1.5 && r > g * 1.1");
    check("cores: a bermuda aparece violeta nos pixels renderizados", violet > 1000, `${violet}`);
    check("cores: cada material ficou com a sua cor, sem contaminar outro", snap.materials.skin.hex !== snap.materials.shirt.hex);
    await hexField(page, "Camisa").fill("azul");
    await hexField(page, "Camisa").blur();
    await settle(page, 80);
    check("cores: texto inválido não muda o material", (await snapshot(page)).materials.shirt.hex === "#00c853" && await hexField(page, "Camisa").inputValue() === "#00c853");
    await page.getByRole("button", { name: "Camisa #55664a" }).click();
    await settle(page, 80);
    check("cores: amostra da paleta aplica", (await snapshot(page)).materials.shirt.hex === "#55664a");
    await shot(page, "05-cores");
    await context.close();
  }

  // ── Proporções medidas nos vértices ───────────────────────────────────────
  {
    const { context, page } = await open();
    await ready(page);
    const base = await snapshot(page);
    await setSlider(page, "Altura", 2);
    let snap = await snapshot(page);
    check("altura: 2,00 m medidos", near(figureHeight(snap), 2, 0.004), fixed(figureHeight(snap)));
    check("altura: pés seguem no chão", near(snap.bounds.min[1], 0, 0.003), fixed(snap.bounds.min[1]));
    await setSlider(page, "Altura", 1.5);
    snap = await snapshot(page);
    check("altura: 1,50 m medidos", near(figureHeight(snap), 1.5, 0.004), fixed(figureHeight(snap)));
    await setSlider(page, "Altura", 1.76);

    await setSlider(page, "Largura do corpo", 1.2);
    snap = await snapshot(page);
    const shirtRatio = snap.slotBounds.shirt.width / base.slotBounds.shirt.width;
    const hairRatio = snap.slotBounds.hair.width / base.slotBounds.hair.width;
    check("largura: tronco 20% mais largo", near(shirtRatio, 1.2, 0.01), fixed(shirtRatio));
    check("largura: cabeça compensada não deforma", near(hairRatio, 1, 0.015), fixed(hairRatio));
    check("largura: altura não muda", near(figureHeight(snap), 1.76, 0.004), fixed(figureHeight(snap)));
    await shot(page, "06-largura-max");
    await setSlider(page, "Largura do corpo", 1);

    await setSlider(page, "Tamanho da cabeça", 1.3);
    snap = await snapshot(page);
    // A altura total é mantida, então a figura encolhe um pouco: mede relativo ao corpo.
    const headToBody = (value) => value.slotBounds.hair.width / value.slotBounds.shirt.width;
    const headRatio = headToBody(snap) / headToBody(base);
    check("cabeça: 30% maior em relação ao corpo", near(headRatio, 1.3, 0.01), fixed(headRatio));
    check("cabeça: a altura total continua a pedida", near(figureHeight(snap), 1.76, 0.004), fixed(figureHeight(snap)));
    await page.getByRole("button", { name: "Enquadrar o rosto" }).click();
    await settle(page);
    await shot(page, "07-cabeca-max");
    await setSlider(page, "Tamanho da cabeça", 0.8);
    snap = await snapshot(page);
    check("cabeça: 20% menor em relação ao corpo", near(headToBody(snap) / headToBody(base), 0.8, 0.01), fixed(headToBody(snap) / headToBody(base)));
    await shot(page, "08-cabeca-min");
    await page.getByRole("button", { name: "Enquadrar o corpo inteiro" }).click();
    await page.getByRole("button", { name: "Voltar Tamanho da cabeça ao valor da base" }).click();
    await settle(page, 120);
    check("reset do controle volta ao valor da base", near((await snapshot(page)).headBoneScale[1], 0.52, 1e-6));

    // poses continuam corretas depois de mexer nas proporções
    await setSlider(page, "Largura do corpo", 1.15);
    await setSlider(page, "Altura", 1.9);
    const standing = await snapshot(page);
    await page.getByRole("button", { name: "Sentado" }).click();
    await settle(page);
    const seated = await snapshot(page);
    check("sentado: o quadril desce de verdade", seated.hipsY < standing.hipsY - 0.15, `${fixed(standing.hipsY)} → ${fixed(seated.hipsY)}`);
    check("sentado: pés continuam no chão", near(seated.bounds.min[1], 0, 0.02), fixed(seated.bounds.min[1]));
    check("sentado: banco aparece", seated.seatVisible === true);
    check("sentado: figura fica centrada no palco", near(seated.bounds.min[2] + seated.bounds.max[2], 0, 0.05), fixed(seated.bounds.min[2] + seated.bounds.max[2]));
    await page.getByRole("button", { name: "Lado", exact: true }).click();
    await settle(page);
    await shot(page, "09-sentado-lado");
    await page.getByRole("button", { name: "Em pé" }).click();
    await settle(page);
    const back = await snapshot(page);
    check("em pé de novo: quadril volta e banco some", near(back.hipsY, standing.hipsY, 0.005) && !back.seatVisible, `${fixed(back.hipsY)}`);
    await context.close();
  }

  // ── Transição de pose, com animação ligada ────────────────────────────────
  {
    const { context, page } = await open({ reducedMotion: "no-preference" });
    await ready(page);
    const start = await frames(page);
    await page.getByRole("button", { name: "Sentado" }).click();
    await settle(page, 1500);
    const seated = await snapshot(page);
    check("transição: senta tocando o clipe e para sozinha", seated.pose === "sitting" && !seated.animating && (await frames(page)) - start > 10, `${(await frames(page)) - start} quadros`);
    const stopped = await frames(page);
    await settle(page, 500);
    check("transição: terminada, não renderiza mais", (await frames(page)) === stopped);
    await page.getByRole("button", { name: "Em pé" }).click();
    await settle(page, 1500);
    const standing = await snapshot(page);
    check("transição: levanta tocando o clipe ao contrário e para", standing.pose === "standing" && !standing.animating && !standing.seatVisible && standing.hipsY > seated.hipsY + 0.1);
    await context.close();
  }

  // ── Variações: criar, renomear, duplicar, excluir, desfazer, recarregar ───
  {
    const { context, page, issues } = await open();
    await ready(page);
    check("variações: lista começa vazia", await page.getByText("Nenhuma ainda.").isVisible());
    const presetBefore = await page.getByRole("button", { name: /Pulse \(base\)/ }).innerText();
    await setHex(page, "Camisa", "#112233");
    check("editar modelo abre variação", (await stored(page).catch(() => null)) !== undefined && await page.getByRole("textbox", { name: "Nome do personagem" }).inputValue() === "Pulse — variação");
    await page.getByRole("button", { name: /Pulse \(base\)/ }).click();
    await settle(page, 120);
    check("modelo da fonte continua intacto", (await snapshot(page)).materials.shirt.hex === "#3b82f6" && await page.getByRole("button", { name: /Pulse \(base\)/ }).innerText() === presetBefore);
    await page.getByRole("button", { name: /Pulse — variação/ }).click();
    await settle(page, 120);
    check("voltar à variação reaplica a cor", (await snapshot(page)).materials.shirt.hex === "#112233");

    const name = page.getByRole("textbox", { name: "Nome do personagem" });
    await name.fill("Ana");
    await name.press("Enter");
    await settle(page, 80);
    check("renomear", await page.getByRole("button", { name: /^Ana/ }).count() === 1);
    await name.fill("   ");
    await name.blur();
    await settle(page, 80);
    check("nome vazio é recusado", await name.inputValue() === "Ana");

    await page.getByRole("button", { name: "Duplicar", exact: true }).click();
    await settle(page, 80);
    check("duplicar", await name.inputValue() === "Ana — cópia");
    await setSlider(page, "Altura", 1.7);
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await settle(page, 80);
    check("excluir", await page.getByRole("button", { name: /Ana — cópia/ }).count() === 0);
    await page.locator(".cs-toast__action").click();
    await settle(page, 120);
    check("desfazer devolve o excluído", await page.getByRole("button", { name: /Ana — cópia/ }).count() === 1 && near(figureHeight(await snapshot(page)), 1.7, 0.004));

    // Vários passos do mesmo controle viram um só no desfazer
    await page.getByRole("button", { name: /^Ana\b/ }).first().click();
    await slider(page, "Largura do corpo").focus();
    for (let index = 0; index < 5; index += 1) await page.keyboard.press("ArrowRight");
    await settle(page, 120);
    const widened = (await snapshot(page)).holderScale[0];
    await page.keyboard.press("ControlOrMeta+z");
    await settle(page, 120);
    const undone = await snapshot(page);
    check("arrastar vira um passo de desfazer", undone.holderScale[0] < widened && await slider(page, "Largura do corpo").inputValue() === "1", await slider(page, "Largura do corpo").inputValue());
    await page.locator(".cs-topbar").getByRole("button", { name: "Refazer" }).click();
    await settle(page, 120);
    check("refazer", await slider(page, "Largura do corpo").inputValue() === "1.05", await slider(page, "Largura do corpo").inputValue());
    await page.getByRole("button", { name: "Restaurar origem" }).click();
    await settle(page, 120);
    check("restaurar origem volta à fonte", (await snapshot(page)).materials.shirt.hex === "#3b82f6");
    await page.locator(".cs-topbar").getByRole("button", { name: "Desfazer" }).click();
    await settle(page, 120);
    check("restaurar origem pode ser desfeito", (await snapshot(page)).materials.shirt.hex === "#112233");

    await setHex(page, "Pele", "#654321");
    await page.reload();
    await ready(page);
    await settle(page);
    const list = await page.locator(".cs-cast__name").allInnerTexts();
    check("recarregar mantém as variações", list.includes("Ana") && list.includes("Ana — cópia"), list.join(", "));
    check("recarregar reaplica no material", (await snapshot(page)).materials.skin.hex === "#654321");
    check("recarregar mantém a seleção", await page.getByRole("textbox", { name: "Nome do personagem" }).inputValue() === "Ana");
    const saved = await stored(page);
    check("localStorage só guarda variações e seleção, nunca presets", JSON.stringify(Object.keys(saved).sort()) === '["schema","selectedId","variants"]' && !JSON.stringify(saved).includes("Alto, camisa musgo"));
    check("sem erro de console nas variações", issues.errors.length === 0, issues.errors.join(" | "));
    await context.close();
  }

  // ── Revisão de preset na fonte não fica escondida ─────────────────────────
  {
    const stale = {
      schema: 1,
      selectedId: "v-velha",
      variants: [{
        id: "v-velha", name: "Antiga", notes: "", updatedAt: "2026-01-01T00:00:00.000Z",
        origin: { presetId: "pulse-base", revision: 1, fingerprint: "00000000" },
        spec: {
          colors: { skin: "#111111", hair: "#222222", shirt: "#333333", pants: "#444444", belt: "#555555", face: "#666666" },
          proportions: { heightM: 1.8, width: 1, head: 1 }, accessories: { glasses: false },
        },
      }],
    };
    const { context, page } = await open({ init: { fn: ([key, value]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(key, value); sessionStorage.setItem("seeded", "1"); } }, arg: [STORAGE_KEY, JSON.stringify(stale)] } });
    await ready(page);
    await settle(page);
    check("revisão: variação mantém seus valores", (await snapshot(page)).materials.shirt.hex === "#333333");
    check("revisão: aviso aparece com ações", await page.getByRole("button", { name: "Usar a revisão" }).isVisible() && await page.getByRole("button", { name: "Manter a minha" }).isVisible());
    check("revisão: marca a variação no elenco", await page.locator(".cs-flag").count() === 1);
    await shot(page, "10-revisao-na-fonte");
    await page.getByRole("button", { name: "Manter a minha" }).click();
    await settle(page, 120);
    check("revisão: manter tira o aviso e preserva a cor", await page.locator(".cs-notice").count() === 0 && (await snapshot(page)).materials.shirt.hex === "#333333");
    await page.locator(".cs-topbar").getByRole("button", { name: "Desfazer" }).click();
    await settle(page, 120);
    await page.getByRole("button", { name: "Usar a revisão" }).click();
    await settle(page, 120);
    check("revisão: usar aplica a fonte atual", (await snapshot(page)).materials.shirt.hex === "#3b82f6");
    await context.close();
  }

  // ── Ficha, PNG e área de transferência ────────────────────────────────────
  {
    const { context, page } = await open({ permissions: ["clipboard-read", "clipboard-write"] });
    await ready(page);
    await setHex(page, "Camisa", "#aa5500");
    await setSlider(page, "Altura", 1.81);
    await page.getByLabel("Óculos").check();
    await page.getByRole("textbox", { name: "Notas e pedido" }).fill("Deixar o cabelo mais claro");
    await settle(page, 120);
    check("óculos aparecem na cena", (await snapshot(page)).glasses === true);

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "JSON", exact: true }).click()]);
    const sheetPath = `${output}/ficha-exportada.json`;
    await download.saveAs(sheetPath);
    const sheet = JSON.parse(await readFile(sheetPath, "utf8"));
    check("ficha: nome do arquivo", download.suggestedFilename() === "pulse-variacao.personagem.json", download.suggestedFilename());
    check("ficha: valores e crédito da base", sheet.character.spec.colors.shirt === "#aa5500" && sheet.character.spec.proportions.heightM === 1.81 && sheet.character.spec.accessories.glasses === true && sheet.base.author === "Quaternius" && sheet.base.license === "CC0 1.0" && sheet.base.sha256.length === 64);

    const [pngDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PNG", exact: true }).click()]);
    const pngPath = `${output}/previa-exportada.png`;
    await pngDownload.saveAs(pngPath);
    const png = await readFile(pngPath);
    const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    check("PNG: arquivo válido com alfa", png.subarray(1, 4).toString() === "PNG" && png[25] === 6 && width > 500 && height > 500, `${width}x${height}, tipo de cor ${png[25]}, ${png.length} bytes`);
    const painted = await countPixels(page, "a > 200");
    check("PNG: o personagem está no quadro", painted > 20_000, `${painted} pixels opacos`);

    await page.getByRole("button", { name: "Copiar pedido e ficha" }).click();
    await settle(page, 120);
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    check("copiar: leva o pedido e a ficha", clipboard.includes("Deixar o cabelo mais claro") && clipboard.includes('"kind": "lipp-hq/ficha-personagem"'));

    // importar colando o texto do chat, com cerca de código
    await page.getByRole("button", { name: "Importar", exact: true }).first().click();
    await page.getByRole("textbox", { name: "Cole a ficha" }).fill(clipboard);
    await page.locator("dialog").getByRole("button", { name: "Importar", exact: true }).click();
    await settle(page, 150);
    check("importar colado: vira variação nova sem sobrescrever", await page.locator(".cs-cast__name").filter({ hasText: "Pulse — variação" }).count() === 2);
    check("importar colado: material aplicado", (await snapshot(page)).materials.shirt.hex === "#aa5500");

    // importar de arquivo
    await page.getByRole("button", { name: "Importar", exact: true }).first().click();
    await page.getByTestId("cs-import-file").setInputFiles(sheetPath);
    await settle(page, 200);
    check("importar arquivo: terceira cópia", await page.locator(".cs-cast__name").filter({ hasText: "Pulse — variação" }).count() === 3);

    // erros
    const attempts = [
      ["texto qualquer", "não é json", "JSON válido"],
      ["outro arquivo", '{"kind":"outro"}', "não é uma ficha"],
      ["fora da faixa", JSON.stringify({ ...sheet, character: { ...sheet.character, spec: { ...sheet.character.spec, proportions: { ...sheet.character.spec.proportions, head: 9 } } } }), "proportions.head"],
      ["versão futura", JSON.stringify({ ...sheet, version: 9 }), "só entende"],
    ];
    await page.getByRole("button", { name: "Importar", exact: true }).first().click();
    const before = await page.locator(".cs-cast__name").count();
    for (const [label, text, expected] of attempts) {
      await page.getByRole("textbox", { name: "Cole a ficha" }).fill(text);
      await page.locator("dialog").getByRole("button", { name: "Importar", exact: true }).click();
      await settle(page, 80);
      const message = await page.locator(".cs-errors").innerText();
      check(`importar recusa ${label}`, message.toLowerCase().includes(expected.toLowerCase()), message.replace(/\n/g, " ").slice(0, 90));
    }
    await shot(page, "11-importar-erro");
    await page.locator("dialog").getByRole("button", { name: "Cancelar" }).click();
    check("recusa não cria variação", await page.locator(".cs-cast__name").count() === before);

    // área de transferência negada
    await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error("negado")); });
    await page.getByRole("button", { name: "Copiar pedido e ficha" }).click();
    await settle(page, 120);
    check("copiar negado: mostra o texto para copiar à mão", await page.getByRole("heading", { name: "Copie o pedido" }).isVisible() && (await page.getByRole("textbox", { name: "Pedido e ficha" }).inputValue()).includes("lipp-hq/ficha-personagem"));
    await context.close();
  }

  // ── Custo: renderização sob demanda ───────────────────────────────────────
  {
    const { context, page } = await open({ reducedMotion: "no-preference" });
    await ready(page);
    await settle(page, 800);
    const ratio = await page.evaluate(() => window.__CHARACTER_STUDIO_QA__.pixelRatio());
    check("DPR limitado a 1,75 numa tela 2x", ratio === 1.75, String(ratio));
    const idleStart = await frames(page);
    await settle(page, 1500);
    const idleFrames = (await frames(page)) - idleStart;
    check("parado: nenhum quadro em 1,5 s", idleFrames === 0, `${idleFrames} quadros`);
    const editStart = await frames(page);
    await setSlider(page, "Altura", 1.8);
    await settle(page, 300);
    const editFrames = (await frames(page)) - editStart;
    check("edição: poucos quadros e depois para", editFrames >= 1 && editFrames <= 12, `${editFrames} quadros`);
    await page.getByRole("button", { name: "Movimento" }).click();
    await settle(page, 300);
    const motionStart = await frames(page);
    await settle(page, 1000);
    const motionFrames = (await frames(page)) - motionStart;
    check("movimento ligado: renderiza continuamente", motionFrames > 20, `${motionFrames} quadros em 1 s`);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle(page, 200);
    const hiddenStart = await frames(page);
    await settle(page, 800);
    const hiddenFrames = (await frames(page)) - hiddenStart;
    check("aba oculta (simulada): pausa", hiddenFrames === 0, `${hiddenFrames} quadros`);
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const shownStart = await frames(page);
    await settle(page, 500);
    check("aba visível de novo: retoma", (await frames(page)) - shownStart > 5);
    await page.getByRole("button", { name: "Movimento" }).click();
    await settle(page, 200);
    const offStart = await frames(page);
    await settle(page, 500);
    check("movimento desligado: para", (await frames(page)) === offStart);
    await context.close();
  }

  // ── Teclado ───────────────────────────────────────────────────────────────
  {
    const { context, page } = await open();
    await ready(page);
    const stage = page.getByRole("application");
    await stage.focus();
    const first = await page.evaluate(() => window.__CHARACTER_STUDIO_QA__.capture());
    await page.keyboard.press("ArrowRight");
    await settle(page, 200);
    check("teclado: seta gira a câmera", first !== (await page.evaluate(() => window.__CHARACTER_STUDIO_QA__.capture())));
    await page.keyboard.press("3");
    await settle(page, 200);
    check("teclado: 3 vai para a vista de lado", await page.getByRole("button", { name: "Lado", exact: true }).getAttribute("aria-pressed") === "true");
    const before = await page.evaluate(() => window.__CHARACTER_STUDIO_QA__.capture());
    await page.keyboard.press("+");
    await settle(page, 200);
    check("teclado: + aproxima", before !== (await page.evaluate(() => window.__CHARACTER_STUDIO_QA__.capture())));
    await page.keyboard.press("0");
    await settle(page, 200);
    check("teclado: 0 restaura", await page.getByRole("button", { name: "Lado", exact: true }).getAttribute("aria-pressed") === "false");
    await slider(page, "Altura").focus();
    await page.keyboard.press("ArrowRight");
    await settle(page, 150);
    check("teclado: controle deslizante altera o modelo", near(figureHeight(await snapshot(page)), 1.77, 0.004));
    const unlabeled = await page.evaluate(() => [...document.querySelectorAll("button, input, textarea")].filter((element) => {
      const hasText = element.textContent?.trim();
      const hasAria = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby");
      const hasLabel = element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      return !hasText && !hasAria && !hasLabel && !element.closest("label");
    }).map((element) => element.outerHTML.slice(0, 80)));
    check("todo controle tem nome acessível", unlabeled.length === 0, unlabeled.join(" "));
    await context.close();
  }

  // ── Estados de falha ──────────────────────────────────────────────────────
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.route("**/prototipo/pulse.glb", (route) => route.fulfill({ status: 404, body: "ausente" }));
    await page.goto(url);
    await page.getByRole("heading", { name: "A prévia 3D não abriu" }).waitFor({ timeout: 20_000 });
    check("modelo ausente: mensagem clara", await page.getByText("Não consegui carregar").isVisible());
    await setHex(page, "Camisa", "#123456");
    check("modelo ausente: painel segue editando e salvando", await page.getByRole("textbox", { name: "Nome do personagem" }).inputValue() === "Pulse — variação");
    await shot(page, "12-erro-modelo");
    await page.unroute("**/prototipo/pulse.glb");
    await page.getByRole("button", { name: "Tentar de novo" }).click();
    await ready(page);
    await settle(page);
    check("tentar de novo recupera com a edição aplicada", (await snapshot(page)).materials.shirt.hex === "#123456");
    await context.close();
  }
  {
    const { context, page } = await open({
      viewport: { width: 1280, height: 800 },
      init: { fn: () => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
          return /webgl/.test(String(type)) ? null : original.call(this, type, ...rest);
        };
      } },
    });
    await page.getByRole("heading", { name: "Este navegador não abriu o WebGL" }).waitFor({ timeout: 15_000 });
    await setHex(page, "Camisa", "#654321");
    check("sem WebGL: painel segue funcionando", await page.getByRole("textbox", { name: "Nome do personagem" }).inputValue() === "Pulse — variação");
    check("sem WebGL: exportar PNG desabilitado", await page.getByRole("button", { name: "PNG", exact: true }).isDisabled());
    await shot(page, "13-sem-webgl");
    await context.close();
  }
  {
    const { context, page } = await open({ viewport: { width: 1280, height: 800 } });
    await ready(page);
    await page.evaluate(() => { window.__restore = window.__CHARACTER_STUDIO_QA__.loseContext(); });
    await page.getByText("O navegador pausou o contexto 3D").waitFor({ timeout: 5000 });
    check("contexto perdido: avisa", true);
    await page.evaluate(() => window.__restore?.());
    await ready(page);
    await setHex(page, "Camisa", "#00c853");
    await settle(page, 300);
    const green = await countPixels(page, "a > 200 && g > r * 1.6 && g > b * 1.4");
    check("contexto restaurado: volta a desenhar", green > 3000, `${green} pixels`);
    await context.close();
  }
  {
    const { context, page } = await open({ viewport: { width: 1280, height: 800 }, init: { fn: ([key]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(key, "{quebrado"); sessionStorage.setItem("seeded", "1"); } }, arg: [STORAGE_KEY] } });
    await ready(page);
    check("dado corrompido: avisa", await page.getByRole("alert").filter({ hasText: "corrompido" }).isVisible());
    check("dado corrompido: guarda cópia", await page.evaluate((key) => localStorage.getItem(key), BACKUP_KEY) === "{quebrado");
    await shot(page, "14-dado-corrompido");
    await context.close();
  }
  {
    const future = JSON.stringify({ schema: 99, variants: [{ id: "x" }] });
    const { context, page } = await open({ viewport: { width: 1280, height: 800 }, init: { fn: ([key, value]) => localStorage.setItem(key, value), arg: [STORAGE_KEY, future] } });
    await ready(page);
    await setHex(page, "Camisa", "#123123");
    await settle(page, 400);
    check("versão futura: não grava por cima", await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY) === future);
    check("versão futura: avisa na tela", await page.getByText("versão mais nova").isVisible() && await page.getByText("Sem salvamento local").isVisible());
    await context.close();
  }

  // Outra aba atualiza o formato enquanto esta já está aberta.
  {
    const { context, page } = await open();
    await ready(page);
    await setHex(page, "Camisa", "#123456");
    await settle(page);
    const sibling = await context.newPage();
    await sibling.goto(url);
    await ready(sibling);
    const future = JSON.stringify({ schema: 99, variants: [{ privateFutureData: "preservar" }] });
    await sibling.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: STORAGE_KEY, value: future });
    await page.getByText("versão mais nova").waitFor();
    await setHex(page, "Camisa", "#654321");
    await settle(page);
    check("outra aba: versão futura não é sobrescrita", await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY) === future);
    check("outra aba: salvamento bloqueado fica visível", await page.getByText("Sem salvamento local").isVisible());
    check("outra aba: figura continua disponível para exportar", (await snapshot(page)).materials.shirt.hex === "#654321");
    await context.close();
  }

  // ── Larguras ──────────────────────────────────────────────────────────────
  for (const [label, viewport] of [["notebook", { width: 1100, height: 700 }], ["tablet", { width: 820, height: 1100 }], ["celular", { width: 390, height: 844 }]]) {
    const { context, page } = await open({ viewport });
    await ready(page);
    await settle(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${label}: sem rolagem horizontal`, overflow <= 0, `${overflow}px`);
    const box = await page.locator(".cs-canvas canvas").boundingBox();
    check(`${label}: prévia com tamanho útil`, box.width >= 300 && box.height >= 300, `${Math.round(box.width)}x${Math.round(box.height)}`);
    const clipped = await page.evaluate(() => [...document.querySelectorAll(".cs-dock")].filter((dock) => {
      const rect = dock.getBoundingClientRect();
      return rect.left < 0 || rect.right > window.innerWidth;
    }).length);
    check(`${label}: controles da câmera dentro da tela`, clipped === 0);
    const [poseDock, viewDock] = await Promise.all([page.locator(".cs-dock--pose").boundingBox(), page.locator(".cs-dock--view").boundingBox()]);
    const overlap = poseDock.x < viewDock.x + viewDock.width && viewDock.x < poseDock.x + poseDock.width && poseDock.y < viewDock.y + viewDock.height && viewDock.y < poseDock.y + poseDock.height;
    check(`${label}: controles não se sobrepõem`, !overlap);
    const cropped = await page.evaluate(() => [...document.querySelectorAll(".cs-panel__foot button, .cs-rail__actions button")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.right > window.innerWidth + 0.5 || rect.left < 0;
    }).length);
    check(`${label}: ações não ficam cortadas`, cropped === 0);
    const figureClear = await page.evaluate(async () => {
      // Pés acima dos controles: o pixel opaco mais baixo não pode cair na faixa dos docks.
      const image = new Image();
      image.src = window.__CHARACTER_STUDIO_QA__.capture();
      await image.decode();
      const canvas = Object.assign(document.createElement("canvas"), { width: image.width, height: image.height });
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height);
      let lowest = 0;
      for (let row = image.height - 1; row >= 0 && !lowest; row -= 1) {
        for (let column = 0; column < image.width; column += 1) {
          if (data[(row * image.width + column) * 4 + 3] > 230) { lowest = row; break; }
        }
      }
      const stage = document.querySelector(".cs-canvas").getBoundingClientRect();
      const top = Math.min(...[...document.querySelectorAll(".cs-dock")].map((dock) => dock.getBoundingClientRect().top));
      return { feet: stage.top + (lowest / image.height) * stage.height, docks: top };
    });
    check(`${label}: corpo inteiro acima dos controles`, figureClear.feet <= figureClear.docks + 1, `pés ${Math.round(figureClear.feet)}, controles ${Math.round(figureClear.docks)}`);
    await shot(page, `15-${label}`);
    await context.close();
  }

  // ── Presets ───────────────────────────────────────────────────────────────
  {
    const { context, page } = await open();
    await ready(page);
    for (const [name, file, height, glasses] of [["Alto, camisa musgo", "16-preset-alto", 1.9, false], ["Compacto, ruivo", "17-preset-compacto", 1.62, true]]) {
      await page.getByRole("button", { name: new RegExp(name) }).click();
      await settle(page);
      const snap = await snapshot(page);
      check(`preset ${name}: altura e acessório`, near(figureHeight(snap), height, 0.004) && snap.glasses === glasses, fixed(figureHeight(snap)));
      await shot(page, file);
    }
    await page.getByRole("button", { name: "Enquadrar o rosto" }).click();
    await settle(page);
    await shot(page, "18-oculos");
    await page.getByRole("button", { name: "Frente", exact: true }).click();
    await settle(page);
    await shot(page, "18-oculos-frente");
    await page.getByRole("button", { name: "Lado", exact: true }).click();
    await settle(page);
    await shot(page, "18-oculos-lado");
    await context.close();
  }

  // ── Cena anterior continua abrindo ────────────────────────────────────────
  for (const [label, path] of [["protótipo Engenharia", "/?prototipo=engenharia"], ["mundo principal", "/"]]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin + path);
    await page.waitForFunction(() => window.__HQ_WORLD_READY__ === true || window.__HQ_QA__, { timeout: 45_000 });
    await page.waitForTimeout(2500);
    check(`${label}: abre sem exceção`, errors.length === 0 && await page.locator("canvas").count() > 0, errors.join(" | "));
    await shot(page, label === "mundo principal" ? "19-mundo" : "20-prototipo");
    await context.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.ok);
await writeFile(`${output}/resultado.json`, JSON.stringify({ when: new Date().toISOString(), origin, total: results.length, failed: failed.length, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} itens ok. Evidências em ${output}.`);
if (failed.length) {
  console.log(failed.map((item) => `- ${item.name}: ${item.detail}`).join("\n"));
  process.exitCode = 1;
}
