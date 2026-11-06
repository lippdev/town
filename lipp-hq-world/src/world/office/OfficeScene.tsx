import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
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
import { useHQStore } from "@/state/useHQStore";
import { effectiveQuality, type GraphicsQuality } from "@/world/quality";
import { QualityController } from "@/world/scene/QualityController";
import { batchKey, SURFACE_KEYS, type Batch, type PropPlacement, type SurfaceKey } from "./officeKit";
import { BUILDING_ROOMS_BY_ID, viewRoomAt, type BuildingView, type FloorId } from "./officeBuilding";
import { buildDirectorate, buildLobby, buildOperationCore, type FloorBuild } from "./buildingInteriors";
import { ROBOT_URL, loadGltf, loadPart } from "@/avatar/human/humanAssets";
import { loadHumanBase } from "@/avatar/human/HumanFigure";
import { resolveHuman } from "@/avatar/human/preset";
import { DIRECTORATE_SCENERY, DIRECTORATE_SEATS, DIRECTORATE_SIGNS } from "./officeDirectorate";
import { LOBBY_SCENERY, LOBBY_SIGNS, type FloorSignSpec } from "./officeLobby";
import { SceneryHumans } from "./SceneryHumans";
import { buildingSignTexture } from "./buildingFacade";
import { BACK_WALL_CUT, FLOOR_BOUNDS, OFFICE_ROOMS, type OfficeSeat } from "./officeLayout";
import { buildOffice, type OfficeBuild } from "./officeRooms";
import { HumanChairs } from "./HumanChairs";
import { screenAtlas, signAtlas } from "./officeTextures";
import { ChiefScene } from "./ChiefScene";
import { BuildingSurroundings } from "./BuildingScene";
import { OfficeCameraRig } from "./OfficeCameraRig";
import { OfficeHumans } from "./HumanBodies";
import { OfficeRobots } from "./RobotBodies";
import { thinIslands } from "./thinIslands";
import type { OfficeMode } from "./officeRoute";
import { useOfficeStore } from "./officeStore";

const PROP_URL = { planta: "/prototipo/planta.glb", luminaria: "/prototipo/luminaria.glb" } as const;

/** A sombra muda pouco com todos sentados: refazê-la raramente é o maior corte de custo. */
const SHADOW_EVERY = { alta: 20, leve: 60 };

