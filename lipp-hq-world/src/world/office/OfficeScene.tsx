import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, SoftShadows, useGLTF, useTexture } from "@react-three/drei";
import type {
  Group,
  InstancedMesh,
  Mesh} from "three";
import {
  BufferAttribute,
  BufferGeometry,
  Euler,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Box3,
  type Material,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { findBaseProblems } from "@/character-studio/viewport/figureRig";
import { useHQStore } from "@/state/useHQStore";
import { effectiveQuality, type GraphicsQuality } from "@/world/quality";
import { QualityController } from "@/world/scene/QualityController";
import { batchKey, SURFACE_KEYS, type Batch, type PropPlacement, type SurfaceKey } from "./officeKit";
import { BACK_WALL_CUT, DESK_REACH, FLOOR_BOUNDS, OFFICE_ROOMS, OFFICE_ROOMS_BY_ID, OFFICE_SEATS_BY_ID, roomAt, type OfficeSeat } from "./officeLayout";
import { DESK_TOP, FIGURE_SCALE, buildOffice, type OfficeBuild } from "./officeRooms";
import type { OfficeBot } from "./officeRoster";
import { screenAtlas, signAtlas } from "./officeTextures";
import { OfficeCameraRig } from "./OfficeCameraRig";
import { SeatedFigure } from "./seatedFigure";
import { thinIslands } from "./thinIslands";
import { useOfficeStore } from "./officeStore";
import { useVisitStore, visitPose } from "./officeVisit";

export const FIGURE_URL = "/prototipo/pulse.glb";
const PROP_URL = { planta: "/prototipo/planta.glb", luminaria: "/prototipo/luminaria.glb" } as const;

/** A sombra muda pouco com todos sentados: refazê-la raramente é o maior corte de custo. */
const SHADOW_EVERY = { alta: 20, leve: 60 };

/** A mobília é uma só por página; não há por que remontar a cada tentativa. */
let built: OfficeBuild | null = null;
function officeBuild(): OfficeBuild {
  built ??= buildOffice();
  return built;
}

function useReducedMotion() {
  return useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches).current;
}

function pbrSet(name: string, withColor: boolean) {
  const urls = [`/prototipo/${name}_nor_gl_1k.jpg`, `/prototipo/${name}_arm_1k.jpg`];
  return withColor ? [`/prototipo/${name}_diff_1k.jpg`, ...urls] : urls;
}

const ALL_TEXTURES = [...pbrSet("wood_floor", true), ...pbrSet("floor_tiles_04", true), ...pbrSet("fabric_pattern_07", false)];

/** Materiais do andar: cada textura carrega uma vez e é dividida por todas as peças. */
function useOfficeMaterials(): Record<SurfaceKey, Material> {
  const textures = useTexture(ALL_TEXTURES) as Texture[];
  const materials = useMemo(() => {
    const prepared = textures.map((texture, index) => {
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.anisotropy = 4;
      if (ALL_TEXTURES[index]!.includes("_diff_")) texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    });
    const [woodMap, woodNormal, woodArm, stoneMap, stoneNormal, stoneArm, fabricNormal, fabricArm] = prepared;
    const screens = screenAtlas();
    const signs = signAtlas();
    return {
      wood: new MeshStandardMaterial({ map: woodMap!, normalMap: woodNormal!, roughnessMap: woodArm!, aoMap: woodArm!, roughness: 1, metalness: 0, vertexColors: true }),
      stone: new MeshStandardMaterial({ map: stoneMap!, normalMap: stoneNormal!, roughnessMap: stoneArm!, aoMap: stoneArm!, roughness: 1, metalness: 0, vertexColors: true }),
      fabric: new MeshStandardMaterial({ normalMap: fabricNormal!, roughnessMap: fabricArm!, aoMap: fabricArm!, roughness: 1, metalness: 0, normalScale: new Vector2(0.18, 0.18), vertexColors: true }),
      matte: new MeshStandardMaterial({ roughness: 0.75, vertexColors: true }),
      glass: new MeshStandardMaterial({ metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.12, depthWrite: false, side: 2, vertexColors: true }),
      screen: new MeshStandardMaterial({ map: screens, emissiveMap: screens, emissive: "#ffffff", emissiveIntensity: 0.5, roughness: 0.3 }),
      sign: new MeshStandardMaterial({ map: signs, roughness: 0.8 }),
      glow: new MeshBasicMaterial({ vertexColors: true }),
    } satisfies Record<SurfaceKey, Material>;
  }, [textures]);
  useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose();
    },
    [materials],
  );
  return materials;
}

