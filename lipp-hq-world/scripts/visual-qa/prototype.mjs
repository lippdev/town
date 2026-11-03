/** Requer fixture Hermes + Vite na porta 5198; comandos em docs/PROTOTIPO-ENGENHARIA.md. */
import { mkdir, writeFile, stat } from "node:fs/promises";
import { cpus, platform, arch, release, totalmem } from "node:os";
import { chromium } from "playwright";
import assert from "node:assert/strict";

const output = process.env.HQ_PROTO_OUTPUT ?? "/tmp/hq-proto";
const origin = "http://127.0.0.1:5198";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const results = { timestamp: new Date().toISOString(), viewport: { width: 1728, height: 1000 }, deviceScaleFactor: 2,
  hardware: { os: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, ramGB: totalmem() / 1024 ** 3 },
  browser: browser.version(), runs: [], interactions: {} };

try {
  for (const mode of ["alta", "leve", "auto"]) {
    for (const scene of ["atual", "prototipo"]) {
      const page = await browser.newPage({ viewport: results.viewport, deviceScaleFactor: 2 });
      const errors = [], consoleErrors = [], failedRequests = [], assetUrls = new Set();
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
      page.on("requestfailed", r => failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
      page.on("response", r => { if (r.url().includes("/prototipo/")) assetUrls.add(r.url()); });
      await page.addInitScript(m => localStorage.setItem("hq.graphics", m), mode);
      await page.goto(origin + (scene === "prototipo" ? "/?prototipo=engenharia" : "/"));
      await page.waitForSelector(".agent-row", { timeout: 30000 });
      await page.waitForFunction(() => window.__HQ_QA__ && window.__HQ_WORLD_READY__, { timeout: 30000 });
      await page.waitForTimeout(10000);
      const samples = [];
      for (let i = 0; i < 3; i++) {
        samples.push(await page.evaluate(() => new Promise(resolve => {
          const ms = [], calls = [], triangles = [];
          let first, last;
          const tick = now => {
            if (first === undefined) first = now;
            if (last !== undefined) ms.push(now - last);
            last = now;
            const info = window.__HQ_QA__.renderInfo();
            calls.push(info.calls); triangles.push(info.triangles);
            if (now - first < 5000) requestAnimationFrame(tick);
            else {
              const q = (values, p) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];
              const round = n => Math.round(n * 100) / 100;
              resolve({ durationMs: round(now - first), frames: ms.length,
                fpsMean: round(ms.length * 1000 / (now - first)),
                fpsP50: round(1000 / q(ms, .5)), fpsP95: round(1000 / q(ms, .05)), fpsP05: round(1000 / q(ms, .95)),
                frameMsP50: round(q(ms, .5)), frameMsP95: round(q(ms, .95)),
                callsMin: Math.min(...calls), callsMax: Math.max(...calls), trianglesMin: Math.min(...triangles), trianglesMax: Math.max(...triangles),
                info });
            }
          };
          requestAnimationFrame(tick);
        })));
      }
      const resources = await page.evaluate(() => performance.getEntriesByType("resource").map(r => ({
        name: r.name, transferSize: r.transferSize, encodedBodySize: r.encodedBodySize, decodedBodySize: r.decodedBodySize,
      })).filter(r => r.name.includes("/prototipo/")));
      const run = { scene, mode, samples, resources, assetUrls: [...assetUrls], errors, consoleErrors, failedRequests };
      results.runs.push(run);
      console.log(JSON.stringify({ scene, mode, samples, errors, consoleErrors, failedRequests }));
      await writeFile(`${output}/metricas.json`, JSON.stringify(results, null, 2) + "\n");
      assert.equal(errors.length, 0, `${scene}: erro de runtime`);
      assert.equal(failedRequests.filter(r => !(r.error === "net::ERR_ABORTED" && r.url.startsWith(origin + "/api/hq/"))).length, 0, `${scene}: requisição falhou`);
      if (scene === "atual") assert.equal(assetUrls.size, 0, "a cena atual baixou assets do protótipo");
      else assert.ok(assetUrls.size >= 9, "assets do protótipo não carregaram");
      if (mode === "alta") {
        await page.screenshot({ path: `${output}/${scene}-alta.png` });
        if (scene === "prototipo") {
          assert.equal(await page.locator(".room-tag").count(), 0);
          const point = await page.evaluate(() => window.__HQ_QA__.getAgentScreenPoint("pulse"));
          assert.ok(point);
          await page.mouse.move(point.x + 100, point.y + 70);
          await page.waitForSelector(".room-tag");
          assert.match(await page.locator(".room-tag").innerText(), /Engenharia/);
          assert.match(await page.locator(".room-tag").innerText(), /Pulse/);
          await page.screenshot({ path: `${output}/prototipo-hover.png` });
          results.interactions.hover = await page.locator(".room-tag").innerText();
          await page.mouse.move(5, 500);
          await page.waitForTimeout(300);
          assert.equal(await page.locator(".room-tag").count(), 0);
          results.interactions.hoverCleared = true;
          await page.locator(".agent-row").filter({ hasText: "Pulse" }).click();
          await page.waitForSelector(".drawer");
          await page.waitForTimeout(1000);
          assert.match(await page.locator(".drawer").innerText(), /Pulse/);
          await page.screenshot({ path: `${output}/prototipo-gaveta.png` });
          results.interactions.drawer = true;
        }
      }
      await writeFile(`${output}/metricas.json`, JSON.stringify(results, null, 2) + "\n");
      await page.close();
    }
  }
  const page = await browser.newPage({ viewport: results.viewport, deviceScaleFactor: 2 });
  const requests = [];
  page.on("request", r => { if (r.url().includes("/prototipo/")) requests.push(r.url()); });
  await page.goto(`${origin}/?prototipo=desconhecido`);
  await page.waitForFunction(() => window.__HQ_QA__);
  await page.waitForTimeout(1500);
  assert.equal(requests.length, 0);
  results.interactions.unknownQueryUsesHQ = true;
  await page.close();
  results.prototypeAssetBytes = results.runs.find(r => r.scene === "prototipo").resources.reduce((n, r) => n + r.encodedBodySize, 0);
  results.screenshots = await Promise.all(["atual-alta", "prototipo-alta", "prototipo-hover", "prototipo-gaveta"].map(async n => ({ path: `${output}/${n}.png`, bytes: (await stat(`${output}/${n}.png`)).size })));
  await writeFile(`${output}/metricas.json`, JSON.stringify(results, null, 2) + "\n");
  console.log("QA concluído:", results.interactions, "bytes recebidos:", results.prototypeAssetBytes);
} finally { await browser.close(); }
