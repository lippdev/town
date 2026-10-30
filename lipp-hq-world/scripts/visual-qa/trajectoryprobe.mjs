// Trajetória do Scout após o comando de caminhada.
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
await page.waitForTimeout(1000);

await page.evaluate(() => window.__HQ_QA__.setDemoPaused(true));
await page.evaluate(() => window.__HQ_QA__.demoCommand("scout", "walking"));

for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(900);
  const pose = await page.evaluate(() => window.__HQ_QA__.getAgentPose("scout"));
  console.log(`t=${(i+1)*0.9}s`, JSON.stringify(pose));
}

await browser.close();
server.kill("SIGTERM");
