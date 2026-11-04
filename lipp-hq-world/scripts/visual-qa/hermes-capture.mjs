#!/usr/bin/env node
/**
 * Prova de ponta a ponta da visão de frota Hermes.
 *
 * Sobe o fixture do gateway Hermes (scripts/hermes/fixture-gateway.mjs) e o
 * preview do app, abre um Chromium real e valida o que a tela mostra:
 * chip do gateway, frota na barra lateral, resumo de estados, painel de um bot
 * com dados reais, e o feed sem evento de simulação depois de ficar ao vivo.
 *
 * Uso: node scripts/visual-qa/hermes-capture.mjs [--out qa/screenshots/hermes]
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { outputDir, startHermesStack } from "./hermes-stack.mjs";

const OUT = outputDir("qa/screenshots/hermes");
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";

const readJson = async (url) => (await fetch(url)).json();
const normalize = (text) => (text ?? "").replace(/\s+/g, " ").trim();

/** Lista de sessões que a gaveta mostra agora (resumo ou aba Sessões). */
function readDrawerSessions(page) {
  return page.evaluate(() => {
    const panel = document.querySelector(".drawer");
    return {
      bot: panel?.querySelector("strong")?.textContent ?? null,
      chatOpen: Boolean(panel?.querySelector(".chat")),
      head: panel?.querySelector(".panel-sessions-head")?.textContent ?? null,
      items: Array.from(panel?.querySelectorAll(".panel-sessions li") ?? []).map((item) => (item.textContent ?? "").trim()),
    };
  });
}

/**
 * Clica numa linha da lista lateral e confere a conversa contra o fixture, lido
 * direto sem passar pelo app: o pedido tem de sair com a sessão e o perfil dela,
 * e a tela tem de mostrar a transcrição dela, sem o andaime `hidden`.
 */
