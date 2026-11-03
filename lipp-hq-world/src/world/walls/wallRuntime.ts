import type { WallMode } from "@/types/hq";

/**
 * Estado mutável do sistema de paredes, fora do React. O loop de render escreve
 * aqui a cada avaliação e a ponte de QA lê sem provocar re-render.
 */
export const wallRuntime = {
  cutaway: new Set<string>(),
  mode: "auto" as WallMode,
  evaluations: 0,
};

export function setWallRuntimeMode(mode: WallMode) {
  wallRuntime.mode = mode;
}
