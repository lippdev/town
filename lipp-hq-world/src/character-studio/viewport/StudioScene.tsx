import { Suspense, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ComponentRef, type Ref } from "react";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, type PerspectiveCamera } from "three";
import type { CharacterSpec } from "@/character-studio/model/schema";
import { BASE_MODEL } from "@/character-studio/model/sheet";
import { findBaseProblems, FigureRig, type FigurePose, type FigureSnapshot } from "@/character-studio/viewport/figureRig";

export type CameraView = "front" | "threeQuarter" | "side" | "back";

const VIEW_AZIMUTH: Record<CameraView, number> = {
  front: 0,
  threeQuarter: 0.62,
  side: Math.PI / 2,
  back: Math.PI,
};
const NEUTRAL_POLAR = Math.PI / 2 - 0.05;
const FOV = 26;
/** Enquadra a maior altura permitida: trocar de variação mostra a diferença real de altura. */
const FRAME_HEIGHT = 2.28;
const FRAME_WIDTH = 1.5;
const BODY_TARGET_Y = 1;
const TWEEN_SECONDS = 0.34;

export interface CameraApi {
  view: (view: CameraView) => void;
  frame: (framing: "body" | "head") => void;
  reset: () => void;
  zoom: (factor: number) => void;
  orbit: (azimuth: number, polar: number) => void;
}

export interface SceneApi {
  camera: CameraApi;
  /** Renderiza agora e entrega o quadro: sem isso o buffer já estaria vazio. */
  capture: () => Promise<Blob>;
  captureDataUrl: () => string;
  snapshot: () => FigureSnapshot | null;
  frames: () => number;
  pixelRatio: () => number;
  loseContextForQa: () => (() => void) | null;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Figure({ spec, pose, motion, rigRef, onReady, onProblem }: {
  spec: CharacterSpec;
  pose: FigurePose;
  motion: boolean;
  rigRef: { current: FigureRig | null };
  onReady: () => void;
  onProblem: (message: string) => void;
}) {
  // Sem Draco: o arquivo só usa meshopt, e o decodificador Draco viria de uma CDN.
  const gltf = useGLTF(BASE_MODEL.file, false, true);
  const [rig, setRig] = useState<FigureRig | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const specRef = useRef(spec);
  specRef.current = spec;
  const poseRef = useRef({ pose, motion });
  poseRef.current = { pose, motion };

  useEffect(() => {
    const problems = findBaseProblems(gltf.scene, gltf.animations);
    if (problems.length) {
      onProblem(`O arquivo ${BASE_MODEL.file} não tem: ${problems.join(", ")}.`);
      return;
    }
    const created = new FigureRig(gltf.scene, gltf.animations);
    created.apply(specRef.current);
    created.setPose(poseRef.current.pose, poseRef.current.motion, true);
    rigRef.current = created;
    setRig(created);
    invalidate();
    onReady();
    return () => {
      rigRef.current = null;
      setRig(null);
      created.dispose();
    };
  }, [gltf, invalidate, onProblem, onReady, rigRef]);

  useLayoutEffect(() => {
    if (!rig) return;
    rig.apply(spec);
    invalidate();
  }, [rig, spec, invalidate]);

  useEffect(() => {
    if (!rig) return;
    rig.setPose(pose, motion, prefersReducedMotion());
    invalidate();
  }, [rig, pose, motion, invalidate]);

  // Volta a pedir quadros quando a aba reaparece; escondida, o laço fica parado.
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden && rig?.animating) invalidate();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [rig, invalidate]);

  useFrame((state, delta) => {
    if (!rig || document.hidden) return;
    if (rig.animating && rig.update(delta)) state.invalidate();
  });

  return rig ? <primitive object={rig.holder} /> : null;
}

