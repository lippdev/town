import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  classifyFailure,
  discoverLocalDashboard,
  extractServedToken,
  isLoopbackUrl,
  loadSavedConnection,
  localCandidates,
  saveConnection,
} from "../../server/hermesConnection";
import { callProxy } from "../helpers/proxy";

describe("token servido pela página do dashboard", () => {
  it("lê o formato JSON e o formato do SPA", () => {
    expect(extractServedToken('<script>window.__HERMES_SESSION_TOKEN__="abc";</script>')).toBe("abc");
    expect(extractServedToken('window.__HERMES_SESSION_TOKEN__ = "a\\"b";')).toBe('a"b');
  });

  it("sem token injetado (gate de auth) devolve null", () => {
    expect(extractServedToken("<html><script>window.__HERMES_AUTH_REQUIRED__=true;</script></html>")).toBeNull();
    expect(extractServedToken('window.__HERMES_SESSION_TOKEN__="";')).toBeNull();
  });
});

describe("onde procurar o Hermes local", () => {
  it("só loopback conta como local", () => {
    expect(isLoopbackUrl("http://127.0.0.1:9119")).toBe(true);
    expect(isLoopbackUrl("http://localhost:9119")).toBe(true);
    expect(isLoopbackUrl("http://[::1]:9119")).toBe(true);
    expect(isLoopbackUrl("http://192.168.0.10:9119")).toBe(false);
    expect(isLoopbackUrl("http://homelab.lan:9119")).toBe(false);
  });

  it("usa o ambiente se for loopback e sempre tenta a 9119", () => {
    expect(localCandidates({})).toEqual(["http://127.0.0.1:9119"]);
    expect(localCandidates({ HERMES_DASHBOARD_URL: "http://127.0.0.1:8000/" })).toEqual([
      "http://127.0.0.1:8000",
      "http://127.0.0.1:9119",
    ]);
    expect(localCandidates({ HERMES_DASHBOARD_URL: "http://remoto:9119" })).toEqual(["http://127.0.0.1:9119"]);
  });
});

describe("causa e ação de uma falha", () => {
  it("reconhece as causas comuns", () => {
    expect(classifyFailure("conexão recusada: o dashboard está de pé nesse endereço?")?.code).toBe("LISTENER");
    expect(classifyFailure("fetch failed")?.action).toMatch(/hermes dashboard --no-open/);
    expect(classifyFailure("o dashboard recusou o session token (HTTP 401)")?.code).toBe("AUTH");
    expect(classifyFailure("o dashboard não respondeu a tempo")?.code).toBe("TIMEOUT");
    expect(classifyFailure("este dashboard exige login OAuth")?.code).toBe("OAUTH");
    expect(classifyFailure("host não encontrado")?.code).toBe("HOST");
    expect(classifyFailure("")).toBeNull();
    expect(classifyFailure("algo novo")).toBeNull();
  });
});

/** Dashboard falso: token rotativo, injeção opcional, contrato do Hermes. */
function fakeDashboard() {
  const state = { token: "token-inicial-000001", withhold: false };
  const server = http.createServer((request, response) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    const path = (request.url ?? "/").split("?")[0];
    if (path === "/api/status") return send(200, { version: "0.22.6", auth_required: false });
    if (path === "/") {
      response.writeHead(200, { "content-type": "text/html" });
      const js = state.withhold ? "" : `window.__HERMES_SESSION_TOKEN__=${JSON.stringify(state.token)};`;
      response.end(`<html><script>${js}</script></html>`);
      return;
    }
    if (request.headers["x-hermes-session-token"] !== state.token) return send(401, { detail: "Unauthorized" });
    if (path === "/api/profiles") return send(200, { profiles: [{ name: "pulse" }, { name: "scout" }] });
    if (path === "/api/profiles/sessions") return send(200, { sessions: [] });
    if (path === "/api/cron/jobs") return send(200, { jobs: [] });
    return send(404, {});
  });
  return { server, state };
}

