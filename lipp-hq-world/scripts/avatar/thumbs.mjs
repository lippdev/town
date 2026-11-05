#!/usr/bin/env node
/**
 * Fotografa cada peça do catálogo para as miniaturas do editor, no próprio Chromium.
 *
 * Precisa do `pnpm dev` no ar. As fotos saem da malha de verdade: nenhuma arte nova.
 *
 * Uso: node scripts/avatar/thumbs.mjs <url do dev> <pasta de saída> [--folha]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [base = "http://127.0.0.1:5173", out = "public/avatares/humano/miniaturas"] = process.argv.slice(2);
const SIZE = 192;
const LIST_ITEMS = `Object.values(await (await import("/src/avatar/human/catalog.ts")).ITEMS_BY_ID).map((item) => item.id)`;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") problems.push(message.text());
});
page.on("pageerror", (error) => problems.push(String(error)));
await page.goto(`${base}/avatares.html?miniaturas`);
await page.waitForFunction(() => window.__HQ_THUMBS__?.ready, null, { timeout: 60000 });
const items = await page.evaluate(`(async () => ${LIST_ITEMS})()`);

for (const item of items) {
  const data = await page.evaluate((id) => window.__HQ_THUMBS__.shot(id), item);
  // WebP por dentro de um canvas: o script não precisa de nenhuma biblioteca de imagem.
  const webp = await page.evaluate(async ([url, size]) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    canvas.getContext("2d").drawImage(image, 0, 0, size, size);
    return canvas.toDataURL("image/webp", 0.82);
  }, [data, SIZE / 2]);
  writeFileSync(path.join(out, `${item}.webp`), Buffer.from(webp.split(",")[1], "base64"));
}
await browser.close();
console.log(`${items.length} miniaturas em ${out}`);
if (problems.length) console.log([...new Set(problems)].join("\n"));
