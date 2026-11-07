import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const url = `${process.env.HQ_URL ?? 'http://127.0.0.1:5199'}/?escritorio=completo&modo=demonstracao&chegada=carro`;
try {
  const context = await browser.newContext();
  await context.route('**/api/hq/**', r => r.fulfill({ status:503, body:'' }));
  const page = await context.newPage();
  let fail = true, requests = 0;
  await page.route('**/RobotExpressive.glb', r => { requests++; return fail ? r.abort() : r.continue(); });
  await page.goto(url);
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__?.state().figuresError);
  for (const [width,height] of [[667,375],[844,390],[932,430],[1280,500],[1920,600],[390,844],[1440,900]]) {
    await page.setViewportSize({width,height});
    await page.waitForTimeout(800);
    const y = await page.evaluate(() => window.__HQ_OFFICE_QA__.spirePoint().y);
    assert.ok(y >= 52 && y < height, `${width}x${height}: coroa y=${y}`);
  }
  console.log('Coroa cabe nos sete formatos, incluindo paisagem.');
  fail = false;
  const before = requests;
  const go = async view => { await page.locator(`[data-floor-selector] [data-view="${view}"]`).click(); };
  let failPlant = true, plantRequests = 0;
  await page.route('**/planta.glb', r => { plantRequests++; return failPlant ? r.abort() : r.continue(); });
  await go('operacao');
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().rigs.length === 7);
  assert.ok(requests > before);
  assert.equal(await page.evaluate(() => window.__HQ_OFFICE_QA__.state().figuresError), null);
  await page.waitForTimeout(500);
  const plantsBefore = plantRequests;
  assert.ok(plantsBefore > 0);
  failPlant = false;
  const recoveredPlant = page.waitForResponse(r => r.url().endsWith('/planta.glb') && r.ok());
  await go('terreo');
  await recoveredPlant;
  assert.ok(plantRequests > plantsBefore);
  console.log('Plantas recuperam após falha sem reutilizar erro do cache.');
  await page.waitForFunction(() => window.__HQ_OFFICE_QA__.state().scenery.length > 0);
  assert.equal(await page.evaluate(() => window.__HQ_OFFICE_QA__.state().humansError), null);
  console.log('Robôs e humanos recuperam a carga após falha de rede, sem reload.');
  await page.locator('[data-person-row="chefe"]').click();
  await page.waitForSelector('[data-human-panel="chefe"]');
  await page.waitForFunction(() => !window.__HQ_OFFICE_QA__.state().traveling);
  const deltas = await page.evaluate(async () => {
    const result=[];
    for(let i=0;i<8;i++) {
      await new Promise(requestAnimationFrame);
      const {view,goal}=window.__HQ_OFFICE_QA__.state();
      result.push(Math.abs(view.x-goal.x)+Math.abs(view.z-goal.z)+Math.abs(view.zoom-goal.zoom));
    }
    return result;
  });
  assert.ok(deltas.every(d => d < .05), `câmera deslizando depois da chegada: ${deltas}`);
  console.log('Depois da viagem, gaveta aberta com a câmera parada no destino.');
} finally { await browser.close(); }
