import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearConnection,
  connectionFilePath,
  isLoopbackAddress,
  legacyConnectionFilePath,
  loadSavedConnection,
  saveConnection,
} from "../../server/hermesConnection";
import { callProxy } from "../helpers/proxy";

describe("proxy só atende esta máquina", () => {
  it("reconhece loopback em IPv4, IPv6 e IPv4 mapeado", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.8.9.10")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("rede local, endereço público e vazio não passam", () => {
    expect(isLoopbackAddress("192.168.0.5")).toBe(false);
    expect(isLoopbackAddress("::ffff:192.168.0.5")).toBe(false);
    expect(isLoopbackAddress("100.64.0.1")).toBe(false);
    expect(isLoopbackAddress("1270.0.0.1")).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });

  it("cliente da rede recebe 403 em leitura e escrita", async () => {
    const remote = "192.168.0.5";
    expect((await callProxy("GET", "/api/hq/status", {}, "", remote)).status).toBe(403);
    expect((await callProxy("GET", "/api/hq/hermes/snapshot", {}, "", remote)).status).toBe(403);
    const json = { "content-type": "application/json", origin: "http://127.0.0.1:5173" };
    expect((await callProxy("POST", "/api/hq/connection", json, "{}", remote)).status).toBe(403);
    expect((await callProxy("POST", "/api/hq/connection/local", json, "{}", remote)).status).toBe(403);
  });

  it("cliente local continua atendido", async () => {
    expect((await callProxy("GET", "/api/hq/status")).status).toBe(200);
  });
});

describe("conexão salva fora do repositório", () => {
  const saved = { home: process.env.HOME, file: process.env.HQ_CONNECTION_FILE, cwd: process.cwd() };
  let home = "";
  let app = "";

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "hq-home-"));
    app = mkdtempSync(join(tmpdir(), "hq-app-"));
    process.env.HOME = home;
    delete process.env.HQ_CONNECTION_FILE;
    process.chdir(app);
  });

  afterEach(() => {
    process.chdir(saved.cwd);
    process.env.HOME = saved.home;
    if (saved.file === undefined) delete process.env.HQ_CONNECTION_FILE;
    else process.env.HQ_CONNECTION_FILE = saved.file;
    rmSync(home, { recursive: true, force: true });
    rmSync(app, { recursive: true, force: true });
  });

  it("padrão é ~/.lipp-hq/connection.json, com pasta 0700 e arquivo 0600", () => {
    expect(connectionFilePath()).toBe(join(home, ".lipp-hq", "connection.json"));
    saveConnection({ url: "http://host:9119", token: "t", savedAt: 1 });
    expect(statSync(join(home, ".lipp-hq")).mode & 0o777).toBe(0o700);
    expect(statSync(connectionFilePath()).mode & 0o777).toBe(0o600);
  });

  it("HQ_CONNECTION_FILE troca o caminho", () => {
    process.env.HQ_CONNECTION_FILE = join(app, "outro.json");
    expect(connectionFilePath()).toBe(join(app, "outro.json"));
  });

  it("arquivo antigo no diretório do app ainda é lido e migra ao salvar", () => {
    const legacy = legacyConnectionFilePath();
    writeFileSync(legacy, JSON.stringify({ url: "http://antigo:9119", token: "velho", savedAt: 1 }));
    expect(loadSavedConnection()?.url).toBe("http://antigo:9119");

    saveConnection({ url: "http://novo:9119", token: "novo", savedAt: 2 });
    expect(existsSync(legacy)).toBe(false);
    expect(loadSavedConnection()?.url).toBe("http://novo:9119");
  });

  it("desconectar apaga o arquivo novo e o antigo", () => {
    saveConnection({ url: "http://novo:9119", token: "novo", savedAt: 2 });
    writeFileSync(legacyConnectionFilePath(), JSON.stringify({ url: "http://antigo:9119", token: "v", savedAt: 1 }));
    clearConnection();
    expect(loadSavedConnection()).toBeNull();
  });
});
