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

const before = await page.evaluate(() => window.__HQ_QA__.getView());
await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  window.__draglog__ = [];
  ["pointerdown","pointermove","pointerup","mousedown","contextmenu"].forEach((type) => {
    canvas.addEventListener(type, (e) => window.__draglog__.push(`${type} btn=${e.button ?? "-"} x=${Math.round(e.clientX ?? 0)} buttons=${e.buttons ?? "-"}`));
  });
  document.addEventListener("pointerdown", (e) => window.__draglog__.push(`DOC ${type2label(e)}`), {capture: true});
  function type2label(e){ return `pointerdown btn=${e.button} buttons=${e.buttons}`; }
});
const box = await page.locator("canvas").boundingBox();
const cx = box.x + box.width/2, cy = box.y + box.height/2;
await page.mouse.move(cx, cy);
await page.mouse.down({ button: "right" });
await page.mouse.move(cx + 260, cy, { steps: 18 });
await page.waitForTimeout(120);
const midView = await page.evaluate(() => window.__HQ_QA__.getView());
console.log("MEIO  :", JSON.stringify(midView));
await page.mouse.up({ button: "right" });
await page.waitForTimeout(900);
const after = await page.evaluate(() => window.__HQ_QA__.getView());

console.log("ANTES :", JSON.stringify(before));
console.log("DEPOIS:", JSON.stringify(after));
console.log("AZIMUTE_MUDOU:", before.azimuthDeg !== after.azimuthDeg, "| delta =", (after.azimuthDeg - before.azimuthDeg).toFixed(1));

const draglog = await page.evaluate(() => window.__draglog__);
console.log("EVENTOS:", JSON.stringify(draglog.slice(0, 12)));
await browser.close();
server.kill("SIGTERM");
