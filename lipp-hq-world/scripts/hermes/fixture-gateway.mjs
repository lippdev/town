#!/usr/bin/env node
/**
 * Fixture de desenvolvimento do gateway Hermes.
 *
 * NÃO é o Hermes: é um servidor local que responde os MESMOS endpoints, com os
 * MESMOS formatos documentados em docs/HERMES.md, para provar o Lipp HQ World
 * de ponta a ponta sem uma instalação real. Serve dois serviços:
 *
 *   :8642  API server do Hermes  → GET /health
 *   :8000  Dashboard do Hermes   → GET /api/profiles
 *                                  GET /api/profiles/sessions
 *                                  GET /api/cron/jobs
 *
 * Os dados evoluem com o tempo (um bot trabalha, uma rotina dispara) para que
 * as capturas do harness mostrem atividade real vinda do "gateway".
 *
 * Uso: node scripts/hermes/fixture-gateway.mjs [--api-port 8642] [--dashboard-port 8000]
 *      HERMES_FIXTURE_TOKEN=segredo node scripts/hermes/fixture-gateway.mjs
 *        (exige o session token, em X-Hermes-Session-Token ou Bearer, como o
 *        dashboard real; /api/status continua público)
 */
import http from "node:http";
import process from "node:process";

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const API_PORT = Number(argValue("--api-port", process.env.HERMES_API_PORT ?? 8642));
const DASHBOARD_PORT = Number(argValue("--dashboard-port", process.env.HERMES_DASHBOARD_PORT ?? 8000));
const TOKEN = process.env.HERMES_FIXTURE_TOKEN ?? "";
const STARTED_AT = Math.floor(Date.now() / 1000);

const BOTS = [
  { name: "argos", display_name: "Argos", bot_title: "Direção geral", description: "Supervisão da operação.", model: "hermes-4.1", provider: "nous", gateway_running: true, is_default: true },
  { name: "forge", display_name: "Forge", bot_title: "Coordenação operacional", description: "Consolida o briefing executivo.", model: "hermes-4.1", provider: "nous", gateway_running: true },
  { name: "pulse", display_name: "Pulse", bot_title: "GitHub Intelligence", description: "Commits, PRs, CI e releases.", model: "hermes-4.1-mini", provider: "nous", gateway_running: false },
  { name: "echo", display_name: "Echo", bot_title: "Comunidade", description: "Feedback e audiência.", model: "hermes-4.1", provider: "nous", gateway_running: true },
  { name: "scout", display_name: "Scout", bot_title: "Pesquisa", description: "Discovery, oportunidades e riscos.", model: "hermes-4.1", provider: "nous", gateway_running: true },
  { name: "atlas", display_name: "Atlas", bot_title: "Product Operations", description: "Backlog, PRDs e docs de produto.", model: "hermes-4.1-mini", provider: "nous", gateway_running: false },
  { name: "ink", display_name: "Ink", bot_title: "Conteúdo", description: "Editorial e comunicação.", model: "hermes-4.1", provider: "nous", gateway_running: true },
];

const TITLES = {
  argos: ["Revisar roadmap do trimestre", "Checar saúde da frota", "Priorizar riscos abertos"],
  forge: ["Consolidar briefing executivo", "Fechar pauta da semana", "Revisar handoffs pendentes"],
  pulse: ["Triagem de pull requests", "Analisar falhas de CI", "Resumir releases do dia"],
  echo: ["Ler feedback da comunidade", "Responder menções", "Agrupar temas recorrentes"],
  scout: ["Varrer oportunidades", "Comparar concorrentes", "Mapear riscos de mercado"],
  atlas: ["Refinar backlog", "Escrever PRD do módulo", "Atualizar documentação"],
  ink: ["Redigir post de lançamento", "Revisar tom editorial", "Preparar newsletter"],
};

/** Sessões em memória: cada bot tem 1–3, com horário derivado do relógio. */
function buildSessions(nowSeconds) {
  const sessions = [];
  let index = 0;
  for (const bot of BOTS) {
    const titles = TITLES[bot.name] ?? ["Trabalho"];
    const count = 1 + (bot.name.length % 3);
    for (let slot = 0; slot < count; slot += 1) {
      index += 1;
      const ageSeconds = (index % 7) * 40 + slot * 900;
      const startedAt = nowSeconds - ageSeconds - 600;
      // origens que o Hermes realmente grava (KNOWN_SOURCES em session_lost_and_found.py)
      const sources = ["cli", "telegram", "dashboard"];
      sessions.push({
        id: `sess_${bot.name}_${slot}`,
        profile: bot.name,
        title: titles[slot % titles.length],
        preview: `${titles[slot % titles.length]} — executando com ${bot.model}.`,
        source: sources[slot % sources.length],
        model: bot.model,
        started_at: startedAt,
        last_active: nowSeconds - ageSeconds,
        ended_at: null,
        message_count: 8 + index,
        tool_call_count: 3 + (index % 5),
        input_tokens: 1200 * index,
        output_tokens: 320 * index,
        estimated_cost_usd: Number((0.004 * index).toFixed(4)),
        archived: false,
        hidden: false,
        pinned: slot === 0,
      });
    }
  }
  // Um briefing diário acontecendo agora: sessões de cron, iniciadas há poucos
  // minutos, para os bots que participam. Isso é o que a cena usa para levar
  // eles até a sala de reuniões.
  for (const name of ["argos", "forge", "atlas"]) {
    index += 1;
    sessions.push({
      id: `sess_briefing_${name}`,
      profile: name,
      title: "Briefing diário",
      preview: "Briefing diário da operação — cada bot traz o resumo do seu time.",
      source: "cron",
      model: "hermes-4.1",
      started_at: nowSeconds - 240,
      last_active: nowSeconds - 20,
      ended_at: null,
      message_count: 6,
      tool_call_count: 2,
      input_tokens: 900,
      output_tokens: 240,
      estimated_cost_usd: 0.003,
      archived: false,
      hidden: false,
      pinned: false,
    });
  }

  return sessions;
}