function CameraDirector({ apiRef, heightM }: { apiRef: { current: CameraApi | null }; heightM: number }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const heightRef = useRef(heightM);
  heightRef.current = heightM;
  /** Enquanto o usuário não mexeu, a câmera acompanha o tamanho da janela. */
  const touched = useRef(false);
  const tween = useRef<{ elapsed: number; from: number[]; to: number[] } | null>(null);

  const fitDistance = () => {
    const halfTan = Math.tan(MathUtils.degToRad(FOV / 2));
    return Math.max(FRAME_HEIGHT / 2 / halfTan, FRAME_WIDTH / 2 / (halfTan * Math.max(camera.aspect, 0.1)));
  };

  const place = (azimuth: number, polar: number, distance: number, targetY: number) => {
    const orbit = controls.current;
    if (!orbit) return;
    orbit.target.set(0, targetY, 0);
    camera.position.setFromSphericalCoords(distance, polar, azimuth).add(orbit.target);
    camera.lookAt(orbit.target);
    orbit.update();
  };

  const current = () => {
    const orbit = controls.current;
    return orbit ? [orbit.getAzimuthalAngle(), orbit.getPolarAngle(), orbit.getDistance(), orbit.target.y] : [0, NEUTRAL_POLAR, 8, BODY_TARGET_Y];
  };

  const go = (patch: { azimuth?: number; polar?: number; distance?: number; targetY?: number }, instant = false) => {
    const from = current() as [number, number, number, number];
    // Caminho curto: de costas para a frente não dá a volta inteira.
    const azimuth = patch.azimuth ?? from[0];
    const shortest = from[0] + Math.atan2(Math.sin(azimuth - from[0]), Math.cos(azimuth - from[0]));
    const to = [shortest, patch.polar ?? from[1], patch.distance ?? from[2], patch.targetY ?? from[3]];
    if (instant || prefersReducedMotion()) {
      tween.current = null;
      place(to[0]!, to[1]!, to[2]!, to[3]!);
    } else {
      tween.current = { elapsed: 0, from, to };
    }
    invalidate();
  };

  const body = () => ({ distance: fitDistance(), targetY: BODY_TARGET_Y });

  useImperativeHandle(apiRef, () => ({
    view: (view) => {
      touched.current = true;
      go({ azimuth: VIEW_AZIMUTH[view], polar: NEUTRAL_POLAR });
    },
    frame: (framing) => {
      touched.current = true;
      if (framing === "body") go(body());
      else go({ distance: fitDistance() * 0.3, targetY: heightRef.current * 0.88 });
    },
    reset: () => {
      touched.current = false;
      go({ azimuth: VIEW_AZIMUTH.threeQuarter * 0.5, polar: NEUTRAL_POLAR, ...body() });
    },
    zoom: (factor) => {
      touched.current = true;
      go({ distance: MathUtils.clamp(current()[2]! * factor, MIN_DISTANCE, MAX_DISTANCE) });
    },
    orbit: (azimuth, polar) => {
      touched.current = true;
      const [fromAzimuth, fromPolar] = current();
      go({ azimuth: fromAzimuth! + azimuth, polar: MathUtils.clamp(fromPolar! + polar, MIN_POLAR, MAX_POLAR) });
    },
  }));

  useLayoutEffect(() => {
    if (touched.current) return;
    go({ azimuth: VIEW_AZIMUTH.threeQuarter * 0.5, polar: NEUTRAL_POLAR, ...body() }, true);
  }, [size.width, size.height]);

  useFrame((_, delta) => {
    const active = tween.current;
    if (!active) return;
    active.elapsed += Math.min(delta, 1 / 20);
    const raw = Math.min(active.elapsed / TWEEN_SECONDS, 1);
    const eased = 1 - (1 - raw) ** 3;
    const value = active.from.map((start, index) => start + (active.to[index]! - start) * eased);
    place(value[0]!, value[1]!, value[2]!, value[3]!);
    if (raw >= 1) tween.current = null;
    invalidate();
  }, -2);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.14}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      minPolarAngle={MIN_POLAR}
      maxPolarAngle={MAX_POLAR}
      onStart={() => {
        touched.current = true;
        tween.current = null;
      }}
    />
  );
}

const MIN_DISTANCE = 1.1;
const MAX_DISTANCE = 11;
const MIN_POLAR = 0.25;
const MAX_POLAR = Math.PI / 2 + 0.16;

function Stage() {
  return (
    <>
      <hemisphereLight args={["#ffffff", "#d6d1c7", 1.6]} />
      <directionalLight
        position={[2.4, 4.4, 3.4]}
        intensity={1.9}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-1.6}
        shadow-camera-right={1.6}
        shadow-camera-top={2.4}
        shadow-camera-bottom={-1.2}
        shadow-camera-near={1}
        shadow-camera-far={10}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        shadow-radius={5}
      />
      <directionalLight position={[-3, 2, 2]} intensity={0.55} />
      <directionalLight position={[0.5, 2.6, -4]} intensity={0.7} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3, 48]} />
        <shadowMaterial opacity={0.17} />
      </mesh>
    </>
  );
}

/** Tudo o que vive dentro do Canvas. O laço é sob demanda: parado, não renderiza. */
export function StudioScene({ spec, pose, motion, apiRef, onReady, onProblem }: {
  spec: CharacterSpec;
  pose: FigurePose;
  motion: boolean;
  apiRef: Ref<SceneApi>;
  onReady: () => void;
  onProblem: (message: string) => void;
}) {
  const rig = useRef<FigureRig | null>(null);
  const camera = useRef<CameraApi | null>(null);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const activeCamera = useThree((state) => state.camera);

  useImperativeHandle(apiRef, () => {
    return {
      camera: {
        view: (view) => camera.current?.view(view),
        frame: (framing) => camera.current?.frame(framing),
        reset: () => camera.current?.reset(),
        zoom: (factor) => camera.current?.zoom(factor),
        orbit: (azimuth, polar) => camera.current?.orbit(azimuth, polar),
      },
      capture: () => new Promise<Blob>((resolve, reject) => {
        gl.render(scene, activeCamera);
        gl.domElement.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar o PNG."))), "image/png");
      }),
      captureDataUrl: () => {
        gl.render(scene, activeCamera);
        return gl.domElement.toDataURL("image/png");
      },
      snapshot: () => rig.current?.snapshot() ?? null,
      frames: () => gl.info.render.frame,
      pixelRatio: () => gl.getPixelRatio(),
      loseContextForQa: () => {
        const extension = gl.getContext().getExtension("WEBGL_lose_context");
        if (!extension) return null;
        extension.loseContext();
        return () => extension.restoreContext();
      },
    };
  }, [gl, scene, activeCamera]);

  return (
    <>
      <Stage />
      <Suspense fallback={null}>
        <Figure spec={spec} pose={pose} motion={motion} rigRef={rig} onReady={onReady} onProblem={onProblem} />
      </Suspense>
      <CameraDirector apiRef={camera} heightM={spec.proportions.heightM} />
    </>
  );
}

export const CAMERA_FOV = FOV;
