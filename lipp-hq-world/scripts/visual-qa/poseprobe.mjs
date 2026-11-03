// Diagnóstico: por que a pose vem null?
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
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:4199", { waitUntil: "load" });
await page.waitForFunction(() => window.__HQ_WORLD_READY__ === true, { timeout: 60000 });
await page.waitForTimeout(1000);

for (const id of ["scout", "forge", "pulse", "ink"]) {
  const pose = await page.evaluate((a) => window.__HQ_QA__.getAgentPose(a), id);
  console.log("POSE", id, JSON.stringify(pose));
}
console.log("ERROS:", JSON.stringify(errors.slice(0, 4)));

await browser.close();
server.kill("SIGTERM");
