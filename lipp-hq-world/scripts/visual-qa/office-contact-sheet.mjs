#!/usr/bin/env node
/** Monta uma folha com várias fotos, para conferir uma sequência de uma vez. Uso: pasta prefixo saida.png [colunas] [largura] */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [dir, prefix, out, columns = "4", width = "480"] = process.argv.slice(2);
const files = readdirSync(dir).filter((file) => file.startsWith(prefix) && file.endsWith(".png")).sort();
const cells = files
  .map((file) => `<figure><img src="data:image/png;base64,${readFileSync(path.join(dir, file)).toString("base64")}"><figcaption>${file}</figcaption></figure>`)
  .join("");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(columns) * (Number(width) + 6), height: 400 } });
await page.setContent(`<style>body{margin:0;background:#000;display:grid;grid-template-columns:repeat(${columns},${width}px);gap:6px}figure{margin:0;position:relative}img{width:100%;display:block}figcaption{position:absolute;top:2px;left:4px;color:#fff;font:11px monospace;background:#000a;padding:1px 4px}</style>${cells}`);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
