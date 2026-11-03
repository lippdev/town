import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, useGLTF, useTexture } from "@react-three/drei";
import { Box3, Mesh, MeshStandardMaterial, PMREMGenerator, RepeatWrapping, SRGBColorSpace, Vector3, type OrthographicCamera } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { QaBridge } from "@/app/QaBridge";
import { useHQStore } from "@/state/useHQStore";
import { CharacterModel, type CharacterRig } from "@/world/characters/CharacterModel";
import type { CharacterEntry } from "@/world/characters/characterManifest";
import { RoomIndicator } from "@/world/rooms/RoomIndicator";
import { ROOMS_BY_ID, roomCenter } from "@/world/rooms/rooms";
import { QualityController } from "@/world/scene/QualityController";
import { labelTexture, screenTexture } from "./PrototypeMaterials";

type Vec = [number, number, number];
const BLUE = "#3b82f6";
const PULSE: CharacterEntry = { file: "pulse.glb", height: 1.76, yawDeg: 180, clips: { idle: "CharacterArmature|Idle", sit: "CharacterArmature|SitDown" } };

function Box({ at, size, color = "#333842", material, shadow = true }: {
  at: Vec; size: Vec; color?: string; material?: MeshStandardMaterial; shadow?: boolean;
}) {
  return <mesh position={at} castShadow={shadow} receiveShadow material={material}>
    <boxGeometry args={size} />
    {!material && <meshStandardMaterial color={color} roughness={0.75} />}
  </mesh>;
}

function Asset({ file, at, width, rotation = 0 }: { file: string; at: Vec; width: number; rotation?: number }) {
  const { scene } = useGLTF(`/prototipo/${file}.glb`);
  const { root, scale, offset } = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((node) => { if (node instanceof Mesh) { node.castShadow = true; node.receiveShadow = true; } });
    const bounds = new Box3().setFromObject(root);
    const scale = width / bounds.getSize(new Vector3()).x;
    const center = bounds.getCenter(new Vector3());
    return { root, scale, offset: [-center.x * scale, -bounds.min.y * scale, -center.z * scale] as Vec };
  }, [scene, width]);
  return <group position={at} rotation={[0, rotation, 0]}><primitive object={root} scale={scale} position={offset} /></group>;
}

function useSurface(name: "wood_floor" | "stone_floor", repeat: [number, number]) {
  const loaded = useTexture([`/prototipo/${name}_diff_1k.jpg`, `/prototipo/${name}_nor_gl_1k.jpg`, `/prototipo/${name}_arm_1k.jpg`]);
  const [rx, ry] = repeat;
  const material = useMemo(() => {
    const [map, normalMap, arm] = loaded.map((source) => {
      const texture = source.clone();
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.repeat.set(rx, ry);
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      return texture;
    });
    map!.colorSpace = SRGBColorSpace;
    return new MeshStandardMaterial({ map, normalMap, roughnessMap: arm, aoMap: arm, roughness: 1, metalness: 0 });
  }, [loaded, rx, ry]);
  useEffect(() => () => {
    material.map?.dispose(); material.normalMap?.dispose(); material.roughnessMap?.dispose(); material.dispose();
  }, [material]);
  return material;
}

function PrototypeCamera() {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);
  const inset = useHQStore((s) => s.viewInsetRight);
  useLayoutEffect(() => {
    // 45° azimute, 30° elevação; sem OrbitControls para preservar o corte.
    camera.position.set(12.65, 11.1, 12.65);
    camera.lookAt(0.4, 1.1, 0.4);
    camera.zoom = Math.min((size.width - inset) / 12.5, size.height / 8.6);
    camera.setViewOffset(size.width, size.height, inset / 2, 0, size.width, size.height);
    camera.updateProjectionMatrix();
  }, [camera, size, inset]);
  return null;
}

function Lighting() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const generator = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = generator.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.35;
    return () => { scene.environment = null; target.dispose(); room.dispose(); generator.dispose(); };
  }, [gl, scene]);
  return <>
    <color attach="background" args={["#111828"]} />
    <hemisphereLight args={["#cad9f5", "#5a4131", 0.5]} />
    <directionalLight position={[3.2, 5, -5]} intensity={4} color="#ffd5a0" castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-6} shadow-camera-right={6}
      shadow-camera-top={6} shadow-camera-bottom={-6} shadow-camera-near={0.1} shadow-camera-far={20}
      shadow-normalBias={0.015} shadow-bias={-0.0002} shadow-radius={4} />
    <directionalLight position={[1, 6, 8]} intensity={0.8} color="#bccff2" />
    <pointLight position={[2.1, 1.65, -1.1]} intensity={3.5} distance={3.5} color="#ffbc75" />
    <ContactShadows position={[0, 0.012, 0]} scale={13} opacity={0.36} blur={2.8} far={3.5} resolution={512} frames={1} />
  </>;
}