async function openChatFromRow(page, stack, row) {
  const rowBot = ((await row.locator(".session-bot").textContent()) ?? "").trim();
  const rowTitle = ((await row.locator(".session-title").textContent()) ?? "").trim();
  const [{ profiles }, { sessions }] = await Promise.all([
    readJson(`${stack.dashboardUrl}/api/profiles`),
    readJson(`${stack.dashboardUrl}/api/profiles/sessions`),
  ]);
  const owner = profiles.find((profile) => profile.display_name === rowBot);
  const session = sessions.find((entry) => entry.profile === owner?.name && entry.title === rowTitle);
  if (!session) throw new Error(`A linha "${rowBot} / ${rowTitle}" não existe no fixture.`);

  const [response] = await Promise.all([
    page.waitForResponse((candidate) => {
      const url = new URL(candidate.url());
      return url.pathname === `/api/hq/hermes/sessions/${session.id}/messages` && url.searchParams.get("profile") === session.profile;
    }, { timeout: 30000 }),
    row.click(),
  ]);
  await page.waitForSelector(".drawer .chat .chat-msg", { timeout: 30000 });

  const transcript = await readJson(`${stack.dashboardUrl}/api/sessions/${session.id}/messages?profile=${session.profile}`);
  const expectedTexts = transcript.messages
    .filter((message) => message.display_kind !== "hidden" && message.role !== "tool" && message.content)
    .map((message) => normalize(message.content));
  const hiddenTexts = transcript.messages.filter((message) => message.display_kind === "hidden").map((message) => normalize(message.content));

  const shown = await page.evaluate(() => {
    const drawer = document.querySelector(".drawer");
    const textOf = (node) => (node?.textContent ?? "").trim();
    return {
      bot: textOf(drawer?.querySelector(".drawer-title strong")),
      title: textOf(drawer?.querySelector(".chat-head strong")),
      texts: Array.from(drawer?.querySelectorAll(".chat-msg .chat-text") ?? []).map(textOf),
      botAuthors: Array.from(drawer?.querySelectorAll(".chat-bot .chat-author") ?? []).map(textOf),
      tools: Array.from(drawer?.querySelectorAll(".chat-tool strong") ?? []).map(textOf),
    };
  });
  const texts = shown.texts.map(normalize);
  return {
    row: { bot: rowBot, title: rowTitle },
    requested: { sessionId: session.id, profile: session.profile, status: response.status() },
    shown,
    expectedTexts,
    matchesFixture:
      response.status() === 200 &&
      expectedTexts.length > 0 &&
      shown.bot === rowBot &&
      shown.title === rowTitle &&
      JSON.stringify(texts) === JSON.stringify(expectedTexts) &&
      !hiddenTexts.some((hidden) => texts.includes(hidden)) &&
      shown.botAuthors.length > 0 &&
      shown.botAuthors.every((author) => author.startsWith(rowBot)) &&
      shown.tools.includes("web_search"),
  };
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const stack = await startHermesStack();

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--ignore-gpu-blocklist"],
  });

  const report = { shots: [], errors: [], checks: {} };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("console", (message) => {
      if (message.type() === "error") report.errors.push(message.text());
    });

    await page.goto(stack.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__HQ_QA__, null, { timeout: 90000 });
    await page.waitForSelector(".agent-row", { timeout: 60000 });
    await page.waitForTimeout(4000);

    const chip = (await page.locator(".connection").first().textContent()) ?? "";
    report.checks.chip = chip.trim();
    report.checks.chipSaysHermesOnline = /Hermes · conectado/.test(chip);

    const roster = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".agent-row")).map((row) => ({
        text: (row.textContent ?? "").trim(),
        dot: row.querySelector(".bot-state-dot")?.className ?? "",
      })),
    );
    report.checks.botCount = roster.length;
    report.checks.botsWithRealState = roster.filter((row) => /bot-state-(working|waiting|idle)/.test(row.dot)).length;

    const summary = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".fleet-stat")).map((stat) => (stat.textContent ?? "").trim()),
    );
    report.checks.summary = summary;

    await page.screenshot({ path: path.join(OUT, "fleet-overview.png") });

    await page.locator(".agent-row").first().click();
    await page.waitForSelector(".panel-stats", { timeout: 30000 });
    report.checks.panel = await page.evaluate(() => {
      const panel = document.querySelector(".drawer");
      return {
        name: panel?.querySelector("strong")?.textContent ?? null,
        stats: Array.from(panel?.querySelectorAll(".panel-stats div") ?? []).map((row) => (row.textContent ?? "").trim()),
        activity: panel?.querySelector(".panel-activity")?.textContent ?? null,
      };
    });
    await page.screenshot({ path: path.join(OUT, "bot-panel.png") });

    // ---- sessões: lista lateral e bloco no painel ----
    await page.locator(".sidebar-item", { hasText: "Sessões" }).click();
    await page.waitForSelector(".session-row", { timeout: 30000 });
    report.checks.sessions = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".session-row"));
      const first = rows[0];
      return {
        rows: rows.length,
        note: document.querySelector(".sidebar .sidebar-note")?.textContent ?? null,
        first: first
          ? {
              bot: first.querySelector(".session-bot")?.textContent ?? null,
              source: first.querySelector(".session-source")?.textContent ?? null,
              title: first.querySelector(".session-title")?.textContent ?? null,
              time: first.querySelector(".agent-state")?.textContent ?? null,
            }
          : null,
        sources: Array.from(new Set(rows.map((row) => row.querySelector(".session-source")?.textContent ?? ""))).sort(),
      };
    });
    await page.screenshot({ path: path.join(OUT, "sessions.png") });

    // clicar numa sessão abre direto a conversa, na gaveta do bot dono dela
    const firstRow = page.locator(".session-row").first();
    const firstBot = ((await firstRow.locator(".session-bot").textContent()) ?? "").trim();
    report.checks.sessionChat = await openChatFromRow(page, stack, firstRow);
    await page.screenshot({ path: path.join(OUT, "session-chat.png") });

    // outra sessão, de outro bot: a gaveta e a conversa trocam juntas
    const otherRow = page.locator(".session-row").filter({ hasNot: page.locator(".session-bot", { hasText: firstBot }) }).first();
    report.checks.sessionChatOtherBot = await openChatFromRow(page, stack, otherRow);

    // voltar sai da conversa e mantém o bot aberto, com a lista dele
    await page.locator(".chat-back[aria-label='Voltar para as sessões']").click();
    await page.waitForSelector(".panel-sessions", { timeout: 30000 });
    report.checks.panelSessions = await readDrawerSessions(page);
    await page.screenshot({ path: path.join(OUT, "bot-panel-sessions.png") });

    // a aba Sessões lista todas as conversas do bot e abre a mesma tela de chat
    await page.locator(".drawer-tab", { hasText: "Sessões" }).click();
    await page.waitForFunction(() => document.querySelector(".drawer-tab.active")?.textContent?.includes("Sessões"));
    report.checks.sessionsTab = await readDrawerSessions(page);
    const { sessions: fixtureSessions } = await readJson(`${stack.dashboardUrl}/api/profiles/sessions`);
    report.checks.sessionsTab.fixtureCount = fixtureSessions.filter(
      (session) => session.profile === report.checks.sessionChatOtherBot.requested?.profile,
    ).length;
    const tabItem = page.locator(".drawer .session-item").first();
    report.checks.sessionsTab.opened = ((await tabItem.locator(".session-name").textContent()) ?? "").trim();
    await tabItem.click();
    await page.waitForSelector(".drawer .chat .chat-msg", { timeout: 30000 });
    report.checks.sessionsTab.chatTitle = ((await page.locator(".drawer .chat-head strong").textContent()) ?? "").trim();
    await page.locator(".chat-back[aria-label='Voltar para as sessões']").click();
    await page.waitForSelector(".drawer .panel-sessions", { timeout: 30000 });
    report.checks.sessionsTab.afterBack = await readDrawerSessions(page);
    report.checks.sessionsTab.stillOnTab = await page.evaluate(
      () => document.querySelector(".drawer-tab.active")?.textContent?.includes("Sessões") ?? false,
    );

    // ---- diagnóstico do gateway: cada endpoint, com latência real ----
    await page.locator(".sidebar-item", { hasText: "Integrações" }).click();
    await page.waitForSelector(".gateway-row", { timeout: 30000 });
    await page.waitForFunction(
      () => {
        const latency = document.querySelectorAll(".gateway-latency");
        return latency.length > 0 && !Array.from(latency).some((node) => (node.textContent ?? "").includes("não lido"));
      },
      null,
      { timeout: 20000 },
    );
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll(".gateway-config dd")).every((node) => (node.textContent ?? "").trim() !== "—"),
      null,
      { timeout: 20000 },
    );
    report.checks.diagnostics = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".gateway-row"));
      const textOf = (node) => (node ? (node.textContent ?? "").trim() : null);
      return {
        rows: rows.length,
        allOk: rows.every((row) => row.classList.contains("ok")),
        paths: rows.map((row) => textOf(row.querySelector("code"))),
        latencies: rows.map((row) => textOf(row.querySelector(".gateway-latency"))),
        summary: textOf(document.querySelector(".gateway-summary")),
        config: Array.from(document.querySelectorAll(".gateway-config div")).map((row) => (row.textContent ?? "").trim()),
      };
    });
    await page.screenshot({ path: path.join(OUT, "gateway-diagnostics.png") });
    await page.locator(".sidebar-item", { hasText: "Bots" }).click();
    // ---- rotinas: agenda com status real, inclusive falha ----
    await page.locator(".sidebar-item", { hasText: "Rotinas" }).click();
    await page.waitForSelector(".routine-row", { timeout: 30000 });
    report.checks.routines = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".routine-row"));
      const statusOf = (row) => row.querySelector(".routine-status")?.className ?? "";
      const textOf = (node) => (node ? (node.textContent ?? "").trim() : null);
      const first = rows[0];
      return {
        rows: rows.length,
        groups: document.querySelectorAll(".routine-group").length,
        note: textOf(document.querySelector(".sidebar .sidebar-note")),
        failed: rows.filter((row) => /routine-(failed|delivery)/.test(statusOf(row))).length,
        ranBefore: rows.filter((row) => (textOf(row.querySelector(".routine-meta")) ?? "").includes("rodou")).length,
        first: first
          ? {
              status: textOf(first.querySelector(".routine-status")),
              name: textOf(first.querySelector(".routine-name")),
              when: textOf(first.querySelector(".routine-when")),
              meta: textOf(first.querySelector(".routine-meta")),
            }
          : null,
      };
    });
    await page.screenshot({ path: path.join(OUT, "routines.png") });

    // selecionar o bot da rotina com falha mostra o aviso no painel
    await page.locator(".sidebar-item", { hasText: "Bots" }).click();
    await page.locator(".agent-row", { hasText: "Forge" }).first().click();
    await page.waitForSelector(".drawer", { timeout: 30000 });
    report.checks.panelRoutineWarning = await page.evaluate(
      () => document.querySelector(".drawer .panel-warn")?.textContent ?? null,
    );
    await page.screenshot({ path: path.join(OUT, "bot-panel-routine.png") });
    await page.locator(".panel-close").first().click();
    await page.waitForTimeout(300);

    // ---- link para o dashboard do Hermes, com o perfil do bot ----
    await page.locator(".agent-row").first().click();
    await page.waitForSelector(".panel-link", { timeout: 30000 });
    report.checks.dashboardLink = await page.evaluate(() => {
      const link = document.querySelector(".panel-link");
      return {
        href: link?.getAttribute("href") ?? null,
        target: link?.getAttribute("target") ?? null,
        rel: link?.getAttribute("rel") ?? null,
        text: (link?.textContent ?? "").trim(),
      };
    });
    await page.screenshot({ path: path.join(OUT, "panel-dashboard-link.png") });
    await page.locator(".panel-close").first().click();
    await page.waitForTimeout(300);

    // não existe mais marcador de demo no feed: o que não pode aparecer é o texto
    report.checks.demoEventsAfterLive = await page.evaluate(() => {
      const events = Array.from(document.querySelectorAll(".feed li"));
      return events.filter((item) => /simula[çc][ãa]o|demo/i.test(item.textContent ?? "")).length;
    });

    await page.evaluate(() => window.__HQ_QA__.setView({ azimuthDeg: 45, elevationDeg: 34, distance: 22, target: [0, 0, -6] }));
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, "fleet-close.png") });
  } finally {
    await browser.close();
    await stack.stop();
  }

  report.ok =
    report.errors.length === 0 &&
    report.checks.chipSaysHermesOnline === true &&
    report.checks.botCount > 0 &&
    report.checks.botsWithRealState === report.checks.botCount &&
    report.checks.demoEventsAfterLive === 0 &&
    report.checks.sessions?.rows > 0 &&
    report.checks.sessions?.sources.length > 1 &&
    (report.checks.sessions?.first?.title ?? "").length > 0 &&
    (report.checks.sessions?.note ?? "").includes("janela de 5 min") &&
    report.checks.sessionChat?.matchesFixture === true &&
    report.checks.sessionChatOtherBot?.matchesFixture === true &&
    report.checks.sessionChatOtherBot.row.bot !== report.checks.sessionChat.row.bot &&
    report.checks.panelSessions?.bot === report.checks.sessionChatOtherBot.row.bot &&
    report.checks.panelSessions?.chatOpen === false &&
    (report.checks.panelSessions?.items.length ?? 0) > 0 &&
    report.checks.sessionsTab?.items.length === report.checks.sessionsTab?.fixtureCount &&
    report.checks.sessionsTab?.fixtureCount > 0 &&
    report.checks.sessionsTab?.opened.length > 0 &&
    report.checks.sessionsTab?.chatTitle === report.checks.sessionsTab?.opened &&
    report.checks.sessionsTab?.afterBack.chatOpen === false &&
    report.checks.sessionsTab?.stillOnTab === true &&
    report.checks.routines?.rows > 0 &&
    report.checks.routines?.failed > 0 &&
    (report.checks.routines?.note ?? "").includes("rotinas") &&
    report.checks.routines?.ranBefore > 0 &&
    (report.checks.panelRoutineWarning ?? "").includes("Rotina") &&
    report.checks.diagnostics?.rows === 4 &&
    report.checks.diagnostics?.allOk === true &&
    report.checks.diagnostics.latencies.every((value) => /ms|s$/.test(value ?? "")) &&
    (report.checks.diagnostics.summary ?? "").includes("4 de 4") &&
    /\?profile=/.test(report.checks.dashboardLink?.href ?? "") &&
    report.checks.dashboardLink?.target === "_blank" &&
    (report.checks.dashboardLink?.rel ?? "").includes("noopener");

  await fs.writeFile(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
