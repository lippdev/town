#!/usr/bin/env node
/**
 * Monta public/esconderijo/kit.glb a partir dos pacotes CC0 originais, baixados e descompactados à mão:
 *
 *   node scripts/assets/build-esconderijo-kit.mjs <megakit-standard> <space-kit> <car-kit> [saida.glb]
 *
 * Não baixa nada e não executa nada dos pacotes. Só copia os arquivos escolhidos para uma pasta
 * temporária, troca as texturas vermelhas e azuis pelas neutras e chama o @gltf-transform/cli,
 * a mesma versão dos outros modelos do protótipo. Hashes e autoria: public/esconderijo/proveniencia.json.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [megakit, spaceKit, carKit, out = "public/esconderijo/kit.glb"] = process.argv.slice(2);
if (!megakit || !spaceKit || !carKit) throw new Error("Uso: build-esconderijo-kit.mjs <megakit-standard> <space-kit> <car-kit> [saida.glb]");

const QUATERNIUS = {
  Props: ["Prop_Computer", "Prop_Chest", "Prop_Crate4", "Prop_Barrel_Large", "Prop_Fan_Small", "Prop_PipeHolder", "Prop_Light_Floor"],
  Platforms: ["Platform_Round1", "Platform_DarkPlates", "Platform_Squares", "Platform_Metal", "Door_Frame_Square", "Door_DarkMetal"],
  Columns: ["Column_Hollow"],
};
const KENNEY = [path.join(spaceKit, "Models/GLTF format/rock_largeA.glb"), path.join(spaceKit, "Models/GLTF format/rock_largeB.glb"), path.join(spaceKit, "Models/GLTF format/rock.glb"), path.join(carKit, "Models/GLB format/wheel-dark.glb")];
/** O vermelho do pacote brigaria com o azul e o âmbar da cena: aqui é tudo neutro, e a cor vem das luzes. */
const RECOLOR = { "T_Trim_01_BaseColor_Red.png": "T_Trim_01_BaseColor.png", "T_Trim_02_BaseColor_Red.png": "T_Trim_02_BaseColor.png", "T_Trim_02_BaseColor_Blue.png": "T_Trim_02_BaseColor.png" };

const work = mkdtempSync(path.join(tmpdir(), "esconderijo-kit-"));
for (const name of readdirSync(path.join(megakit, "Textures"))) copyFileSync(path.join(megakit, "Textures", name), path.join(work, name));

const inputs = [];
for (const [folder, names] of Object.entries(QUATERNIUS)) {
  for (const name of names) {
    const gltf = JSON.parse(readFileSync(path.join(megakit, "glTF", folder, `${name}.gltf`), "utf8"));
    for (const image of gltf.images ?? []) image.uri = RECOLOR[image.uri] ?? image.uri;
    writeFileSync(path.join(work, `${name}.gltf`), JSON.stringify(gltf));
    copyFileSync(path.join(megakit, "glTF", folder, `${name}.bin`), path.join(work, `${name}.bin`));
    inputs.push(path.join(work, `${name}.gltf`));
  }
}
const CLI = ["--yes", "@gltf-transform/cli@4.5.1"];
const merged = path.join(work, "merged.glb");
execFileSync("npx", [...CLI, "merge", ...inputs, ...KENNEY, merged, "--merge-scenes"], { stdio: "inherit" });
mkdirSync(path.dirname(out), { recursive: true });
// Sem juntar nós nem malhas: cada peça é instanciada pelo nome, e a cena decide onde ela fica.
execFileSync("npx", [...CLI, "optimize", merged, out, "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", "512", "--flatten", "false", "--join", "false", "--instance", "false", "--palette", "false", "--simplify", "false"], { stdio: "inherit" });
console.log(`${out}: ${statSync(out).size} bytes`);
