#!/usr/bin/env node
/**
 * Prova do ciclo dia-noite da cidade: luz, janelas acesas e custo de renderização
 * nos três momentos-chave (meio-dia, entardecer e noite).
 *
 * Uso: HQ_URL=http://127.0.0.1:5247 node scripts/visual-qa/office-city.mjs [pasta]
 * Cada página usa um perfil novo: nada toca no que você salvou no navegador.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.HQ_URL ?? "http://127.0.0.1:5173";
const ANGLE = process.env.HQ_ANGLE ?? "metal";
const OUT = process.argv[2] ?? "qa/office-city";
const IGNORED = [/THREE\.Clock/, /GPU stall/, /GL Driver Message/, /Hermes/, /\/api\/hq\//, /Program Info Log/];
mkdirSync(OUT, { recursive: true });

/** Horas de teste e o nível de luz esperado. */
const HOURS = [
  { hora: "12:00", label: "meio-dia", daylight: 1 },
  { hora: "17:30", label: "entardecer", daylight: 0.5 },
  { hora: "22:00", label: "noite", daylight: 0 },
];

const browser = await chromium.launch({ args: [`--use-angle=${ANGLE}`, "--ignore-gpu-blocklist"] });
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
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 90000 });
  return page;
}

const state = (page) => page.evaluate(() => window.__HQ_OFFICE_QA__.state());

const shot = async (page, name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
};

/** Luminância real via page.evaluate: carrega o PNG no browser como data URL e usa getImageData. */
async function pageLuminance(page, pngBuffer) {
  const dataUrl = "data:image/png;base64," + pngBuffer.toString("base64");
  return page.evaluate(async (src) => {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    // Região central: 400×300 pixels no centro da tela.
    const cx = Math.floor(img.width / 2) - 200;
    const cy = Math.floor(img.height / 2) - 150;
    const { data } = ctx.getImageData(cx, cy, 400, 300);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Luminância perceptual: 0.2126 R + 0.7152 G + 0.0722 B
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    return sum / (data.length / 4);
  }, dataUrl);
}

// ── Fase 1: abrir cada hora na demonstração ──────────────────────────────────

const custo = {};
const luminances = {};
// Guardamos as materialColors capturadas na fase 1, sem reabrir páginas depois.
const materialColors = {};

for (const { hora, label, daylight } of HOURS) {
  const url = `/?escritorio=completo&modo=demonstracao&hora=${hora}`;
  const page = await open(url);

  await check(`${label} (${hora}): estado carregado e luz do dia correta`, async () => {
    await page.waitForTimeout(2000);
    const now = await state(page);
    // A tolerância é 0.25 para absorver diferenças de arredondamento (17:30 está na transição).
    const tolerance = 0.25;
    assert.ok(
      Math.abs(now.daylight - daylight) <= tolerance,
      `daylight esperado ~${daylight}, obtido ${now.daylight} (hora=${hora})`,
    );
  });

  // Screenshot desktop 1440×900
  await shot(page, `${label}-desktop`);

  // Screenshot celular 390×800
  const phonePage = await open(url, { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  await phonePage.waitForTimeout(2000);
  await shot(phonePage, `${label}-celular`);
  await phonePage.context().close();

  // Luminância para comparação dia vs noite (capturada aqui, enquanto a página está aberta)
  const pngBuffer = Buffer.from(await page.screenshot({ fullPage: false }));
  luminances[label] = await pageLuminance(page, pngBuffer);

  // Custo de renderização parado
  await check(`${label} (${hora}): custo de renderização`, async () => {
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const { calls, triangles } = window.__HQ_OFFICE_QA__.renderInfo();
      return { calls, triangles };
    });
    custo[label] = { hora, ...info };
  });

  // Verificar cidade-acesa existe
  await check(`${label} (${hora}): objeto "cidade-acesa" existe na cena`, async () => {
    const exists = await page.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("cidade-acesa"));
    assert.equal(exists, true, "cidade-acesa deve existir na demonstração");
  });

  // Capturar e verificar materialColor de cidade-acesa (guardamos para comparação posterior)
  await check(`${label} (${hora}): materialColor de "cidade-acesa" retorna cor válida`, async () => {
    const color = await page.evaluate(() => window.__HQ_OFFICE_QA__.materialColor("cidade-acesa"));
    assert.ok(color !== null, "materialColor deve retornar um objeto, não null");
    assert.ok(
      typeof color.r === "number" && typeof color.g === "number" && typeof color.b === "number",
      "cor deve ter r, g, b numéricos",
    );
    materialColors[label] = color;
  });

  await page.context().close();
}

// Gravar custo.json
writeFileSync(path.join(OUT, "custo.json"), JSON.stringify(custo, null, 2));

// ── Fase 2: provar que dia é mais claro que noite ────────────────────────────

await check("luminância do meio-dia é maior que a da noite (ciclo dia-noite age na cena)", async () => {
  const lumDia = luminances["meio-dia"];
  const lumNoite = luminances["noite"];
  assert.ok(
    lumDia > lumNoite,
    `luminância do meio-dia (${lumDia.toFixed(1)}) deve ser maior que a da noite (${lumNoite.toFixed(1)})`,
  );
});

// ── Fase 3: comparar materialColor de cidade-acesa dia vs noite ──────────────
// (usa valores já coletados na fase 1 — sem reabrir páginas)

await check("cidade-acesa é mais escura de dia que à noite (janelas acesas pela hora)", async () => {
  const corDia = materialColors["meio-dia"];
  const corNoite = materialColors["noite"];
  assert.ok(corDia !== null && corNoite !== null, "materialColor deve ter sido coletado em ambas as horas");
  // De dia litWindows é 0.12; à noite é 1 → setScalar(litWindows) → cor mais baixa de dia
  const lumDia = 0.2126 * corDia.r + 0.7152 * corDia.g + 0.0722 * corDia.b;
  const lumNoite = 0.2126 * corNoite.r + 0.7152 * corNoite.g + 0.0722 * corNoite.b;
  assert.ok(
    lumDia < lumNoite,
    `materialColor de dia (lum=${lumDia.toFixed(3)}) deve ser menor que à noite (lum=${lumNoite.toFixed(3)})`,
  );
});

// ── Fase 4: modo ao vivo não tem cidade ─────────────────────────────────────

await check("modo ao vivo (?escritorio=completo&hora=22:00): sem cidade nem cidade-acesa", async () => {
  const live = await open("/?escritorio=completo&hora=22:00");
  await live.waitForTimeout(800);
  assert.equal(
    await live.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("cidade")),
    false,
    "objeto \"cidade\" não deve existir no modo ao vivo",
  );
  assert.equal(
    await live.evaluate(() => window.__HQ_OFFICE_QA__.objectNamed("cidade-acesa")),
    false,
    "objeto \"cidade-acesa\" não deve existir no modo ao vivo",
  );
  await shot(live, "modo-ao-vivo");
  await live.context().close();
});

await browser.close();

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`\n${checks.length} verificações ok. Fotos em ${OUT}`);
