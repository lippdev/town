import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import type { InstancedMesh} from "three";
import { AdditiveBlending, Box3, CanvasTexture, Color, DoubleSide, Euler, Matrix4, MeshBasicMaterial, Object3D, Quaternion, SRGBColorSpace, Vector3, type BufferGeometry, type Group, type Material, type Mesh, type MeshStandardMaterial } from "three";
import { batEmblemGeometry } from "./hideoutGear";
import { buildHideoutCar, buildHideoutCarLights, buildHideout, buildSecretShelf, buildTerminalScreens } from "./buildingInteriors";
import { batchKey, SURFACE_KEYS, type Batch, type SurfaceKey } from "./officeKit";
import { BAT_OUTLINE, CAR_WHEELS, GIANT_COIN, HIDEOUT_GLOWS, HIDEOUT_KIT, SIGNAL_LAMP, SIGNAL_TARGET, TURNTABLE, type KitPlacement } from "./officeHideout";
import { FACADE_BOUNDS, BUILDING_HEIGHT, CROWN_HEIGHT } from "./officeBuilding";
import { SECRET_CLOCK, SECRET_SHELF, useSecretStore } from "./officeSecrets";
import { GroundGroup } from "./BuildingScene";
import { useOfficeStore } from "./officeStore";

export const HIDEOUT_KIT_URL = "/esconderijo/kit.glb";

/** Só o que veio de fora precisa do arquivo: se ele falhar, a caverna autoral continua de pé. */
class KitBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[esconderijo] peças do kit fora da cena:", error instanceof Error ? error.message : String(error));
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function BatchParts({ batch, materials, shadow = true }: { batch: Batch; materials: Record<SurfaceKey, Material>; shadow?: boolean }) {
  return (
    <>
      {SURFACE_KEYS.flatMap((surface) =>
        [true, false].map((cast) => {
          const geometry = batch.get(batchKey(surface, cast));
          return geometry ? <mesh key={batchKey(surface, cast)} geometry={geometry} material={materials[surface]} castShadow={shadow && cast} receiveShadow={shadow && surface !== "glow" && surface !== "glass"} /> : null;
        }),
      )}
    </>
  );
}

interface KitPart {
  geometry: BufferGeometry;
  material: Material;
  /** Da peça, já com o pé no chão e centrada. */
  local: Matrix4;
}

const worldBox = new Box3();
const anchorOf = new Vector3();
const anchorSize = new Vector3();

/** As malhas de um nó do kit, centradas na origem e com a base em y = 0. Nada é copiado: é o mesmo arquivo. */
function kitParts(scene: Object3D, name: string): KitPart[] {
  const node = scene.getObjectByName(name);
  if (!node) return [];
  scene.updateMatrixWorld(true);
  worldBox.setFromObject(node);
  worldBox.getCenter(anchorOf);
  worldBox.getSize(anchorSize);
  const toOrigin = new Matrix4().makeTranslation(-anchorOf.x, -worldBox.min.y, -anchorOf.z);
  const parts: KitPart[] = [];
  node.traverse((child) => {
    const mesh = child as Mesh;
    if (mesh.isMesh) parts.push({ geometry: mesh.geometry, material: mesh.material as Material, local: toOrigin.clone().multiply(mesh.matrixWorld) });
  });
  return parts;
}

const placeMatrix = new Matrix4();
const placeRotation = new Quaternion();
const placeEuler = new Euler();
const placePosition = new Vector3();
const placeScale = new Vector3();

function placementMatrix(item: KitPlacement, local: Matrix4) {
  const scale = typeof item.scale === "number" || item.scale === undefined ? [item.scale ?? 1, item.scale ?? 1, item.scale ?? 1] : item.scale;
  placeRotation.setFromEuler(placeEuler.set(0, item.yaw ?? 0, 0));
  placeMatrix.compose(placePosition.set(item.x, item.y ?? 0, item.z), placeRotation, placeScale.set(scale[0]!, scale[1]!, scale[2]!));
  return placeMatrix.multiply(local);
}

