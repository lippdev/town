import { useEffect, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { MOUSE, Vector3 } from "three";
import { CAMERA } from "@/config/constants";
import { useHQStore } from "@/state/useHQStore";
import { useReducedMotion } from "@/app/useReducedMotion";
import { ROOMS_BY_ID, roomCenter, roomSize } from "@/world/rooms/rooms";

export interface RigView {
  azimuthDeg: number;
  elevationDeg: number;
  distance: number;
  target: [number, number, number];
}

interface ControlsLike {
  target: Vector3;
  update: () => void;
}

interface CameraAnimation {
  fromPosition: Vector3;
  toPosition: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
  elapsed: number;
  duration: number;
}

const FOCUS_DURATION = 1.05;

/**
 * Mapeamento de botões. Atenção aos valores de `THREE.MOUSE`: `ROTATE` é 0 e
 * `PAN` é 2 — o valor aqui é a ação, não o código do botão. O OrbitControls não
 * tem ação "nenhuma": `LEFT: -1` cai no default do switch interno e o clique
 * esquerdo segue livre para o raycast de seleção.
 *
 * Esses campos são aplicados por impostação direta no efeito abaixo, porque a
 * aplicação via props JSX do drei não chega na instância.
 */
const MOUSE_BUTTONS = {
  LEFT: -1,
  MIDDLE: MOUSE.DOLLY,
  RIGHT: MOUSE.ROTATE,
};

function readView(cameraPosition: Vector3, target: Vector3): RigView {
  const offset = cameraPosition.clone().sub(target);
  const horizontal = Math.hypot(offset.x, offset.z);
  return {
    azimuthDeg: Number(((Math.atan2(offset.x, offset.z) * 180) / Math.PI).toFixed(2)),
    elevationDeg: Number(((Math.atan2(offset.y, horizontal) * 180) / Math.PI).toFixed(2)),
    distance: Number(offset.length().toFixed(2)),
    target: [target.x, target.y, target.z],
  };
}

export function CameraRig() {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as
    | (ControlsLike & {
        enablePan: boolean;
        mouseButtons: { LEFT: number; MIDDLE: number; RIGHT: number };
        addEventListener: (type: string, listener: () => void) => void;
        removeEventListener: (type: string, listener: () => void) => void;
      })
    | null;
  const cameraCommand = useHQStore((state) => state.cameraCommand);
  const reducedMotion = useReducedMotion();
  const animation = useRef<CameraAnimation | null>(null);

  useEffect(() => {
    if (!controls) return;
    controls.enablePan = false;
    controls.mouseButtons = { ...MOUSE_BUTTONS };

    const syncView = () => {
      useHQStore.setState({ cameraView: readView(camera.position, controls.target) });
    };
    controls.addEventListener("change", syncView);
    syncView();
    return () => controls.removeEventListener("change", syncView);
  }, [controls, camera]);

  useEffect(() => {
    if (!cameraCommand || !controls) return;

    const currentTarget = controls.target.clone();
    let nextTarget: Vector3;
    let nextPosition: Vector3;

    if (cameraCommand.kind === "reset" || !cameraCommand.roomId) {
      nextTarget = new Vector3(...CAMERA.target);
      nextPosition = new Vector3(...CAMERA.position);
    } else {
      const room = ROOMS_BY_ID[cameraCommand.roomId];
      if (!room) return;
      const center = roomCenter(room);
      const size = roomSize(room);
      nextTarget = new Vector3(center[0], 0.9, center[2]);

      const direction = camera.position.clone().sub(nextTarget);
      if (direction.lengthSq() < 0.01) direction.set(0.7, 1.1, 0.7);
      direction.normalize();

      const distance = Math.min(Math.max(size.width * 2.4, 26), 36);
      nextPosition = nextTarget.clone().add(direction.multiplyScalar(distance));
    }

    if (cameraCommand.instant || reducedMotion) {
      camera.position.copy(nextPosition);
      controls.target.copy(nextTarget);
      // descarrega todo resíduo de damping de manobras anteriores, sincronamente
      for (let i = 0; i < 200; i += 1) controls.update();
      return;
    }

    animation.current = {
      fromPosition: camera.position.clone(),
      toPosition: nextPosition,
      fromTarget: currentTarget,
      toTarget: nextTarget,
      elapsed: 0,
      duration: FOCUS_DURATION,
    };
  }, [cameraCommand, camera, controls]);

  useFrame((_, delta) => {
    const current = animation.current;
    if (!current || !controls) return;

    current.elapsed += delta;
    const progress = Math.min(1, current.elapsed / current.duration);
    const eased = progress * progress * (3 - 2 * progress);

    camera.position.lerpVectors(current.fromPosition, current.toPosition, eased);
    controls.target.lerpVectors(current.fromTarget, current.toTarget, eased);
    controls.update();

    if (progress >= 1) animation.current = null;
  });

  // movimento reduzido: sem amortecimento — a câmera obedece na hora
  const damping = reducedMotion ? 1 : CAMERA.dampingFactor;

  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={damping}
      enableRotate
      enableZoom
      minDistance={CAMERA.minDistance}
      maxDistance={CAMERA.maxDistance}
      minPolarAngle={CAMERA.minPolarAngle}
      maxPolarAngle={CAMERA.maxPolarAngle}
    />
  );
}