function BatchMeshes({ batch, materials }: { batch: Batch; materials: Record<SurfaceKey, Material> }) {
  return (
    <>
      {SURFACE_KEYS.flatMap((surface) =>
        [true, false].map((cast) => {
          const geometry = batch.get(batchKey(surface, cast));
          if (!geometry) return null;
          const receives = surface !== "glass" && surface !== "glow";
          return <mesh key={batchKey(surface, cast)} geometry={geometry} material={materials[surface]} castShadow={cast} receiveShadow={receives} />;
        }),
      )}
    </>
  );
}

/**
 * Parte alta das paredes internas da sala em foco. Sobe a partir do corte, e só existe
 * enquanto há o que mostrar: sem foco, nenhuma chamada de desenho a mais.
 */
function RaisedWalls({ build, materials }: { build: OfficeBuild; materials: Record<SurfaceKey, Material> }) {
  const groups = useRef<Record<string, Group | null>>({});
  const progress = useRef<Record<string, number>>({});
  const reduced = useReducedMotion();
  useFrame((_, delta) => {
    const focused = useOfficeStore.getState().focusedRoomId;
    for (const room of OFFICE_ROOMS) {
      const group = groups.current[room.id];
      if (!group) continue;
      const goal = room.id === focused ? 1 : 0;
      const current = progress.current[room.id] ?? 0;
      const next = reduced ? goal : current + Math.sign(goal - current) * Math.min(Math.abs(goal - current), delta * 3.2);
      progress.current[room.id] = next;
      group.visible = next > 0.001;
      group.scale.y = Math.max(0.001, next * next * (3 - 2 * next));
    }
  });
  return (
    <>
      {OFFICE_ROOMS.map((room) => (
        <group key={room.id} position={[0, BACK_WALL_CUT, 0]} visible={false} ref={(node) => { groups.current[room.id] = node; }}>
          <group position={[0, -BACK_WALL_CUT, 0]}>
            <BatchMeshes batch={build.raised[room.id]!} materials={materials} />
          </group>
        </group>
      ))}
    </>
  );
}

/** Fração das ilhas menores que fica fora da sala em foco. */
const LOD_KEEP: Record<GraphicsQuality, number> = { alta: 0.22, leve: 0.08 };
/** Só a primitiva realmente cara (o vaso com a terra) ganha versão reduzida. */
const LOD_MIN_TRIANGLES = 30000;

function reducedGeometry(source: BufferGeometry, keep: number) {
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(new BufferAttribute(thinIslands(source.index!, source.attributes.position!, keep), 1));
  geometry.boundingSphere = source.boundingSphere;
  return geometry;
}

const instanceMatrix = new Matrix4();
const placement = new Matrix4();
const rotation = new Quaternion();
const euler = new Euler();
const unit = new Vector3(1, 1, 1);

/**
 * GLBs caros (a planta tem 69 mil triângulos) entram por instância e dividem a mesma
 * geometria. Fora da sala em foco, a planta usa a versão sem a maior parte da terra.
 */
