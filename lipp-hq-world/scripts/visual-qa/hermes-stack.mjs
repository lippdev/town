import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { freePort, waitForUrl } from "./ports.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** `--out <pasta>` do harness; sem ele, a pasta padrão dentro de qa/screenshots. */
export function outputDir(fallback) {
  const index = process.argv.indexOf("--out");
  return path.resolve(ROOT, index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback);
}

/**
 * Sobe o fixture do Hermes e o build de produção em portas livres, isolados da
 * máquina: a conexão salva vira um arquivo temporário e as credenciais do
 * ambiente saem. Sem isso, o preview leria `~/.lipp-hq/connection.json` e a
 * prova rodaria contra o gateway de verdade de quem executa.
 *
 * Chama o vite direto: um SIGTERM no `pnpm preview` deixava o servidor órfão.
 */
export async function startHermesStack({ previewPort, stdio = "ignore" } = {}) {
  const [port, apiPort, dashboardPort] = await Promise.all([
    previewPort ? Promise.resolve(Number(previewPort)) : freePort(),
    freePort(),
    freePort(),
  ]);
  const connectionDir = await fs.mkdtemp(path.join(os.tmpdir(), "hq-qa-conexao-"));
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const dashboardUrl = `http://127.0.0.1:${dashboardPort}`;
  const url = `http://127.0.0.1:${port}`;

  const startFixture = () =>
    spawn(
      "node",
      ["scripts/hermes/fixture-gateway.mjs", "--api-port", String(apiPort), "--dashboard-port", String(dashboardPort)],
      { cwd: ROOT, stdio },
    );
  let fixture = startFixture();
  const preview = spawn(
    path.join(ROOT, "node_modules/.bin/vite"),
    ["preview", "--port", String(port), "--host", "127.0.0.1", "--strictPort"],
    {
      cwd: ROOT,
      stdio,
      env: {
        ...process.env,
        HQ_CONNECTION_FILE: path.join(connectionDir, "connection.json"),
        HERMES_API_URL: apiUrl,
        HERMES_DASHBOARD_URL: dashboardUrl,
        HERMES_API_KEY: "",
        HERMES_DASHBOARD_TOKEN: "",
      },
    },
  );

  const stop = async () => {
    preview.kill("SIGTERM");
    fixture?.kill("SIGTERM");
    await fs.rm(connectionDir, { recursive: true, force: true });
  };

  try {
    await waitForUrl(`${url}/api/hq/hermes/snapshot`, 60000, "preview com proxy");
    await waitForUrl(`${apiUrl}/health`, 30000, "fixture do gateway");
    const status = await (await fetch(`${url}/api/hq/status`)).json();
    if (status.source !== "env" || status.dashboardUrl !== dashboardUrl) {
      throw new Error(`O preview não está no fixture isolado: ${JSON.stringify({ source: status.source, dashboardUrl: status.dashboardUrl })}`);
    }
  } catch (error) {
    await stop();
    throw error;
  }

  return {
    url,
    apiUrl,
    dashboardUrl,
    /** Derruba o gateway no meio da sessão, com o preview de pé. */
    stopFixture() {
      fixture?.kill("SIGTERM");
      fixture = null;
    },
    /** Sobe o gateway de novo nas mesmas portas. */
    async restartFixture() {
      fixture = startFixture();
      await waitForUrl(`${apiUrl}/health`, 30000, "API server de volta");
    },
    stop,
  };
}
