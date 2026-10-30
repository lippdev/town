// Depuração do arrasto: injeta espião no prototype do OrbitControls conectado.
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

// Espia os handlers no canvas antes do arrasto
const handlers = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const out = {};
  // Chrome DevTools não expõe getEventListeners fora do console; usa capturing
  const types = ["pointerdown","pointermove","pointerup","wheel"];
  for (const type of types) out[type] = "checked-via-log";
  return out;
});
console.log("HANDLERS:", JSON.stringify(handlers));

// Verifica se o pointer capture funciona: arrasta e observa position da camera via matrix
const readCam = () => page.evaluate(() => {
  // A câmera não é exposta; usa a bridge: getView retorna da store agora
  return window.__HQ_QA__.getView();
});

const before = await readCam();
const box = await page.locator("canvas").boundingBox();
const cx = box.x + box.width/2, cy = box.y + box.height/2;

// Dispatch manual de PointerEvent para contornar qualquer filtro de input do CDP
await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const fire = (type, x, y, buttons, button) => {
    canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: 7, pointerType: "mouse", isPrimary: true,
      button, buttons, clientX: x, clientY: y, bubbles: true, cancelable: true, view: window,
    }));
  };
  window.__fire = fire;
});

await page.evaluate(() => window.__fire("pointerdown", 640, 400, 2, 2));
for (let i = 1; i <= 12; i++) {
  await page.evaluate((step) => window.__fire("pointermove", 640 + step * 20, 400, 2, -1), i);
}
await page.waitForTimeout(300);
const mid = await readCam();
await page.evaluate(() => window.__fire("pointerup", 880, 400, 0, -1));
await page.waitForTimeout(400);
const after = await readCam();

console.log("ANTES :", JSON.stringify(before));
console.log("MID   :", JSON.stringify(mid));
console.log("DEPOIS:", JSON.stringify(after));
console.log("DELTA_AZ:", (after.azimuthDeg - before.azimuthDeg).toFixed(2));

await browser.close();
server.kill("SIGTERM");
