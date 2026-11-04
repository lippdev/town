#!/usr/bin/env node
/**
 * Percorre o zoom inteiro do escritório com o Filipe em cena, em DPR 1, 1,5 e 2: recorta
 * o personagem, grava folhas de comparação e imprime px por texel e as medidas por captura.
 * Roda também no código antigo (sem o gancho `sprite` do QA), para comparar antes e depois.
 *
 * Uso: node scripts/visual-qa/sprite-zoom.mjs [--url http://127.0.0.1:5181] [--rotulo depois]
 *        [--saida pasta] [--dpr 1,1.5,2] [--qualidade alta] [--escalas 0.55,1.5] [--rapido] [--so-zoom] [--so-custo] [--arte-nova]
 * Sem --url, sobe um vite numa porta livre. Saída padrão: qa/sprite-zoom/<rótulo>.
 *
 * Medidas:
 * - bloco: em cada linha e coluna do corpo, acha as bordas com posição subpixel (centroide
 *   do gradiente) e compara a distância entre bordas vizinhas com o múltiplo inteiro mais
 *   próximo do tamanho do texel. Zero é bloco perfeito; nearest em escala não inteira erra
 *   até meio pixel de tela.
 * - rosto: desvio padrão do luma e faixa p5–p95 na região do rosto, contra o atlas original.
 * - varredura: maior salto de brilho médio entre passos de 1% de zoom (piscar).
 * - tremor: com o gancho, diferença entre quadros consecutivos andando, com e sem encaixe.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { chromium } from "playwright";
import { freePort, waitForUrl } from "./ports.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const argOf = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const LABEL = argOf("rotulo", "depois");
const OUT = path.resolve(argOf("saida", path.join(ROOT, "qa/sprite-zoom", LABEL)));
const DPRS = argOf("dpr", "1,1.5,2").split(",").map(Number);
const QUALITY = argOf("qualidade", "alta");
const NEW_ART = process.argv.includes("--arte-nova");
/** Só a folha de zoom e a de cena: para olhar um ajuste sem esperar as varreduras. */
const QUICK = process.argv.includes("--rapido");
/** Só o custo por quadro: para medir um build antigo sem refazer as folhas. */
const COST_ONLY = process.argv.includes("--so-custo");
/** Só o percurso de zoom e as folhas dele, sem as cenas: para iterar na redução e na cor. */
const ZOOM_ONLY = process.argv.includes("--so-zoom");

const DEMO = "/?escritorio=completo&modo=demonstracao";
const VIEWPORT = { width: 1440, height: 900 };
/** Largura e altura de um texel na tela por unidade de zoom: 1,8 m em 107 linhas, vistos a 30°. */
const SCREEN_METERS_PER_TEXEL = (1.8 * Math.cos(Math.PI / 6)) / 107;
const CELL = { width: 58, height: 115, sole: 112, visible: 107 };
/** Pixels de tela (CSS) por texel que entram na folha, do andar inteiro ao zoom máximo. */
const SCALES = (argOf("escalas", null)?.split(",").map(Number)) ?? [0.39, 0.45, 0.55, 0.7, 0.85, 1, 1.25, 1.5, 1.8, 2, 2.25, 2.7, 3.2, 3.93];
/** Primeira parada do passeio, onde ele fica com movimento reduzido. */
const FEET = { x: -0.6, z: 2.05 };
const HIDE_UI = `.office-labels, .office-top, .office-bottom, .office-roster, .office-camera, .office-focus, .office-hud, .office-demo-panel { visibility: hidden !important; }`;

// ---------------------------------------------------------------- PNG mínimo, sem dependência