/** Uma peça do kit, repetida quantas vezes a tabela pedir: uma chamada de desenho por material. */
function KitPiece({ scene, node, items, shadow }: { scene: Object3D; node: string; items: readonly KitPlacement[]; shadow: boolean }) {
  const parts = useMemo(() => kitParts(scene, node), [scene, node]);
  return (
    <>
      {parts.map((part) => (
        <instancedMesh
          key={part.geometry.uuid}
          args={[part.geometry, part.material, items.length]}
          castShadow={shadow}
          receiveShadow
          frustumCulled={false}
          raycast={() => null}
          ref={(mesh: InstancedMesh | null) => {
            if (!mesh) return;
            items.forEach((item, index) => mesh.setMatrixAt(index, placementMatrix(item, part.local)));
            mesh.instanceMatrix.needsUpdate = true;
          }}
        />
      ))}
    </>
  );
}

/** Rocha sem o laranja de Marte; tela sem o logotipo de exemplo do pacote. Só nesta cópia em memória. */
function useKitScene() {
  const { scene } = useGLTF(HIDEOUT_KIT_URL);
  return useMemo(() => {
    scene.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as MeshStandardMaterial;
      if (material.name === "rock") material.color.set("#8a8d96");
      if (material.name === "rockTrack") material.color.set("#6f727b");
      if (material.name === "M_Decal_Screen") mesh.material = new MeshBasicMaterial({ color: "#1f5fa8", toneMapped: false, name: "tela-do-terminal" });
    });
    return scene;
  }, [scene]);
}

function HideoutKit() {
  const scene = useKitScene();
  const groups = useMemo(() => {
    const byNode = new Map<string, KitPlacement[]>();
    for (const item of HIDEOUT_KIT) byNode.set(item.node, [...(byNode.get(item.node) ?? []), item]);
    return [...byNode];
  }, []);
  return (
    <group name="esconderijo-kit">
      {groups.map(([node, items]) => <KitPiece key={node} scene={scene} node={node} items={items} shadow={!node.startsWith("Platform_")} />)}
    </group>
  );
}

const TURN_SECONDS = 3.4;

/** Carro e plataforma: giram juntos. As rodas e o disco são do kit; a carroceria é autoral. */
function Turntable({ materials }: { materials: Record<SurfaceKey, Material> }) {
  const holder = useRef<Group>(null);
  const lights = useRef<Group>(null);
  const turn = useRef({ left: 0, seen: useSecretStore.getState().engineTurns });
  const carBatch = useMemo(buildHideoutCar, []);
  const lightBatch = useMemo(buildHideoutCarLights, []);
  useFrame((_, delta) => {
    const secret = useSecretStore.getState();
    if (lights.current) lights.current.visible = secret.engine;
    if (secret.engineTurns !== turn.current.seen) {
      turn.current.seen = secret.engineTurns;
      if (!reducedMotion()) turn.current.left = TURN_SECONDS;
    }
    if (turn.current.left <= 0 || !holder.current) return;
    turn.current.left = Math.max(0, turn.current.left - Math.min(delta, 0.05));
    const t = 1 - turn.current.left / TURN_SECONDS;
    holder.current.rotation.y = (t * t * (3 - 2 * t)) * Math.PI * 2;
  });
  useEffect(() => () => {
    for (const geometry of lightBatch.values()) geometry.dispose();
  }, [lightBatch]);
  return (
    <group position={[TURNTABLE.x, 0, TURNTABLE.z]}>
      <group ref={holder} name="esconderijo-plataforma">
        <group rotation={[0, TURNTABLE.carYaw, 0]} position={[0, 0.2, 0]} name="esconderijo-carro">
          <BatchParts batch={carBatch} materials={materials} />
          <group ref={lights} visible={false}>
            <BatchParts batch={lightBatch} materials={materials} shadow={false} />
          </group>
          <KitBoundary>
            <Suspense fallback={null}>
              <TurntableKit />
            </Suspense>
          </KitBoundary>
        </group>
      </group>
    </group>
  );
}

function TurntableKit() {
  const scene = useKitScene();
  const wheels = useMemo(() => CAR_WHEELS.map(([x, z]) => ({ node: "wheel-dark", x, z, yaw: x > 0 ? 0 : Math.PI, scale: 1.1 })), []);
  return (
    <>
      <KitPiece scene={scene} node="wheel-dark" items={wheels} shadow />
      <group rotation={[0, -TURNTABLE.carYaw, 0]} position={[0, -0.2, 0]}>
        <KitPiece scene={scene} node="Platform_Round1" items={[{ node: "Platform_Round1", x: 0, z: 0, scale: TURNTABLE.radius / 3 }]} shadow={false} />
      </group>
    </>
  );
}

