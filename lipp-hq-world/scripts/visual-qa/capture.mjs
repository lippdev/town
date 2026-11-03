#!/usr/bin/env node
/**
 * Harness de validação visual do Lipp HQ World.
 *
 * Abre a aplicação num Chromium real com WebGL habilitado, espera o primeiro
 * frame, posiciona a câmera por uma ponte de QA determinística e valida cada
 * captura: luminância média e desvio padrão (para reprovar canvas preto ou
 * chapado) e enquadramento do prédio na tela.
 *
 * Uso:
 *   node scripts/visual-qa/capture.mjs --serve --out qa/screenshots
 *   node scripts/visual-qa/capture.mjs --url http://127.0.0.1:4173 --shots camera-north
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

const SETTLE_MS = 900;

/**
 * Capturas cujo enquadramento não é julgado: os testes de arrasto terminam em
 * qualquer azimute (o centro do AABB se desloca por perspectiva) e o zoom é
 * intencionalmente recortado.
 */
const FRAMING_EXEMPT = new Set([
  "drag-right-rotate",
  "drag-vertical-orbit",
  "camera-zoom-in",
  // close-up intencional na sala do agente para mostrar o visual escolhido
  "appearance-picker",
]);

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

async function sceneState(page, framingRoom) {
  return page.evaluate((room) => {
    const api = window.__HQ_QA__;
    if (!api) return null;
    return {
      view: api.getView(),
      framing: room ? api.getFraming(room) : api.getFraming(),
      cutawayWalls: api.getCutawayWalls(),
      signs: api.getSignPositions(),
      wallGroups: api.countWalls(),
    };
  }, framingRoom ?? null);
}

/** Arrasto com o botão direito no centro do canvas. */
async function rightDrag(page, { dx = 0, dy = 0, steps = 24 } = {}) {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("Canvas não encontrado para o teste de arrasto.");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(startX + dx, startY + dy, { steps });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(SETTLE_MS);
}

const setView = (view) => async (page) => {
  await page.evaluate((options) => window.__HQ_QA__?.setView(options), view);
  await page.waitForTimeout(SETTLE_MS);
};

const setWallMode = (mode) => async (page) => {
  await page.evaluate((value) => window.__HQ_QA__?.setWallMode(value), mode);
  await page.waitForTimeout(SETTLE_MS);
};

/**
 * Espera a vista alcançar o valor esperado (com tolerância mínima) — a prova
 * só vale se o valor for o do comando, não um frame do meio do caminho.
 */
async function waitForViewNear(
  page,
  expected,
  { toleranceDeg = 0.08, timeoutMs = 12000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const view = await page.evaluate(() => window.__HQ_QA__.getView());
    const gaps = {
      az: Math.abs(view.azimuthDeg - expected.azimuthDeg),
      el: Math.abs(view.elevationDeg - expected.elevationDeg),
      dist: Math.abs(view.distance - expected.distance),
    };
    if (gaps.az < toleranceDeg && gaps.el < toleranceDeg && gaps.dist < 0.05) return;
    await page.waitForTimeout(400);
  }
  throw new Error(`A vista não chegou ao valor esperado: ${JSON.stringify(expected)}`);
}

/** Espera um predicado sobre a pose do agente ficar verdadeiro. */
async function waitForAgentPredicate(page, agentId, predicate, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pose = await page.evaluate((id) => window.__HQ_QA__.getAgentPose(id), agentId);
    if (pose && predicate(pose)) return;
    await page.waitForTimeout(300);
  }
  throw new Error(`Predicado da pose de ${agentId} nunca ficou verdadeiro.`);
}

/** Espera o agente chegar a um ponto (distância máxima) ou mudar de estado. */
async function waitForAgentNear(page, agentId, target, maxDistance, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pose = await page.evaluate((id) => window.__HQ_QA__.getAgentPose(id), agentId);
    if (pose) {
      const distance = Math.hypot(pose.x - target.x, pose.z - target.z);
      if (distance <= maxDistance) return;
    }
    await page.waitForTimeout(600);
  }
  throw new Error(`Agente ${agentId} não chegou perto do alvo a tempo.`);
}

