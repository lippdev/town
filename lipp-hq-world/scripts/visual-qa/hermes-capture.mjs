#!/usr/bin/env node
/**
 * Prova de ponta a ponta da visão de frota Hermes.
 *
 * Sobe o fixture do gateway Hermes (scripts/hermes/fixture-gateway.mjs) e o
 * preview do app, abre um Chromium real e valida o que a tela mostra:
 * chip do gateway, frota na barra lateral, resumo de estados, painel de um bot
 * com dados reais, e o feed sem evento de simulação depois de ficar ao vivo.
 *
 * Uso: node scripts/visual-qa/hermes-capture.mjs [--out qa/screenshots/hermes]
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { freePort, waitForUrl } from "./ports.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "qa/screenshots/hermes");
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const previewPort = await freePort();
const apiPort = await freePort();
const dashboardPort = await freePort();

function run(command, args, options = {}) {
  return spawn(command, args, { cwd: ROOT, stdio: "ignore", ...options });
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
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--ignore-gpu-blocklist"],
  });

  const report = { shots: [], errors: [], checks: {} };
  try {
    await waitForUrl(`http://127.0.0.1:${previewPort}/api/hq/hermes/snapshot`, 60000, "preview com proxy");
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("console", (message) => {
      if (message.type() === "error") report.errors.push(message.text());
    });

    await page.goto(`http://127.0.0.1:${previewPort}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__HQ_QA__, null, { timeout: 90000 });
    await page.waitForSelector(".agent-row", { timeout: 60000 });
    await page.waitForTimeout(4000);

    const chip = (await page.locator(".connection").first().textContent()) ?? "";
    report.checks.chip = chip.trim();
    report.checks.chipSaysHermesOnline = /Hermes · conectado/.test(chip);

    const roster = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".agent-row")).map((row) => ({
        text: (row.textContent ?? "").trim(),
        dot: row.querySelector(".bot-state-dot")?.className ?? "",
      })),
    );
    report.checks.botCount = roster.length;
    report.checks.botsWithRealState = roster.filter((row) => /bot-state-(working|waiting|idle)/.test(row.dot)).length;

    const summary = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".fleet-stat")).map((stat) => (stat.textContent ?? "").trim()),
    );
    report.checks.summary = summary;

    await page.screenshot({ path: path.join(OUT, "fleet-overview.png") });

    await page.locator(".agent-row").first().click();
    await page.waitForSelector(".panel-stats", { timeout: 30000 });
    report.checks.panel = await page.evaluate(() => {
      const panel = document.querySelector(".panel");
      return {
        name: panel?.querySelector("strong")?.textContent ?? null,
        stats: Array.from(panel?.querySelectorAll(".panel-stats div") ?? []).map((row) => (row.textContent ?? "").trim()),
        activity: panel?.querySelector(".panel-activity")?.textContent ?? null,
      };
    });
    await page.screenshot({ path: path.join(OUT, "bot-panel.png") });

    // ---- diagnóstico do gateway: cada endpoint, com latência real ----
    await page.locator(".sidebar-item", { hasText: "Integrações" }).click();
    await page.waitForSelector(".gateway-row", { timeout: 30000 });
    await page.waitForFunction(
      () => {
        const latency = document.querySelectorAll(".gateway-latency");
        return latency.length > 0 && !Array.from(latency).some((node) => (node.textContent ?? "").includes("não lido"));
      },
      null,
      { timeout: 20000 },
    );
    report.checks.diagnostics = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".gateway-row"));
      const textOf = (node) => (node ? (node.textContent ?? "").trim() : null);
      return {
        rows: rows.length,
        allOk: rows.every((row) => row.classList.contains("ok")),
        paths: rows.map((row) => textOf(row.querySelector("code"))),
        latencies: rows.map((row) => textOf(row.querySelector(".gateway-latency"))),
        summary: textOf(document.querySelector(".gateway-summary")),
        config: Array.from(document.querySelectorAll(".gateway-config div")).map((row) => (row.textContent ?? "").trim()),
      };
    });
    await page.screenshot({ path: path.join(OUT, "gateway-diagnostics.png") });
    await page.locator(".sidebar-item", { hasText: "Bots" }).click();

    report.checks.demoEventsAfterLive = await page.evaluate(() => {
      const events = Array.from(document.querySelectorAll(".feed li"));
      return events.filter((item) => item.querySelector(".feed-demo")).length;
    });

    await page.evaluate(() => window.__HQ_QA__.setView({ azimuthDeg: 45, elevationDeg: 34, distance: 22, target: [0, 0, -6] }));
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, "fleet-close.png") });
  } finally {
    await browser.close();
    preview.kill("SIGTERM");
    fixture.kill("SIGTERM");
  }

  report.ok =
    report.errors.length === 0 &&
    report.checks.chipSaysHermesOnline === true &&
    report.checks.botCount > 0 &&
    report.checks.botsWithRealState === report.checks.botCount &&
    report.checks.demoEventsAfterLive === 0;

  await fs.writeFile(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