function decodePng(buffer) {
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const channels = { 2: 3, 6: 4 }[buffer[25]];
  if (buffer[24] !== 8 || !channels || buffer[28] !== 0) throw new Error("PNG fora do formato esperado");
  const parts = [];
  for (let at = 8; at < buffer.length;) {
    const size = buffer.readUInt32BE(at);
    if (buffer.toString("latin1", at + 4, at + 8) === "IDAT") parts.push(buffer.subarray(at + 8, at + 8 + size));
    at += size + 12;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(stride);
  const line = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    const filter = raw[start];
    for (let i = 0; i < stride; i += 1) {
      const value = raw[start + 1 + i];
      const a = i >= channels ? line[i - channels] : 0;
      const b = previous[i];
      const c = i >= channels ? previous[i - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = (value + predictor) & 255;
    }
    previous.set(line);
    for (let x = 0; x < width; x += 1) {
      const to = (y * width + x) * 4;
      out[to] = line[x * channels];
      out[to + 1] = line[x * channels + 1];
      out[to + 2] = line[x * channels + 2];
      out[to + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
  }
  return { width, height, data: out };
}

const lumaAt = (image, x, y) => {
  const i = (y * image.width + x) * 4;
  return 0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2];
};

// ---------------------------------------------------------------- medidas

/** Posições subpixel das bordas de uma linha de luma. */
function edgesOf(line, threshold = 6, strength = 20) {
  const edges = [];
  let i = 0;
  while (i < line.length - 1) {
    const g = line[i + 1] - line[i];
    if (Math.abs(g) < threshold) {
      i += 1;
      continue;
    }
    const sign = Math.sign(g);
    let sum = 0;
    let moment = 0;
    while (i < line.length - 1 && Math.sign(line[i + 1] - line[i]) === sign && Math.abs(line[i + 1] - line[i]) >= threshold) {
      const value = Math.abs(line[i + 1] - line[i]);
      sum += value;
      moment += value * (i + 1);
      i += 1;
    }
    if (sum >= strength) edges.push(moment / sum);
  }
  return edges;
}

/** Erro de cada distância entre bordas vizinhas contra múltiplos do texel, em pixels. */
function blockErrors(image, rect, texel) {
  const errors = [];
  const scan = (line) => {
    const edges = edgesOf(line);
    for (let i = 1; i < edges.length; i += 1) {
      const gap = edges[i] - edges[i - 1];
      const blocks = Math.round(gap / texel);
      if (blocks >= 1 && blocks <= 6) errors.push(Math.abs(gap - blocks * texel));
    }
  };
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(image.width, Math.round(rect.x + rect.width));
  const y1 = Math.min(image.height, Math.round(rect.y + rect.height));
  for (let y = y0; y < y1; y += 1) {
    const line = [];
    for (let x = x0; x < x1; x += 1) line.push(lumaAt(image, x, y));
    scan(line);
  }
  for (let x = x0; x < x1; x += 1) {
    const line = [];
    for (let y = y0; y < y1; y += 1) line.push(lumaAt(image, x, y));
    scan(line);
  }
  return errors;
}

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};
const mean = (values) => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);

function regionStats(image, rect, keep = () => true) {
  const values = [];
  for (let y = Math.max(0, Math.round(rect.y)); y < Math.min(image.height, Math.round(rect.y + rect.height)); y += 1) {
    for (let x = Math.max(0, Math.round(rect.x)); x < Math.min(image.width, Math.round(rect.x + rect.width)); x += 1) {
      if (keep(x, y)) values.push(lumaAt(image, x, y));
    }
  }
  const average = mean(values);
  const deviation = Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
  return { mean: average, deviation, p5: percentile(values, 0.05), p95: percentile(values, 0.95), count: values.length };
}

/** Rosto na célula (linhas e colunas do atlas, quadro parado de frente). */
const FACE = { top: 16, bottom: 32, left: -10, right: 11 };

function faceRect(feet, texel) {
  return {
    x: feet.x + FACE.left * texel,
    y: feet.y - (CELL.sole - FACE.top) * texel,
    width: (FACE.right - FACE.left) * texel,
    height: (FACE.bottom - FACE.top) * texel,
  };
}

function bodyRect(feet, texel) {
  return { x: feet.x - 26 * texel, y: feet.y - CELL.visible * texel, width: 52 * texel, height: CELL.visible * texel };
}

/**
 * Cor na cena contra a da arte. Cada texel interior do quadro parado cobre um pixel de tela;
 * o espelhamento e o meio pixel do encaixe são achados pelo que mais correlaciona o luma. Razão 1
 * em cada canal é a cor da arte; contraste 1 é o desvio do luma da arte. O cabelo é a faixa
 * de cima da cabeça; a roupa, os texels escuros do resto.
 */
