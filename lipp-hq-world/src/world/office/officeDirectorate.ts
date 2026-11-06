import { newPreset } from "@/avatar/human/preset";
import { FACING, DESK_REACH, FLOOR_BOUNDS, type OfficeSeat } from "./officeLayout";
import { zone, type BuildingRoom, type FloorSignSpec, type SceneryHuman } from "./officeLobby";
import type { Point } from "./officeHumans";

/**
 * A Diretoria, no último andar. A sala do chefe fica no canto do fundo, o ápice da tela, com as
 * duas janelas e sem nada entre ela e a câmera. Os diretores são cenário: sem nome próprio e sem
 * função, até alguém definir o que eles fazem.
 */
const { minX, maxX, minZ, maxZ } = FLOOR_BOUNDS;

/** O eixo entre as metades do andar: mais largo que os corredores do escritório. */
export const AXIS = { minZ: -0.6, maxZ: 1.4 } as const;
export const CHIEF_ROOM = { minX, maxX: -2.4, minZ, maxZ: AXIS.minZ } as const;
export const CHIEF_DOOR = { x: CHIEF_ROOM.maxX, z: -5, width: 1.6 } as const;
export const MEETING_ROOM = { minX: 1.5, maxX, minZ: AXIS.maxZ, maxZ } as const;
export const MEETING_DOOR = { x: 5.4, z: AXIS.maxZ, width: 1.6 } as const;
export const LOUNGE_ROOM = { minX, maxX: 0, minZ: AXIS.maxZ, maxZ } as const;
export const LOUNGE_DOOR = { x: -5, z: AXIS.maxZ, width: 2.2 } as const;

export const DIRECTORATE_ROOMS: BuildingRoom[] = [
  zone("sala-chefe", "Sala do chefe", "#c2a26a", "Escritório de canto, com mesa, reunião privada e lounge. A agenda é de exemplo.", CHIEF_ROOM),
  zone("antessala", "Antessala", "#8fa3b8", "Chegada dos elevadores. Só cenário.", { minX: CHIEF_ROOM.maxX, maxX, minZ, maxZ: AXIS.minZ }),
  zone("reuniao-diretoria", "Sala de reunião", "#7f8fa8", "Mesa da diretoria. Só cenário: não há reunião de verdade aqui.", MEETING_ROOM),
  zone("lounge-diretoria", "Lounge", "#7f9f83", "Espera e café. Só cenário.", LOUNGE_ROOM),
];

const seat = (id: string, roomId: string, x: number, z: number, yaw: number): OfficeSeat => ({ id, roomId, kind: "reuniao", x, z, yaw });

/** Mesa do chefe: 2,8 × 1, de frente para a câmera, com o rosto dele livre. */
export const CHIEF_DESK = { width: 2.8, depth: 1 } as const;
export const CHIEF_SEAT = seat("diretoria-chefe", "sala-chefe", -7.4, -6.6, FACING.south);
/** Ao lado da mesa, do lado da porta: de lá a cadeira já está no caminho. */
export const CHIEF_SPOT: Point = { x: CHIEF_SEAT.x + 2.05, z: CHIEF_SEAT.z - 0.6 };

/** A mesa da sala de reunião corre de leste a oeste; a primeira cadeira do norte é a do diretor. */
export const BOARD_TABLE = { x: 6.4, z: 5.2, width: 5.2, depth: 1.3 } as const;
export const BOARD_XS = [-1.7, 0, 1.7] as const;
export const DIRECTOR_SEAT = seat("diretoria-reuniao", "reuniao-diretoria", BOARD_TABLE.x + BOARD_XS[0], BOARD_TABLE.z - BOARD_TABLE.depth / 2 - DESK_REACH, FACING.south);

/** Só estas cadeiras se movem por conta de alguém; ficam fora de `OFFICE_SEATS`, que é dos bots. */
export const DIRECTORATE_SEATS: readonly OfficeSeat[] = [CHIEF_SEAT, DIRECTOR_SEAT];

const SCENERY_DATE = "2026-11-05T00:00:00.000Z";

const standingDirector: SceneryHuman = (() => {
  const base = newPreset("diretora-simulada", "Diretora simulada", SCENERY_DATE);
  return {
    id: base.id,
    tag: "Diretora · simulada",
    floor: "diretoria",
    preset: {
      ...base,
      parts: { ...base.parts, hair: "Hair.007" },
      colors: { ...base.colors, hair: "#6b4426", eyebrow: "#6b4426", head: "#f0c3a0", nose: "#f0c3a0", top: "#2f4256", bottom: "#23262c", shoes: "#23262c" },
    },
    spot: { x: 0.2, z: -5.6 },
    chair: null,
  };
})();

const seatedDirector: SceneryHuman = (() => {
  const base = newPreset("diretor-simulado", "Diretor simulado", SCENERY_DATE);
  return {
    id: base.id,
    tag: "Diretor · simulado",
    floor: "diretoria",
    preset: {
      ...base,
      parts: { ...base.parts, hair: "Hair.005" },
      colors: { ...base.colors, hair: "#2a2a2c", eyebrow: "#2a2a2c", facialHair: "#2a2a2c", head: "#8d5a3c", nose: "#8d5a3c", top: "#6b5a44", bottom: "#2f4256", shoes: "#23262c" },
    },
    spot: { x: DIRECTOR_SEAT.x, z: DIRECTOR_SEAT.z - 1 },
    chair: DIRECTOR_SEAT,
  };
})();

export const DIRECTORATE_SCENERY: readonly SceneryHuman[] = [standingDirector, seatedDirector];

export const DIRECTORATE_SIGNS: readonly FloorSignSpec[] = [
  { text: "ELEVADORES", at: [4.35, 2.83, minZ + 0.05], width: 1.7, height: 0.28 },
  { text: "DIRETORIA", at: [-0.9, 1.9, minZ + 0.2], width: 2.4, height: 0.4 },
];

/** A ronda agora fica no andar dele: sai pela porta, vai ao eixo e volta. Só visual. */
export function directoratePatrol(spot: Point): Point[][] {
  const inside = { x: CHIEF_DOOR.x - 1.2, z: CHIEF_DOOR.z };
  const outside = { x: CHIEF_DOOR.x + 1, z: CHIEF_DOOR.z };
  const landing = { x: outside.x, z: -2.2 };
  const axis = { x: 1.6, z: (AXIS.minZ + AXIS.maxZ) / 2 };
  return [
    [spot, inside, outside],
    [outside, landing, axis],
    [axis, landing, outside],
    [outside, inside, spot],
  ];
}