const CELL = { width: 720, height: 480 };

function batPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number) {
  const half = width / 2;
  ctx.beginPath();
  BAT_OUTLINE.forEach(([px, py], index) => (index === 0 ? ctx.moveTo(x + px * half, y - py * half) : ctx.lineTo(x + px * half, y - py * half)));
  ctx.closePath();
}

function drawPanel(ctx: CanvasRenderingContext2D, file: number, cell: number) {
  const { width, height } = CELL;
  ctx.save();
  ctx.translate(cell * width, 0);
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  ctx.fillStyle = "#04101f";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(90, 169, 255, 0.16)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y < height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  const seed = (file + 1) * 7 + cell * 3;
  const scene = (file + cell) % 3;
  if (scene === 0) {
    // Mapa: quarteirões e um alvo âmbar andando pela cidade.
    ctx.fillStyle = "#0e2c4f";
    for (let i = 0; i < 26; i += 1) ctx.fillRect(((i * 97 + seed * 37) % 660) + 20, ((i * 61 + seed * 13) % 400) + 40, 44 + (i % 3) * 22, 30 + (i % 4) * 16);
    ctx.strokeStyle = "#e0a84f";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(200 + seed * 23 % 340, 150 + seed * 11 % 200, 56, 0, Math.PI * 2);
    ctx.moveTo(200 + seed * 23 % 340 - 90, 150 + seed * 11 % 200);
    ctx.lineTo(200 + seed * 23 % 340 + 90, 150 + seed * 11 % 200);
    ctx.stroke();
  } else if (scene === 1) {
    // Quadro do caso: fotos sem rosto ligadas por linhas.
    const spots = [[150, 120], [370, 90], [560, 160], [250, 300], [480, 340]] as const;
    ctx.strokeStyle = "#e0a84f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    spots.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    spots.forEach(([x, y], index) => {
      ctx.fillStyle = "#0e2c4f";
      ctx.fillRect(x - 58, y - 44, 116, 88);
      ctx.fillStyle = index === (file + 1) % 5 ? "#e0a84f" : "#5aa9ff";
      ctx.beginPath();
      ctx.arc(x, y - 10, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 26, y + 12, 52, 26);
    });
  } else {
    // Radar com o morcego no centro.
    ctx.strokeStyle = "#5aa9ff";
    ctx.lineWidth = 3;
    for (const radius of [70, 130, 190]) { ctx.beginPath(); ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = "#e0a84f";
    batPath(ctx, width / 2, height / 2, 230);
    ctx.fill();
  }
  ctx.fillStyle = "#0a2036";
  ctx.fillRect(0, 0, width, 38);
  ctx.fillStyle = "#cfe4ff";
  ctx.font = "600 21px monospace";
  ctx.fillText(`ARQUIVO ${file + 1}/3 · CENOGRÁFICO`, 16, 26);
  ctx.restore();
}

/** Os três painéis numa textura só: trocar de arquivo redesenha, sem criar nada na GPU. */
function TerminalScreens() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CELL.width * 3;
    canvas.height = CELL.height;
    const created = new CanvasTexture(canvas);
    created.colorSpace = SRGBColorSpace;
    return created;
  }, []);
  const material = useMemo(() => new MeshBasicMaterial({ map: texture, toneMapped: false }), [texture]);
  const batch = useMemo(buildTerminalScreens, []);
  const file = useSecretStore((state) => state.file);
  useLayoutEffect(() => {
    const ctx = (texture.image as HTMLCanvasElement).getContext("2d")!;
    for (let cell = 0; cell < 3; cell += 1) drawPanel(ctx, file, cell);
    texture.needsUpdate = true;
  }, [texture, file]);
  useEffect(() => () => {
    texture.dispose();
    material.dispose();
    for (const geometry of batch.values()) geometry.dispose();
  }, [texture, material, batch]);
  return <mesh geometry={batch.get(batchKey("screen", false))!} material={material} name="esconderijo-telas" raycast={() => null} />;
}

