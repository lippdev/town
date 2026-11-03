// Prova de seleção: clique de verdade no piso de uma sala.
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import path from "node:path";

const ROOT = process.cwd();
const server = spawn(path.join(ROOT, "node_modules/.bin/vite"), ["preview","--port","4199","--host","127.0.0.1","--strictPort"], { stdio: ["ignore","pipe","pipe"] });
await new Promise(r => setTimeout(r, 2500));

const browser = await chromium.launch({
  executablePath: "/usr/local/bin/google-chrome",
  args: ["--no-sandbox","--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:4199", { waitUntil: "load" });
await page.waitForFunction(() => window.__HQ_WORLD_READY__ === true, { timeout: 60000 });
await page.waitForTimeout(900);

// vista padrão
const box = await page.locator("canvas").boundingBox();

// clica no centro da tela (deve cair no hall ou corredor central)
await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
await page.waitForTimeout(400);
console.log("SELECAO CENTRO:", JSON.stringify(await page.evaluate(() => window.__HQ_QA__.getSelection())));

// clica num canto vazio (fundo) para limpar
await page.mouse.click(box.x + 60, box.y + 60);
await page.waitForTimeout(300);
console.log("SELECAO CANTO:", JSON.stringify(await page.evaluate(() => window.__HQ_QA__.getSelection())));

await browser.close();
server.kill("SIGTERM");
