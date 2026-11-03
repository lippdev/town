#!/usr/bin/env node
/**
 * Conferência de contrato com um Hermes de verdade.
 *
 * O app fala com o Hermes por quatro endpoints. O fixture do QA reproduz o que
 * foi lido do código do Hermes, mas só uma instância real fecha a dúvida — este
 * script mostra, campo por campo, o que a sua instância devolve e aponta o que
 * o app não vai conseguir ler.
 *
 * Uso:
 *   node scripts/hermes/contract-check.mjs
 *   node scripts/hermes/contract-check.mjs --dashboard http://127.0.0.1:8000 \
 *        --api http://127.0.0.1:8642 --token <HERMES_DASHBOARD_TOKEN> --api-key <HERMES_API_KEY>
 *
 * Saída legível + `qa/hermes-contract.json` com a amostra crua (sem credencial).
 * Exit code 0 = tudo que o app precisa está presente; 1 = falta campo essencial.
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "qa/hermes-contract.json");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const API = flag(
  "--api",
  process.env.HERMES_API_URL ?? "http://127.0.0.1:8642",
).replace(/\/+$/, "");
const DASHBOARD = flag(
  "--dashboard",
  process.env.HERMES_DASHBOARD_URL ?? "http://127.0.0.1:8000",
).replace(/\/+$/, "");
const TOKEN = flag("--token", process.env.HERMES_DASHBOARD_TOKEN ?? "");
const API_KEY = flag("--api-key", process.env.HERMES_API_KEY ?? "");

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  const icon = ok ? "ok  " : "FALHA";
  console.log(`  [${icon}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function getJson(url, headers) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: AbortSignal.timeout(8000),
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { __notJson: text.slice(0, 200) };
    }
    return {
      ok: response.ok,
      status: response.status,
      data,
      ms: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - startedAt,
    };
  }
}

/** Campos que o mapeamento do app lê, por endpoint. */
const EXPECTED = {
  profiles: [
    "name",
    "display_name",
    "bot_title",
    "description",
    "model",
    "is_default",
    "gateway_running",
  ],
  sessions: [
    "id",
    "profile",
    "title",
    "preview",
    "source",
    "last_active",
    "started_at",
    "ended_at",
    "message_count",
  ],
  jobs: [
    "id",
    "name",
    "profile",
    "enabled",
    "state",
    "schedule_display",
    "next_run_at",
    "last_run_at",
    "last_status",
  ],
};

function keysOf(row) {
  return row && typeof row === "object" ? Object.keys(row).sort() : [];
}

function missingKeys(rows, expected) {
  if (!rows.length) return expected;
  const present = new Set(rows.flatMap((row) => keysOf(row)));
  return expected.filter((key) => !present.has(key));
}

function sampleKeys(rows, limit = 4) {
  const keys = new Set(rows.flatMap((row) => keysOf(row)));
  return [...keys].sort().slice(0, limit).join(", ");
}

