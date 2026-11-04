#!/usr/bin/env node
/**
 * Lê o que `office-seat.mjs` gravou e mede, quadro a quadro: salto de cada osso, a pessoa em
 * relação à cadeira e onde mãos e pés terminam. Com `--sheet`, monta a folha de fotos.
 *
 * Uso: node scripts/visual-qa/office-seat-report.mjs <pasta> <prefixo> [--sheet <saída.png> <fotos...>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [dir, prefix, flag, sheetOut, ...photos] = process.argv.slice(2);

const { seats } = JSON.parse(readFileSync(path.join(dir, `${prefix}-coordenadas.json`), "utf8"));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const local = (point, chair) => {
  const dx = point.x - chair.x;
  const dz = point.z - chair.z;
  return { x: dx * Math.cos(chair.yaw) - dz * Math.sin(chair.yaw), y: point.y, z: dx * Math.sin(chair.yaw) + dz * Math.cos(chair.yaw) };
};
const BONES = ["hips", "head", "leftHand", "rightHand", "leftFoot", "rightFoot"];
const fixed = (value, digits = 3) => value.toFixed(digits);

const summary = seats.map(({ name, seat, joints, frames }) => {
  let fastest = 0;
  let fastestBone = "";
  let fastestPhase = "";
  let fastestDt = 0;
  let chairJump = 0;
  let spin = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const [before, now] = [frames[index - 1], frames[index]];
    const dt = (now.time - before.time) / 1000;
    if (dt <= 0) continue;
    // Andar é o clipe de sempre. Aqui importa a entrada na cadeira e a saída dela.
    if (now.phase !== "sitting" && now.phase !== "rising") continue;
    for (const bone of BONES) {
      const speed = distance(now.joints[bone], before.joints[bone]) / dt;
      if (speed > fastest) {
        fastest = speed;
        fastestBone = bone;
        fastestPhase = now.phase;
        fastestDt = dt;
      }
    }
    if (now.chair && before.chair) {
      chairJump = Math.max(chairJump, Math.hypot(now.chair.x - before.chair.x, now.chair.z - before.chair.z) / dt);
      spin = Math.max(spin, Math.abs(now.chair.yaw - before.chair.yaw) / dt);
    }
  }
  const sitting = frames.filter((frame) => frame.phase === "seated" || frame.phase === "sitting");
  const lastSitting = sitting.at(-1);
  // Depois de pousar (1,16 s), a bacia não sai do lugar em cima do assento.
  const start = sitting[0]?.time ?? 0;
  const landed = sitting.filter((frame) => frame.phase === "sitting" && (frame.time - start) / 1000 > 1.25);
  const hipsOnSeat = landed.map((frame) => local(frame.joints.hips, frame.chair));
  const slideX = hipsOnSeat.length ? Math.max(...hipsOnSeat.map((point) => Math.abs(point.x))) : null;
  const slideZ = hipsOnSeat.length ? Math.max(...hipsOnSeat.map((point) => point.z)) - Math.min(...hipsOnSeat.map((point) => point.z)) : null;
  const chair = lastSitting?.chair ?? { x: seat.x, z: seat.z, yaw: seat.yaw };
  const end = Object.fromEntries(Object.entries(joints).map(([bone, point]) => [bone, local(point, chair)]));
  const last = frames.at(-1);
  return {
    name,
    seat: seat.id,
    frames: frames.length,
    fastest: `${fixed(fastest, 2)} m/s (${fastestBone}, ${fastestPhase}, ${fixed(fastestDt * 1000, 0)} ms)`,
    chairTopSpeed: `${fixed(chairJump, 2)} m/s`,
    chairTopSpin: `${fixed(spin, 2)} rad/s`,
    hipsOffAxis: slideX === null ? null : fixed(slideX),
    hipsSlideAlongSeat: slideZ === null ? null : fixed(slideZ),
    seated: {
      hips: [fixed(end.hips.x), fixed(end.hips.y), fixed(end.hips.z)],
      leftHand: [fixed(end.leftHand.x), fixed(end.leftHand.y), fixed(end.leftHand.z)],
      rightHand: [fixed(end.rightHand.x), fixed(end.rightHand.y), fixed(end.rightHand.z)],
      leftFoot: [fixed(end.leftFoot.x), fixed(end.leftFoot.y), fixed(end.leftFoot.z)],
      rightFoot: [fixed(end.rightFoot.x), fixed(end.rightFoot.y), fixed(end.rightFoot.z)],
    },
    backHome: last.chair ? `${fixed(last.chair.x - seat.x)}, ${fixed(last.chair.z - seat.z)}` : null,
  };
});
const out = path.join(dir, `${prefix}-medidas.json`);
writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
for (const line of summary) console.log(JSON.stringify(line));

if (flag === "--sheet") {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const columns = Math.min(photos.length, 4);
  const images = photos.map((file) => {
    const [source, caption] = file.split("=");
    const data = readFileSync(path.join(dir, source)).toString("base64");
    return `<figure><img src="data:image/png;base64,${data}"><figcaption>${caption ?? source}</figcaption></figure>`;
  });
  await page.setContent(`<style>body{margin:0;background:#14181f;font:18px system-ui;color:#eef}main{display:grid;grid-template-columns:repeat(${columns},1fr);gap:8px;padding:8px}figure{margin:0}img{width:100%;display:block}figcaption{padding:6px 2px}</style><main>${images.join("")}</main>`);
  const main = await page.$("main");
  await main.screenshot({ path: sheetOut });
  await browser.close();
  console.log(`  folha: ${sheetOut}`);
}