let atlasCache = null;
async function colorMatch(image, feet, texel) {
  atlasCache ??= decodePng(await readFile(path.join(ROOT, "public/characters/filipe/walk.png")));
  const atlas = atlasCache;
  const column = (x, mirrored) => CELL.width + (mirrored ? CELL.width - 1 - x : x);
  const at = (x, y, mirrored) => (y * atlas.width + column(x, mirrored)) * 4;
  const interior = (x, y) => {
    if (x < 1 || y < 1 || x >= CELL.width - 1 || y >= CELL.height - 1 || atlas.data[at(x, y, false) + 3] !== 255) return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => atlas.data[at(x + dx, y + dy, false) + 3] === 255);
  };
  const texels = [];
  for (let y = 0; y < CELL.height; y += 1) for (let x = 0; x < CELL.width; x += 1) if (interior(x, y)) texels.push({ x, y });
  const lumaOf = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const pairs = (mirrored, offset, every = 1) => {
    const list = [];
    for (let i = 0; i < texels.length; i += every) {
      const { x, y } = texels[i];
      const px = Math.floor(feet.x + offset.x + (x + 0.5 - CELL.width / 2) * texel);
      const py = Math.floor(feet.y + offset.y + (y + 0.5 - CELL.sole) * texel);
      if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
      const from = at(x, y, mirrored);
      list.push({ y, art: [0, 1, 2].map((c) => atlas.data[from + c]), shot: [0, 1, 2].map((c) => image.data[(py * image.width + px) * 4 + c]) });
    }
    return list;
  };
  const correlation = (list) => {
    const art = list.map((item) => lumaOf(item.art));
    const shot = list.map((item) => lumaOf(item.shot));
    const [ma, ms] = [mean(art), mean(shot)];
    const cross = mean(art.map((value, i) => (value - ma) * (shot[i] - ms)));
    return cross / Math.sqrt(mean(art.map((value) => (value - ma) ** 2)) * mean(shot.map((value) => (value - ms) ** 2)) || 1);
  };
  let best = { score: -Infinity, mirrored: false, offset: { x: 0, y: 0 } };
  const reach = Math.ceil(texel * 0.75 + 1);
  for (const mirrored of [false, true]) {
    for (let dy = -reach; dy <= reach; dy += 0.5) {
      for (let dx = -reach; dx <= reach; dx += 0.5) {
        const list = pairs(mirrored, { x: dx, y: dy }, 3);
        if (list.length < 50) continue;
        const score = correlation(list);
        if (score > best.score) best = { score, mirrored, offset: { x: dx, y: dy } };
      }
    }
  }
  const matched = pairs(best.mirrored, best.offset);
  const spread = (list) => {
    const values = list.map(lumaOf);
    const average = mean(values);
    return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
  };
  const summary = (list) => ({
    ratio: [0, 1, 2].map((c) => mean(list.map((item) => item.shot[c])) / mean(list.map((item) => item.art[c]))),
    contrast: spread(list.map((item) => item.shot)) / spread(list.map((item) => item.art)),
    count: list.length,
  });
  return {
    all: summary(matched),
    hair: summary(matched.filter((item) => item.y < 17)),
    cloth: summary(matched.filter((item) => item.y >= 17 && lumaOf(item.art) < 60)),
    match: best.score,
    mirrored: best.mirrored,
  };
}

/** O mesmo recorte no atlas original: a referência do que o rosto deveria mostrar. */
async function faceReference() {
  const atlas = decodePng(await readFile(path.join(ROOT, "public/characters/filipe/walk.png")));
  const feet = { x: CELL.width * 1.5, y: CELL.sole };
  return regionStats(atlas, faceRect(feet, 1), (x, y) => atlas.data[(y * atlas.width + x) * 4 + 3] > 127);
}

// ---------------------------------------------------------------- cena

async function openPage(browser, origin, dpr, routes) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: dpr, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.problems = [];
  page.on("pageerror", (error) => page.problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" || (message.type() === "warning" && /shader|THREE\.|escritório/i.test(message.text()))) page.problems.push(message.text().slice(0, 400));
  });
  await page.addInitScript((quality) => localStorage.setItem("hq.graphics", quality), QUALITY);
  if (routes) await routes(page);
  await page.goto(origin + DEMO);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().load === "ready", null, { timeout: 180000 });
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().rigs.length >= 7, null, { timeout: 180000 });
  await page.addStyleTag({ content: HIDE_UI });
  await page.waitForFunction(() => !window.__HQ_OFFICE_QA__.sprite || window.__HQ_OFFICE_QA__.sprite.info().ready, null, { timeout: 60000 }).catch(() => {});
  return page;
}

const zoomOf = (page) => page.evaluate(() => window.__HQ_OFFICE_QA__.state().view.zoom);
const feetAt = (page) => page.evaluate(({ x, z }) => window.__HQ_OFFICE_QA__.roomPoint("hall", x, z), FEET);
/** Espera a cena desenhar de novo: a captura não pode sair antes do quadro novo. */
const settled = (page) => page.evaluate(() => new Promise((resolve) => {
  let left = 3;
  const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
}));

async function zoomTo(page, target) {
  for (let tries = 0; tries < 6; tries += 1) {
    const zoom = await zoomOf(page);
    if (Math.abs(zoom - target) / target < 0.002) break;
    const feet = await feetAt(page);
    await page.mouse.move(feet.x, feet.y);
    // igual ao palco: zoom · exp(−deltaY · 0,0016)
    await page.mouse.wheel(0, -Math.log(target / zoom) / 0.0016);
    await settled(page);
  }
  return zoomOf(page);
}

/** Arrasta o andar até os pés caírem no ponto pedido da tela. */
async function centerFeet(page, goal = { x: 720, y: 640 }) {
  for (let tries = 0; tries < 3; tries += 1) {
    const feet = await feetAt(page);
    if (Math.hypot(feet.x - goal.x, feet.y - goal.y) < 2) return;
    await page.mouse.move(feet.x, feet.y);
    await page.mouse.down();
    await page.mouse.move(goal.x, goal.y, { steps: 3 });
    await page.mouse.up();
    await settled(page);
  }
}

