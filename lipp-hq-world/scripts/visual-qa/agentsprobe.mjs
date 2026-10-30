// Diagnóstico: o app com Agents montado dispara erro de runtime?
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
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });

await page.goto("http://127.0.0.1:4199", { waitUntil: "load" });
await page.waitForTimeout(6000);
const ready = await page.evaluate(() => window.__HQ_WORLD_READY__ === true).catch(() => false);
console.log("READY:", ready);
console.log("ERROS:", JSON.stringify(errors.slice(0, 6), null, 1));

await browser.close();
server.kill("SIGTERM");
