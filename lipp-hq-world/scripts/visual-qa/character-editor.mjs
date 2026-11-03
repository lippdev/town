#!/usr/bin/env node
/**
 * Prova de ponta a ponta do editor de personagem.
 *
 * Sobe o fixture do gateway e o preview, abre um Chromium real e valida que:
 * editar uma peça no painel muda as cores/de escala realmente aplicadas nas
 * malhas do personagem na cena 3D, grava no localStorage e sobrevive a um
 * reload. Também exige que a peça "camisa" comece na cor do agente.
 *
 * Uso: node scripts/visual-qa/character-editor.mjs [--out qa/screenshots/character]
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { freePort, waitForUrl } from "./ports.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "qa/screenshots/character");
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const previewPort = await freePort();
const apiPort = await freePort();
const dashboardPort = await freePort();

const SHIRT = "#22c55e";
const HAIR = "#b4522e";
const STORAGE_KEY = "lipp-hq-world:agent-looks:v2";

function run(command, args, options = {}) {
  return spawn(command, args, { cwd: ROOT, stdio: "ignore", ...options });
}

function hex(value) {
  return String(value).replace("#", "").toLowerCase();
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const fixture = run("node", [
    "scripts/hermes/fixture-gateway.mjs",
    "--api-port",
    String(apiPort),
    "--dashboard-port",
    String(dashboardPort),
  ]);
  const preview = run("pnpm", ["preview", "--port", String(previewPort), "--strictPort"], {
    env: {
      ...process.env,
      HERMES_API_URL: `http://127.0.0.1:${apiPort}`,
      HERMES_DASHBOARD_URL: `http://127.0.0.1:${dashboardPort}`,
    },
  });

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-gpu-sandbox",
      "--ignore-gpu-blocklist",
    ],
  });

  const report = { shots: [], errors: [], checks: {} };
  try {
    await waitForUrl(`http://127.0.0.1:${previewPort}/api/hq/hermes/snapshot`, 60000, "preview com proxy");
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(60000);
    page.on("console", (message) => {
      if (message.type() === "error") report.errors.push(message.text());
    });

    await page.goto(`http://127.0.0.1:${previewPort}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__HQ_QA__, null, { timeout: 90000 });
    await page.waitForSelector(".agent-row", { timeout: 60000 });
    await page.waitForTimeout(4000);

    const row = page.locator(".agent-row").first();
    const botName = ((await row.textContent()) ?? "").trim();
    await row.click();
    await page.waitForSelector(".character-editor", { timeout: 30000 });
    const selectedId = await page.evaluate(() => window.__HQ_QA__.getSelection().agentId);
    report.checks.bot = { name: botName, id: selectedId };

    // personagem enquadrado: a captura precisa mostrar o efeito da edição
    const pose = await page.evaluate((id) => window.__HQ_QA__.getAgentPose(id), selectedId);
    const view = await page.evaluate(
      ({ x, z }) => window.__HQ_QA__.setView({ azimuthDeg: 12, elevationDeg: 9, distance: 5, target: [x, 1, z] }),
      { x: pose?.x ?? 0, z: pose?.z ?? 0 },
    );
    report.checks.view = view;
    await page.waitForTimeout(1500);

    const before = await page.evaluate((id) => window.__HQ_QA__.getAgentLook(id), selectedId);
    report.checks.before = before;

    await page.screenshot({ path: path.join(OUT, "editor-fechado.png") });

    await page.getByRole("button", { name: "Editar" }).click();
    await page.waitForSelector(".look-groups", { timeout: 15000 });
    await page.screenshot({
      path: path.join(OUT, "editor-painel.png"),
      clip: await page.locator(".character-editor").boundingBox(),
    });
    const identityShirt = await page.evaluate(() => {
      const swatch = document.querySelector(".look-groups .swatch.identity");
      if (!swatch) return null;
      const channels = getComputedStyle(swatch).backgroundColor.match(/\d+/g);
      if (!channels) return null;
      return channels
        .slice(0, 3)
        .map((value) => Number(value).toString(16).padStart(2, "0"))
        .join("");
    });
    report.checks.identityShirt = identityShirt;
    report.checks.startsWithIdentityShirt = identityShirt !== null && (before?.colors.includes(identityShirt) ?? false);
    await page.screenshot({ path: path.join(OUT, "editor-aberto.png") });

    // cabelo: cor + estilo; acessório; camisa; altura
    await page.getByRole("button", { name: `Cabelo ${HAIR}` }).click();
    await page.getByRole("button", { name: "Moicano", exact: true }).click();
    await page.getByRole("button", { name: "Fone", exact: true }).click();
    await page.getByRole("button", { name: `Camisa ${SHIRT}` }).click();
    await page.locator(".look-range").fill("1.06");
    await page.waitForTimeout(1200);

    const after = await page.evaluate((id) => window.__HQ_QA__.getAgentLook(id), selectedId);
    report.checks.after = after;
    report.checks.meshGrew = (after?.meshes ?? 0) > (before?.meshes ?? 0);
    report.checks.shirtApplied = after?.colors.includes(hex(SHIRT)) ?? false;
    report.checks.hairApplied = after?.colors.includes(hex(HAIR)) ?? false;
    report.checks.oldShirtGone = before?.colors.some((color) => !after?.colors.includes(color)) ?? false;
    report.checks.heightApplied = (after?.scale ?? 1) === 1.06;

    report.checks.storage = JSON.parse(await page.evaluate((key) => window.localStorage.getItem(key) ?? "{}", STORAGE_KEY));
    const stored = report.checks.storage[selectedId] ?? {};
    report.checks.storageHasEdits =
      stored.shirt?.toLowerCase() === SHIRT &&
      stored.hair?.toLowerCase() === HAIR &&
      stored.hairStyle === "moicano" &&
      stored.accessory === "fone" &&
      stored.height === 1.06;

    await page.screenshot({ path: path.join(OUT, "editor-editado.png") });
    const point = await page.evaluate((id) => window.__HQ_QA__.getAgentScreenPoint(id), selectedId);
    if (point) {
      await page.screenshot({
        path: path.join(OUT, "personagem-editado.png"),
        clip: { x: Math.max(0, point.x - 150), y: Math.max(0, point.y - 190), width: 300, height: 330 },
      });
    }

    // reload: as escolhas voltam e a cena volta com as mesmas peças
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__HQ_QA__, null, { timeout: 90000 });
    await page.waitForSelector(".agent-row", { timeout: 60000 });
    await page.waitForTimeout(3500);
    await page.locator(".agent-row").first().click();
    await page.waitForSelector(".character-editor", { timeout: 30000 });
    await page.waitForTimeout(800);
    const reloaded = await page.evaluate((id) => window.__HQ_QA__.getAgentLook(id), selectedId);
    report.checks.reloaded = reloaded;
    report.checks.survivedReload =
      (reloaded?.colors.includes(hex(SHIRT)) ?? false) &&
      (reloaded?.colors.includes(hex(HAIR)) ?? false) &&
      (reloaded?.scale ?? 1) === 1.06;

    await page.getByRole("button", { name: "Editar" }).click();
    await page.waitForSelector(".look-groups", { timeout: 15000 });
    report.checks.selectionsAfterReload = {
      shirt: await page.getByRole("button", { name: `Camisa ${SHIRT}` }).getAttribute("aria-pressed"),
      moicano: await page.getByRole("button", { name: "Moicano", exact: true }).getAttribute("aria-pressed"),
      fone: await page.getByRole("button", { name: "Fone", exact: true }).getAttribute("aria-pressed"),
      height: await page.locator(".look-range").inputValue(),
    };
    await page.screenshot({ path: path.join(OUT, "editor-reload.png") });

    // restaurar volta ao visual de fábrica
    await page.getByRole("button", { name: "Restaurar" }).click();
    await page.waitForTimeout(1000);
    const restored = await page.evaluate((id) => window.__HQ_QA__.getAgentLook(id), selectedId);
    report.checks.restored = restored;
    // Restaurar volta ao look de fábrica daquele bot (bot ao vivo já nasce com
    // um preset determinístico), então o alvo é a leitura feita antes da edição.
    const sameColors =
      (restored?.colors.length ?? -1) === (before?.colors.length ?? -2) &&
      [...(restored?.colors ?? [])].sort().join(",") === [...(before?.colors ?? [])].sort().join(",");
    report.checks.restoreWorks = sameColors && (restored?.scale ?? 0) === (before?.scale ?? -1);
    report.checks.storageEmptyAfterRestore = !(selectedId in JSON.parse(await page.evaluate((key) => window.localStorage.getItem(key) ?? "{}", STORAGE_KEY)));
    await page.screenshot({ path: path.join(OUT, "editor-restaurado.png") });
  } finally {
    await browser.close();
    preview.kill("SIGTERM");
    fixture.kill("SIGTERM");
  }

  report.ok =
    report.errors.length === 0 &&
    report.checks.meshGrew === true &&
    report.checks.shirtApplied === true &&
    report.checks.hairApplied === true &&
    report.checks.oldShirtGone === true &&
    report.checks.startsWithIdentityShirt === true &&
    report.checks.heightApplied === true &&
    report.checks.storageHasEdits === true &&
    report.checks.survivedReload === true &&
    report.checks.selectionsAfterReload?.shirt === "true" &&
    report.checks.selectionsAfterReload?.moicano === "true" &&
    report.checks.selectionsAfterReload?.fone === "true" &&
    report.checks.selectionsAfterReload?.height === "1.06" &&
    report.checks.restoreWorks === true &&
    report.checks.storageEmptyAfterRestore === true;

  await fs.writeFile(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
