import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiProfilePrefix, clearConnection, loadSavedConnection, probeApi, saveConnection } from "../../server/hermesConnection";
import { echoed } from "@/integrations/hermes/useSessionConversation";
import { callProxy } from "../helpers/proxy";

const KEY = "chave-da-api-0123456789abcdef";
const DASHBOARD_TOKEN = "token-do-dashboard-0001";

/** Um servidor só faz dashboard e API: o que importa é o caminho e a credencial. */
function fakeHermes() {
  const calls: Array<{ path: string; auth?: string; body: string }> = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const path = (request.url ?? "/").split("?")[0];
      const send = (status: number, payload: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(payload));
      };
      if (path === "/health/detailed") {
        return request.headers.authorization === `Bearer ${KEY}` ? send(200, { version: "0.22.6" }) : send(401, {});
      }
      const chat = path.match(/^(?:\/p\/([^/]+))?\/api\/sessions\/([^/]+)\/chat$/);
      if (chat && request.method === "POST") {
        calls.push({ path, auth: request.headers.authorization, body });
        if (request.headers.authorization !== `Bearer ${KEY}`) return send(401, {});
        if (chat[1] === "fantasma") return send(404, { error: "Unknown or unconfigured profile" });
        return send(200, { status: "completed", message: { role: "assistant", content: "feito" } });
      }
      return send(404, {});
    });
  });
  return { server, calls };
}

const json = { "content-type": "application/json", origin: "http://127.0.0.1:5173" };

describe("prova da API do Hermes", () => {
  const { server } = fakeHermes();
  let url = "";
  beforeAll(async () => {
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((done) => server.close(() => done())));

  it("chave certa passa; errada ou vazia diz o que fazer", async () => {
    expect(await probeApi(url, KEY)).toMatchObject({ ok: true, version: "0.22.6" });
    expect((await probeApi(url, "errada")).error).toMatch(/recusou a chave/);
    expect((await probeApi(url, "")).action).toMatch(/API_SERVER_ENABLED/);
  });

  it("nada escutando ensina a habilitar a API", async () => {
    const probe = await probeApi("http://127.0.0.1:1", KEY, 1000);
    expect(probe.ok).toBe(false);
    expect(probe.action).toMatch(/API_SERVER_KEY/);
  });

  it("perfil padrão na raiz, os outros em /p/<perfil>", () => {
    expect(apiProfilePrefix("default")).toBe("");
    expect(apiProfilePrefix("pulse")).toBe("/p/pulse");
  });
});

describe("envio pelo proxy", () => {
  const { server, calls } = fakeHermes();
  const dir = mkdtempSync(join(tmpdir(), "hq-send-"));
  const file = join(dir, "connection.json");
  const previous = process.env.HQ_CONNECTION_FILE;
  let url = "";

  beforeAll(async () => {
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.HQ_CONNECTION_FILE = file;
  });
  afterAll(async () => {
    if (previous === undefined) delete process.env.HQ_CONNECTION_FILE;
    else process.env.HQ_CONNECTION_FILE = previous;
    rmSync(dir, { recursive: true, force: true });
    await new Promise<void>((done) => server.close(() => done()));
  });

  const send = (session: string, profile: string, message: unknown, headers = json) =>
    callProxy("POST", `/api/hq/hermes/sessions/${session}/chat?profile=${profile}`, headers, JSON.stringify({ message }));

  it("sem a API configurada o chat fica só leitura, com o caminho para habilitar", async () => {
    saveConnection({ url, token: DASHBOARD_TOKEN, savedAt: 1 }, file);
    const { status, json: body } = await send("sess_1", "pulse", "oi");
    expect(status).toBe(409);
    expect(body.action).toMatch(/Integrações/);
  });

  it("habilitar a API testa a chave, salva e nunca devolve o valor", async () => {
    const bad = await callProxy("POST", "/api/hq/connection/api", json, JSON.stringify({ url, key: "errada" }));
    expect(bad.status).toBe(422);
    const { status, json: body } = await callProxy("POST", "/api/hq/connection/api", json, JSON.stringify({ url, key: KEY }));
    expect(status).toBe(200);
    expect((body.status as { canSend: boolean }).canSend).toBe(true);
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(loadSavedConnection(file)).toMatchObject({ token: DASHBOARD_TOKEN, api: { url, key: KEY } });
  });

  it("manda ao perfil do bot com a chave da API, não com o token do dashboard", async () => {
    const { status, json: body } = await send("sess_1", "pulse", "  status do CI?  ");
    expect(status).toBe(200);
    expect(body.reply).toBe("feito");
    const call = calls[calls.length - 1];
    expect(call.path).toBe("/p/pulse/api/sessions/sess_1/chat");
    expect(call.auth).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(call.body)).toEqual({ message: "status do CI?" });
  });

  it("perfil padrão vai sem prefixo", async () => {
    await send("sess_2", "default", "oi");
    expect(calls[calls.length - 1].path).toBe("/api/sessions/sess_2/chat");
  });

  it("perfil que a API não serve vira erro com a porta certa como ação", async () => {
    const { status, json: body } = await send("sess_1", "fantasma", "oi");
    expect(status).toBe(404);
    expect(body.action).toMatch(/API_SERVER_PORT/);
  });

  it("recusa outro site, mensagem vazia, longa demais e caminho estranho", async () => {
    const before = calls.length;
    expect((await send("sess_1", "pulse", "oi", { "content-type": "application/json", origin: "https://malicioso.example" })).status).toBe(403);
    expect((await send("sess_1", "pulse", "   ")).status).toBe(400);
    expect((await send("sess_1", "pulse", "x".repeat(8001))).status).toBe(413);
    expect((await send("..%2Fadmin", "pulse", "oi")).status).toBe(400);
    expect(calls.length).toBe(before);
  });

  it("desligar o envio mantém o dashboard conectado", async () => {
    const { status } = await callProxy("DELETE", "/api/hq/connection/api", json);
    expect(status).toBe(200);
    const saved = loadSavedConnection(file);
    expect(saved?.token).toBe(DASHBOARD_TOKEN);
    expect(saved?.api).toBeUndefined();
    clearConnection(file);
  });
});

describe("mensagem enviada some quando o Hermes a devolve", () => {
  it("casa pelo texto e não por uma mensagem antiga igual", () => {
    const at = Date.parse("2026-11-03T12:00:00Z");
    expect(echoed({ text: "oi", at }, [{ id: "1", role: "user", text: "oi", at: at + 500 }])).toBe(true);
    expect(echoed({ text: "oi", at }, [{ id: "1", role: "user", text: "oi", at: at - 3_600_000 }])).toBe(false);
    expect(echoed({ text: "oi", at }, [{ id: "1", role: "assistant", text: "oi", at }])).toBe(false);
  });
});
