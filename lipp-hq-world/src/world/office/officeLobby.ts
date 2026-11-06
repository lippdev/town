import { newPreset, type HumanPreset } from "@/avatar/human/preset";
import type { FloorId } from "./officeBuilding";
import { ENTRANCE, FLOOR_BOUNDS, type OfficeBounds, type OfficeRoom, type OfficeSeat } from "./officeLayout";
import type { Point } from "./officeHumans";

/**
 * O térreo: recepção, elevadores e lounge num salão só. As zonas não têm parede; existem para
 * apontar e enquadrar. Tudo aqui é cenário: ninguém atende, e o elevador não leva a lugar nenhum.
 */
export type BuildingRoom = Pick<OfficeRoom, "id" | "name" | "color" | "purpose" | "bounds" | "center">;

export function zone(id: string, name: string, color: string, purpose: string, bounds: OfficeBounds): BuildingRoom {
  return { id, name, color, purpose, bounds, center: { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 } };
}

const { minX, maxX, minZ, maxZ } = FLOOR_BOUNDS;

export const LOBBY_ROOMS: BuildingRoom[] = [
  zone("recepcao", "Recepção", "#d6a65c", "Balcão de boas-vindas. Cenário: a atendente não atende nem registra nada.", { minX: -9.2, maxX: 0.6, minZ, maxZ: 2 }),
  zone("elevadores", "Elevadores", "#8fa3b8", "Hall dos elevadores. Só visual: para mudar de andar, use o seletor.", { minX: 0.8, maxX, minZ, maxZ: -1.2 }),
  zone("lounge", "Lounge", "#7f9f83", "Espera com sofás e poltronas. Só cenário.", { minX: 1.6, maxX, minZ: 0.6, maxZ }),
  zone("cafe", "Café", "#a97c5b", "Balcão de café e mesinhas. Só cenário.", { minX, maxX: -6.6, minZ: 2, maxZ }),
];

/** Figura que só compõe a cena: não está em Pessoas, não clica e não recebe comando. */
export interface SceneryHuman {
  id: string;
  /** Nome na etiqueta, que sempre diz que é cenário. */
  tag: string;
  floor: FloorId;
  preset: HumanPreset;
  spot: Point;
  /** Cadeira onde fica sentada; sem ela, fica em pé olhando para a câmera. */
  chair: OfficeSeat | null;
}

const SCENERY_DATE = "2026-11-05T00:00:00.000Z";

export const RECEPTION = { x: ENTRANCE.x, z: -3.9, width: 5.4 } as const;

const attendant: SceneryHuman = (() => {
  const base = newPreset("atendente", "Atendente", SCENERY_DATE);
  return {
    id: base.id,
    tag: "Atendente · cenográfica",
    floor: "terreo",
    preset: {
      ...base,
      expression: "smile",
      parts: { ...base.parts, hair: "Hair.004" },
      colors: { ...base.colors, hair: "#2b1a12", eyebrow: "#2b1a12", head: "#c98f6b", nose: "#c98f6b", top: "#7c2d3a", bottom: "#23262c", shoes: "#23262c" },
    },
    spot: { x: RECEPTION.x, z: RECEPTION.z - 1.25 },
    chair: null,
  };
})();

export const LOBBY_SCENERY: readonly SceneryHuman[] = [attendant];

/** Placas com texto, cada uma desenhada aqui mesmo. */
export interface FloorSignSpec {
  text: string;
  at: readonly [number, number, number];
  width: number;
  height: number;
  rotationY?: number;
}

/**
 * O núcleo dos elevadores é o mesmo nos andares: a porta do meio fica no eixo do corredor leste do
 * escritório. Numa torre de verdade o poço não muda de lugar de um pavimento para o outro.
 */
export const ELEVATOR_CORE_X = 4.35;
export const ELEVATOR_XS = [ELEVATOR_CORE_X - 2.3, ELEVATOR_CORE_X, ELEVATOR_CORE_X + 2.3] as const;

/** Face externa da parede do fundo do prédio: é dali que o núcleo começa, para o norte. */
const BACK_FACE = minZ - 0.16;
const SHAFT_PITCH = 2.3;

/**
 * O núcleo dos elevadores: uma caixa de verdade atrás da parede do fundo, com um poço para cada
 * porta e a mesma planta em todo andar. Fica fora da laje de propósito: nenhuma sala, posto ou
 * móvel precisou mudar de lugar para ele caber, e o escritório da frota real segue igual.
 */
export const ELEVATOR_CORE = {
  /** Espaço entre o batente da frente do poço e a parede do fundo dele. */
  front: BACK_FACE - 0.36,
  back: BACK_FACE - 2.06,
  /** Pegada da caixa, com as paredes. */
  bounds: { minX: ELEVATOR_XS[0] - SHAFT_PITCH / 2, maxX: ELEVATOR_XS[2] + SHAFT_PITCH / 2, minZ: BACK_FACE - 2.22, maxZ: BACK_FACE },
  wallFace: BACK_FACE,
  pitch: SHAFT_PITCH,
  /** Parede entre um poço e outro. */
  partition: 0.14,
  /** Até onde a caixa sobe: acima da parede de 3 m, o poço fica à mostra de cima. */
  top: 3.4,
  /** Altura do vão na parede e da porta: a 30°, a verga cobre o que estiver recuado atrás dela. */
  openingHead: 2.65,
  doorHeight: 2.12,
  cab: { width: 1.92, depth: 1.5, height: 2.35 },
} as const;

/** Como cada andar vê o núcleo. A cabine aberta é de um poço diferente em cada andar: são três elevadores. */
export interface ElevatorStop {
  /** Índices de `ELEVATOR_XS` que têm porta neste andar. */
  doors: readonly number[];
  /** O poço cuja cabine está parada aqui, de porta aberta. */
  openShaft: number;
  /** Largura do vão na parede. */
  opening: number;
  /** Quanto a porta fica atrás da face externa da parede. */
  recess: number;
  panel: boolean;
  /** Último pavimento: as máquinas ficam em cima do poço. */
  machines: boolean;
}

export const ELEVATOR_STOPS = {
  terreo: { doors: [0, 1, 2], openShaft: 0, opening: 1.75, recess: 0.3, panel: true, machines: false },
  // O corredor do escritório mede 1,5 m e as paredes das salas invadem um pouco a ponta dele:
  // com o recuo dos outros andares, a própria parede cobriria a porta nesta câmera.
  operacao: { doors: [1], openShaft: 1, opening: 1.18, recess: 0.06, panel: false, machines: false },
  diretoria: { doors: [0, 1, 2], openShaft: 2, opening: 1.75, recess: 0.3, panel: true, machines: true },
} as const satisfies Record<FloorId, ElevatorStop>;

export const LOBBY_SIGNS: readonly FloorSignSpec[] = [
  { text: "LIPP HQ", at: [RECEPTION.x, 1.75, minZ + 0.2], width: 4.8, height: 0.8 },
  { text: "ELEVADORES", at: [ELEVATOR_XS[1], 2.83, minZ + 0.05], width: 1.7, height: 0.28 },
];

/** Por onde se chega à recepção a partir da porta: faixa livre de móveis. */
export const LOBBY_WALK: readonly Point[] = [
  { x: ENTRANCE.x, z: maxZ - 0.2 },
  { x: ENTRANCE.x, z: RECEPTION.z + 0.9 },
];
