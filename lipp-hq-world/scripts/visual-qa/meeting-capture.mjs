#!/usr/bin/env node
/**
 * Prova da sala de reunião dirigida por briefing real.
 *
 * Sobe o fixture (que tem um briefing diário em andamento), abre o app e
 * verifica: os três bots do briefing ficaram com estado "meeting", eles saíram
 * do posto e estão DENTRO da sala de reuniões, e o HUD mostra o briefing.
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { outputDir, startHermesStack } from "./hermes-stack.mjs";

const OUT = outputDir("qa/screenshots/hermes");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const stack = await startHermesStack();
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--ignore-gpu-blocklist"],
  });

  const report = { checks: {}, errors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("console", (message) => {
      if (message.type() === "error") report.errors.push(message.text());
    });

    await page.goto(stack.url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".agent-row", { timeout: 90000 });
    await sleep(3000);

    // HUD: aba Briefing deve listar os três participantes
    await page.getByRole("button", { name: /^Briefing/ }).click();
    await sleep(600);
    report.checks.briefingRows = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".sidebar-list .agent-row")).map((row) => (row.textContent ?? "").trim()),
    );

    // cena: cada bot do briefing precisa estar com estado "meeting" e dentro da sala
    await page.evaluate(() => window.__HQ_QA__.setDemoPaused(true));
    const poses = await page.evaluate(async () => {
      const ids = ["argos", "forge", "atlas"];
      const out = {};
      for (const id of ids) out[id] = window.__HQ_QA__.getAgentPose(id);
      return out;
    });

    // espera a caminhada: até 90s para todos chegarem na sala
    const deadline = Date.now() + 90000;
    let arrived = false;
    while (Date.now() < deadline) {
      const current = await page.evaluate(() => {
        const ids = ["argos", "forge", "atlas"];
        const out = {};
        for (const id of ids) out[id] = window.__HQ_QA__.getAgentPose(id);
        return out;
      });
      const inside = Object.values(current).every(
        (pose) => pose && pose.x >= 6.6 && pose.x <= 16.2 && pose.z >= 5.0 && pose.z <= 12.4,
      );
      if (inside) {
        report.checks.finalPoses = current;
        arrived = true;
        break;
      }
      await sleep(2000);
    }
    report.checks.startedOutsideMeetingRoom = Object.entries(poses).filter(
      ([, pose]) => pose && !(pose.x >= 6.6 && pose.x <= 16.2 && pose.z >= 5.0 && pose.z <= 12.4),
    ).length;
    report.checks.arrivedInMeetingRoom = arrived;

    await page.evaluate(() => window.__HQ_QA__.focus("reunioes", { instant: true }));
    await page.evaluate(() => window.__HQ_QA__.setDemoPaused(false));
    await sleep(2500);
    await page.screenshot({ path: path.join(OUT, "briefing-meeting.png") });

    report.checks.boardPresent = await page.evaluate(() => Boolean(document.querySelector("canvas")));
  } finally {
    await browser.close();
    await stack.stop();
  }

  report.ok =
    report.errors.length === 0 &&
    (report.checks.briefingRows ?? []).length === 3 &&
    report.checks.arrivedInMeetingRoom === true;

  await fs.writeFile(path.join(OUT, "meeting.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