function Monitor({ x, variant }: { x: number; variant: number }) {
  const texture = useMemo(() => screenTexture(variant), [variant]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group position={[x, 0.88, -1.67]}>
    <Box at={[0, 0.02, 0]} size={[0.32, 0.035, 0.21]} />
    <Box at={[0, 0.18, -0.03]} size={[0.055, 0.32, 0.06]} />
    <Box at={[0, 0.47, 0]} size={[0.94, 0.6, 0.055]} color="#20252b" />
    <mesh position={[0, 0.47, 0.031]}><planeGeometry args={[0.88, 0.54]} />
      <meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={0.5} roughness={0.3} />
    </mesh>
  </group>;
}

function Pulse() {
  const rig = useRef<CharacterRig | null>(null);
  const onRig = useCallback((value: CharacterRig | null) => { rig.current = value; }, []);
  useFrame((_, dt) => { rig.current?.play("sit"); rig.current?.update(Math.min(dt, 0.05)); });
  return <group position={[0.65, 0, -0.44]} name="agent-pulse" userData={{ agentId: "pulse" }}
    onClick={(e) => { e.stopPropagation(); useHQStore.getState().selectAgent("pulse"); }}>
    <CharacterModel url="/prototipo/pulse.glb" entry={PULSE} onRig={onRig} />
  </group>;
}

function Bookshelf({ wood }: { wood: MeshStandardMaterial }) {
  const bookColors = ["#384d61", "#a28b6a", "#745442", "#b7aa8d", "#313f48"];
  return <group position={[-2.64, 0, -1.12]}>
    <Box at={[-0.22, 1.25, 0]} size={[0.08, 2.5, 1.65]} material={wood} />
    {[-0.85, 0.85].map(z => <Box key={z} at={[0, 1.25, z]} size={[0.53, 2.5, 0.07]} color="#343637" />)}
    {[0.12, 0.67, 1.22, 1.77, 2.38].map((y, row) => <group key={y}>
      <Box at={[0, y, 0]} size={[0.56, 0.06, 1.76]} material={wood} />
      {row < 4 && Array.from({ length: row === 1 ? 5 : 8 }, (_, i) => <Box key={i}
        at={[0.04, y + 0.2, -0.64 + i * 0.16]} size={[0.3, 0.27 + (i % 3) * 0.065, 0.105]}
        color={bookColors[(row + i) % bookColors.length]} shadow={false} />)}
    </group>)}
  </group>;
}

export function EngineeringPrototype() {
  const wood = useSurface("wood_floor", [2, 2]);
  const deskWood = useSurface("wood_floor", [0.7, 0.5]);
  const stone = useSurface("stone_floor", [1, 3]);
  const sign = useMemo(() => labelTexture("Engenharia", "LIPP HQ  /  01"), []);
  useEffect(() => () => sign.dispose(), [sign]);
  const [cx, , cz] = roomCenter(ROOMS_BY_ID.engenharia!);
  return <>
    <PrototypeCamera /><Lighting /><QaBridge /><QualityController />
    <group name="engineering-prototype"
      onPointerOver={(e) => { e.stopPropagation(); useHQStore.getState().setHoveredRoom("engenharia"); }}
      onPointerOut={() => useHQStore.getState().setHoveredRoom(null)}
      onClick={() => useHQStore.getState().selectRoom("engenharia")}>
      <Box at={[0.7, -0.16, 0]} size={[7.6, 0.3, 5]} color="#61554a" />
      <Box at={[0, -0.015, 0]} size={[6.1, 0.06, 4.8]} material={wood} />
      <Box at={[3.8, -0.01, 0]} size={[1.5, 0.07, 4.8]} material={stone} />
      {/* Paredes só nos fundos; a janela é um vão real, com sol e venezianas. */}
      <Box at={[-3.06, 1.5, 0]} size={[0.18, 3, 4.95]} color="#8e8478" />
      <Box at={[-1.8, 1.5, -2.47]} size={[2.7, 3, 0.18]} color="#9a9083" />
      <Box at={[1.3, 0.52, -2.47]} size={[3.5, 1.04, 0.18]} color="#9a9083" />
      <Box at={[1.3, 2.86, -2.47]} size={[3.5, 0.28, 0.18]} color="#9a9083" />
      <Box at={[3, 1.9, -2.47]} size={[0.2, 1.8, 0.18]} color="#9a9083" />
      <Box at={[-0.43, 1.9, -2.47]} size={[0.12, 1.8, 0.18]} color="#665a4d" />
      <Box at={[1.3, 1.04, -2.35]} size={[3.5, 0.1, 0.36]} material={deskWood} />
      {[0, 1.22, 2.48].map(x => <Box key={x} at={[x, 1.9, -2.43]} size={[0.055, 1.75, 0.1]} color="#554a3c" />)}
      {Array.from({ length: 8 }, (_, i) => <group key={i} rotation={[0.16, 0, 0]} position={[1.3, 1.6 + i * 0.15, -2.4]}>
        <Box at={[0, 0, 0]} size={[3.3, 0.035, 0.15]} material={deskWood} />
      </group>)}
      <mesh position={[1.3, 1.9, -2.52]}><planeGeometry args={[3.3, 1.7]} />
        <meshBasicMaterial color="#edc89b" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <Box at={[-2.94, 0.12, 0]} size={[0.06, 0.2, 4.8]} material={deskWood} />
      <Box at={[0, 0.12, -2.35]} size={[6, 0.2, 0.06]} material={deskWood} />
      <mesh position={[-1.7, 2.35, -2.36]}><planeGeometry args={[2.05, 0.53]} />
        <meshStandardMaterial map={sign} roughness={0.8} />
      </mesh>
      <Bookshelf wood={deskWood} />
      <Asset file="planta" at={[-2.56, 2.43, -1.35]} width={0.88} />
      <Asset file="planta" at={[2.5, 0.025, -1.85]} width={1.0} />
      <Asset file="planta" at={[3.75, 0.03, -1.5]} width={0.8} />
      <Asset file="sofa" at={[-1.75, 0.025, 1.15]} width={2.15} rotation={Math.PI / 2} />
      <Box at={[0.4, 0.035, 0.4]} size={[3.1, 0.025, 2.6]} color="#8a8179" shadow={false} />
      <Box at={[0.8, 0.84, -1.42]} size={[2.8, 0.09, 0.97]} material={deskWood} />
      {[-0.42, 2.02].map(x => <Box key={x} at={[x, 0.41, -1.42]} size={[0.12, 0.82, 0.83]} color="#414141" />)}
      <Box at={[1.82, 0.45, -1.45]} size={[0.48, 0.72, 0.74]} material={deskWood} />
      {[0.27, 0.49, 0.71].map(y => <Box key={y} at={[1.82, y, -1.065]} size={[0.16, 0.02, 0.025]} color="#272b31" shadow={false} />)}
      <Monitor x={0.12} variant={0} /><Monitor x={1.14} variant={1} />
      <Box at={[0.65, 0.91, -1.12]} size={[0.64, 0.035, 0.23]} color="#30343b" />
      {Array.from({ length: 4 }, (_, i) => <Box key={i} at={[0.65, 0.931, -1.2 + i * 0.05]} size={[0.57, 0.004, 0.018]} color="#696d72" shadow={false} />)}
      <Asset file="luminaria" at={[2, 0.89, -1.42]} width={0.45} rotation={-Math.PI / 2} />
      <Box at={[0.65, 0.48, -0.32]} size={[0.54, 0.12, 0.55]} color="#323943" />
      <Box at={[0.65, 0.88, 0]} size={[0.54, 0.66, 0.095]} color="#353c47" />
      <Box at={[0.65, 0.25, -0.32]} size={[0.055, 0.43, 0.055]} color="#565d63" />
      <Box at={[0.65, 0.07, -0.32]} size={[0.62, 0.05, 0.06]} color="#343943" />
      <Box at={[0.65, 0.07, -0.32]} size={[0.06, 0.05, 0.62]} color="#343943" />
      <Pulse />
      <Box at={[-0.2, 0.42, 1.5]} size={[1.2, 0.075, 0.65]} material={deskWood} />
      {[-0.7, 0.3].flatMap(x => [1.27, 1.73].map(z => <Box key={`${x}-${z}`} at={[x, 0.22, z]} size={[0.035, 0.4, 0.035]} color="#282e35" />))}
      <Box at={[-0.2, 0.49, 1.5]} size={[0.32, 0.06, 0.23]} color={BLUE} />
      {/* Um painel de vidro junto ao corredor, mantendo a entrada aberta. */}
      <group position={[3, 0, -1.5]}>
        {[-0.65, 0.65].map(z => <Box key={z} at={[0, 1.2, z]} size={[0.045, 2.4, 0.045]} color="#383a38" />)}
        {[0.08, 1.2, 2.38].map(y => <Box key={y} at={[0, y, 0]} size={[0.045, 0.04, 1.35]} color="#383a38" />)}
        <mesh position={[0, 1.22, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[1.3, 2.32]} />
          <meshStandardMaterial color="#b8d6dd" metalness={0.2} roughness={0.15} transparent opacity={0.12} depthWrite={false} side={2} />
        </mesh>
      </group>
    </group>
    {/* Reusa o indicador original; só remapeia o centro da planta para o cenário do spike. */}
    <group position={[-cx + 0.65, -0.7, -cz - 0.35]}><RoomIndicator /></group>
  </>;
}