/** Sinal do morcego: disco de luz com o recorte escuro. A mesma imagem serve à parede e ao céu. */
function signalTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const glow = ctx.createRadialGradient(256, 256, 40, 256, 256, 254);
  glow.addColorStop(0, "rgba(255, 234, 170, 1)");
  glow.addColorStop(0.72, "rgba(255, 214, 130, 0.9)");
  glow.addColorStop(0.86, "rgba(255, 196, 110, 0.35)");
  glow.addColorStop(1, "rgba(255, 196, 110, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 512, 512);
  ctx.globalCompositeOperation = "destination-out";
  batPath(ctx, 256, 256, 360);
  ctx.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function useSignalMaterial() {
  const texture = useMemo(signalTexture, []);
  const material = useMemo(() => new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide }), [texture]);
  useEffect(() => () => {
    texture.dispose();
    material.dispose();
  }, [texture, material]);
  return material;
}

function CaveSignal() {
  const on = useSecretStore((state) => state.signal);
  const material = useSignalMaterial();
  const beam = useMemo(() => {
    // O facho sai da lente e vai abrindo até a parede: o eixo do cilindro é o y dele.
    const from = new Vector3(SIGNAL_LAMP.x, 1.12, SIGNAL_LAMP.z);
    const to = new Vector3(SIGNAL_TARGET.x + 0.02, SIGNAL_TARGET.y, SIGNAL_TARGET.z);
    const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), to.clone().sub(from).normalize());
    return { position: from.clone().lerp(to, 0.5).toArray() as [number, number, number], quaternion: quaternion.toArray() as [number, number, number, number], length: from.distanceTo(to) };
  }, []);
  if (!on) return null;
  return (
    <group name="esconderijo-sinal">
      <mesh position={[SIGNAL_TARGET.x + 0.06, SIGNAL_TARGET.y, SIGNAL_TARGET.z]} rotation={[0, Math.PI / 2, 0]} material={material} renderOrder={3} raycast={() => null}>
        <planeGeometry args={[2.6, 2.6]} />
      </mesh>
      <mesh position={beam.position} quaternion={beam.quaternion} renderOrder={3} raycast={() => null}>
        <cylinderGeometry args={[1.2, 0.2, beam.length, 18, 1, true]} />
        <meshBasicMaterial color="#ffd68a" transparent opacity={0.09} depthWrite={false} toneMapped={false} blending={AdditiveBlending} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/** No prédio fechado, o sinal aceso também aparece no céu, ao lado da coroa. Só existe ligado. */
export function SkySignal() {
  const on = useSecretStore((state) => state.signal);
  const closed = useOfficeStore((state) => state.buildingView === "exterior" && !state.traveling);
  if (!on || !closed) return null;
  return (
    <GroundGroup>
      <SkySignalBody />
    </GroundGroup>
  );
}

function SkySignalBody() {
  const material = useSignalMaterial();
  const { minX, maxX, minZ, maxZ } = FACADE_BOUNDS;
  const center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  // À esquerda da torre na tela, um pouco atrás dela, e virado para a câmera, que não muda de ângulo.
  const side = 13;
  const y = BUILDING_HEIGHT + CROWN_HEIGHT * 0.55;
  return (
    <mesh position={[center.x - side * Math.SQRT1_2 - 8, y, center.z + side * Math.SQRT1_2 - 8]} rotation={[0, Math.PI / 4, 0]} material={material} renderOrder={3} name="sinal-no-ceu" raycast={() => null}>
      <planeGeometry args={[8.4, 8.4]} />
    </mesh>
  );
}

const COIN_SECONDS = 1.4;

/** A moeda gigante: um lado limpo, o outro riscado. Cara ou coroa é ela que mostra, não uma etiqueta. */
function GiantCoin() {
  const holder = useRef<Group>(null);
  const spin = useRef({ left: 0, seen: useSecretStore.getState().coinFlips, from: 0, to: 0 });
  const emblem = useMemo(() => batEmblemGeometry(GIANT_COIN.radius * 1.3, 0.016), []);
  useEffect(() => () => emblem.dispose(), [emblem]);
  useFrame((_, delta) => {
    const secret = useSecretStore.getState();
    const state = spin.current;
    if (!holder.current) return;
    if (secret.coinFlips !== state.seen) {
      state.seen = secret.coinFlips;
      state.from = holder.current.rotation.y;
      // Três voltas e meia, sempre parando com a face pedida de frente para o sudeste.
      const face = secret.coin === "coroa" ? Math.PI : 0;
      state.to = Math.PI * 6 + face;
      if (reducedMotion()) {
        holder.current.rotation.y = face;
        return;
      }
      state.left = COIN_SECONDS;
    }
    if (state.left <= 0) return;
    state.left = Math.max(0, state.left - Math.min(delta, 0.05));
    const t = 1 - state.left / COIN_SECONDS;
    holder.current.rotation.y = state.from + (state.to - state.from) * (1 - (1 - t) ** 3);
    if (state.left === 0) holder.current.rotation.y = state.to % (Math.PI * 2);
  });
  return (
    <group position={[GIANT_COIN.x, GIANT_COIN.radius + 0.2, GIANT_COIN.z]} rotation={[0, Math.PI / 4, 0]} name="esconderijo-moeda">
      <group ref={holder}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[GIANT_COIN.radius, GIANT_COIN.radius, 0.14, 40]} />
          <meshStandardMaterial color="#a8703a" roughness={0.35} metalness={0.75} />
        </mesh>
        <mesh geometry={emblem} position={[0, 0, 0.07]}>
          <meshStandardMaterial color="#d9a860" roughness={0.3} metalness={0.8} />
        </mesh>
        {/* O lado riscado: as marcas ficam na coroa, e bastam para distinguir de longe. */}
        {[-0.5, -0.1, 0.32].map((offset, index) => (
          <mesh key={offset} position={[offset, offset * 0.6, -0.074]} rotation={[0, 0, 0.6 + index * 0.3]}>
            <boxGeometry args={[1.5 - index * 0.2, 0.06, 0.01]} />
            <meshStandardMaterial color="#4b2f18" roughness={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const BATS = 5;
const batDummy = new Object3D();

/** Morcegos em volta do teto da caverna: uma malha só e nenhum cronômetro fora do quadro. */
function Bats() {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    const emblem = batEmblemGeometry(0.46, 0.004);
    emblem.rotateX(-Math.PI / 2);
    return emblem;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const place = (time: number) => {
    if (!mesh.current) return;
    for (let index = 0; index < BATS; index += 1) {
      const speed = 0.16 + index * 0.012;
      const angle = time * speed + (index * Math.PI * 2) / BATS;
      batDummy.position.set(-2 + Math.cos(angle) * (6.2 + index * 0.5), 3.15 + Math.sin(time * 0.8 + index) * 0.24, -2.5 + Math.sin(angle) * (4 + index * 0.3));
      batDummy.rotation.set(0, -angle, 0);
      batDummy.scale.set(1, 1, 0.7 + Math.abs(Math.sin(time * 9 + index)) * 0.5);
      batDummy.updateMatrix();
      mesh.current.setMatrixAt(index, batDummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  };
  useLayoutEffect(() => place(4), []);
  useFrame(({ clock }) => {
    if (!reducedMotion()) place(clock.elapsedTime);
  });
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, BATS]} frustumCulled={false} raycast={() => null} name="esconderijo-morcegos">
      <meshStandardMaterial color="#17191f" roughness={0.8} side={DoubleSide} />
    </instancedMesh>
  );
}

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.72)");
  gradient.addColorStop(0.45, "rgba(255, 255, 255, 0.26)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}

const glowDummy = new Object3D();
const glowColor = new Color();

/** Luz azul e âmbar pintada, sem luz nenhuma a mais: uma chamada de desenho por toda a caverna. */
function GlowPools() {
  const texture = useMemo(glowTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <instancedMesh
      args={[undefined, undefined, HIDEOUT_GLOWS.length]}
      renderOrder={2}
      frustumCulled={false}
      raycast={() => null}
      name="esconderijo-luz"
      ref={(mesh: InstancedMesh | null) => {
        if (!mesh) return;
        HIDEOUT_GLOWS.forEach((pool, index) => {
          glowDummy.position.set(pool.x, pool.y, pool.z);
          glowDummy.rotation.set(0, 0, 0);
          if (pool.on === "floor") glowDummy.rotation.x = -Math.PI / 2;
          if (pool.on === "west") glowDummy.rotation.y = Math.PI / 2;
          glowDummy.scale.set(pool.width, pool.height, 1);
          glowDummy.updateMatrix();
          mesh.setMatrixAt(index, glowDummy.matrix);
          mesh.setColorAt(index, glowColor.set(pool.color));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }}
    >
      <planeGeometry />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
    </instancedMesh>
  );
}

/** Tudo o que há dentro do esconderijo. O que é caro entra sob demanda: só existe com o andar à mostra. */
export function HideoutFloor({ materials }: { materials: Record<SurfaceKey, Material> }) {
  return (
    <>
      <group name="andar-esconderijo">
        <BatchParts batch={buildHideout().fixed} materials={materials} />
      </group>
      <KitBoundary>
        <Suspense fallback={null}>
          <HideoutKit />
        </Suspense>
      </KitBoundary>
      <TerminalScreens />
      <Turntable materials={materials} />
      <CaveSignal />
      <GiantCoin />
      <Bats />
      <GlowPools />
    </>
  );
}

const OPEN_ANGLE = 1.42;
const HOUR_1047 = -((10 + 47 / 60) / 12) * Math.PI * 2;
const MINUTE_1047 = -(47 / 60) * Math.PI * 2;

/** A estante que gira, o livro e os ponteiros: moram na Diretoria, onde é o começo do segredo. */
export function SecretDirectoratePieces({ materials }: { materials: Record<SurfaceKey, Material> }) {
  const shelf = useRef<Group>(null);
  const hour = useRef<Mesh>(null);
  const minute = useRef<Mesh>(null);
  const book = useRef<MeshStandardMaterial>(null);
  const { body } = useMemo(buildSecretShelf, []);
  const doorOpen = useSecretStore((state) => state.doorOpen);
  // A primeira vez que a estante abre já deixa à mão o que vem depois, em vez de esperar na descida.
  useEffect(() => {
    if (!doorOpen) return;
    useGLTF.preload(HIDEOUT_KIT_URL);
    buildHideout();
  }, [doorOpen]);
  useFrame((_, delta) => {
    const secret = useSecretStore.getState();
    const still = reducedMotion();
    const step = still ? 1 : 1 - Math.exp(-5 * Math.min(delta, 0.05));
    if (shelf.current) {
      const goal = secret.doorOpen ? OPEN_ANGLE : 0;
      shelf.current.rotation.y += (goal - shelf.current.rotation.y) * step;
    }
    if (hour.current && minute.current) {
      const hourGoal = secret.clockHint ? -Math.PI * 2 : HOUR_1047;
      const minuteGoal = secret.clockHint ? -Math.PI * 2 : MINUTE_1047;
      hour.current.rotation.z += (hourGoal - hour.current.rotation.z) * step;
      minute.current.rotation.z += (minuteGoal - minute.current.rotation.z) * step;
    }
    if (book.current) book.current.emissiveIntensity = secret.clockHint ? 1.2 + Math.sin(performance.now() / 260) * (still ? 0 : 0.4) : 0.18;
  });
  const { x, hingeZ, bookY, bookZ } = SECRET_SHELF;
  return (
    <>
      <group ref={shelf} position={[x - 0.22, 0, hingeZ]} name="estante-secreta">
        <BatchParts batch={body} materials={materials} />
        <mesh position={[0.34, bookY, bookZ - hingeZ]} name="livro-fora-do-lugar" castShadow>
          <boxGeometry args={[0.34, 0.33, 0.12]} />
          <meshStandardMaterial ref={book} color="#a8703a" emissive="#e0a84f" emissiveIntensity={0.18} roughness={0.5} />
        </mesh>
      </group>
      <group position={[SECRET_CLOCK.x, SECRET_CLOCK.y, SECRET_CLOCK.z + 0.04]} name="relogio-da-diretoria">
        <mesh ref={hour} rotation={[0, 0, HOUR_1047]}>
          <boxGeometry args={[0.035, SECRET_CLOCK.radius * 1.15, 0.012]} />
          <meshStandardMaterial color="#26292e" />
        </mesh>
        <mesh ref={minute} position={[0, 0, 0.012]} rotation={[0, 0, MINUTE_1047]}>
          <boxGeometry args={[0.022, SECRET_CLOCK.radius * 1.7, 0.012]} />
          <meshStandardMaterial color="#26292e" />
        </mesh>
      </group>
    </>
  );
}
