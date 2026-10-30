#!/usr/bin/env node
/**
 * Harness de validação visual do Lipp HQ World.
 *
 * Abre a aplicação num Chromium real com WebGL habilitado, espera o primeiro
 * frame, executa as capturas pedidas e valida cada imagem (luminância média e
 * desvio padrão), para que um canvas preto nunca passe como evidência.
 *
 * Uso:
 *   node scripts/visual-qa/capture.mjs --serve --out qa/screenshots
 *   node scripts/visual-qa/capture.mjs --url http://127.0.0.1:4173 --shots overview-default
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "../..");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/local/bin/google-chrome",
  "/usr/bin/google-chrome",
  "/usr/local/bin/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const GL_FLAGS = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--disable-gpu-sandbox",
  "--ignore-gpu-blocklist",
];

function parseArgs(argv) {
  const options = {
    url: "http://127.0.0.1:4173",
    out: "qa/screenshots",
    width: 1440,
    height: 900,
    serve: false,
    shots: [],
    port: "4173",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`Falta o valor de ${arg}`);
      index += 1;
      return value;
    };
    if (arg === "--url") options.url = takeValue();
    else if (arg === "--out") options.out = takeValue();
    else if (arg === "--width") options.width = Number(takeValue());
    else if (arg === "--height") options.height = Number(takeValue());
    else if (arg === "--shots") {
      options.shots = takeValue()
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
    } else if (arg === "--port") options.port = takeValue();
    else if (arg === "--serve") options.serve = true;
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return options;
}

async function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error(
    "Nenhum Chromium encontrado. Defina CHROME_PATH apontando para um executável do Chrome.",
  );
}

async function waitForServer(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      /* servidor ainda subindo */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Servidor não respondeu em ${url}`);
}

async function startPreview(port) {
  const child = spawn(
    path.join(ROOT, "node_modules/.bin/vite"),
    ["preview", "--port", port, "--host", "127.0.0.1", "--strictPort"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout.on("data", (chunk) => process.stdout.write(`[preview] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[preview] ${chunk}`));
  return child;
}

async function analyze(page, filePath) {
  const base64 = (await fs.readFile(filePath)).toString("base64");
  return page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, image.width >> 1);
    canvas.height = Math.max(1, image.height >> 1);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D indisponível para auditoria.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    let sumSquares = 0;
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      const luminance =
        0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
      sum += luminance;
      sumSquares += luminance * luminance;
      count += 1;
    }
    const mean = sum / count;
    const variance = sumSquares / count - mean * mean;
    return {
      mean: Number(mean.toFixed(2)),
      stdDev: Number(Math.sqrt(Math.max(variance, 0)).toFixed(2)),
      width: image.width,
      height: image.height,
    };
  }, `data:image/png;base64,${base64}`);
}

/** Roda um arrasto horizontal com o botão direito no centro do canvas. */
async function rightDrag(page, { dx = 320, dy = 0, steps = 24 } = {}) {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("Canvas não encontrado para o teste de arrasto.");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(startX + dx, startY + dy, { steps });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(700);
}

const SHOTS = {
  "overview-default": async () => {},
  "drag-right-rotate": async (page) => {
    await rightDrag(page, { dx: 340 });
  },
  "drag-vertical-orbit": async (page) => {
    await rightDrag(page, { dx: 0, dy: 180 });
  },
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, options.out);
  await fs.mkdir(outDir, { recursive: true });

  let server = null;
  if (options.serve) {
    server = await startPreview(options.port);
    options.url = `http://127.0.0.1:${options.port}`;
  }
  await waitForServer(options.url);

  const executablePath = await findChrome();
  const browser = await chromium.launch({
    executablePath,
    args: GL_FLAGS,
  });

  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  const report = {
    generatedAt: new Date().toISOString(),
    url: options.url,
    viewport: { width: options.width, height: options.height },
    chrome: executablePath,
    webgl: null,
    shots: [],
    consoleErrors,
  };

  try {
    await page.goto(options.url, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => window.__HQ_WORLD_READY__ === true, { timeout: 60000 });
    // Deixa o damping/mixer assentarem antes da primeira captura.
    await page.waitForTimeout(900);

    report.webgl = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
      if (!gl) return { supported: false };
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        supported: true,
        version: gl.getParameter(gl.VERSION),
        renderer: debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
      };
    });

    const names = options.shots.length > 0 ? options.shots : Object.keys(SHOTS);
    for (const name of names) {
      const action = SHOTS[name];
      if (!action) throw new Error(`Captura desconhecida: ${name}`);
      await action(page);
      const filePath = path.join(outDir, `${name}.png`);
      await page.screenshot({ path: filePath, animations: "allow" });
      const analysis = await analyze(page, filePath);
      const bytes = await fs.readFile(filePath);
      report.shots.push({
        name,
        file: path.relative(ROOT, filePath),
        sha256: crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16),
        ...analysis,
      });
    }
  } finally {
    await browser.close();
    if (server) server.kill("SIGTERM");
  }

  const blank = report.shots.filter((shot) => shot.stdDev < 4 || shot.mean < 6);
  const duplicated = new Map();
  for (const shot of report.shots) {
    duplicated.set(shot.sha256, (duplicated.get(shot.sha256) ?? 0) + 1);
  }
  const identical = [...duplicated.entries()].filter(([, count]) => count > 1);

  report.verdict = {
    ok: blank.length === 0 && consoleErrors.length === 0,
    blankShots: blank.map((shot) => shot.name),
    duplicateShots: identical.length > 0,
    consoleErrorCount: consoleErrors.length,
  };

  const manifestPath = path.join(outDir, "manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify(report, null, 2));

  if (blank.length > 0) {
    console.error(`Capturas em branco ou chapadas: ${blank.map((s) => s.name).join(", ")}`);
  }
  if (consoleErrors.length > 0) {
    console.error(`Erros de console detectados: ${consoleErrors.length}`);
  }
  if (!report.verdict.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