describe("detecção do Hermes local", () => {
  const { server, state } = fakeDashboard();
  let url = "";
  beforeAll(async () => {
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((done) => server.close(() => done())));

  it("acha, lê o token da página e confere os perfis", async () => {
    state.withhold = false;
    const found = await discoverLocalDashboard([url]);
    expect(found).toMatchObject({ found: true, url, tokenServed: true, token: state.token, profileCount: 2 });
    expect(found.error).toBeUndefined();
  });

  it("token omitido pelo gate: acha mas pede o token", async () => {
    state.withhold = true;
    const found = await discoverLocalDashboard([url]);
    expect(found).toMatchObject({ found: true, tokenServed: false });
    expect(found.error).toMatch(/cole o session token/);
    state.withhold = false;
  });

  it("nada escutando: não acha e sugere o comando", async () => {
    const found = await discoverLocalDashboard(["http://127.0.0.1:1"], 1000);
    expect(found).toMatchObject({ found: false, hint: "hermes dashboard --no-open" });
  });

  it("nunca procura em host remoto", async () => {
    const found = await discoverLocalDashboard(["http://192.0.2.1:9119"], 500);
    expect(found.found).toBe(false);
  });
});

describe("conexão local pelo proxy", () => {
  const { server, state } = fakeDashboard();
  const dir = mkdtempSync(join(tmpdir(), "hq-local-"));
  const file = join(dir, "connection.json");
  let url = "";
  const previous = { file: process.env.HQ_CONNECTION_FILE, dashboard: process.env.HERMES_DASHBOARD_URL };

  beforeAll(async () => {
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.HQ_CONNECTION_FILE = file;
    process.env.HERMES_DASHBOARD_URL = url;
  });
  afterAll(async () => {
    process.env.HQ_CONNECTION_FILE = previous.file;
    process.env.HERMES_DASHBOARD_URL = previous.dashboard;
    if (previous.file === undefined) delete process.env.HQ_CONNECTION_FILE;
    if (previous.dashboard === undefined) delete process.env.HERMES_DASHBOARD_URL;
    rmSync(dir, { recursive: true, force: true });
    await new Promise<void>((done) => server.close(() => done()));
  });

  const json = { "content-type": "application/json", origin: "http://127.0.0.1:5173" };

  it("GET de detecção nunca devolve o token", async () => {
    const { status, json: body } = await callProxy("GET", "/api/hq/connection/local");
    expect(status).toBe(200);
    expect(body.found).toBe(true);
    expect(JSON.stringify(body)).not.toContain(state.token);
  });

  it("POST salva o token servido marcado como 'served'", async () => {
    const { status } = await callProxy("POST", "/api/hq/connection/local", json, "{}");
    expect(status).toBe(200);
    expect(loadSavedConnection(file)).toMatchObject({ url, token: state.token, tokenSource: "served" });
  });

  it("dashboard reiniciou com token novo: o snapshot se recupera sozinho", async () => {
    state.token = "token-depois-do-restart-2";
    const { json: snapshot } = await callProxy("GET", "/api/hq/hermes/snapshot");
    expect((snapshot.profiles as unknown[]).length).toBe(2);
    expect(loadSavedConnection(file)?.token).toBe("token-depois-do-restart-2");
  });

  it("token colado ('typed') nunca é trocado sozinho", async () => {
    saveConnection({ url, token: "colado-a-mao-123456", savedAt: 1, tokenSource: "typed" }, file);
    const { json: snapshot } = await callProxy("GET", "/api/hq/hermes/snapshot");
    const blocks = snapshot.blocks as Record<string, { status: number; cause?: string }>;
    expect(blocks.profiles.status).toBe(401);
    expect(blocks.profiles.cause).toBe("Token recusado");
    expect(loadSavedConnection(file)?.token).toBe("colado-a-mao-123456");
  });

  it("outro site não consegue usar o Hermes local", async () => {
    const { status } = await callProxy(
      "POST",
      "/api/hq/connection/local",
      { "content-type": "application/json", origin: "https://malicioso.example" },
      "{}",
    );
    expect(status).toBe(403);
  });
});
