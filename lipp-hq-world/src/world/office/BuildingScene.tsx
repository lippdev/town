import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import { Plane, Vector3, type Group, type Mesh, type MeshStandardMaterial } from "three";
import { BUILDING_HEIGHT, CROWN_STEPS, FACADE_BOUNDS, STORY, viewElevation, visibleLevels, type FloorId } from "./officeBuilding";
import { buildFacade, buildingSignTexture } from "./buildingFacade";
import { OfficeCity } from "./CityScene";
import { TOWER_TOP, sectionAt } from "./floorTravel";
import { officeRuntime, travelSinks, useOfficeStore } from "./officeStore";

const CUT_SINK = 0.05;
const PLATE_DEPTH = 0.3;

/** O conteúdo de um andar: fica em y = 0 e só aparece quando é ele o andar à mostra. */
export function FloorGroup({ floor, children }: { floor: FloorId; children: ReactNode }) {
  const group = useRef<Group>(null);
  useLayoutEffect(() => {
    const node = group.current!;
    node.visible = officeRuntime.travel.shown === floor;
    travelSinks.floors.set(node, floor);
    return () => {
      travelSinks.floors.delete(node);
    };
  }, [floor]);
  return <group ref={group}>{children}</group>;
}

/** O que pertence à rua: desce com a cidade quando a âncora é um andar alto. */
export function GroundGroup({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null);
  useLayoutEffect(() => {
    const node = group.current!;
    node.position.y = -officeRuntime.travel.root;
    travelSinks.ground.add(node);
    return () => {
      travelSinks.ground.delete(node);
    };
  }, []);
  return (
    <group ref={group} name="entorno-do-predio">
      {children}
    </group>
  );
}

/** Pavimento apontado no prédio fechado: uma faixa de luz em volta dele. */
function LevelBand({ level }: { level: number }) {
  const { minX, maxX, minZ, maxZ } = FACADE_BOUNDS;
  return (
    <mesh position={[(minX + maxX) / 2, (level + 0.5) * STORY, (minZ + maxZ) / 2]} renderOrder={2} name="pavimento-apontado">
      <boxGeometry args={[maxX - minX + 0.6, STORY - 0.1, maxZ - minZ + 0.6]} />
      <meshBasicMaterial color="#ffd9a0" transparent opacity={0.28} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function Facade() {
  const hoveredLevel = useOfficeStore((state) => state.hoveredLevel);
  const closed = useOfficeStore((state) => state.buildingView === "exterior" && !state.traveling);
  const gl = useThree((state) => state.gl);
  const build = useMemo(buildFacade, []);
  const sign = useMemo(buildingSignTexture, []);
  const clip = useMemo(() => [new Plane(new Vector3(0, -1, 0), 1000)], []);
  const holder = useRef<Group>(null);
  const plate = useRef<Mesh>(null);
  const plateMaterial = useRef<MeshStandardMaterial>(null);
  useEffect(
    () => () => {
      build.body.dispose();
      build.lit.dispose();
      sign.dispose();
    },
    [build, sign],
  );
  useLayoutEffect(() => {
    // Só as peças da fachada usam o plano: o sombreador dos andares não muda.
    gl.localClippingEnabled = true;
    let drawn = NaN;
    const apply = () => {
      const { cut, root, flight, plate: opacity, shown } = officeRuntime.travel;
      const levels = flight || shown === null ? Infinity : visibleLevels(shown);
      if (levels !== drawn) {
        drawn = levels;
        // Parado, só o que está abaixo do corte vai para a placa de vídeo; na viagem, a torre toda.
        build.body.setDrawRange(0, levels === Infinity ? Infinity : (build.bodyEnds[levels - 1] ?? 0));
        build.lit.setDrawRange(0, levels === Infinity ? Infinity : (build.litEnds[levels - 1] ?? 0));
      }
      const whole = cut >= TOWER_TOP;
      const sink = whole ? 0 : CUT_SINK;
      // No corte, o topo da torre fica dentro da laje: no mesmo plano do piso, os dois piscariam.
      if (holder.current) holder.current.position.y = -sink;
      clip[0]!.constant = whole ? 1000 : cut - root - sink + 0.001;
      const section = flight ? sectionAt(cut) : null;
      if (!plate.current || !plateMaterial.current) return;
      plate.current.visible = section !== null && opacity > 0.01;
      if (!section) return;
      plate.current.position.set((section.minX + section.maxX) / 2, cut - root - sink + 0.005 - PLATE_DEPTH / 2, (section.minZ + section.maxZ) / 2);
      plate.current.scale.set(section.maxX - section.minX, PLATE_DEPTH, section.maxZ - section.minZ);
      plateMaterial.current.opacity = opacity;
      plateMaterial.current.depthWrite = opacity > 0.99;
    };
    apply();
    travelSinks.listeners.add(apply);
    return () => {
      travelSinks.listeners.delete(apply);
    };
  }, [build, clip, gl]);
  const { minX, maxZ, maxX } = FACADE_BOUNDS;
  return (
    <>
      <group ref={holder}>
        <mesh geometry={build.body} name="fachada">
          <meshStandardMaterial vertexColors roughness={0.85} clippingPlanes={clip} />
        </mesh>
        <mesh geometry={build.lit} name="fachada-acesa">
          <meshBasicMaterial vertexColors clippingPlanes={clip} />
        </mesh>
      </group>
      <mesh ref={plate} visible={false} name="laje-do-corte">
        <boxGeometry />
        <meshStandardMaterial ref={plateMaterial} color="#31353c" roughness={0.9} transparent />
      </mesh>
      <mesh position={[(minX + maxX) / 2, BUILDING_HEIGHT + 1.85, maxZ - CROWN_STEPS[0]!.inset + 0.2]} name="placa-do-predio">
        <planeGeometry args={[11.4, 1.9]} />
        <meshBasicMaterial map={sign} toneMapped={false} clippingPlanes={clip} />
      </mesh>
      {closed && hoveredLevel !== null && <LevelBand level={hoveredLevel} />}
    </>
  );
}

/**
 * Tudo fora do andar em tela: a cidade e a fachada descem juntas, e o andar fica em y = 0.
 * Nada aqui clica nem projeta sombra; a cidade só recebe a do andar quando está colada nele.
 * A fachada inteira fica montada: o plano de corte decide até onde ela vai.
 */
export function BuildingSurroundings() {
  // A rua só vale a pena de perto. A sombra do andar só cai nela com o chão colado.
  // Na viagem os pedestres ficam: sumiriam da calçada à vista logo no primeiro quadro.
  const elevated = useOfficeStore((state) => !state.traveling && viewElevation(state.buildingView) > STORY);
  return (
    <GroundGroup>
      <OfficeCity elevated={elevated} />
      <Facade />
    </GroundGroup>
  );
}