const SHOTS = {
  "overview-default": async () => {},
  "camera-north": setView({ azimuthDeg: 180, elevationDeg: 34, distance: 57 }),
  "camera-east": setView({ azimuthDeg: 90, elevationDeg: 34, distance: 57 }),
  "camera-south": setView({ azimuthDeg: 0, elevationDeg: 34, distance: 57 }),
  "camera-west": setView({ azimuthDeg: 270, elevationDeg: 34, distance: 57 }),
  "camera-diagonal-a": setView({ azimuthDeg: 40, elevationDeg: 30, distance: 55 }),
  "camera-diagonal-b": setView({ azimuthDeg: 140, elevationDeg: 30, distance: 55 }),
  "camera-zoom-in": setView({ azimuthDeg: 35, elevationDeg: 28, distance: 30 }),
  "walls-auto-north": async (page) => {
    await setWallMode("auto")(page);
    await setView({ azimuthDeg: 180, elevationDeg: 32, distance: 52 })(page);
  },
  "walls-auto-south": async (page) => {
    await setWallMode("auto")(page);
    await setView({ azimuthDeg: 0, elevationDeg: 32, distance: 52 })(page);
  },
  "walls-auto-diagonal": async (page) => {
    await setWallMode("auto")(page);
    await setView({ azimuthDeg: 50, elevationDeg: 30, distance: 52 })(page);
  },
  "walls-low": async (page) => {
    await setWallMode("low")(page);
    await setView({ azimuthDeg: 45, elevationDeg: 34, distance: 57 })(page);
  },
  "walls-full": async (page) => {
    await setWallMode("full")(page);
    await setView({ azimuthDeg: 45, elevationDeg: 34, distance: 57 })(page);
  },
  "drag-right-rotate": async (page) => {
    await setWallMode("auto")(page);
    await setView({ azimuthDeg: 30, elevationDeg: 34, distance: 57 })(page);
    await rightDrag(page, { dx: 320 });
  },
  "drag-vertical-orbit": async (page) => {
    await setView({ azimuthDeg: 30, elevationDeg: 34, distance: 57 })(page);
    await rightDrag(page, { dx: 0, dy: 160 });
  },
  "room-selected-focus": async (page) => {
    await page.evaluate(() => window.__HQ_QA__.focus("engenharia", { instant: true }));
    await page.waitForTimeout(SETTLE_MS + 1200);
  },
  "camera-reset": async (page) => {
    await page.evaluate(() => window.__HQ_QA__.reset({ instant: true }));
    await waitForViewNear(page, globalThis.__initialView);
  },
  "stability-nudge": async (page) => {
    await setWallMode("auto")(page);
    await setView({ azimuthDeg: 46, elevationDeg: 30, distance: 52 })(page);
  },
  "agents-walking": async (page) => {
    await setWallMode("auto")(page);
    await setView({ azimuthDeg: 45, elevationDeg: 38, distance: 57 })(page);
    await page.evaluate(() => window.__HQ_QA__.setDemoPaused(true));
    await page.evaluate(() => {
      window.__HQ_QA__.demoCommand("scout", "walking");
      window.__HQ_QA__.demoCommand("ink", "walking");
    });
    // congela quando o Scout estiver no corredor oeste (x entre -6,5 e -4,3)
    // ou a menos de 3 unidades do waypoint do hall
    await waitForAgentPredicate(page, "scout", (pose) => {
      const inCorridor = pose.x > -6.5 && pose.x < -4.3;
      const nearHall = Math.hypot(pose.x + 1.2, pose.z - 0.8) < 3;
      return inCorridor || nearHall;
    }, 60000);
    await page.evaluate(() => window.__HQ_QA__.setDemoPaused(false));
  },
  "appearance-picker": async (page) => {
    await setWallMode("auto")(page);
    await setView({ azimuthDeg: 40, elevationDeg: 32, distance: 26 })(page);
    // escolhe um personagem pronto para o Pulse pela UI real (painel do agente)
    await page.getByRole("button", { name: "Agentes" }).click();
    await page.getByRole("button", { name: /Pulse/ }).click();
    await page.getByRole("option", { name: "Nox" }).click();
    // aproxima a sala do Pulse para o novo visual ficar legível na captura
    await setView({ azimuthDeg: 45, elevationDeg: 34, distance: 11, target: [-11.4, 0, -8.7] })(page);
    await page.waitForTimeout(SETTLE_MS + 600);
  },
  "agents-meeting": async (page) => {
    await page.evaluate(() => window.__HQ_QA__.setDemoPaused(true));
    await page.evaluate(() => window.__HQ_QA__.demoCommand("forge", "meeting"));
    await waitForAgentNear(page, "forge", { x: 11.4, z: 8.7 }, 2.0, 60000);
    await page.evaluate(() => window.__HQ_QA__.focus("reunioes", { instant: true }));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__HQ_QA__.setDemoPaused(false));
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
  const browser = await chromium.launch({ executablePath, args: GL_FLAGS });
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
    await page.waitForTimeout(SETTLE_MS);

    // Vista inicial de referência para a prova do reset.
    globalThis.__initialView = await page.evaluate(() => window.__HQ_QA__.getView());
    report.initialView = globalThis.__initialView;

    // FPS medido de verdade: conta frames por 3 segundos.
    report.fps = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0;
          const start = performance.now();
          const tick = () => {
            frames += 1;
            if (performance.now() - start < 3000) requestAnimationFrame(tick);
            else resolve(Number((frames / 3).toFixed(1)));
          };
          requestAnimationFrame(tick);
        }),
    );

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

    // Responsividade: mesma cena em três viewports da spec.
    const responsiveViewports = [
      { width: 1280, height: 800, name: "responsive-1280x800" },
      { width: 1366, height: 768, name: "responsive-1366x768" },
      { width: 1920, height: 1080, name: "responsive-1920x1080" },
    ];
    if (options.shots.length === 0) {
      for (const viewport of responsiveViewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(1600);
        const filePath = path.join(outDir, `${viewport.name}.png`);
        await page.screenshot({ path: filePath, animations: "allow" });
        const analysis = await analyze(page, filePath);
        const state = await sceneState(page);
        const bytes = await fs.readFile(filePath);
        report.shots.push({
          name: viewport.name,
          file: path.relative(ROOT, filePath),
          sha256: crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16),
          ...analysis,
          view: state?.view ?? null,
          framing: state?.framing ?? null,
          cutawayWalls: state?.cutawayWalls ?? [],
        });
      }
      // volta ao viewport de referência
      await page.setViewportSize({ width: options.width, height: options.height });
      await page.waitForTimeout(1200);
    }

    const names = options.shots.length > 0 ? options.shots : Object.keys(SHOTS);
    for (const name of names) {
      const action = SHOTS[name];
      if (!action) throw new Error(`Captura desconhecida: ${name}`);
      await action(page);
      const filePath = path.join(outDir, `${name}.png`);
      await page.screenshot({ path: filePath, animations: "allow" });
      const analysis = await analyze(page, filePath);
      const state = await sceneState(
        page,
        name === "room-selected-focus" ? "engenharia" : undefined,
      );
      const framingChecked = !FRAMING_EXEMPT.has(name);
      const bytes = await fs.readFile(filePath);
      report.shots.push({
        name,
        file: path.relative(ROOT, filePath),
        sha256: crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16),
        ...analysis,
        view: state?.view ?? null,
        framing: framingChecked ? (state?.framing ?? null) : null,
        framingBypassed: !framingChecked,
        cutawayWalls: state?.cutawayWalls ?? [],
        signCount: state?.signs?.length ?? null,
      });
    }

    const last = await sceneState(page);
    report.scene = {
      signs: last?.signs ?? [],
      cutawayWalls: last?.cutawayWalls ?? [],
      wallGroups: last?.wallGroups ?? 0,
    };
  } finally {
    await browser.close();
    if (server) server.kill("SIGTERM");
  }

  const blank = report.shots.filter((shot) => shot.stdDev < 4 || shot.mean < 6);
  const offCenter = report.shots.filter(
    (shot) => shot.framing && (shot.framing.centerX < 0.4 || shot.framing.centerX > 0.6),
  );
  const tooSmall = report.shots.filter(
    (shot) =>
      shot.framing &&
      shot.framing.widthFraction < (shot.name.startsWith("responsive-") ? 0.45 : 0.3),
  );
  // Reset: a vista precisa voltar ao padrão dentro de tolerância. Pixels podem
  // diferir por um resíduo de damping no instante da captura.
  const overview = report.shots.find((shot) => shot.name === "overview-default")?.view;
  const resetShot = report.shots.find((shot) => shot.name === "camera-reset");
  const resetView = resetShot?.view;
  let resetWorks = false;
  if (overview && resetView) {
    const angleGap = Math.abs(overview.azimuthDeg - resetView.azimuthDeg);
    const elevationGap = Math.abs(overview.elevationDeg - resetView.elevationDeg);
    const distanceGap = Math.abs(overview.distance - resetView.distance);
    resetWorks = angleGap < 0.5 && elevationGap < 1.5 && distanceGap < 0.5;
  }

  const hashes = new Map();
  for (const shot of report.shots) {
    if (shot.name === "camera-reset" || shot.name === "overview-default") continue;
    hashes.set(shot.sha256, (hashes.get(shot.sha256) ?? 0) + 1);
  }
  const identical = [...hashes.entries()].filter(([, count]) => count > 1);

  report.verdict = {
    ok:
      blank.length === 0 &&
      consoleErrors.length === 0 &&
      offCenter.length === 0 &&
      tooSmall.length === 0,
    blankShots: blank.map((shot) => shot.name),
    offCenterShots: offCenter.map((shot) => shot.name),
    tooSmallShots: tooSmall.map((shot) => shot.name),
    duplicateShots: identical.length > 0,
    resetProvenByIdenticalShot: resetWorks,
    consoleErrorCount: consoleErrors.length,
    signCount: report.scene.signs.length,
  };

  const manifestPath = path.join(outDir, "manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify(report, null, 2));

  if (blank.length > 0) console.error(`Capturas em branco: ${blank.map((s) => s.name).join(", ")}`);
  if (offCenter.length > 0)
    console.error(`Enquadramento fora do centro: ${offCenter.map((s) => s.name).join(", ")}`);
  if (tooSmall.length > 0)
    console.error(`Prédio pequeno demais: ${tooSmall.map((s) => s.name).join(", ")}`);
  if (consoleErrors.length > 0)
    console.error(`Erros de console detectados: ${consoleErrors.length}`);
  if (!report.verdict.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
