import { BoxGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, type BufferGeometry } from "three";
import { CHIEF_PRESET } from "./officeChief";
import { ColorMerge } from "./officeCity";

/** Raio do rotor principal: o deque e o mastro foram medidos por ele. */
export const ROTOR_RADIUS = 4;
/** Altura do rotor principal, medida do chão onde os esquis encostam. */
export const ROTOR_HEIGHT = 2.74;
/** Eixo do rotor de cauda, em relação ao helicóptero. */
export const TAIL_ROTOR = { x: 0.2, y: 2.06, z: -3.92 } as const;

const HULL = "#20283a";
const HULL_LIGHT = "#2f3a50";
const GLASS = "#0d1219";
const BRONZE = "#a6834c";
const METAL = "#4a4f58";
const DARK = "#14161a";

/** Elipsoide de poucas faces: a cabine é um ovo achatado, como o resto da cidade é caixa. */
function egg(radiusX: number, radiusY: number, radiusZ: number) {
  const sphere = new SphereGeometry(1, 14, 10);
  sphere.scale(radiusX, radiusY, radiusZ);
  return sphere;
}

export interface HelicopterBuild {
  body: BufferGeometry;
  /** O que gira, centrado no eixo: fica à parte para só ele mudar a cada quadro. */
  rotor: BufferGeometry;
  blur: BufferGeometry;
  tail: BufferGeometry;
  /** Farol e luzes de navegação: material básico, sem luz nova na cena. */
  lamps: BufferGeometry;
  strobe: BufferGeometry;
}

/** O helicóptero do chefe, olhando para +z com rotação zero, com os esquis em y = 0. */
export function buildHelicopter(): HelicopterBuild {
  const body = new ColorMerge();
  // Cabine, com a barriga mais clara e o vidro envolvendo o nariz.
  body.add(egg(0.84, 0.86, 1.72), 0, 1.45, 0.55, HULL);
  body.add(egg(0.72, 0.34, 1.34), 0, 0.92, 0.58, HULL_LIGHT);
  body.add(egg(0.78, 0.62, 0.98), 0, 1.62, 1.28, GLASS);
  // Janela lateral e a porta do lado que a câmera vê: é por ela que o chefe entra e sai.
  body.box(0.73, 1.34, 0.2, 0.2, 0.62, 0.72, GLASS);
  body.box(0.78, 0.92, 0.2, 0.12, 0.42, 0.74, HULL_LIGHT);
  // Capô do motor, atrás do rotor.
  const cowl = new CylinderGeometry(0.36, 0.56, 1.5, 10);
  cowl.rotateX(-Math.PI / 2);
  body.add(cowl, 0, 2.1, -0.28, HULL);
  // Cauda afinando, com a faixa de bronze da torre.
  const boom = new CylinderGeometry(0.09, 0.3, 3.4, 8);
  boom.rotateX(-Math.PI / 2);
  body.add(boom, 0, 1.72, -2.2, HULL);
  body.box(0.86, 1.38, 0.6, 0.04, 0.09, 2.3, BRONZE);
  body.box(-0.86, 1.38, 0.6, 0.04, 0.09, 2.3, BRONZE);
  body.box(0.17, 1.72, -2.2, 0.04, 0.07, 2.6, BRONZE);
  // Deriva e estabilizador.
  body.box(0, 1.76, -3.72, 0.07, 0.86, 0.46, HULL);
  body.box(0, 2.4, -3.86, 0.07, 0.3, 0.3, BRONZE);
  body.box(0, 1.68, -3.06, 1.3, 0.05, 0.34, HULL);
  // Eixo do rotor principal e cubo.
  const shaft = new CylinderGeometry(0.08, 0.1, 0.5, 8);
  body.add(shaft, 0, ROTOR_HEIGHT - 0.25, -0.1, METAL);
  // Esquis: dois tubos, a ponta dobrada para cima e as travessas até a barriga.
  for (const side of [-1, 1]) {
    body.box(side * 0.98, 0, 0.48, 0.09, 0.09, 3.3, DARK);
    const tip = new BoxGeometry(0.09, 0.09, 0.42);
    tip.rotateX(-Math.PI / 5);
    body.add(tip, side * 0.98, 0.15, 2.27, DARK);
    for (const along of [-0.2, 1.12]) body.box(side * 0.86, 0.05, along, 0.08, 0.66, 0.08, METAL);
  }
  for (const along of [-0.2, 1.12]) body.box(0, 0.64, along, 1.72, 0.08, 0.08, METAL);

  const rotor = new ColorMerge();
  rotor.box(0, 0, 0, ROTOR_RADIUS * 2, 0.035, 0.24, DARK);
  rotor.box(0, 0, 0, 0.24, 0.035, ROTOR_RADIUS * 2, DARK);
  rotor.add(new CylinderGeometry(0.2, 0.24, 0.16, 8), 0, 0.03, 0, METAL);

  const tail = new ColorMerge();
  tail.box(0, -0.56, 0, 0.03, 1.12, 0.1, DARK);
  tail.box(0, -0.05, -0.56, 0.03, 0.1, 1.12, DARK);
  tail.add(new ConeGeometry(0.07, 0.14, 6).rotateZ(-Math.PI / 2), 0, 0, 0, METAL);

  const lamps = new ColorMerge();
  lamps.add(egg(0.1, 0.1, 0.1), 0, 0.78, 1.86, "#fff4d0");
  lamps.box(0.86, 1.24, -0.42, 0.05, 0.08, 0.14, "#5dff97");
  lamps.box(-0.86, 1.24, -0.42, 0.05, 0.08, 0.14, "#ff5a48");

  const strobe = new ColorMerge();
  strobe.box(0, 2.72, -3.86, 0.12, 0.08, 0.12, "#ff5a48");
  strobe.box(0, 0.54, 0.2, 0.2, 0.06, 0.2, "#ff5a48");

  const blur = new CircleGeometry(ROTOR_RADIUS, 32);
  blur.rotateX(-Math.PI / 2);

  return { body: body.build(), rotor: rotor.build(), blur, tail: tail.build(), lamps: lamps.build(), strobe: strobe.build() };
}

export interface DeckFigureBuild {
  body: BufferGeometry;
  leg: BufferGeometry;
}

/**
 * O chefe visto do deque: de longe, com as cores dele e sem baixar nenhum arquivo. O corpo de verdade
 * só existe no andar em tela; fora dele, um boneco é o que a escala do exterior precisa, na altura
 * que as pessoas têm na cena.
 */
export function buildDeckFigure(): DeckFigureBuild {
  const { colors } = CHIEF_PRESET;
  const body = new ColorMerge();
  body.box(0, 0.62, 0, 0.36, 0.42, 0.2, colors.top);
  body.box(0, 0.9, 0.09, 0.09, 0.12, 0.04, "#e8e4d8");
  for (const side of [-1, 1]) body.box(side * 0.23, 0.62, 0, 0.09, 0.4, 0.11, colors.top);
  body.add(egg(0.12, 0.13, 0.12), 0, 1.16, 0, colors.head);
  body.add(egg(0.125, 0.09, 0.125), 0, 1.22, -0.015, colors.hair);
  const leg = new ColorMerge();
  // A perna pende da bacia: o giro é em volta do topo dela.
  leg.box(0, -0.6, 0, 0.13, 0.54, 0.15, colors.bottom);
  leg.box(0, -0.64, 0.03, 0.13, 0.07, 0.24, colors.shoes);
  return { body: body.build(), leg: leg.build() };
}
