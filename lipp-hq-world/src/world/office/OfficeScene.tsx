import { Component, Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CITY_AIR, CITY_LIT_MIN } from "./cityHaze";
import { idleSequence } from "./idleQueue";
import { shouldStall } from "./loadWatch";
import { useLoadProgress } from "./useLoadProgress";
import { CLOCK_POLL_MS, NIGHT_BACKGROUND, currentMinutes, daylightAt, skyFor } from "./dayCycle";
import { ContactShadows, SoftShadows, useGLTF, useTexture } from "@react-three/drei";
import type {
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh} from "three";
import {
  BufferAttribute,
  Color,
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
import { BUILDING_ROOMS_BY_ID, viewRoomAt, type FloorId } from "./officeBuilding";
import { buildDirectorate, buildExpansion, buildLobby, buildOperationCore, expansionSigns, type FloorBuild } from "./buildingInteriors";
import { EXPANSION_FLOORS, expansionScenery, expansionSeats } from "./officeExpansion";
import { HideoutFloor, SecretDirectoratePieces, SkySignal } from "./HideoutScene";
import { ROBOT_URL, loadGltf, loadPart } from "@/avatar/human/humanAssets";
import { loadHumanBase } from "@/avatar/human/HumanFigure";
import { resolveHuman } from "@/avatar/human/preset";
import { DIRECTORATE_SCENERY, DIRECTORATE_SEATS, DIRECTORATE_SIGNS } from "./officeDirectorate";
import { HIDEOUT_SCENERY, HIDEOUT_SIGNS } from "./officeHideout";
import { LOBBY_SCENERY, LOBBY_SIGNS, type FloorSignSpec } from "./officeLobby";
import { SceneryHumans } from "./SceneryHumans";
import { buildingSignTexture } from "./buildingFacade";
import { BACK_WALL_CUT, FLOOR_BOUNDS, OFFICE_ROOMS, type OfficeSeat } from "./officeLayout";
import { buildOffice, type OfficeBuild } from "./officeRooms";
import { HumanChairs } from "./HumanChairs";
import { screenAtlas, signAtlas } from "./officeTextures";
import { ChiefScene } from "./ChiefScene";
import { BuildingSurroundings, FloorGroup } from "./BuildingScene";
import { OfficeCameraRig } from "./OfficeCameraRig";
import { OfficeHumans } from "./HumanBodies";
import { OfficeRobots } from "./RobotBodies";
import { thinIslands } from "./thinIslands";
import { OFFICE_SCENARIO, type OfficeMode } from "./officeRoute";
import { travelSinks, useOfficeStore } from "./officeStore";

type BuildingFloors = readonly FloorId[];

/** O cenário de tecnologia vem num arquivo à parte: sem `cenario`, nada dele é baixado. */
const TechScene = lazy(() => import("@/tech/TechScene"));

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

/** 512 px em WebP: nesta câmera a textura nunca chega perto do tamanho de 1k, e a abertura cai de 3 MB para 225 KB. */
function pbrSet(name: string, withColor: boolean) {
  const urls = [`/escritorio/texturas/${name}_nor_gl.webp`, `/escritorio/texturas/${name}_arm.webp`];
  return withColor ? [`/escritorio/texturas/${name}_diff.webp`, ...urls] : urls;
}

const ALL_TEXTURES = [...pbrSet("wood_floor", true), ...pbrSet("floor_tiles_04", true), ...pbrSet("fabric_pattern_07", false)];

/** Materiais do andar: cada textura carrega uma vez e é dividida por todas as peças. */
function useOfficeMaterials(): Record<SurfaceKey, Material> {
  const textures = useTexture(ALL_TEXTURES) as Texture[];
  const materials = useMemo(() => {
    const prepared = textures.map((texture, index) => {
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.anisotropy = 4;
      if (ALL_TEXTURES[index]!.includes("_diff")) texture.colorSpace = SRGBColorSpace;
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
  // Sobe as texturas para a GPU sem pressa: senão a primeira entrada num andar paga tudo de uma vez.
  const gl = useThree((state) => state.gl);
  useEffect(() => idleSequence(textures.map((texture) => () => gl.initTexture(texture))), [gl, textures]);
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
  const hemi = useRef<HemisphereLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const fill = useRef<DirectionalLight>(null);
  const background = useMemo(() => new Color(NIGHT_BACKGROUND), []);
  useEffect(() => {
    scene.background = background;
    return () => {
      scene.background = null;
    };
  }, [scene, background]);
  // O céu segue o relógio de Brasília e o esconderijo escurece tudo. Só muda força e cor,
  // com a laje fechada: nenhum sombreador é refeito.
  const lastMood = useRef("");
  useFrame(() => {
    const { shownFloor, daylight } = useOfficeStore.getState();
    const cave = shownFloor === "esconderijo";
    const mood = `${cave}:${daylight.toFixed(3)}`;
    if (mood === lastMood.current) return;
    lastMood.current = mood;
    const sky = skyFor(daylight);
    // No esconderijo a luz que chega é a de dentro: perto da noite, qualquer que seja a hora.
    const caveDim = cave ? 0.45 : 1;
    background.set(cave ? NIGHT_BACKGROUND : sky.background);
    if (hemi.current) {
      hemi.current.intensity = cave ? 0.5 : sky.hemi;
      hemi.current.color.set(sky.hemiSky);
      hemi.current.groundColor.set(sky.hemiGround);
    }
    if (sun.current) {
      sun.current.intensity = sky.sun * caveDim;
      sun.current.color.set(sky.sunColor);
    }
    if (fill.current) {
      fill.current.intensity = cave ? 0.65 : sky.fill;
      fill.current.color.set(sky.fillColor);
    }
    scene.environmentIntensity = cave ? 0.42 : sky.environment;
    gl.toneMappingExposure = cave ? 1 : sky.exposure;
    CITY_AIR.value.set(sky.air);
    for (const name of ["fachada-acesa", "cidade-acesa"]) {
      const lit = scene.getObjectByName(name) as Mesh | undefined;
      const material = lit?.material as { color?: Color } | undefined;
      material?.color?.setScalar(sky.litWindows);
    }
    // De dia a cidade não tem luz acesa: o quadro ocre sobre a pedra virava remendo. Sai uma chamada.
    const cityLit = scene.getObjectByName("cidade-acesa");
    if (cityLit) cityLit.visible = sky.litWindows > CITY_LIT_MIN;
  });
  return (
    <>
      {/* Penumbra suave só na qualidade alta: o sombreador é o que mais pesa por pixel. */}
      {quality === "alta" && <SoftShadows size={7} samples={6} focus={0.5} />}
      <hemisphereLight ref={hemi} args={["#cad9f5", "#5a4131", 0.55]} />
      {/* Um sol e um preenchimento para o andar inteiro; nenhuma luz por sala. */}
      <directionalLight
        key={quality}
        ref={sun}
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
      <directionalLight ref={fill} position={[3, 18, 24]} intensity={0.8} color="#bccff2" />
    </>
  );
}

/** Relê o relógio de vez em quando; `?hora=` fixa a hora para conferir qualquer momento. */
function DayClock() {
  useEffect(() => {
    const tick = () => useOfficeStore.getState().setDaylight(daylightAt(currentMinutes(window.location.search)));
    tick();
    const timer = window.setInterval(tick, CLOCK_POLL_MS);
    return () => window.clearInterval(timer);
  }, []);
  return null;
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

/**
 * Vigia o carregamento pelos arquivos que chegam, não pelo relógio.
 *
 * Antes eram 20 s fixos: em máquina com render por software a cena terminava de
 * montar e o aviso "está demorando" aparecia antes do prédio, como se tivesse
 * falhado. Agora o aviso só entra quando os downloads param de avançar.
 */
function LoadWatch() {
  const { active, loaded } = useLoadProgress();
  const pulse = useRef({ active, loaded, at: Date.now(), startedAt: Date.now() });

  useEffect(() => {
    const now = Date.now();
    // download em andamento ou arquivo novo contam como vida
    if (active || loaded !== pulse.current.loaded) pulse.current.at = now;
    pulse.current.active = active;
    pulse.current.loaded = loaded;
  }, [active, loaded]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const store = useOfficeStore.getState();
      if (store.load !== "loading") return;
      const now = Date.now();
      const stalled = shouldStall({
        active: pulse.current.active,
        idleMs: now - pulse.current.at,
        elapsedMs: now - pulse.current.startedAt,
      });
      if (stalled) store.setLoad("stalled");
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return null;
}

/** Quem entra no meio da viagem, ou troca o andar à mostra: não pode herdar a sombra do anterior. */
function ShadowRefresh({ view }: { view: BuildingFloors }) {
  const gl = useThree((state) => state.gl);
  useLayoutEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, view]);
  return null;
}

/**
 * A sombra de contato olha para cima a partir do piso e pegaria a fachada e a laje da viagem.
 * Estes dois quadros em volta dela escondem o entorno só durante aquela foto.
 */
function HideGround({ hidden }: { hidden: boolean }) {
  useFrame(() => {
    for (const group of travelSinks.ground) group.visible = !hidden;
  });
  return null;
}

/**
 * Deixa pronto o que os andares fora de tela vão pedir: na hora da troca, nada espera a rede nem
 * monta a mobília. Andar fora de tela continua desmontado; só os arquivos e as malhas ficam à mão.
 */
function PrepareBuilding() {
  const ready = useOfficeStore((state) => state.load === "ready");
  useEffect(() => {
    if (!ready) return;
    const { humans } = useOfficeStore.getState();
    const scenery = [...LOBBY_SCENERY, ...DIRECTORATE_SCENERY, ...EXPANSION_FLOORS.flatMap((floor) => expansionScenery(floor.id)), ...HIDEOUT_SCENERY];
    const parts = [...humans.map((human) => human.preset), ...scenery.map((person) => person.preset)].flatMap((preset) => resolveHuman(preset).parts.map((part) => part.file));
    return idleSequence([
      () => loadGltf(ROBOT_URL),
      () => loadHumanBase(),
      buildOperationCore,
      buildLobby,
      buildDirectorate,
      ...[...new Set(parts)].map((file) => () => loadPart(file)),
    ]);
  }, [ready]);
  return null;
}

/** Plantas e luminárias de um andar: sem cena, a falha delas não derruba nada. */
function FloorProps({ floor, props, quality }: { floor: FloorId; props: PropPlacement[]; quality: GraphicsQuality }) {
  const plants = useMemo(() => props.filter((item) => item.kind === "planta"), [props]);
  const lamps = useMemo(() => props.filter((item) => item.kind === "luminaria"), [props]);
  return (
    <PartBoundary key={floor} onError={(message) => {
      useGLTF.clear(PROP_URL.planta);
      useGLTF.clear(PROP_URL.luminaria);
      console.warn("[escritório] planta/luminária fora da cena:", message);
    }}>
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
function FloorsWorld({ quality }: { quality: GraphicsQuality }) {
  const materials = useOfficeMaterials();
  const mounted = useOfficeStore((state) => state.mountedFloors);
  const shown = useOfficeStore((state) => state.shownFloor);
  const mode = useOfficeStore((state) => state.mode);
  return (
    <>
      <ShadowRefresh view={mounted} />
      {mounted.includes("operacao") && (
        <FloorGroup floor="operacao">
          <OperacaoFloor quality={quality} materials={materials} />
          {mode === "demo" && <BatchMeshes batch={buildOperationCore().fixed} materials={materials} />}
        </FloorGroup>
      )}
      {mounted.includes("diretoria") && (
        <FloorGroup floor="diretoria">
          <KitFloor floor="diretoria" build={buildDirectorate()} signs={DIRECTORATE_SIGNS} seats={DIRECTORATE_SEATS} quality={quality} materials={materials} />
          <SecretDirectoratePieces materials={materials} />
        </FloorGroup>
      )}
      {mounted.includes("terreo") && (
        <FloorGroup floor="terreo">
          <KitFloor floor="terreo" build={buildLobby()} signs={LOBBY_SIGNS} quality={quality} materials={materials} />
        </FloorGroup>
      )}
      {mounted.includes("esconderijo") && (
        <FloorGroup floor="esconderijo">
          <HideoutFloor materials={materials} />
          {HIDEOUT_SIGNS.map((spec) => <FloorSign key={spec.text} spec={spec} />)}
        </FloorGroup>
      )}
      {EXPANSION_FLOORS.filter((floor) => mounted.includes(floor.id)).map((floor) => (
        <FloorGroup key={floor.id} floor={floor.id}>
          <KitFloor floor={floor.id} build={buildExpansion(floor.id)} signs={expansionSigns(floor)} seats={expansionSeats(floor)} quality={quality} materials={materials} />
        </FloorGroup>
      ))}
      {/* Um único par de render targets: remontar ContactShadows por andar vaza GPU no drei. */}
      <group visible={shown !== null}>
        <HideGround hidden />
        <ContactShadows position={[0, 0.012, 0]} {...FLOOR_SHADOW} frames={shown === null ? 0 : 1} />
        <HideGround hidden={false} />
      </group>
      <SceneReady />
    </>
  );
}

/**
 * A vista inicial é o prédio fechado, sem nenhum móvel: as texturas dos andares vêm depois, na folga.
 * Quem abre direto num andar, ou a frota real, espera por elas como sempre. Depois de montados, os
 * materiais ficam, inclusive ao voltar para fora.
 */
function OfficeWorld({ quality }: { quality: GraphicsQuality }) {
  const inside = useOfficeStore((state) => state.mountedFloors.length > 0);
  const [warm, setWarm] = useState(false);
  const [started, setStarted] = useState(inside);
  if (!started && (inside || warm)) setStarted(true);
  useEffect(() => {
    if (started) return;
    return idleSequence([() => setWarm(true)]);
  }, [started]);
  return started ? <FloorsWorld quality={quality} /> : <SceneReady />;
}

/** Sem os materiais não há andar: a interface segue de pé e explica o que faltou. */
function reportWorldFailure(message: string) {
  const file = /\/(?:prototipo|escritorio)\/[^\s:]+/.exec(message)?.[0];
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
      <DayClock />
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
          <SkySignal />
          {OFFICE_SCENARIO === "tecnologia" && (
            <Suspense fallback={null}>
              <TechScene />
            </Suspense>
          )}
        </PartBoundary>
      )}
      <RoomGlow />
    </>
  );
}
