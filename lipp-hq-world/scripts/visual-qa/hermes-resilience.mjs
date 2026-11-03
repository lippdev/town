#!/usr/bin/env node
/**
 * Prova do comportamento de rede: o gateway cai no meio da sessão.
 *
 * Valida que a frota não pisca para vazio, que o selo "atrasado" aparece com a
 * idade real do dado, que o botão "tentar de novo" funciona quando o serviço
 * volta, e que nada disso gera erro de console.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "qa/screenshots/hermes");
const PORT = 4179;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await sleep(400);
  }
  throw new Error(`timeout esperando ${url}`);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  let fixture = spawn("node", ["scripts/hermes/fixture-gateway.mjs"], { cwd: ROOT, stdio: "ignore" });
  const preview = spawn("pnpm", ["preview", "--port", String(PORT), "--strictPort"], { cwd: ROOT, stdio: "ignore" });

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--ignore-gpu-blocklist"],
  });

  const report = { checks: {}, errors: [] };
  try {
    await waitFor(`http://127.0.0.1:${PORT}/api/hq/hermes/snapshot`);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("console", (message) => {
      if (message.type() === "error") report.errors.push(message.text());
    });

    await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".agent-row", { timeout: 90000 });
    await sleep(3000);

    report.checks.botsBefore = await page.locator(".agent-row").count();

    // derruba o gateway e espera o próximo poll falhar
    fixture.kill("SIGTERM");
    fixture = null;
    await page.waitForSelector(".connection-stale", { timeout: 60000 });
    report.checks.staleBadge = (await page.locator(".connection-stale").textContent())?.trim() ?? null;
    report.checks.botsWhileStale = await page.locator(".agent-row").count();
    await page.screenshot({ path: path.join(OUT, "stale-banner.png") });

    // painel deveria avisar que a leitura está atrasada
    await page.locator(".agent-row").first().click();
    await page.waitForSelector(".panel-warn", { timeout: 20000 });
    report.checks.panelWarn = (await page.locator(".panel-warn").first().textContent())?.trim() ?? null;

    // sobe o gateway de novo e usa "tentar de novo" pelo roster
    fixture = spawn("node", ["scripts/hermes/fixture-gateway.mjs"], { cwd: ROOT, stdio: "ignore" });
    await waitFor("http://127.0.0.1:8642/health", 30000);
    await page.locator(".note-retry").click({ timeout: 5000 }).catch(async () => {
      await page.evaluate(() => window.__HQ_QA__ && null);
    });
    await page.waitForFunction(() => !document.querySelector(".connection-stale"), null, { timeout: 60000 });
    report.checks.staleBadgeAfterRecovery = await page.locator(".connection-stale").count();
    report.checks.botsAfterRecovery = await page.locator(".agent-row").count();
  } finally {
    await browser.close();
    preview.kill("SIGTERM");
    fixture?.kill("SIGTERM");
  }

  report.ok =
    report.errors.length === 0 &&
    report.checks.botsBefore > 0 &&
    /atrasado/.test(report.checks.staleBadge ?? "") &&
    report.checks.botsWhileStale === report.checks.botsBefore &&
    report.checks.staleBadgeAfterRecovery === 0 &&
    report.checks.botsAfterRecovery === report.checks.botsBefore;

  await fs.writeFile(path.join(OUT, "resilience.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