async function shootAround(page, feet, cssTexel, dpr, marginTexels = 6) {
  const width = (CELL.width + marginTexels * 2) * cssTexel;
  const height = (CELL.visible + marginTexels * 2) * cssTexel;
  const clip = {
    x: Math.max(0, Math.floor(feet.x - width / 2)),
    y: Math.max(0, Math.floor(feet.y - height + marginTexels * cssTexel)),
    width: Math.ceil(width),
    height: Math.ceil(height),
  };
  clip.width = Math.min(clip.width, VIEWPORT.width - clip.x);
  clip.height = Math.min(clip.height, VIEWPORT.height - clip.y);
  const png = await page.screenshot({ clip });
  const image = decodePng(png);
  // os pés dentro do recorte, em pixels do dispositivo
  return { png, image, feet: { x: (feet.x - clip.x) * dpr, y: (feet.y - clip.y) * dpr } };
}

const dataUri = (png) => `data:image/png;base64,${png.toString("base64")}`;

/** Folha em HTML, para não depender de biblioteca de imagem: o navegador compõe e captura. */
async function renderSheet(browser, file, title, rows) {
  const context = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
  const page = await context.newPage();
  const cells = rows.map((row) => `
    <section><h2>${row.title}</h2><div class="row">${row.items.map((item) => `
      <figure><img src="${dataUri(item.png)}" style="width:${item.width}px;height:${item.height}px"><figcaption>${item.caption}</figcaption></figure>`).join("")}</div></section>`).join("");
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:16px;background:#20242e;color:#e8eaf0;font:13px/1.35 system-ui,sans-serif;width:max-content}
    h1{font-size:18px;margin:0 0 12px} h2{font-size:14px;margin:12px 0 6px;font-weight:600}
    .row{display:flex;gap:10px;align-items:flex-end}
    figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:4px}
    img{image-rendering:pixelated;display:block;background:#000}
    figcaption{font-variant-numeric:tabular-nums;color:#b7bdcb;text-align:center;white-space:pre}
    </style><h1>${title}</h1>${cells}`);
  await page.screenshot({ path: file, fullPage: true });
  await context.close();
}

/** Aumento inteiro para a folha, sem interpolar: o que se vê é o pixel que saiu da cena. */
const enlarge = (image, wanted) => Math.max(1, Math.floor(wanted / image.width));

// ---------------------------------------------------------------- arte nova (prova do JSON)

/** Atlas de prova: 12 quadros de caminhada e 8 de parado, com o dobro da resolução. */
async function newArtRoutes(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const source = await readFile(path.join(ROOT, "public/characters/filipe/walk.png"));
  await page.setContent("<canvas></canvas>");
  const png = await page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const cell = { w: 58, h: 115 };
    const canvas = document.createElement("canvas");
    canvas.width = cell.w * 2 * 12;
    canvas.height = cell.h * 2 * 4;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    for (let row = 0; row < 4; row += 1) {
      const sourceRow = row % 2;
      for (let column = 0; column < 12; column += 1) {
        const from = row < 2 ? column % 4 : 1;
        ctx.drawImage(bitmap, from * cell.w, sourceRow * cell.h, cell.w, cell.h, column * cell.w * 2, row * cell.h * 2, cell.w * 2, cell.h * 2);
      }
    }
    return canvas.toDataURL("image/png").split(",")[1];
  }, source.toString("base64"));
  await context.close();
  const metadata = {
    image: "walk.png",
    cell: { width: 116, height: 230 },
    soleRow: 224,
    visibleRows: 214,
    animations: {
      "walk-front": { row: 0, frames: 12, stepMeters: 0.2 / 3 },
      "walk-back": { row: 1, frames: 12, stepMeters: 0.2 / 3 },
      "idle-front": { row: 2, frames: 8, fps: 6 },
      "idle-back": { row: 3, frames: 8, fps: 6 },
    },
  };
  return async (page) => {
    await page.route("**/characters/filipe/walk.png", (route) => route.fulfill({ contentType: "image/png", body: Buffer.from(png, "base64") }));
    await page.route("**/characters/filipe/walk.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(metadata) }));
  };
}

// ---------------------------------------------------------------- percursos

async function sweepZoom(browser, origin, dpr, reference, routes) {
  const page = await openPage(browser, origin, dpr, routes);
  await centerFeet(page);
  const results = [];
  const info = await page.evaluate(() => window.__HQ_OFFICE_QA__.renderInfo());
  console.log(`\nDPR ${dpr} (canvas a ${info.pixelRatio}; ${info.graphicsMode}/${info.autoQuality}, ${info.calls} chamadas, ${info.textures} texturas)`);
  console.log(" pedido  css/tx  canvas/tx  bloco méd  bloco p95  arestas  rosto dp (ref %s)".replace("%s", reference.deviation.toFixed(1)));
  for (const scale of SCALES) {
    const zoom = await zoomTo(page, scale / SCREEN_METERS_PER_TEXEL);
    await centerFeet(page);
    await settled(page);
    const feet = await feetAt(page);
    const cssTexel = zoom * SCREEN_METERS_PER_TEXEL;
    const shot = await shootAround(page, feet, cssTexel, dpr);
    const texel = cssTexel * dpr;
    const errors = texel >= 1.2 ? blockErrors(shot.image, bodyRect(shot.feet, texel), texel) : [];
    const face = regionStats(shot.image, faceRect(shot.feet, texel));
    const color = texel >= 1 ? await colorMatch(shot.image, shot.feet, texel) : null;
    const canvasTexel = cssTexel * info.pixelRatio;
    const entry = {
      dpr,
      scale,
      zoom,
      cssPerTexel: cssTexel,
      canvasPerTexel: canvasTexel,
      devicePerTexel: texel,
      blockMean: mean(errors),
      blockP95: percentile(errors, 0.95),
      blockCount: errors.length,
      face,
      color,
      png: shot.png,
      image: shot.image,
      shotFeet: shot.feet,
    };
    results.push(entry);
    if (color) {
      const show = (group) => `${group.ratio.map((value) => value.toFixed(3)).join(" ")} (contraste ${group.contrast.toFixed(3)}, ${group.count} texels)`;
      console.log(`        cor/arte R G B: corpo ${show(color.all)}; cabelo ${show(color.hair)}; roupa ${show(color.cloth)}; correlação ${color.match.toFixed(4)}${color.mirrored ? ", espelhado" : ""}`);
    }
    console.log(
      `${scale.toFixed(2).padStart(7)} ${cssTexel.toFixed(2).padStart(7)} ${canvasTexel.toFixed(2).padStart(10)} ${errors.length ? entry.blockMean.toFixed(3).padStart(10) : "         —"} ${errors.length ? entry.blockP95.toFixed(3).padStart(10) : "         —"} ${String(errors.length).padStart(8)} ${face.deviation.toFixed(1).padStart(8)}`,
    );
  }
  const problems = page.problems;
  await page.context().close();
  return { results, info, problems };
}

/** Passos de 1% de zoom: o brilho do personagem não pode saltar. */
async function brightnessJumps(browser, origin, routes) {
  const page = await openPage(browser, origin, 1, routes);
  await centerFeet(page);
  const windows = [0.5, 0.75, 1.2, 1.8, 2.7];
  const summary = [];
  for (const start of windows) {
    let previous = null;
    let worst = 0;
    const deltas = [];
    await zoomTo(page, start / SCREEN_METERS_PER_TEXEL);
    await centerFeet(page);
    for (let step = 0; step < 10; step += 1) {
      const zoom = await zoomTo(page, (start * 1.01 ** step) / SCREEN_METERS_PER_TEXEL);
      const feet = await feetAt(page);
      const texel = zoom * SCREEN_METERS_PER_TEXEL;
      const shot = await shootAround(page, feet, texel, 1);
      const stats = regionStats(shot.image, bodyRect(shot.feet, texel));
      if (previous !== null) {
        deltas.push(Math.abs(stats.mean - previous));
        worst = Math.max(worst, Math.abs(stats.mean - previous));
      }
      previous = stats.mean;
    }
    summary.push({ start, worst, mean: mean(deltas) });
    console.log(`  varredura a partir de ${start} px/texel: maior salto ${worst.toFixed(2)}, média ${mean(deltas).toFixed(2)} (luma 0–255)`);
  }
  await page.context().close();
  return summary;
}

/** Caminha de verdade em passos de 1/60 s com o quadro fixo: o que muda é só o tremor. */
async function walkShimmer(browser, origin) {
  const page = await openPage(browser, origin, 1);
  const results = [];
  const hasHook = await page.evaluate(() => Boolean(window.__HQ_OFFICE_QA__.sprite));
  if (!hasHook) {
    await page.context().close();
    return results;
  }
  await centerFeet(page);
  const force = (pose) => page.evaluate((value) => window.__HQ_OFFICE_QA__.sprite.force(value), pose);
  for (const scale of [0.55, 1.5, 2.7]) {
    const zoom = await zoomTo(page, scale / SCREEN_METERS_PER_TEXEL);
    await centerFeet(page);
    for (const snap of [true, false]) {
      await page.evaluate((value) => window.__HQ_OFFICE_QA__.sprite.snap(value), snap);
      const texel = zoom * SCREEN_METERS_PER_TEXEL;
      const diffs = [];
      let previous = null;
      for (let step = 0; step < 24; step += 1) {
        // anda em +x, a diagonal da tela
        await force({ x: FEET.x + step * (1.2 / 60), z: FEET.z, animation: "walk-front", column: 1, mirrored: false });
        await settled(page);
        const at = await page.evaluate(() => window.__HQ_OFFICE_QA__.sprite.info().screen);
        const shot = await shootAround(page, at, texel, 1, 2);
        // só o miolo do corpo: a borda carrega o chão que passa por trás
        const rect = { x: shot.feet.x - 7 * texel, y: shot.feet.y - 80 * texel, width: 14 * texel, height: 55 * texel };
        const values = [];
        for (let y = Math.round(rect.y); y < Math.round(rect.y + rect.height); y += 1) {
          for (let x = Math.round(rect.x); x < Math.round(rect.x + rect.width); x += 1) values.push(lumaAt(shot.image, Math.max(0, Math.min(shot.image.width - 1, x)), Math.max(0, Math.min(shot.image.height - 1, y))));
        }
        if (previous && previous.length === values.length) diffs.push(mean(values.map((value, i) => Math.abs(value - previous[i]))));
        previous = values;
      }
      results.push({ scale, snap, mean: mean(diffs), worst: Math.max(0, ...diffs) });
      console.log(`  tremor a ${scale} px/texel, encaixe ${snap ? "ligado " : "desligado"}: média ${mean(diffs).toFixed(2)}, pior ${Math.max(0, ...diffs).toFixed(2)} (luma 0–255)`);
    }
  }
  await page.evaluate(() => window.__HQ_OFFICE_QA__.sprite.force(null));
  await page.context().close();
  return results;
}

/**
 * Quanto a sombra escurece o chão, por canal: a do balcão da recepção contra a dele, cada
 * uma dividida pelo chão aceso do lado. É a medida de "combina com a dos móveis".
 */
async function shadowMatch(browser, origin) {
  const page = await openPage(browser, origin, 1);
  const hasHook = await page.evaluate(() => Boolean(window.__HQ_OFFICE_QA__.sprite));
  if (!hasHook) {
    await page.context().close();
    return null;
  }
  await zoomTo(page, 2 / SCREEN_METERS_PER_TEXEL);
  const patch = async ({ x, z }) => {
    const at = await page.evaluate((point) => window.__HQ_OFFICE_QA__.roomPoint("hall", point.x, point.z), { x, z });
    const image = decodePng(await page.screenshot({ clip: { x: Math.round(at.x) - 4, y: Math.round(at.y) - 4, width: 9, height: 9 } }));
    const sum = [0, 0, 0];
    for (let i = 0; i < image.data.length; i += 4) for (let c = 0; c < 3; c += 1) sum[c] += image.data[i + c];
    return sum.map((value) => value / (image.data.length / 4));
  };
  const look = async (x, z) => {
    const goal = await page.evaluate((point) => window.__HQ_OFFICE_QA__.roomPoint("hall", point.x, point.z), { x, z });
    await page.mouse.move(goal.x, goal.y);
    await page.mouse.down();
    await page.mouse.move(720, 450, { steps: 3 });
    await page.mouse.up();
    await settled(page);
  };
  const ratio = (a, b) => a.map((value, c) => value / b[c]);
  // o balcão vai de x −3,25 a −1,25; a 2,4 de z, o chão atrás dele está na sombra e mais à direita, não
  await page.evaluate(() => window.__HQ_OFFICE_QA__.sprite.force({ x: 2.9, z: -2.2, animation: "walk-front", column: 1, mirrored: false }));
  await look(-1.8, 2.4);
  const furniture = ratio(await patch({ x: -2.2, z: 2.4 }), await patch({ x: -0.95, z: 2.4 }));
  // a sombra dele a 0,5 m de altura: o quadril, largura de sobra para o centro estar cheio
  await page.evaluate(() => window.__HQ_OFFICE_QA__.sprite.force({ x: 1.8, z: 1.35, animation: "walk-front", column: 1, mirrored: false }));
  await look(1.7, 1.9);
  const own = ratio(await patch({ x: 1.48, z: 1.85 }), await patch({ x: 1.985, z: 2.17 }));
  await page.evaluate(() => window.__HQ_OFFICE_QA__.sprite.force(null));
  await page.context().close();
  const format = (values) => values.map((value) => value.toFixed(3)).join(" ");
  console.log(`  sombra sobre o chão aceso (R G B em sRGB): móvel ${format(furniture)}; Filipe ${format(own)}`);
  return { furniture, own };
}

/** Tempo de quadro e chamadas de desenho, de longe e de perto, onde o sprite pesa mais. */
async function frameCost(browser, origin) {
  const page = await openPage(browser, origin, 1);
  const results = [];
  await centerFeet(page);
  for (const scale of [0.39, 3.93]) {
    await zoomTo(page, scale / SCREEN_METERS_PER_TEXEL);
    await centerFeet(page);
    await settled(page);
    const ms = await page.evaluate(() => new Promise((resolve) => {
      const times = [];
      let last = performance.now();
      const tick = (now) => {
        times.push(now - last);
        last = now;
        if (times.length < 30) requestAnimationFrame(tick);
        else resolve(times.slice(5).reduce((sum, value) => sum + value, 0) / (times.length - 5));
      };
      requestAnimationFrame(tick);
    }));
    const info = await page.evaluate(() => window.__HQ_OFFICE_QA__.renderInfo());
    const buildMs = await page.evaluate(() => window.__HQ_OFFICE_QA__.sprite?.info().buildMs ?? null);
    results.push({ scale, ms, calls: info.calls, triangles: info.triangles, programs: info.programs, buildMs });
    console.log(`  ${scale} px/texel: ${ms.toFixed(0)} ms por quadro, ${info.calls} chamadas, ${info.triangles} triângulos, ${info.programs} programas${buildMs === null ? "" : `; reduções em ${buildMs.toFixed(1)} ms`}`);
  }
  await page.context().close();
  return results;
}

/** Todas as direções e quadros: o espelhamento e o quadro precisam acompanhar sombra e luz. */
async function posesSheet(browser, origin, rows) {
  const page = await openPage(browser, origin, 1);
  const hasHook = await page.evaluate(() => Boolean(window.__HQ_OFFICE_QA__.sprite));
  if (!hasHook) {
    await page.context().close();
    return;
  }
  const poses = [
    { animation: "walk-front", column: 0, mirrored: false },
    { animation: "walk-front", column: 2, mirrored: false },
    { animation: "walk-front", column: 0, mirrored: true },
    { animation: "walk-front", column: 2, mirrored: true },
    { animation: "walk-back", column: 0, mirrored: false },
    { animation: "walk-back", column: 2, mirrored: false },
    { animation: "walk-back", column: 0, mirrored: true },
    { animation: "walk-back", column: 2, mirrored: true },
  ];
  await zoomTo(page, 2 / SCREEN_METERS_PER_TEXEL);
  await centerFeet(page, { x: 820, y: 640 });
  const items = [];
  for (const pose of poses) {
    await page.evaluate((value) => window.__HQ_OFFICE_QA__.sprite.force({ x: 0.6, z: 1.35, ...value }), pose);
    await settled(page);
    const at = await page.evaluate(() => window.__HQ_OFFICE_QA__.sprite.info().screen);
    const clip = { x: Math.max(0, at.x - 330), y: Math.max(0, at.y - 260), width: 420, height: 320 };
    items.push({ png: await page.screenshot({ clip }), width: 420, height: 320, caption: `${pose.animation} quadro ${pose.column}${pose.mirrored ? " espelhado" : ""}` });
  }
  rows.push({ title: "Quadros e direções, com sombra (2 px/texel)", items: items.slice(0, 4) }, { title: "", items: items.slice(4) });
  await page.evaluate(() => window.__HQ_OFFICE_QA__.sprite.force(null));
  await page.context().close();
}

/** Oclusão no caminho real: atrás da recepção, da bancada e das plantas. */
async function occlusionSheet(browser, origin, rows) {
  const page = await openPage(browser, origin, 1);
  const hasHook = await page.evaluate(() => Boolean(window.__HQ_OFFICE_QA__.sprite));
  if (!hasHook) {
    await page.context().close();
    return;
  }
  const spots = [
    { label: "atrás da recepção", x: -2.0, z: 1.55 },
    { label: "na frente da recepção", x: -2.0, z: 2.35 },
    { label: "entre as cadeiras da bancada", x: 0.1, z: -0.1 },
    { label: "atrás da bancada", x: 0.1, z: -1.3 },
    { label: "ao lado da planta", x: 2.9, z: 2.05 },
    { label: "no tapete", x: -1.0, z: -2.0 },
  ];
  await zoomTo(page, 1.5 / SCREEN_METERS_PER_TEXEL);
  const items = [];
  for (const spot of spots) {
    const goal = await page.evaluate(({ x, z }) => window.__HQ_OFFICE_QA__.roomPoint("hall", x, z), spot);
    await page.mouse.move(goal.x, goal.y);
    await page.mouse.down();
    await page.mouse.move(720, 560, { steps: 3 });
    await page.mouse.up();
    await page.evaluate((value) => window.__HQ_OFFICE_QA__.sprite.force({ x: value.x, z: value.z, animation: "walk-front", column: 1, mirrored: false }), spot);
    await settled(page);
    const at = await page.evaluate(() => window.__HQ_OFFICE_QA__.sprite.info().screen);
    items.push({ png: await page.screenshot({ clip: { x: Math.max(0, at.x - 260), y: Math.max(0, at.y - 230), width: 400, height: 300 } }), width: 400, height: 300, caption: spot.label });
  }
  rows.push({ title: "Oclusão e sombra perto dos móveis (1,5 px/texel)", items: items.slice(0, 3) }, { title: "", items: items.slice(3) });
  await page.evaluate(() => window.__HQ_OFFICE_QA__.sprite.force(null));
  await page.context().close();
}

/** Sala em foco e fora de foco: o escurecimento vem do véu HTML, sobre a cena inteira. */
async function focusSheet(browser, origin, rows) {
  const page = await openPage(browser, origin, 1);
  await page.addStyleTag({ content: ".office-labels { visibility: visible !important; } .office-room-tag, .office-bot-tag, .office-entrance-tag { visibility: hidden !important; }" });
  const items = [];
  for (const room of [null, "hall", "produto"]) {
    if (room) await page.evaluate((id) => document.querySelector(`[data-room="${id}"]`)?.click(), room);
    await page.waitForTimeout(600);
    await settled(page);
    const feet = await feetAt(page);
    const zoom = await zoomOf(page);
    const texel = zoom * SCREEN_METERS_PER_TEXEL;
    const clip = { x: Math.max(0, feet.x - 180), y: Math.max(0, feet.y - 130 * texel), width: 300, height: Math.min(300, 150 * texel) };
    items.push({ png: await page.screenshot({ clip }), width: 300, height: clip.height, caption: room === null ? "sem foco" : room === "hall" ? "hall em foco" : "outra sala em foco" });
  }
  rows.push({ title: "Foco da sala", items });
  await page.context().close();
}

// ---------------------------------------------------------------- principal

async function main() {
  await mkdir(OUT, { recursive: true });
  let server = null;
  let origin = argOf("url", null);
  if (!origin) {
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    server = spawn("npx", ["vite", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: ROOT, stdio: "ignore", shell: process.platform === "win32" });
    await waitForUrl(origin, 90000, "vite");
  }
  const browser = await chromium.launch({ channel: "msedge", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const routes = NEW_ART ? await newArtRoutes(browser) : null;
  if (COST_ONLY) {
    console.log(`Custo em ${origin}, qualidade ${QUALITY}`);
    await frameCost(browser, origin);
    await browser.close();
    if (server) server.kill();
    process.exit(0);
  }
  const reference = await faceReference();
  console.log(`Saída: ${OUT}`);
  console.log(`Rosto no atlas original: desvio ${reference.deviation.toFixed(1)}, p5–p95 ${reference.p5.toFixed(0)}–${reference.p95.toFixed(0)}`);
  const report = { label: LABEL, quality: QUALITY, newArt: NEW_ART, reference, dpr: {}, problems: [] };
  const zoomRows = [];
  const faceItems = [];
  for (const dpr of DPRS) {
    const { results, info, problems } = await sweepZoom(browser, origin, dpr, reference, routes);
    report.problems.push(...problems);
    report.dpr[dpr] = {
      renderInfo: info,
      captures: results.map((entry) => {
        const { face, ...rest } = entry;
        delete rest.png;
        delete rest.image;
        delete rest.shotFeet;
        return { ...rest, faceDeviation: face.deviation, faceP5: face.p5, faceP95: face.p95 };
      }),
    };
    zoomRows.push({
      title: `DPR ${dpr} — canvas a ${info.pixelRatio}`,
      items: results.map((entry) => {
        const factor = enlarge(entry.image, 118);
        return { png: entry.png, width: entry.image.width * factor, height: entry.image.height * factor, caption: `${entry.cssPerTexel.toFixed(2)} css/tx\n${entry.canvasPerTexel.toFixed(2)} canvas/tx\n×${factor}` };
      }),
    });
    for (const entry of results.filter((value) => value.scale === 0.55 || value.scale === 0.39)) {
      const rect = faceRect(entry.shotFeet, entry.devicePerTexel);
      faceItems.push({ png: entry.png, width: entry.image.width * 8, height: entry.image.height * 8, caption: `DPR ${dpr}, ${entry.cssPerTexel.toFixed(2)} css/tx\nrosto em y≈${Math.round(rect.y)}` });
    }
  }
  await renderSheet(browser, path.join(OUT, "folha-zoom.png"), `Sprite por zoom — ${LABEL}${NEW_ART ? " (arte de prova)" : ""}, qualidade ${QUALITY}`, zoomRows);
  await renderSheet(browser, path.join(OUT, "folha-rosto.png"), `Rosto na vista do andar — ${LABEL}`, [{ title: "Aumento ×8, sem interpolar", items: faceItems }]);
  if (!NEW_ART && !ZOOM_ONLY) {
    if (!QUICK) {
      console.log("\nSaltos de brilho");
      report.brightness = await brightnessJumps(browser, origin, routes);
      console.log("\nTremor andando");
      report.shimmer = await walkShimmer(browser, origin);
      console.log("\nSombra");
      report.shadow = await shadowMatch(browser, origin);
      console.log("\nCusto");
      report.cost = await frameCost(browser, origin);
    }
    const rows = [];
    await posesSheet(browser, origin, rows);
    await occlusionSheet(browser, origin, rows);
    await focusSheet(browser, origin, rows);
    if (rows.length > 0) await renderSheet(browser, path.join(OUT, "folha-cena.png"), `Personagem na cena — ${LABEL}`, rows);
  }
  await writeFile(path.join(OUT, "medidas.json"), JSON.stringify(report, null, 2));
  await browser.close();
  if (server) server.kill();
  if (report.problems.length > 0) {
    console.log("\nProblemas no console:");
    for (const text of [...new Set(report.problems)]) console.log(`  ${text}`);
  }
  console.log(`\nFolhas: ${path.join(OUT, "folha-zoom.png")}`);
  console.log(`        ${path.join(OUT, "folha-rosto.png")}`);
  if (!NEW_ART && !ZOOM_ONLY) console.log(`        ${path.join(OUT, "folha-cena.png")}`);
  console.log(`Medidas: ${path.join(OUT, "medidas.json")}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
