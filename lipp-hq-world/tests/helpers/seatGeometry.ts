import { Vector3, type Object3D, type SkinnedMesh } from "three";
import { CHAIR, DESK, SIT } from "@/avatar/human/seatFit";
import type { ChairPose } from "@/world/office/officeHumans";

/** Um vértice da malha, já na pose: em metros do andar, com o osso que mais o puxa. */
export interface PosedVertex {
  x: number;
  y: number;
  z: number;
  bone: string;
  part: string;
}

/** Roda os vértices vestidos pela pose atual, um a cada `step`. É o que a tela desenha. */
export function posedVertices(root: Object3D, step = 3): PosedVertex[] {
  root.updateWorldMatrix(true, true);
  const out: PosedVertex[] = [];
  const point = new Vector3();
  root.traverse((node) => {
    const mesh = node as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    mesh.skeleton.update();
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    for (let index = 0; index < position!.count; index += step) {
      let best = 0;
      for (let slot = 1; slot < 4; slot += 1) if (skinWeight!.getComponent(index, slot) > skinWeight!.getComponent(index, best)) best = slot;
      mesh.getVertexPosition(index, point);
      mesh.localToWorld(point);
      out.push({ x: point.x, y: point.y, z: point.z, bone: mesh.skeleton.bones[skinIndex!.getComponent(index, best)]!.name, part: mesh.name });
    }
  });
  return out;
}

/** Leva um ponto do andar para o referencial da cadeira: +Z é para onde o assento olha. */
export function inChair(point: { x: number; y: number; z: number }, chair: ChairPose) {
  const dx = point.x - chair.x;
  const dz = point.z - chair.z;
  return { x: dx * Math.cos(chair.yaw) - dz * Math.sin(chair.yaw), y: point.y, z: dx * Math.sin(chair.yaw) + dz * Math.cos(chair.yaw) };
}

export interface Box {
  label: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** O que da cadeira é sólido, no referencial dela. Mudar o desenho muda este teste junto. */
export const CHAIR_BOXES: readonly Box[] = [
  { label: "assento", minX: -CHAIR.seatWidth / 2, maxX: CHAIR.seatWidth / 2, minY: CHAIR.seatBottom, maxY: CHAIR.seatTop, minZ: CHAIR.seatRear, maxZ: CHAIR.seatFront },
  { label: "encosto", minX: -CHAIR.seatWidth / 2, maxX: CHAIR.seatWidth / 2, minY: CHAIR.backBottom, maxY: CHAIR.backTop, minZ: CHAIR.backRear, maxZ: CHAIR.backFront },
];

/** Quanto o vértice mais fundo entrou na caixa. Zero é não encostar. */
export function deepestInside(vertices: readonly { x: number; y: number; z: number }[], box: Box): number {
  let deepest = 0;
  for (const { x, y, z } of vertices) {
    if (x <= box.minX || x >= box.maxX || y <= box.minY || y >= box.maxY || z <= box.minZ || z >= box.maxZ) continue;
    deepest = Math.max(deepest, Math.min(x - box.minX, box.maxX - x, y - box.minY, box.maxY - y, z - box.minZ, box.maxZ - z));
  }
  return deepest;
}

export const isHand = (vertex: PosedVertex) => /Hand(Thumb|Index|Middle|Ring|Pinky)|Hand$/.test(vertex.bone);
export const isFoot = (vertex: PosedVertex) => /Foot$|ToeBase$|Toe_End$/.test(vertex.bone) || vertex.part.startsWith("Shoes");
export const isLeg = (vertex: PosedVertex) => /UpLeg$|Leg$/.test(vertex.bone);
export const isPelvis = (vertex: PosedVertex) => /Hips$|UpLeg$/.test(vertex.bone);
export const isTrunk = (vertex: PosedVertex) => /Hips$|Spine\d?$/.test(vertex.bone);

export interface SeatFitReport {
  seatGap: number;
  backGap: number;
  handGapLeft: number;
  handGapRight: number;
  handOverDeskLeft: number;
  handOverDeskRight: number;
  footGapLeft: number;
  footGapRight: number;
  thighTopClear: number;
  bellyToEdge: number;
  deepestSeat: number;
  deepestBack: number;
}

/** Mede o encaixe nos vértices, sem olhar para os alvos que a pose pediu. */
export function seatFit(vertices: readonly PosedVertex[], chair: ChairPose): SeatFitReport {
  const local = vertices.map((vertex) => ({ ...vertex, ...inChair(vertex, chair) }));
  const lowest = (list: readonly { y: number }[]) => list.reduce((value, item) => Math.min(value, item.y), Infinity);
  const left = (list: readonly (PosedVertex & { x: number })[]) => list.filter((item) => item.x > 0);
  const right = (list: readonly (PosedVertex & { x: number })[]) => list.filter((item) => item.x < 0);

  const onSeat = local.filter((item) => isPelvis(item) && item.z < CHAIR.seatFront && item.z > CHAIR.seatRear && Math.abs(item.x) < CHAIR.seatWidth / 2);
  const trunk = local.filter((item) => isPelvis(item) && item.y > CHAIR.backBottom);
  const hands = local.filter(isHand);
  const overDesk = hands.filter((item) => item.z > SIT.deskEdge);
  const feet = local.filter((item) => isFoot(item) && item.y < 0.45);
  const barTop = CHAIR.footBar.y + CHAIR.footBar.radius;
  const overBar = feet.filter((item) => Math.abs(item.z - CHAIR.footBar.z) < 0.03);
  const thighs = local.filter((item) => isLeg(item) && item.z > SIT.deskEdge - 0.2);
  const atDesk = local.filter((item) => isTrunk(item) && item.y > DESK.underside && item.y < DESK.top);
  const atChairBox = local.filter((item) => !isHand(item));

  return {
    seatGap: lowest(onSeat) - CHAIR.seatTop,
    backGap: trunk.reduce((value, item) => Math.min(value, item.z), Infinity) - CHAIR.backFront,
    handGapLeft: lowest(left(overDesk)) - DESK.top,
    handGapRight: lowest(right(overDesk)) - DESK.top,
    handOverDeskLeft: left(hands).reduce((value, item) => Math.max(value, item.z), -Infinity) - SIT.deskEdge,
    handOverDeskRight: right(hands).reduce((value, item) => Math.max(value, item.z), -Infinity) - SIT.deskEdge,
    footGapLeft: lowest(left(overBar)) - barTop,
    footGapRight: lowest(right(overBar)) - barTop,
    thighTopClear: DESK.underside - thighs.reduce((value, item) => Math.max(value, item.y), -Infinity),
    bellyToEdge: SIT.deskEdge - atDesk.reduce((value, item) => Math.max(value, item.z), -Infinity),
    deepestSeat: deepestInside(atChairBox, CHAIR_BOXES[0]!),
    deepestBack: deepestInside(atChairBox, CHAIR_BOXES[1]!),
  };
}
