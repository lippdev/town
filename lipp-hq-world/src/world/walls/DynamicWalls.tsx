import { useCallback, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group } from "three";
import { WALL_VISIBILITY } from "@/config/constants";
import { useHQStore } from "@/state/useHQStore";
import { ROOMS_BY_ID } from "@/world/rooms/rooms";
import { computeWallOcclusion, shouldCutaway, targetPanelScale } from "@/world/walls/occlusion";
import { WALLS } from "@/world/walls/walls";
import { wallRuntime } from "@/world/walls/wallRuntime";
import { WallSegment } from "@/world/walls/WallSegment";
import type { Vector3Tuple, WallDefinition } from "@/types/hq";

/** Distância mínima de câmera para reavaliar a oclusão de todas as paredes. */
const CAMERA_EPSILON = 0.12;

/** Amostras de um muro de perímetro: pontos do corredor logo atrás dele. */
function capSamples(wall: WallDefinition): Vector3Tuple[] {
  const inward: [number, number] = [-wall.outward[0], -wall.outward[2]];
  const offsets = [0.18, 0.5, 0.82];
  const length = wall.end - wall.start;

  return offsets.map((ratio) => {
    const along = wall.start + length * ratio;
    const depth = 1.35;
    return wall.axis === "x"
      ? [along + inward[0] * 0, 0, wall.fixed + inward[1] * depth]
      : [wall.fixed + inward[0] * depth, 0, along];
  });
}

const CAP_SAMPLES = new Map<string, Vector3Tuple[]>(
  WALLS.filter((wall) => wall.roomId === null).map((wall) => [wall.id, capSamples(wall)]),
);

/**
 * Sistema de paredes dinâmicas: avalia a câmera, decide quais paredes entram em
 * cutaway e anima o painel superior por referência direta, sem re-render.
 */
export function DynamicWalls() {
  const wallMode = useHQStore((state) => state.wallMode);
  const selectedRoomId = useHQStore((state) => state.selectedRoomId);
  const { camera } = useThree();

  const panels = useRef(new Map<string, Group>());
  const decisions = useRef(new Map<string, boolean>());
  const lastCamera = useRef({ x: Number.NaN, z: Number.NaN });

  useEffect(() => {
    wallRuntime.mode = wallMode;
  }, [wallMode]);

  const register = useCallback((wallId: string, node: Group | null) => {
    if (node) panels.current.set(wallId, node);
    else panels.current.delete(wallId);
  }, []);

  useFrame((_, delta) => {
    const position = camera.position;
    const moved =
      !Number.isFinite(lastCamera.current.x) ||
      Math.hypot(position.x - lastCamera.current.x, position.z - lastCamera.current.z) >
        CAMERA_EPSILON;

    if (moved) {
      lastCamera.current = { x: position.x, z: position.z };
      wallRuntime.evaluations += 1;
      wallRuntime.cutaway.clear();

      for (const wall of WALLS) {
        const room = wall.roomId ? ROOMS_BY_ID[wall.roomId] : undefined;
        const samples = room ? room.samples : (CAP_SAMPLES.get(wall.id) ?? []);
        if (samples.length === 0) {
          decisions.current.set(wall.id, false);
          continue;
        }

        const occlusion = computeWallOcclusion(wall, samples, {
          x: position.x,
          y: position.y,
          z: position.z,
        });

        const focused = Boolean(room && room.id === selectedRoomId);
        const forcedByFocus = focused && occlusion.facingScore > 0.02;
        const next =
          forcedByFocus || shouldCutaway(occlusion, decisions.current.get(wall.id) ?? false);

        decisions.current.set(wall.id, next);
        if (next) wallRuntime.cutaway.add(wall.id);
      }
    }

    const factor = Math.min(1, delta * WALL_VISIBILITY.transitionSpeed);
    for (const wall of WALLS) {
      const node = panels.current.get(wall.id);
      if (!node) continue;
      const target = targetPanelScale(decisions.current.get(wall.id) ?? false, wallMode);
      node.scale.y += (target - node.scale.y) * factor;
      node.visible = node.scale.y > 0.05;
    }
  });

  return (
    <group name="walls">
      {WALLS.map((wall) => (
        <WallSegment key={wall.id} wall={wall} registerPanel={register} />
      ))}
    </group>
  );
}
