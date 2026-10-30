// Diagnóstico dos controles no app real
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
await page.waitForTimeout(800);

const info = await page.evaluate(() => window.__HQ_QA__.controlsInfo());
console.log("CONTROLES:", JSON.stringify(info));

// rotação programática direto na instância
const progAz = await page.evaluate(() => {
  const c = window.__HQ_CONTROLS__;
  const az0 = c.getAzimuthalAngle();
  c.rotateLeft ? c.rotateLeft(0.5) : null;
  // sem frame loop entre chamadas; força update
  c.update?.();
  const az1 = c.getAzimuthalAngle();
  return { az0: az0.toFixed(3), az1: az1.toFixed(3), temRotateLeft: typeof c.rotateLeft };
});
console.log("ROT PROGRAMATICA:", JSON.stringify(progAz));

await browser.close();
server.kill("SIGTERM");
