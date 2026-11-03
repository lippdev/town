import { mkdtempSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authModeFromStatus,
  clearConnection,
  loadSavedConnection,
  normalizeDashboardUrl,
  probeConnection,
  saveConnection,
  sessionHeaders,
  tokenFromLink,
  tokenPreview,
} from "../../server/hermesConnection";
import { isSameOriginWrite, readHermesConfig, statusPayload } from "../../server/hermesProxy";

describe("link do dashboard (como o Hermes Desktop)", () => {
  it("aceita host:porta sem esquema", () => {
    expect(normalizeDashboardUrl("100.64.0.1:9119")).toBe("http://100.64.0.1:9119");
    expect(normalizeDashboardUrl("  homelab.lan:9119/ ")).toBe("http://homelab.lan:9119");
  });

  it("mantém https e prefixo de caminho, descarta query e hash", () => {
    expect(normalizeDashboardUrl("https://hq.exemplo.com/hermes/?token=x#y")).toBe("https://hq.exemplo.com/hermes");
  });

  it("recusa vazio, esquema estranho e usuário na URL", () => {
    expect(() => normalizeDashboardUrl("")).toThrow();
    expect(() => normalizeDashboardUrl("ftp://host:21")).toThrow(/http/);
    expect(() => normalizeDashboardUrl("http://eu:senha@host:9119")).toThrow(/session token/);
  });

  it("lê o token colado no próprio link", () => {
    expect(tokenFromLink("http://host:9119/?token=abc")).toBe("abc");
    expect(tokenFromLink("host:9119/#token=xyz")).toBe("xyz");
    expect(tokenFromLink("http://host:9119")).toBeUndefined();
  });
});

describe("token e modo de autenticação", () => {
  it("prévia nunca mostra o token inteiro", () => {
    expect(tokenPreview("")).toBeNull();
    expect(tokenPreview("curto")).toBe("definido");
    expect(tokenPreview("abcdefghijkl123456")).toBe("...123456");
  });

  it("auth_required true é OAuth; o resto é token", () => {
    expect(authModeFromStatus({ auth_required: true })).toBe("oauth");
    expect(authModeFromStatus({ auth_required: false })).toBe("token");
    expect(authModeFromStatus(null)).toBe("token");
  });

  it("usa o header dedicado do Hermes", () => {
    expect(sessionHeaders("t0k")).toEqual({ "x-hermes-session-token": "t0k" });
    expect(sessionHeaders("")).toEqual({});
  });
});

describe("conexão salva", () => {
  const dir = mkdtempSync(join(tmpdir(), "hq-conn-"));
  const file = join(dir, "sub", "connection.json");
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("grava com permissão 0600, lê de volta e apaga", () => {
    expect(loadSavedConnection(file)).toBeNull();
    saveConnection({ url: "http://host:9119", token: "segredo", savedAt: 1 }, file);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(loadSavedConnection(file)).toEqual({ url: "http://host:9119", token: "segredo", savedAt: 1 });
    clearConnection(file);
    expect(loadSavedConnection(file)).toBeNull();
  });

  it("conexão salva vence o ambiente e não vaza o token no status", () => {
    const config = readHermesConfig(
      { HERMES_DASHBOARD_URL: "http://env:8000", HERMES_DASHBOARD_TOKEN: "env-token" },
      { url: "http://salvo:9119", token: "abcdefghij999999", savedAt: 1 },
    );
    expect(config.source).toBe("saved");
    expect(config.dashboardUrl).toBe("http://salvo:9119");
    const status = statusPayload(config);
    expect(status.tokenPreview).toBe("...999999");
    expect(JSON.stringify(status)).not.toContain("abcdefghij999999");
  });

  it("sem conexão salva, o ambiente continua valendo", () => {
    const config = readHermesConfig({ HERMES_DASHBOARD_URL: "http://env:8000/" }, null);
    expect(config.source).toBe("env");
    expect(config.dashboardUrl).toBe("http://env:8000");
  });
});

describe("escrita da conexão só pela própria página", () => {
  const base = { host: "127.0.0.1:5173", "content-type": "application/json" };

  it("aceita mesma origem com JSON", () => {
    expect(isSameOriginWrite({ ...base, origin: "http://127.0.0.1:5173", "sec-fetch-site": "same-origin" })).toBe(true);
  });

  it("recusa outro site, outra origem e corpo que não é JSON", () => {
    expect(isSameOriginWrite({ ...base, "sec-fetch-site": "cross-site" })).toBe(false);
    expect(isSameOriginWrite({ ...base, origin: "https://malicioso.example" })).toBe(false);
    expect(isSameOriginWrite({ host: base.host, "content-type": "text/plain" })).toBe(false);
  });
});

describe("teste da conexão contra um dashboard", () => {
  const TOKEN = "token-de-teste-123456";
  let oauth = false;
  let url = "";
  const server = http.createServer((request, response) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.url === "/api/status") {
      send(200, { version: "0.22.6", gateway_running: true, auth_required: oauth });
      return;
    }
    if (request.headers["x-hermes-session-token"] !== TOKEN) {
      send(401, { detail: "Unauthorized" });
      return;
    }
    if (request.url === "/api/profiles") {
      send(200, { profiles: [{ name: "default" }, { name: "pulse" }] });
      return;
    }
    send(404, {});
  });

  beforeAll(async () => {
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((done) => server.close(() => done())));

  it("token certo conecta e conta os perfis", async () => {
    oauth = false;
    const result = await probeConnection(url, TOKEN);
    expect(result).toMatchObject({ ok: true, authMode: "token", version: "0.22.6", profileCount: 2 });
  });

  it("token errado diz que foi recusado", async () => {
    oauth = false;
    const result = await probeConnection(url, "errado");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/recusou o session token/);
  });

  it("dashboard com OAuth é recusado com o motivo", async () => {
    oauth = true;
    const result = await probeConnection(url, TOKEN);
    expect(result).toMatchObject({ ok: false, authMode: "oauth" });
    expect(result.error).toMatch(/OAuth/);
  });

  it("nada escutando vira erro legível", async () => {
    const result = await probeConnection("http://127.0.0.1:1", TOKEN, 1000);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
