import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Raycaster, Vector2 } from "three";
import { useHQStore } from "@/state/useHQStore";

import { AGENTS_BY_ID } from "@/agents/agents";

const raycaster = new Raycaster();
const pointer = new Vector2();

/** Grupos marcados como selecionáveis, varridos da cena a cada clique. */
let pickables: import("three").Object3D[] = [];

export function registerPickable(object: import("three").Object3D) {
  if (!pickables.includes(object)) pickables.push(object);
}

/** Sobe a árvore até achar a marcação de agente ou sala. */
function pickInfo(object: import("three").Object3D): { agentId?: string; roomId?: string } {
  let node: import("three").Object3D | null = object;
  while (node) {
    const agentId = node.userData?.agentId as string | undefined;
    const roomId = node.userData?.roomId as string | undefined;
    if (agentId || roomId) return { agentId, roomId };
    node = node.parent;
  }
  return {};
}

function collectPickables(): import("three").Object3D[] {
  return pickables.filter((object) => {
    let root: import("three").Object3D | null = object;
    while (root) {
      if (!root.parent && root.type !== "Scene") return false;
      root = root.parent;
    }
    return true;
  });
}

/** Distância máxima de arranque de arrasto que ainda conta como clique. */
const CLICK_SLOP = 6;

/**
 * Seleção por clique: sala pelo piso, agente pela figura. Um arrasto que passou
 * de CLICK_SLOP não é clique — evita selecionar ao girar a câmera.
 */
export function Picking() {
  const { camera, gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    let downX = 0;
    let downY = 0;
    let downButton = -1;

    const onPointerDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
      downButton = event.button;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (downButton !== 0) return;
      const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
      if (moved > CLICK_SLOP) return;

      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);

      const hits = raycaster.intersectObjects(collectPickables(), true);
      for (const hit of hits) {
        const info = pickInfo(hit.object);
        if (info.agentId && AGENTS_BY_ID[info.agentId]) {
          useHQStore.getState().selectAgent(info.agentId);
          return;
        }
        if (info.roomId) {
          useHQStore.getState().selectRoom(info.roomId);
          return;
        }
      }

      useHQStore.getState().clearSelection();
    };

    const onDoubleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);

      const hits = raycaster.intersectObjects(collectPickables(), true);
      for (const hit of hits) {
        const roomId = hit.object.userData?.roomId as string | undefined;
        if (roomId) {
          useHQStore.getState().focusRoom(roomId);
          return;
        }
      }
      useHQStore.getState().resetCamera();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("dblclick", onDoubleClick);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("dblclick", onDoubleClick);
    };
  }, [camera, gl]);

  return null;
}