function InstancedProp({ url, placements, quality }: { url: string; placements: PropPlacement[]; quality: GraphicsQuality }) {
  const { scene } = useGLTF(url);
  const focusedRoomId = useOfficeStore((state) => state.focusedRoomId);
  const { parts, center, minY, baseWidth } = useMemo(() => {
    scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(scene);
    const meshes: Array<{ geometry: BufferGeometry; material: Material; matrix: Matrix4 }> = [];
    scene.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh) meshes.push({ geometry: mesh.geometry, material: mesh.material as Material, matrix: mesh.matrixWorld.clone() });
    });
    return { parts: meshes, center: bounds.getCenter(new Vector3()), minY: bounds.min.y, baseWidth: bounds.getSize(new Vector3()).x };
  }, [scene]);

  const inFocus = (item: PropPlacement) => roomAt(item.at[0], item.at[2])?.id === focusedRoomId;
  const near = placements.filter(inFocus);
  const far = placements.filter((item) => !inFocus(item));

  const lods = useMemo(
    () => parts.map((part) => {
      const triangles = (part.geometry.index?.count ?? 0) / 3;
      return triangles > LOD_MIN_TRIANGLES ? reducedGeometry(part.geometry, LOD_KEEP[quality]) : part.geometry;
    }),
    [parts, quality],
  );
  useEffect(() => () => {
    lods.forEach((geometry, index) => {
      if (geometry !== parts[index]!.geometry) geometry.dispose();
    });
  }, [lods, parts]);

  const fill = (mesh: InstancedMesh | null, items: PropPlacement[], local: Matrix4) => {
    if (!mesh) return;
    items.forEach((item, index) => {
      const scale = item.width / baseWidth;
      rotation.setFromEuler(euler.set(0, item.yaw, 0));
      placement.compose(new Vector3(item.at[0], item.at[1], item.at[2]), rotation, unit.clone().multiplyScalar(scale));
      instanceMatrix.copy(placement).multiply(new Matrix4().makeTranslation(-center.x, -minY, -center.z)).multiply(local);
      mesh.setMatrixAt(index, instanceMatrix);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
  };

  return (
    <>
      {parts.map((part, index) => (
        <group key={part.geometry.uuid}>
          <instancedMesh
            key={`far-${placements.length}`}
            args={[lods[index]!, part.material, placements.length]}
            castShadow
            receiveShadow
            ref={(mesh) => fill(mesh, far, part.matrix)}
          />
          <instancedMesh
            key={`near-${placements.length}`}
            args={[part.geometry, part.material, placements.length]}
            castShadow
            receiveShadow
            visible={near.length > 0}
            ref={(mesh) => fill(mesh, near, part.matrix)}
          />
        </group>
      ))}
    </>
  );
}

function Lighting({ quality }: { quality: GraphicsQuality }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const generator = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = generator.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.45;
    return () => {
      scene.environment = null;
      target.dispose();
      room.dispose();
      generator.dispose();
    };
  }, [gl, scene]);
  const span = Math.max(FLOOR_BOUNDS.maxX, FLOOR_BOUNDS.maxZ) + 5;
  return (
    <>
      {/* Penumbra suave só na qualidade alta: o sombreador é o que mais pesa por pixel. */}
      {quality === "alta" && <SoftShadows size={7} samples={6} focus={0.5} />}
      <color attach="background" args={["#111828"]} />
      <hemisphereLight args={["#cad9f5", "#5a4131", 0.55]} />
      {/* Um sol e um preenchimento para o andar inteiro; nenhuma luz por sala. */}
      <directionalLight
        key={quality}
        position={[9.6, 15, -15]}
        intensity={3.3}
        color="#ffd5a0"
        castShadow
        shadow-mapSize={quality === "alta" ? [4096, 4096] : [2048, 2048]}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={1}
        shadow-camera-far={50}
        shadow-normalBias={0.02}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[3, 18, 24]} intensity={0.8} color="#bccff2" />
    </>
  );
}

