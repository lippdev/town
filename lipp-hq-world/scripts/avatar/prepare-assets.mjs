#!/usr/bin/env node
/**
 * Refaz os arquivos servidos em public/avatares a partir das fontes oficiais.
 *
 * Só baixa, confere o SHA-256 e comprime a geometria. Não executa nada do pacote: os
 * .blend ficam de fora e o zip é tratado apenas como dado. A compressão é a mesma do
 * protótipo (meshopt), com o simplify desligado para não alterar a malha.
 *
 * Uso: node scripts/avatar/prepare-assets.mjs [--work <pasta vazia>]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "public/avatares");
const WAWA_COMMIT = "802398d1a195a36c270ab451d883c128044e3177";
const WAWA = `https://raw.githubusercontent.com/wass08/r3f-ultimate-character-configurator/${WAWA_COMMIT}`;
const ROBOT = "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/RobotExpressive";
const ZIP_SHA256 = "455fc3bf5e31877d5e672e5c2d34557e82d2fd049be6cc6e65aed7f3ba6914ec";
const GLTF_TRANSFORM = "@gltf-transform/cli@4.5.1";
const FLAGS = "--compress meshopt --flatten false --join false --instance false --palette false --simplify false --texture-compress webp --texture-size 512".split(" ");
/** Ficam de fora do catálogo e do build; o motivo está em docs/AVATARES.md. */
const LEFT_OUT = new Set(["Armature.glb", "NakedFullBody.glb", "FaceMask.glb", "Outfit.002.glb"]);

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function download(url, file) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

function optimize(input, output) {
  execFileSync("npx", ["--yes", GLTF_TRANSFORM, "optimize", input, output, ...FLAGS], { stdio: "ignore", shell: process.platform === "win32" });
}

/** O tar do Windows lê zip; o do Git Bash, não. A pasta __MACOSX que vem junto é ignorada. */
function unzip(cwd) {
  for (const [command, args] of [["unzip", ["-q", "-o", "Assets.zip"]], ["tar", ["-xf", "Assets.zip"]]]) {
    try {
      execFileSync(command, args, { cwd, stdio: "ignore" });
      return;
    } catch {
      // tenta o próximo
    }
  }
  throw new Error("Instale unzip para extrair o Assets.zip.");
}

const work = argument("--work") ?? mkdtempSync(path.join(tmpdir(), "hq-avatares-"));
mkdirSync(path.join(OUT, "humano/pecas"), { recursive: true });
mkdirSync(path.join(OUT, "robo"), { recursive: true });

const zip = await download(`${WAWA}/Assets.zip`, path.join(work, "Assets.zip"));
const zipSha = sha256(zip);
if (zipSha !== ZIP_SHA256) throw new Error(`Assets.zip mudou: ${zipSha}`);
unzip(work);
const assets = path.join(work, "Assets");

const sources = {};
for (const name of readdirSync(assets).filter((file) => file.endsWith(".glb") && !LEFT_OUT.has(file)).sort()) {
  const output = path.join(OUT, "humano/pecas", name);
  optimize(path.join(assets, name), output);
  sources[name] = { sha256Origem: sha256(path.join(assets, name)), bytes: statSync(output).size };
}
optimize(path.join(assets, "Armature.glb"), path.join(OUT, "humano/armature.glb"));
const poses = await download(`${WAWA}/public/models/Poses.glb`, path.join(work, "Poses.glb"));
optimize(poses, path.join(OUT, "humano/poses.glb"));

// O robô entra idêntico ao oficial: 464 kB, sem nada a ganhar comprimindo.
await download(`${ROBOT}/RobotExpressive.glb`, path.join(OUT, "robo/RobotExpressive.glb"));
await download(`${ROBOT}/README.md`, path.join(OUT, "robo/README.md"));

writeFileSync(
  path.join(OUT, "proveniencia.json"),
  `${JSON.stringify(
    {
      humano: {
        autor: "Wawa Sensei (wass08)",
        repositorio: "https://github.com/wass08/r3f-ultimate-character-configurator",
        commit: WAWA_COMMIT,
        pacote: "Assets.zip",
        sha256: zipSha,
        licenca: "não identificada no repositório",
        autorizacao: "uso informado pelo Filipe Moreira em 2026-11-04",
        poses: { arquivo: "public/models/Poses.glb", sha256: sha256(poses) },
        ferramenta: `${GLTF_TRANSFORM} optimize ${FLAGS.join(" ")}`,
        pecas: sources,
      },
      robo: {
        autor: "Tomás Laulhé (modelo), Don McCurdy (modificações)",
        licenca: "CC0 1.0",
        origem: "https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive",
        sha256: sha256(path.join(OUT, "robo/RobotExpressive.glb")),
      },
    },
    null,
    2,
  )}\n`,
);
console.log(`ok: ${Object.keys(sources).length} peças em ${OUT}`);