/** A mobília é uma só por modo; não há por que remontar a cada tentativa. Só o prédio tem elevador. */
const built = new Map<OfficeMode, OfficeBuild>();
function officeBuild(): OfficeBuild {
  const { mode } = useOfficeStore.getState();
  let build = built.get(mode);
  if (!build) {
    build = buildOffice({ elevatorOpening: mode === "demo" });
    built.set(mode, build);
  }
  return build;
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
      // A primeira vez é sem animar: quem chega de outro andar encontra a sala já aberta.
      const current = progress.current[room.id] ?? goal;
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
function InstancedProp({ url, placements, quality, floor }: { url: string; placements: PropPlacement[]; quality: GraphicsQuality; floor: FloorId }) {
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

  const inFocus = (item: PropPlacement) => viewRoomAt(floor, item.at[0], item.at[2])?.id === focusedRoomId;
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

function RoomGlow() {
  const hoveredRoomId = useOfficeStore((state) => state.hoveredRoomId);
  const focusedRoomId = useOfficeStore((state) => state.focusedRoomId);
  const room = hoveredRoomId && hoveredRoomId !== focusedRoomId ? BUILDING_ROOMS_BY_ID[hoveredRoomId] : null;
  if (!room) return null;
  const { minX, maxX, minZ, maxZ } = room.bounds;
  return (
    <mesh position={[room.center.x, 0.06, room.center.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[maxX - minX, maxZ - minZ]} />
      <meshBasicMaterial color={room.color} transparent opacity={0.16} depthWrite={false} toneMapped={false} />
    </mesh>
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

/** No mesmo quadro da troca: o andar que acabou de entrar não pode herdar a sombra do anterior. */
function ShadowRefresh({ view }: { view: BuildingView }) {
  const gl = useThree((state) => state.gl);
  useLayoutEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, view]);
  return null;
}

/**
 * Deixa pronto o que os andares fora de tela vão pedir: na hora da troca, nada espera a rede nem
 * monta a mobília. Andar fora de tela continua desmontado; só os arquivos e as malhas ficam à mão.
 */
function PrepareBuilding() {
  useEffect(() => {
    buildLobby();
    buildDirectorate();
    buildOperationCore();
    void loadGltf(ROBOT_URL).catch(() => undefined);
    void loadHumanBase().catch(() => undefined);
    useGLTF.preload(PROP_URL.planta);
    useGLTF.preload(PROP_URL.luminaria);
    const presets = [...useOfficeStore.getState().humans.map((human) => human.preset), ...LOBBY_SCENERY.map((person) => person.preset), ...DIRECTORATE_SCENERY.map((person) => person.preset)];
    for (const preset of presets) for (const part of resolveHuman(preset).parts) void loadPart(part.file).catch(() => undefined);
  }, []);
  return null;
}

/** Plantas e luminárias de um andar: sem cena, a falha delas não derruba nada. */
function FloorProps({ floor, props, quality }: { floor: FloorId; props: PropPlacement[]; quality: GraphicsQuality }) {
  const plants = useMemo(() => props.filter((item) => item.kind === "planta"), [props]);
  const lamps = useMemo(() => props.filter((item) => item.kind === "luminaria"), [props]);
  return (
    <PartBoundary onError={(message) => console.warn("[escritório] planta/luminária fora da cena:", message)}>
      <Suspense fallback={null}>
        {plants.length > 0 && <InstancedProp url={PROP_URL.planta} placements={plants} quality={quality} floor={floor} />}
        {lamps.length > 0 && <InstancedProp url={PROP_URL.luminaria} placements={lamps} quality={quality} floor={floor} />}
      </Suspense>
    </PartBoundary>
  );
}

const FLOOR_SHADOW = { scale: [FLOOR_BOUNDS.maxX * 2 + 3, FLOOR_BOUNDS.maxZ * 2 + 3] as [number, number], opacity: 0.36, blur: 2.4, far: 3.5, resolution: 1024, frames: 1 };

function FloorSign({ spec }: { spec: FloorSignSpec }) {
  const texture = useMemo(() => buildingSignTexture(spec.text), [spec.text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[spec.at[0], spec.at[1], spec.at[2]]} rotation={[0, spec.rotationY ?? 0, 0]} name={`placa-${spec.text}`}>
      <planeGeometry args={[spec.width, spec.height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

/** Andar feito só de peças do kit: sem as paredes que sobem nem as cadeiras do hall. */
function KitFloor({ floor, build, signs, seats, quality, materials }: { floor: FloorId; build: FloorBuild; signs: readonly FloorSignSpec[]; seats?: readonly OfficeSeat[]; quality: GraphicsQuality; materials: Record<SurfaceKey, Material> }) {
  return (
    <>
      <group name={`andar-${floor}`}>
        <BatchMeshes batch={build.fixed} materials={materials} />
      </group>
      {seats && <HumanChairs material={materials.matte} seats={seats} />}
      {signs.map((spec) => <FloorSign key={spec.text} spec={spec} />)}
      <FloorProps floor={floor} props={build.props} quality={quality} />
    </>
  );
}

/** O escritório dos bots: o andar da Operação. */
function OperacaoFloor({ quality, materials }: { quality: GraphicsQuality; materials: Record<SurfaceKey, Material> }) {
  const build = officeBuild();
  return (
    <>
      <group name="office-fixed">
        <BatchMeshes batch={build.fixed} materials={materials} />
      </group>
      <HumanChairs material={materials.matte} />
      <RaisedWalls build={build} materials={materials} />
      <FloorProps floor="operacao" props={build.props} quality={quality} />
    </>
  );
}

/** Materiais ficam; o andar é o único pedaço do prédio com móveis, e só ele está montado. */
function OfficeWorld({ quality }: { quality: GraphicsQuality }) {
  const materials = useOfficeMaterials();
  const view = useOfficeStore((state) => state.buildingView);
  const mode = useOfficeStore((state) => state.mode);
  return (
    <>
      <ShadowRefresh view={view} />
      {view === "operacao" && <OperacaoFloor quality={quality} materials={materials} />}
      {view === "operacao" && mode === "demo" && <BatchMeshes batch={buildOperationCore().fixed} materials={materials} />}
      {view === "diretoria" && <KitFloor floor="diretoria" build={buildDirectorate()} signs={DIRECTORATE_SIGNS} seats={DIRECTORATE_SEATS} quality={quality} materials={materials} />}
      {view === "terreo" && <KitFloor floor="terreo" build={buildLobby()} signs={LOBBY_SIGNS} quality={quality} materials={materials} />}
      {/* Um único par de render targets: remontar ContactShadows por andar vaza GPU no drei. */}
      <group visible={view !== "exterior"}>
        <ContactShadows position={[0, 0.012, 0]} {...FLOOR_SHADOW} frames={view === "exterior" ? 0 : 1} />
      </group>
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
  const mode = useOfficeStore((state) => state.mode);
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
        <OfficeRobots world={officeBuild()} />
      </PartBoundary>
      <PartBoundary onError={(message) => useOfficeStore.getState().setHumansError(message)}>
        <OfficeHumans />
      </PartBoundary>
      {mode === "demo" && (
        <PartBoundary onError={() => undefined}>
          <PrepareBuilding />
          <BuildingSurroundings />
          <SceneryHumans />
          <ChiefScene />
        </PartBoundary>
      )}
      <RoomGlow />
    </>
  );
}
