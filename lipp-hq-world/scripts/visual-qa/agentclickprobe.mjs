// Prova de seleção de personagem: clique na figura do agente.
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import path from "node:path";

const ROOT = process.cwd();
const server = spawn(path.join(ROOT, "node_modules/.bin/vite"), ["preview","--port","4199","--host","127.0.0.1","--strictPort"], { stdio: ["ignore","ignore","pipe"] });
await new Promise(r => setTimeout(r, 2500));

const browser = await chromium.launch({
  executablePath: "/usr/local/bin/google-chrome",
  args: ["--no-sandbox","--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:4199", { waitUntil: "load" });
await page.waitForFunction(() => window.__HQ_WORLD_READY__ === true, { timeout: 60000 });
await page.waitForTimeout(1500);

// aproxima da sala da Engenharia (Pulse) e clica no personagem
await page.evaluate(() => window.__HQ_QA__.focus("engenharia"));
await page.waitForTimeout(2500);
await page.screenshot({ path: "qa/screenshots/agent-selected.png" });

// clica exatamente sobre a figura do agente
const point = await page.evaluate(() => window.__HQ_QA__.getAgentScreenPoint("pulse"));
console.log("PONTO:", JSON.stringify(point));
if (!point) throw new Error("Agente fora da tela.");
await page.mouse.click(point.x, point.y);
await page.waitForTimeout(500);
console.log("SELECAO:", JSON.stringify(await page.evaluate(() => window.__HQ_QA__.getSelection())));
await page.screenshot({ path: "qa/screenshots/agent-selected.png" });

await browser.close();
server.kill("SIGTERM");
