import { useEffect, useState } from "react";

/**
 * Personagens em GLB: um arquivo por bot em `public/characters/`, listado no
 * `public/characters/manifest.json`. Sem manifesto (ou sem entrada para o bot),
 * a cena usa a figura procedural de sempre — modelo é opcional, nunca requisito.
 *
 * Guia de como fazer os modelos: docs/PERSONAGENS.md.
 */

/** Poses que a cena pede ao personagem; cada uma vira uma animação do GLB. */
export const CHARACTER_POSES = ["idle", "walk", "sit", "type", "talk"] as const;
export type CharacterPose = (typeof CHARACTER_POSES)[number];

export interface CharacterEntry {
  /** Arquivo dentro de public/characters/ (ex.: "pulse.glb"). */
  file: string;
  /** Altura final em metros (1 unidade da cena = 1 m). Padrão 1.72. */
  height?: number;
  /** Nome exato da animação para cada pose, quando o automático não acerta. */
  clips?: Partial<Record<CharacterPose, string>>;
  /** Ajuste do assento (m): y desce/sobe, z aproxima da mesa. Padrão 0. */
  seatOffset?: { y?: number; z?: number };
  /** Gira o modelo (graus) se ele foi exportado olhando para outro lado. */
  yawDeg?: number;
}

export interface CharacterManifest {
  version: 1;
  /** Modelo para bots sem entrada própria (opcional). */
  default?: CharacterEntry;
  characters: Record<string, CharacterEntry>;
}

export const DEFAULT_CHARACTER_HEIGHT = 1.72;

/** Palavras que identificam cada pose no nome da animação (Mixamo, Blender, pt-BR). */
const POSE_KEYWORDS: Record<CharacterPose, string[]> = {
  idle: ["idle", "parado", "breath", "stand"],
  walk: ["walk", "andar", "anda", "caminh"],
  sit: ["sitting idle", "sit idle", "sitting", "sentado", "sit"],
  type: ["typing", "type", "digit", "keyboard", "teclado"],
  talk: ["talking", "talk", "convers", "falando", "explain"],
};

/** Na falta de uma pose, qual outra serve (sentado digitando ~ sentado). */
const POSE_FALLBACK: Record<CharacterPose, CharacterPose[]> = {
  idle: [],
  walk: ["idle"],
  sit: ["type", "idle"],
  type: ["sit", "idle"],
  talk: ["sit", "idle"],
};

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^.*\|/, "") // "Armature|Walking" → "walking"
    .replace(/[_.-]+/g, " ")
    .trim();
}

/**
 * Qual animação do arquivo toca em cada pose. Nome explícito no manifesto
 * vence; depois, palavra-chave no nome; depois, a pose parecida. Pose sem
 * nada fica de fora (o personagem mantém a anterior).
 */
export function resolveClips(
  available: string[],
  explicit: Partial<Record<CharacterPose, string>> = {},
): Partial<Record<CharacterPose, string>> {
  const direct: Partial<Record<CharacterPose, string>> = {};
  for (const pose of CHARACTER_POSES) {
    const wanted = explicit[pose];
    if (wanted && available.includes(wanted)) {
      direct[pose] = wanted;
      continue;
    }
    for (const keyword of POSE_KEYWORDS[pose]) {
      // "sit" não pode pegar "Sitting" se "type" já pediu algo mais específico: a
      // ordem das palavras vai do mais específico ao mais genérico
      const match = available.find((name) => normalize(name).includes(keyword));
      if (match) {
        direct[pose] = match;
        break;
      }
    }
  }
  // "talk" e "type" nunca devem cair numa animação de andar por acidente
  if (direct.type && direct.type === direct.walk) delete direct.type;

  const resolved: Partial<Record<CharacterPose, string>> = { ...direct };
  for (const pose of CHARACTER_POSES) {
    if (resolved[pose]) continue;
    const substitute = POSE_FALLBACK[pose].find((other) => direct[other]);
    if (substitute) resolved[pose] = direct[substitute];
  }
  return resolved;
}

/** Escala que leva a altura medida do modelo à altura desejada. */
export function fitScale(measuredHeight: number, targetHeight = DEFAULT_CHARACTER_HEIGHT): number {
  if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) return 1;
  return targetHeight / measuredHeight;
}

/** Pose que a cena pede para o estado do bot. */
export function poseForState(state: string): CharacterPose {
  switch (state) {
    case "walking":
      return "walk";
    case "working":
    case "blocked":
      return "type";
    case "meeting":
      return "talk";
    default:
      return "idle";
  }
}

/** Entrada do bot no manifesto (própria ou a padrão). */
export function characterFor(manifest: CharacterManifest | null, botId: string): CharacterEntry | null {
  if (!manifest) return null;
  return manifest.characters[botId] ?? manifest.default ?? null;
}

/** Arquivo seguro: só nome de arquivo .glb/.gltf dentro de public/characters. */
export function characterUrl(entry: CharacterEntry): string | null {
  return /^[\w.-]+\.(glb|gltf)$/i.test(entry.file) ? `/characters/${entry.file}` : null;
}

export function parseManifest(raw: unknown): CharacterManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<CharacterManifest>;
  const characters: Record<string, CharacterEntry> = {};
  const valid = (entry: unknown): entry is CharacterEntry =>
    Boolean(entry && typeof entry === "object" && typeof (entry as CharacterEntry).file === "string");
  for (const [botId, entry] of Object.entries(data.characters ?? {})) {
    if (valid(entry)) characters[botId] = entry;
  }
  return { version: 1, characters, ...(valid(data.default) ? { default: data.default } : {}) };
}

let manifestPromise: Promise<CharacterManifest | null> | null = null;

function loadManifest(): Promise<CharacterManifest | null> {
  manifestPromise ??= fetch("/characters/manifest.json", { cache: "no-cache" })
    .then((response) => (response.ok ? response.json() : null))
    .then(parseManifest)
    .catch(() => null);
  return manifestPromise;
}

/** Manifesto lido uma vez por página; null enquanto lê ou quando não existe. */
export function useCharacterManifest(): CharacterManifest | null {
  const [manifest, setManifest] = useState<CharacterManifest | null>(null);
  useEffect(() => {
    let alive = true;
    void loadManifest().then((value) => {
      if (alive) setManifest(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return manifest;
}
