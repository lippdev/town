import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { BASE_SLAB, WALL_HEIGHT } from "@/config/constants";
import { useHQStore } from "@/state/useHQStore";
import { ROOMS_BY_ID } from "@/world/rooms/rooms";
import { wallRuntime } from "@/world/walls/wallRuntime";
import { demoWalkToHall, getAgentRuntimeInfo } from "@/world/characters/Agents";
import type { Vector3Tuple, WallMode } from "@/types/hq";

export interface HqQaView {
  azimuthDeg: number;
  elevationDeg: number;
  distance: number;
  target: Vector3Tuple;
}

export interface HqQaFraming {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
  widthFraction: number;
  heightFraction: number;
}

export interface HqQaApi {
  setView: (options: {
    azimuthDeg?: number;
    elevationDeg?: number;
    distance?: number;
    target?: Vector3Tuple;
  }) => HqQaView;
  getView: () => HqQaView;
  setWallMode: (mode: WallMode) => void;
  getCutawayWalls: () => string[];
  getSignPositions: () => Array<{ id: string; position: Vector3Tuple }>;
  countWalls: () => number;
  getFraming: (roomId?: string) => HqQaFraming;
  controlsInfo: () => {
    mouseButtons: { LEFT: number; MIDDLE: number; RIGHT: number };
    enableRotate: boolean;
    enablePan: boolean;
    enableDamping: boolean;
    dampingFactor: number;
    enabled: boolean;
    azimuth: number;
  } | null;
  select: (roomId: string) => void;
  demoCommand: (agentId: string, state: "working" | "meeting" | "walking" | "idle") => void;
  setDemoPaused: (paused: boolean) => void;
  getAgentPose: (agentId: string) => { x: number; z: number; state: string } | null;
  getAgentScreenPoint: (agentId: string) => { x: number; y: number } | null;
  focus: (roomId: string, options?: { instant?: boolean }) => void;
  reset: (options?: { instant?: boolean }) => void;
  getSelection: () => { roomId: string | null; agentId: string | null };
}

declare global {
  interface Window {
    /** Ponte usada pelo harness de QA visual para posicionar a câmera e ler o estado. */
    __HQ_QA__?: HqQaApi;
    /** Instância dos OrbitControls, para diagnóstico de controles no QA. */
    __HQ_CONTROLS__?: unknown;
  }
}

interface ControlsLike {
  target: Vector3;
  update: () => void;
}

function summarize(cameraPosition: Vector3, target: Vector3): HqQaView {
  const offset = cameraPosition.clone().sub(target);
  const distance = offset.length();
  const horizontal = Math.hypot(offset.x, offset.z);
  return {
    azimuthDeg: Number(((Math.atan2(offset.x, offset.z) * 180) / Math.PI).toFixed(2)),
    elevationDeg: Number(((Math.atan2(offset.y, horizontal) * 180) / Math.PI).toFixed(2)),
    distance: Number(distance.toFixed(2)),
    target: [Number(target.x.toFixed(2)), Number(target.y.toFixed(2)), Number(target.z.toFixed(2))],
  };
}

/**
 * Expoe um controlador determinístico da cena para as capturas automatizadas.
 * Só existe para QA: não altera estado de domínio, apenas posiciona câmera e lê
 * o resultado do sistema de paredes.
 */
