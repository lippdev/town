import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chatMessagesFromHermes, contentText, messageTime } from "@/integrations/hermes/chatMessages";
import { loadSavedConnection, saveConnection } from "../../server/hermesConnection";
import { callProxy } from "../helpers/proxy";

describe("mensagens do Hermes no chat", () => {
  it("esconde andaime, papel desconhecido e linha vazia", () => {
    const messages = chatMessagesFromHermes([
      { id: 1, role: "user", content: "oi" },
      { id: 2, role: "user", content: "[System: retry]", display_kind: "hidden" },
      { id: 3, role: "system", content: "prompt" },
      { id: 4, role: "assistant", content: "   " },
      { id: 5, role: "assistant", content: "pronto" },
    ]);
    expect(messages.map((message) => message.id)).toEqual(["1", "5"]);
  });

  it("display_content vence o conteúdo físico", () => {
    const [message] = chatMessagesFromHermes([{ id: 1, role: "user", content: "<steer>x</steer>", display_content: "x" }]);
    expect(message.text).toBe("x");
  });

  it("chamada de ferramenta vira pílula e o resultado fica resumido", () => {
    const long = "a".repeat(400);
    const [call, result] = chatMessagesFromHermes([
      { id: 1, role: "assistant", content: "", tool_calls: [{ name: "web_search" }] },
      { id: 2, role: "tool", content: long, tool_name: "web_search" },
    ]);
    expect(call.tools).toEqual(["web_search"]);
    expect(result).toMatchObject({ role: "tool", toolName: "web_search" });
    expect(result.text.length).toBeLessThan(long.length);
  });

  it("partes multimodais e horário em segundos", () => {
    expect(contentText([{ type: "text", text: "veja" }, { type: "image_url" }])).toBe("veja\n[imagem]");
    expect(messageTime(1762000000.5)).toBe(1762000000500);
    expect(messageTime("2026-11-03T12:00:00Z")).toBe(Date.parse("2026-11-03T12:00:00Z"));
    expect(messageTime(undefined)).toBeUndefined();
  });
});

describe("rota de mensagens no proxy", () => {
  const state = { token: "token-inicial-000001", lastQuery: "" };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://x");
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<script>window.__HERMES_SESSION_TOKEN__=${JSON.stringify(state.token)};</script>`);
      return;
    }
    if (request.headers["x-hermes-session-token"] !== state.token) return send(401, { detail: "Unauthorized" });
    if (url.pathname === "/api/sessions/sess_1/messages") {
      state.lastQuery = url.search;
      if (url.searchParams.get("profile") !== "pulse") return send(404, { detail: "Session not found" });
      return send(200, {
        session_id: "sess_1",
        messages: [
          { id: 1, role: "assistant", content: "", tool_calls: [{ function: { name: "shell", arguments: '{"cmd":"cat ~/.env"}' } }] },
        ],
      });
    }
    return send(404, {});
  });
  const dir = mkdtempSync(join(tmpdir(), "hq-chat-"));
  const file = join(dir, "connection.json");
  const previous = process.env.HQ_CONNECTION_FILE;
  let url = "";

  beforeAll(async () => {
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.HQ_CONNECTION_FILE = file;
    saveConnection({ url, token: state.token, savedAt: 1, tokenSource: "served" }, file);
  });
  afterAll(async () => {
    if (previous === undefined) delete process.env.HQ_CONNECTION_FILE;
    else process.env.HQ_CONNECTION_FILE = previous;
    rmSync(dir, { recursive: true, force: true });
    await new Promise<void>((done) => server.close(() => done()));
  });

  it("lê do perfil do bot, sem imagens inline e sem argumentos de ferramenta", async () => {
    const { status, json } = await callProxy("GET", "/api/hq/hermes/sessions/sess_1/messages?profile=pulse");
    expect(status).toBe(200);
    expect(state.lastQuery).toContain("profile=pulse");
    expect(state.lastQuery).toContain("inline_images=false");
    expect(JSON.stringify(json)).not.toContain(".env");
    expect((json.messages as Array<{ tool_calls: unknown }>)[0].tool_calls).toEqual([{ name: "shell" }]);
  });

  it("sessão de outro perfil vira 404 legível", async () => {
    const { status, json } = await callProxy("GET", "/api/hq/hermes/sessions/sess_1/messages?profile=echo");
    expect(status).toBe(404);
    expect(json.error).toMatch(/não achou/);
  });

  it("id ou perfil que mudaria o caminho é recusado antes de sair", async () => {
    expect((await callProxy("GET", "/api/hq/hermes/sessions/..%2Fsecrets/messages?profile=pulse")).status).toBe(400);
    expect((await callProxy("GET", "/api/hq/hermes/sessions/sess_1/messages?profile=a%2Fb")).status).toBe(400);
  });

  it("dashboard reiniciou: a leitura renova o token servido sozinha", async () => {
    state.token = "token-depois-do-restart-2";
    const { status } = await callProxy("GET", "/api/hq/hermes/sessions/sess_1/messages?profile=pulse");
    expect(status).toBe(200);
    expect(loadSavedConnection(file)?.token).toBe("token-depois-do-restart-2");
  });
});
