import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import { useAboveCutClip } from "./BuildingScene";
import { BUILDING_HEIGHT, HELIPAD } from "./officeBuilding";
import { ROTOR_HEIGHT, TAIL_ROTOR, buildDeckFigure, buildHelicopter } from "./helicopter";
import { helipadRuntime } from "./officeHelipad";
import { officeRuntime } from "./officeStore";

/** Rotor cheio, em radianos por segundo. */
const ROTOR_SPEED = 34;
const TAIL_FACTOR = 2.3;
const STROBE_EVERY = 1.1;
const STROBE_ON = 0.09;
/** Até esta altura do deque a sombra de contato vale: acima dela, o helicóptero já não pesa ali. */
const GROUND_EFFECT = 12;
const HIP = 0.62;

/**
 * O helicóptero, a sombra de contato no deque e o chefe andando nele: nada é luz nem textura, e só
 * é montado enquanto há helicóptero em cena. Tudo fica acima da torre: com o corte aberto, o grupo
 * sai do desenho e o roteiro segue pelo relógio.
 */
export function HelipadScene() {
  const clip = useAboveCutClip();
  const build = useMemo(buildHelicopter, []);
  const figure = useMemo(buildDeckFigure, []);
  useEffect(
    () => () => {
      for (const geometry of [build.body, build.rotor, build.blur, build.tail, build.lamps, build.strobe, figure.body, figure.leg]) geometry.dispose();
    },
    [build, figure],
  );
  const root = useRef<Group>(null);
  const aircraft = useRef<Group>(null);
  const rotor = useRef<Mesh>(null);
  const tail = useRef<Mesh>(null);
  const blur = useRef<Mesh>(null);
  const blurMaterial = useRef<MeshBasicMaterial>(null);
  const lamps = useRef<Mesh>(null);
  const strobe = useRef<Mesh>(null);
  const contact = useRef<Mesh>(null);
  const contactMaterial = useRef<MeshBasicMaterial>(null);
  const person = useRef<Group>(null);
  const leftLeg = useRef<Mesh>(null);
  const rightLeg = useRef<Mesh>(null);
  const spin = useRef({ angle: 0, clock: 0 });

  useFrame((_, delta) => {
    if (!root.current || !aircraft.current || !rotor.current || !tail.current || !blur.current || !blurMaterial.current || !lamps.current || !strobe.current || !contact.current || !contactMaterial.current || !person.current || !leftLeg.current || !rightLeg.current) return;
    const { helicopter, rotor: power, figure: walker } = helipadRuntime;
    // Abaixo do topo da torre nada daqui aparece: o corte tira do desenho e não custa chamada.
    root.current.visible = helicopter !== null && officeRuntime.travel.cut > BUILDING_HEIGHT;
    if (!root.current.visible || !helicopter) return;
    aircraft.current.position.set(helicopter.x, helicopter.y, helicopter.z);
    aircraft.current.rotation.set(helicopter.pitch, helicopter.yaw, helicopter.roll, "YXZ");
    const step = Math.min(delta, 0.1);
    spin.current.angle += power * ROTOR_SPEED * step;
    spin.current.clock += step;
    rotor.current.rotation.y = spin.current.angle;
    tail.current.rotation.x = spin.current.angle * TAIL_FACTOR;
    // Com o rotor cheio as pás viram um disco: é o borrão que vende a velocidade, sem nenhuma luz.
    const blurred = Math.max(0, (power - 0.25) / 0.75);
    blur.current.visible = blurred > 0.01;
    blurMaterial.current.opacity = blurred * 0.15;
    const running = power > 0.05;
    lamps.current.visible = running;
    strobe.current.visible = running && spin.current.clock % STROBE_EVERY < STROBE_ON;
    const altitude = helicopter.y - HELIPAD.top;
    const close = altitude < GROUND_EFFECT && Math.hypot(helicopter.x - HELIPAD.x, helicopter.z - HELIPAD.z) < 6;
    contact.current.visible = close;
    if (close) {
      contactMaterial.current.opacity = 0.2 * (1 - altitude / GROUND_EFFECT);
      contact.current.scale.setScalar(1 + altitude * 0.05);
      contact.current.rotation.z = helicopter.yaw;
    }
    person.current.visible = walker !== null;
    if (walker) {
      person.current.position.set(walker.x, HELIPAD.top, walker.z);
      person.current.rotation.y = walker.yaw;
      const swing = Math.sin(walker.stride * 5.4) * 0.5;
      leftLeg.current.rotation.x = swing;
      rightLeg.current.rotation.x = -swing;
    }
  });

  return (
    <group ref={root} visible={false} name="heliporto-em-cena" raycast={() => null}>
      <group ref={aircraft} name="helicoptero">
        <mesh geometry={build.body} name="helicoptero-corpo">
          <meshStandardMaterial vertexColors roughness={0.42} metalness={0.35} clippingPlanes={clip} />
        </mesh>
        <mesh ref={rotor} geometry={build.rotor} position={[0, ROTOR_HEIGHT, -0.1]} name="helicoptero-rotor">
          <meshStandardMaterial vertexColors roughness={0.6} clippingPlanes={clip} />
        </mesh>
        <mesh ref={blur} geometry={build.blur} position={[0, ROTOR_HEIGHT, -0.1]} visible={false} renderOrder={3} name="helicoptero-disco">
          <meshBasicMaterial ref={blurMaterial} color="#c8d0dc" transparent opacity={0} depthWrite={false} clippingPlanes={clip} />
        </mesh>
        <mesh ref={tail} geometry={build.tail} position={[TAIL_ROTOR.x, TAIL_ROTOR.y, TAIL_ROTOR.z]} name="helicoptero-rotor-de-cauda">
          <meshStandardMaterial vertexColors roughness={0.6} clippingPlanes={clip} />
        </mesh>
        <mesh ref={lamps} geometry={build.lamps} visible={false} name="helicoptero-luzes">
          <meshBasicMaterial vertexColors clippingPlanes={clip} />
        </mesh>
        <mesh ref={strobe} geometry={build.strobe} visible={false} name="helicoptero-pisca">
          <meshBasicMaterial vertexColors clippingPlanes={clip} />
        </mesh>
      </group>
      <mesh ref={contact} position={[HELIPAD.x, HELIPAD.top + 0.03, HELIPAD.z]} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={1} name="helicoptero-sombra">
        <circleGeometry args={[2.3, 24]} />
        <meshBasicMaterial ref={contactMaterial} color="#000000" transparent opacity={0} depthWrite={false} clippingPlanes={clip} />
      </mesh>
      <group ref={person} visible={false} name="chefe-no-deque">
        <mesh geometry={figure.body}>
          <meshStandardMaterial vertexColors roughness={0.7} clippingPlanes={clip} />
        </mesh>
        <mesh ref={leftLeg} geometry={figure.leg} position={[-0.1, HIP, 0]}>
          <meshStandardMaterial vertexColors roughness={0.7} clippingPlanes={clip} />
        </mesh>
        <mesh ref={rightLeg} geometry={figure.leg} position={[0.1, HIP, 0]}>
          <meshStandardMaterial vertexColors roughness={0.7} clippingPlanes={clip} />
        </mesh>
      </group>
    </group>
  );
}
