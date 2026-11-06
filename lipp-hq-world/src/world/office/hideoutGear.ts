import type { BufferGeometry} from "three";
import { CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, SphereGeometry, Vector3, type Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BAT_OUTLINE } from "./officeHideout";

const SUIT = "#2a2d36";
const GOLD = "#c7983d";

/** O morcego em chapa fina, deitado em XY e olhando para +z. */
export function batEmblemGeometry(width: number, depth = 0.02): BufferGeometry {
  const half = width / 2;
  const shape = new Shape(BAT_OUTLINE.map(([x, y]) => ({ x: x * half, y: y * half })) as never);
  return new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
}

/** Capuz com as duas orelhas pontudas: o centro da cabeça é a origem, e a frente é +z. */
export function cowlGeometry(radius: number): BufferGeometry {
  const dome = new SphereGeometry(radius, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.8);
  const ears = [-1, 1].map((side) => {
    const ear = new CylinderGeometry(0.001, radius * 0.3, radius * 0.95, 6);
    ear.rotateZ(-side * 0.16);
    ear.translate(side * radius * 0.56, radius * 1.15, 0);
    return ear;
  });
  const parts = [dome, ...ears].map((part) => (part.index ? part.toNonIndexed() : part));
  const merged = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  return merged;
}

/** Capa com a barra em pontas, no plano XY: y = 0 nos ombros, descendo. Fica um pouco curvada para trás. */
export function capeGeometry(width: number, length: number): BufferGeometry {
  const half = width / 2;
  const shape = new Shape();
  shape.moveTo(-half * 0.55, 0);
  shape.lineTo(half * 0.55, 0);
  shape.lineTo(half, -length * 0.9);
  const points = 4;
  for (let index = 0; index < points; index += 1) {
    const from = half - (index * 2 * half) / points;
    const to = half - ((index + 1) * 2 * half) / points;
    shape.quadraticCurveTo((from + to) / 2, -length * 0.8, to, -length * (index % 2 === 0 ? 1 : 0.9));
  }
  shape.lineTo(-half * 0.55, 0);
  const geometry = new ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: false, curveSegments: 6 });
  const position = geometry.attributes.position!;
  const point = new Vector3();
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index);
    // A barra afasta do corpo, e o meio fica mais fundo que as pontas.
    const bend = (-point.y / length) ** 0.8 * 0.16 + (1 - (point.x / half) ** 2) * 0.05;
    position.setZ(index, point.z - bend);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Medidas da figura em cena, em metros: a cabeça é grande de propósito, como em todas as Pessoas. */
export const COWL_RADIUS = 0.325;
const HEAD_CENTER = [0, 0.285, 0.02] as const;
const CAPE_TOP = [0, 0.14, -0.13] as const;

interface GearFigure {
  root: Object3D;
}

/**
 * Veste o morcego por cima da figura normal: capuz na cabeça, capa no peito e cinto na bacia, presos
 * aos ossos, para acompanhar o idle. Devolve o que libera tudo. Nada aqui sabe de quem é a figura.
 */
export function wearBatGear(figure: GearFigure): () => void {
  const matte = new MeshStandardMaterial({ color: SUIT, roughness: 0.55, metalness: 0.25 });
  const gold = new MeshStandardMaterial({ color: GOLD, roughness: 0.4, metalness: 0.6 });
  const geometries: BufferGeometry[] = [];
  const attached: Object3D[] = [];
  const attach = (boneName: string, geometry: BufferGeometry, material: MeshStandardMaterial, offset: readonly [number, number, number]) => {
    const bone = figure.root.getObjectByName(boneName);
    if (!bone) return;
    bone.updateWorldMatrix(true, false);
    const { x: scale } = bone.getWorldScale(new Vector3());
    const holder = new Group();
    // O osso vem com a escala do arquivo: geometria e deslocamento ficam em metros da cena.
    holder.scale.setScalar(1 / scale);
    holder.position.set(offset[0] / scale, offset[1] / scale, offset[2] / scale);
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = true;
    holder.add(mesh);
    bone.add(holder);
    geometries.push(geometry);
    attached.push(holder);
  };
  attach("mixamorigHead", cowlGeometry(COWL_RADIUS), matte, HEAD_CENTER);
  attach("mixamorigSpine2", capeGeometry(0.6, 0.68), matte, CAPE_TOP);
  // Luvas: as mãos da figura têm a cor da pele, e o traje não.
  for (const hand of ["mixamorigLeftHand", "mixamorigRightHand"]) attach(hand, new SphereGeometry(0.085, 10, 8), matte, [0, 0.125, 0]);
  attach("mixamorigHips", new CylinderGeometry(0.13, 0.13, 0.035, 14), gold, [0, 0.045, 0]);
  return () => {
    for (const holder of attached) holder.removeFromParent();
    for (const geometry of geometries) geometry.dispose();
    matte.dispose();
    gold.dispose();
  };
}