export function QaBridge() {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const controls = useThree((state) => state.controls) as ControlsLike | null;
  const setWallMode = useHQStore((state) => state.setWallMode);

  useEffect(() => {
    const api: HqQaApi = {
      setView: ({ azimuthDeg = 45, elevationDeg = 34, distance = 56, target = [0, 0, 0] }) => {
        const azimuth = (azimuthDeg * Math.PI) / 180;
        const elevation = (elevationDeg * Math.PI) / 180;
        const targetVector = new Vector3(target[0], target[1], target[2]);
        const offset = new Vector3(
          Math.cos(elevation) * Math.sin(azimuth),
          Math.sin(elevation),
          Math.cos(elevation) * Math.cos(azimuth),
        ).multiplyScalar(distance);

        camera.position.copy(targetVector.clone().add(offset));
        camera.lookAt(targetVector);
        if (controls) {
          controls.target.copy(targetVector);
          controls.update();
        }
        return summarize(camera.position, targetVector);
      },
      getView: () => {
        const stored = useHQStore.getState().cameraView;
        if (stored) return stored;
        return summarize(camera.position, controls ? controls.target : new Vector3(0, 0, 0));
      },
      setWallMode: (mode) => setWallMode(mode),
      getCutawayWalls: () => [...wallRuntime.cutaway].sort(),
      getSignPositions: () => {
        const found: Array<{ id: string; position: Vector3Tuple }> = [];
        scene.traverse((object) => {
          if (object.name.startsWith("room-sign-")) {
            const world = new Vector3();
            object.getWorldPosition(world);
            found.push({
              id: object.name.replace("room-sign-", ""),
              position: [
                Number(world.x.toFixed(2)),
                Number(world.y.toFixed(2)),
                Number(world.z.toFixed(2)),
              ],
            });
          }
        });
        return found.sort((a, b) => a.id.localeCompare(b.id));
      },
      countWalls: () => {
        let count = 0;
        scene.traverse((object) => {
          if (object.name === "wall-group") count += 1;
        });
        return count;
      },
      controlsInfo: () => {
        const instance = window.__HQ_CONTROLS__ as
          | {
              mouseButtons: { LEFT: number; MIDDLE: number; RIGHT: number };
              enableRotate: boolean;
              enablePan: boolean;
              enableDamping: boolean;
              dampingFactor: number;
              enabled: boolean;
              getAzimuthalAngle: () => number;
            }
          | undefined;
        if (!instance?.getAzimuthalAngle) return null;
        return {
          mouseButtons: instance.mouseButtons,
          enableRotate: instance.enableRotate,
          enablePan: instance.enablePan,
          enableDamping: instance.enableDamping,
          dampingFactor: instance.dampingFactor,
          enabled: instance.enabled,
          azimuth: Number(instance.getAzimuthalAngle().toFixed(3)),
        };
      },
      select: (roomId) => useHQStore.getState().selectRoom(roomId),
      getAgentPose: (agentId) => getAgentRuntimeInfo(agentId),
      setDemoPaused: (paused) => useHQStore.getState().setDemoPaused(paused),
      demoCommand: (agentId, state) => {
        if (state === "walking") {
          demoWalkToHall(agentId);
          useHQStore.getState().setAgentState(agentId, "walking", "Simulação: caminhando até o hall.");
          return;
        }
        useHQStore.getState().setAgentState(agentId, state, `Simulação: estado ${state}.`);
      },
      getAgentScreenPoint: (agentId) => {
        let found: { x: number; y: number } | null = null;
        scene.traverse((object) => {
          if (found) return;
          if (object.name === `agent-${agentId}` && "position" in object) {
            const world = new Vector3();
            object.getWorldPosition(world);
            world.y += 0.9;
            const projected = world.clone().project(camera);
            found = {
              x: ((projected.x + 1) / 2) * window.innerWidth,
              y: ((1 - projected.y) / 2) * window.innerHeight,
            };
          }
        });
        return found;
      },
      focus: (roomId, options) => useHQStore.getState().focusRoom(roomId, options),
      reset: (options) => useHQStore.getState().resetCamera(options),
      getSelection: () => {
        const state = useHQStore.getState();
        return { roomId: state.selectedRoomId, agentId: state.selectedAgentId };
      },
      getFraming: (roomId) => {
        let x0: number = BASE_SLAB.minX;
        let x1: number = BASE_SLAB.maxX;
        let z0: number = BASE_SLAB.minZ;
        let z1: number = BASE_SLAB.maxZ;
        if (roomId) {
          const room = ROOMS_BY_ID[roomId];
          if (!room) throw new Error(`Sala desconhecida: ${roomId}`);
          x0 = room.bounds.minX;
          x1 = room.bounds.maxX;
          z0 = room.bounds.minZ;
          z1 = room.bounds.maxZ;
        }
        const corners: Vector3[] = [];
        for (const x of [x0, x1]) {
          for (const y of [-BASE_SLAB.thickness, WALL_HEIGHT]) {
            for (const z of [z0, z1]) {
              corners.push(new Vector3(x, y, z).project(camera));
            }
          }
        }
        const xs = corners.map((corner) => (corner.x + 1) / 2);
        const ys = corners.map((corner) => (1 - corner.y) / 2);
        const minX = Number(Math.min(...xs).toFixed(4));
        const maxX = Number(Math.max(...xs).toFixed(4));
        const minY = Number(Math.min(...ys).toFixed(4));
        const maxY = Number(Math.max(...ys).toFixed(4));
        return {
          minX,
          minY,
          maxX,
          maxY,
          centerX: Number(((minX + maxX) / 2).toFixed(4)),
          centerY: Number(((minY + maxY) / 2).toFixed(4)),
          widthFraction: Number((maxX - minX).toFixed(4)),
          heightFraction: Number((maxY - minY).toFixed(4)),
        };
      },
    };

    window.__HQ_QA__ = api;
    window.__HQ_CONTROLS__ = controls ?? null;
    return () => {
      delete window.__HQ_QA__;
    };
  }, [camera, controls, scene, setWallMode]);

  return null;
}