// Rotinas como o Hermes grava: `schedule_display`, `next_run_at`/`last_run_at`
// em ISO-8601, `last_status` cru e a sequência de falhas. Uma delas falha de
// propósito para a tela de rotinas ter o que mostrar.
const JOBS = BOTS.filter((bot) => bot.name !== "echo").map((bot, position) => {
  const names = ["Briefing diário", "Briefing semanal", "Revisar inbox", "Publicar changelog"];
  const schedules = ["0 9 * * *", "30 18 * * 1", "0 */4 * * *", "0 12 1 * *"];
  const iso = (offsetSeconds) => new Date(Date.now() + offsetSeconds * 1000).toISOString();
  const failed = bot.name === "forge";
  return {
    id: `job_${bot.name}`,
    name: names[position % names.length],
    profile: bot.name,
    enabled: !failed,
    paused: false,
    state: failed ? "paused" : "scheduled",
    schedule: { kind: "cron", expr: schedules[position % schedules.length] },
    schedule_display: schedules[position % schedules.length],
    next_run_at: iso(failed ? 86400 : 900 + position * 600),
    last_run_at: iso(-3600 - position * 900),
    last_status: failed ? "error" : position % 2 === 0 ? "ok" : "delivery_failed",
    last_error: failed ? "sessão encerrou sem resposta do modelo (timeout 600s)" : null,
    failure_streak: failed ? 3 : 0,
  };
});

function authorized(request) {
  if (!TOKEN) return true;
  // mesmas duas formas que o dashboard aceita (web_server._has_valid_session_token)
  return (
    (request.headers["x-hermes-session-token"] ?? "") === TOKEN ||
    (request.headers.authorization ?? "") === `Bearer ${TOKEN}`
  );
}

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

const apiServer = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${API_PORT}`);
  if (!authorized(request)) {
    send(response, 401, { error: { message: "Invalid gateway API key (API_SERVER_KEY)", type: "gateway_auth_error" } });
    return;
  }
  if (url.pathname === "/health" || url.pathname === "/v1/health") {
    send(response, 200, { status: "ok", platform: "hermes-agent", version: "fixture-0.1.0" });
    return;
  }
  send(response, 404, { error: { message: `unknown route ${url.pathname}` } });
});

const dashboardServer = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${DASHBOARD_PORT}`);
  const nowSeconds = Math.floor(Date.now() / 1000);
  // público no Hermes (dashboard_auth/public_paths.py): sonda de vida e modo de auth
  if (url.pathname === "/api/status") {
    send(response, 200, {
      version: "fixture-0.1.0",
      gateway_running: true,
      gateway_state: "running",
      auth_required: false,
      uptime_seconds: nowSeconds - STARTED_AT,
    });
    return;
  }
  if (!authorized(request)) {
    send(response, 401, { detail: "Unauthorized" });
    return;
  }

  if (url.pathname === "/api/profiles") {
    send(response, 200, { profiles: BOTS });
    return;
  }
  if (url.pathname === "/api/profiles/sessions") {
    const sessions = buildSessions(nowSeconds);
    const profileTotals = Object.fromEntries(BOTS.map((bot) => [bot.name, sessions.filter((s) => s.profile === bot.name).length]));
    send(response, 200, { sessions, total: sessions.length, profile_totals: profileTotals, limit: 200, offset: 0, errors: [] });
    return;
  }
  if (url.pathname === "/api/cron/jobs") {
    send(response, 200, { jobs: JOBS });
    return;
  }
  send(response, 404, { detail: `unknown route ${url.pathname}` });
});

apiServer.listen(API_PORT, "127.0.0.1", () => {
  console.log(`[fixture] Hermes API server em http://127.0.0.1:${API_PORT} (GET /health)`);
});
dashboardServer.listen(DASHBOARD_PORT, "127.0.0.1", () => {
  console.log(`[fixture] Hermes dashboard em http://127.0.0.1:${DASHBOARD_PORT} (GET /api/profiles, /api/profiles/sessions, /api/cron/jobs)`);
  if (TOKEN) console.log("[fixture] exigindo session token (X-Hermes-Session-Token ou Bearer)");
});

const shutdown = () => {
  apiServer.close();
  dashboardServer.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