function SeatMarker() {
  const marker = useRef<Mesh>(null);
  useFrame(() => {
    const id = useHQStore.getState().selectedBotId ?? useOfficeStore.getState().hoveredBotId;
    const seat = id ? OFFICE_SEATS_BY_ID[useOfficeStore.getState().seating.seats[id] ?? ""] : undefined;
    const pose = id && useOfficeStore.getState().mode === "demo" ? visitPose(id) : null;
    if (marker.current && seat) marker.current.position.set(pose?.x ?? seat.x, 0.07, pose?.z ?? seat.z);
  });
  const selectedBotId = useHQStore((state) => state.selectedBotId);
  const hoveredBotId = useOfficeStore((state) => state.hoveredBotId);
  const seating = useOfficeStore((state) => state.seating);
  const bots = useOfficeStore((state) => state.bots);
  const id = selectedBotId ?? hoveredBotId;
  const seat = id ? OFFICE_SEATS_BY_ID[seating.seats[id] ?? ""] : undefined;
  const bot = bots.find((candidate) => candidate.id === id);
  if (!seat || !bot) return null;
  const selected = selectedBotId === id;
  return (
    <mesh ref={marker} position={[seat.x, 0.07, seat.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <ringGeometry args={[0.5, selected ? 0.62 : 0.56, 48]} />
      <meshBasicMaterial color={bot.color} transparent opacity={selected ? 0.95 : 0.55} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function RoomGlow() {
  const hoveredRoomId = useOfficeStore((state) => state.hoveredRoomId);
  const focusedRoomId = useOfficeStore((state) => state.focusedRoomId);
  const room = hoveredRoomId && hoveredRoomId !== focusedRoomId ? OFFICE_ROOMS_BY_ID[hoveredRoomId] : null;
  if (!room) return null;
  const { minX, maxX, minZ, maxZ } = room.bounds;
  return (
    <mesh position={[room.center.x, 0.06, room.center.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[maxX - minX, maxZ - minZ]} />
      <meshBasicMaterial color={room.color} transparent opacity={0.16} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Registro para o QA ler as figuras reais. */
export const seatedFigures = new Map<string, SeatedFigure>();

function OfficeFigure({ bot, seat }: { bot: OfficeBot; seat: OfficeSeat }) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF(FIGURE_URL);
  const [figure, setFigure] = useState<SeatedFigure | null>(null);
  const specKey = JSON.stringify(bot.spec);
  const phase = useMemo(() => [...bot.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.73, [bot.id]);
  const reduced = useReducedMotion();
  useEffect(() => {
    const problems = findBaseProblems(scene, animations);
    if (problems.length > 0) {
      useOfficeStore.getState().setFiguresError(`O modelo não tem ${problems.join(", ")}.`);
      return;
    }
    const spec = JSON.parse(specKey) as OfficeBot["spec"];
    const next = new SeatedFigure(scene, animations, spec, {
      handY: (DESK_TOP + 0.035) / FIGURE_SCALE,
      handZ: (DESK_REACH + 0.06) / FIGURE_SCALE,
      phase,
    });
    seatedFigures.set(bot.id, next);
    setFigure(next);
    return () => {
      seatedFigures.delete(bot.id);
      next.dispose();
      setFigure(null);
    };
  }, [scene, animations, specKey, phase, bot.id]);
  useFrame(({ clock }) => {
    const pose = useOfficeStore.getState().mode === "demo" ? visitPose(bot.id) : null;
    if (pose) {
      group.current?.position.set(pose.x, 0, pose.z);
      if (group.current) group.current.rotation.y = pose.yaw;
      figure?.perform(pose.standing, pose.walk, pose.talk, useVisitStore.getState().time, reduced, pose);
    } else {
      group.current?.position.set(seat.x, 0, seat.z);
      if (group.current) group.current.rotation.y = seat.yaw;
      figure?.perform(0, 0, 0, 0, true);
      if (!reduced) figure?.sway(clock.elapsedTime);
    }
  });
  if (!figure) return null;
  return (
    <group ref={group} position={[seat.x, 0, seat.z]} rotation={[0, seat.yaw, 0]} scale={FIGURE_SCALE} name={`bot-${bot.id}`} userData={{ botId: bot.id }}>
      <primitive object={figure.root} />
    </group>
  );
}

function OfficeFigures() {
  useFrame((_, delta) => {
    if (useOfficeStore.getState().mode === "demo" && !document.hidden && seatedFigures.has("pulse") && seatedFigures.has("scout")) useVisitStore.getState().advance(delta);
  }, -1);
  const bots = useOfficeStore((state) => state.bots);
  const seating = useOfficeStore((state) => state.seating);
  useEffect(() => {
    useOfficeStore.getState().setFiguresError(null);
  }, []);
  return (
    <>
      {bots.map((bot) => {
        const seat = OFFICE_SEATS_BY_ID[seating.seats[bot.id] ?? ""];
        return seat ? <OfficeFigure key={bot.id} bot={bot} seat={seat} /> : null;
      })}
    </>
  );
}

/** Falha de um pedaço opcional não derruba o resto da cena. */
class PartBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error));
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function SceneReady() {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    useOfficeStore.getState().setLoad("ready");
    const canvas = gl.domElement;
    const onLost = (event: Event) => {
      event.preventDefault();
      useOfficeStore.getState().setLoad("failed", "A placa de vídeo descartou a cena (contexto WebGL perdido).");
    };
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [gl]);
  return null;
}

function LoadWatch() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (useOfficeStore.getState().load === "loading") useOfficeStore.getState().setLoad("stalled");
    }, 20000);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}

function OfficeWorld({ quality }: { quality: GraphicsQuality }) {
  const materials = useOfficeMaterials();
  const build = officeBuild();
  const plants = useMemo(() => build.props.filter((item) => item.kind === "planta"), [build]);
  const lamps = useMemo(() => build.props.filter((item) => item.kind === "luminaria"), [build]);
  return (
    <>
      <group name="office-fixed">
        <BatchMeshes batch={build.fixed} materials={materials} />
      </group>
      <RaisedWalls build={build} materials={materials} />
      <PartBoundary onError={(message) => console.warn("[escritório] planta/luminária fora da cena:", message)}>
        <Suspense fallback={null}>
          <InstancedProp url={PROP_URL.planta} placements={plants} quality={quality} />
          <InstancedProp url={PROP_URL.luminaria} placements={lamps} quality={quality} />
        </Suspense>
      </PartBoundary>
      <ContactShadows position={[0, 0.012, 0]} scale={[FLOOR_BOUNDS.maxX * 2 + 3, FLOOR_BOUNDS.maxZ * 2 + 3]} opacity={0.36} blur={2.4} far={3.5} resolution={1024} frames={1} />
      <SceneReady />
    </>
  );
}

/** Sem os materiais não há andar: a interface segue de pé e explica o que faltou. */
function reportWorldFailure(message: string) {
  const file = /\/prototipo\/[^\s:]+/.exec(message)?.[0];
  useOfficeStore.getState().setLoad("failed", file ? `Não consegui baixar ${file}.` : message);
}

/** Tudo o que a cena desenha. */
export function OfficeScene({ stage }: { stage: HTMLElement }) {
  const quality = useHQStore((state) => effectiveQuality(state.graphicsMode, state.autoQuality));
  return (
    <>
      <OfficeCameraRig stage={stage} />
      <Lighting quality={quality} />
      <QualityController shadowEvery={SHADOW_EVERY} />
      <PartBoundary onError={reportWorldFailure}>
        <Suspense fallback={<LoadWatch />}>
          <OfficeWorld quality={quality} />
        </Suspense>
      </PartBoundary>
      <PartBoundary onError={(message) => useOfficeStore.getState().setFiguresError(message)}>
        <Suspense fallback={null}>
          <OfficeFigures />
        </Suspense>
      </PartBoundary>
      <SeatMarker />
      <RoomGlow />
    </>
  );
}