async function main() {
  const apiHeaders = API_KEY ? { authorization: `Bearer ${API_KEY}` } : {};
  const dashboardHeaders = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};

  console.log(`Hermes API       ${API}`);
  console.log(`Hermes dashboard ${DASHBOARD}`);
  console.log(
    `Credencial       ${API_KEY ? "api key" : "sem api key"} · ${TOKEN ? "dashboard token" : "sem dashboard token"}`,
  );
  console.log("");

  const health = await getJson(`${API}/health`, apiHeaders);
  console.log(
    `API ${API}/health → ${health.status || health.error} (${health.ms} ms)`,
  );
  check(
    "API responde /health",
    health.ok,
    health.error ?? `status ${health.data?.status ?? "?"}`,
  );

  const profiles = await getJson(`${DASHBOARD}/api/profiles`, dashboardHeaders);
  console.log(
    `Dashboard /api/profiles → ${profiles.status || profiles.error} (${profiles.ms} ms)`,
  );
  const profileRows = Array.isArray(profiles.data?.profiles)
    ? profiles.data.profiles
    : [];
  check(
    "dashboard responde /api/profiles",
    profiles.ok,
    profiles.error ?? `${profileRows.length} profiles`,
  );
  check(
    "profiles trazem os campos que o app lê",
    missingKeys(profileRows, EXPECTED.profiles).length === 0,
    missingKeys(profileRows, EXPECTED.profiles).length
      ? `faltando: ${missingKeys(profileRows, EXPECTED.profiles).join(", ")}`
      : `campos: ${sampleKeys(profileRows)}…`,
  );

  const sessions = await getJson(
    `${DASHBOARD}/api/profiles/sessions?limit=200&order=recent`,
    dashboardHeaders,
  );
  console.log(
    `Dashboard /api/profiles/sessions → ${sessions.status || sessions.error} (${sessions.ms} ms)`,
  );
  const sessionRows = Array.isArray(sessions.data?.sessions)
    ? sessions.data.sessions
    : [];
  check(
    "dashboard responde /api/profiles/sessions",
    sessions.ok,
    sessions.error ?? `${sessionRows.length} sessões`,
  );
  check(
    "sessões vêm marcadas com o profile dono",
    sessionRows.length === 0 ||
      sessionRows.every((row) => typeof row?.profile === "string"),
    sessionRows.length === 0
      ? "nenhuma sessão para conferir"
      : `${sessionRows.length} linhas`,
  );
  check(
    "sessões trazem os campos que o app lê",
    missingKeys(sessionRows, EXPECTED.sessions).length === 0,
    missingKeys(sessionRows, EXPECTED.sessions).length
      ? `faltando: ${missingKeys(sessionRows, EXPECTED.sessions).join(", ")}`
      : `campos: ${sampleKeys(sessionRows)}…`,
  );

  const jobs = await getJson(`${DASHBOARD}/api/cron/jobs`, dashboardHeaders);
  console.log(
    `Dashboard /api/cron/jobs → ${jobs.status || jobs.error} (${jobs.ms} ms)`,
  );
  const jobRows = Array.isArray(jobs.data?.jobs) ? jobs.data.jobs : [];
  check(
    "dashboard responde /api/cron/jobs",
    jobs.ok,
    jobs.error ?? `${jobRows.length} rotinas`,
  );
  check(
    "rotinas trazem os campos que o app lê",
    missingKeys(jobRows, EXPECTED.jobs).length === 0,
    missingKeys(jobRows, EXPECTED.jobs).length
      ? `faltando: ${missingKeys(jobRows, EXPECTED.jobs).join(", ")}`
      : `campos: ${sampleKeys(jobRows)}…`,
  );

  // Formatos de data: o app aceita ISO-8601 e epoch, mas é bom saber qual vem.
  const sampleNext = jobRows.find((job) => job?.next_run_at)?.next_run_at;
  if (sampleNext !== undefined) {
    const parsed =
      typeof sampleNext === "number"
        ? "epoch (segundos)"
        : Number.isFinite(Date.parse(String(sampleNext)))
          ? "ISO-8601"
          : "formato desconhecido";
    check(
      "next_run_at em formato reconhecido",
      parsed !== "formato desconhecido",
      `${JSON.stringify(sampleNext)} — ${parsed}`,
    );
  } else if (jobRows.length > 0) {
    check(
      "next_run_at presente nas rotinas",
      false,
      "nenhuma rotina trouxe next_run_at: o app mostra 'sem agenda'",
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    endpoints: {
      health: { status: health.status, ms: health.ms, ok: health.ok },
      profiles: {
        status: profiles.status,
        ms: profiles.ms,
        ok: profiles.ok,
        count: profileRows.length,
      },
      sessions: {
        status: sessions.status,
        ms: sessions.ms,
        ok: sessions.ok,
        count: sessionRows.length,
      },
      jobs: {
        status: jobs.status,
        ms: jobs.ms,
        ok: jobs.ok,
        count: jobRows.length,
      },
    },
    sampleKeys: {
      profiles: keysOf(profileRows[0]),
      sessions: keysOf(sessionRows[0]),
      jobs: keysOf(jobRows[0]),
    },
    checks,
    ok: checks.every((item) => item.ok),
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`);

  console.log("");
  console.log(
    report.ok
      ? "Contrato completo: o app consegue ler tudo o que precisa."
      : "Atenção: há campo que o app espera e a instância não devolveu.",
  );
  console.log(
    `Amostra crua salva em ${path.relative(ROOT, OUT)} (sem credencial).`,
  );
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
