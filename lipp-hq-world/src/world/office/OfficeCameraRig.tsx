import { visitPose } from "./officeVisit";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrthographicCamera } from "three";
import { useHQStore } from "@/state/useHQStore";
import { FLOOR_BOUNDS, OFFICE_ROOMS_BY_ID, OFFICE_SEATS_BY_ID, roomAt } from "./officeLayout";
import {
  FORWARD,
  clampView,
  fitView,
  panView,
  pickBoxAt,
  screenToGround,
  zoomLimits,
  zoomViewAt,
  type PickBox,
} from "./officeCamera";
import { FLOOR_MARGIN, currentInsets, floorFit, officeRuntime, useOfficeStore, zoomStep } from "./officeStore";

/** Longe o bastante para nada cruzar o plano próximo; na ortográfica não muda o tamanho. */
const DISTANCE = 45;
const EASE_PER_SECOND = 7;
/** Arrastar menos que isto ainda é clique. */
const CLICK_SLOP = 5;
const KEY_PAN = 60;

/** Caixas de clique das figuras: bem mais barato e estável que testar a malha com esqueleto. */
function botBoxes(onlyRoom?: string): PickBox[] {
  const { seating } = useOfficeStore.getState();
  return Object.entries(seating.seats).flatMap(([botId, seatId]) => {
    const seat = OFFICE_SEATS_BY_ID[seatId];
    if (!seat) return [];
    const pose = useOfficeStore.getState().mode === "demo" ? visitPose(botId) : null;
    const x = pose?.x ?? seat.x, z = pose?.z ?? seat.z;
    if (onlyRoom && (pose ? roomAt(x, z)?.id : seat.roomId) !== onlyRoom) return [];
    return [{ id: botId, minX: x - 0.38, maxX: x + 0.38, minY: 0, maxY: 1.85, minZ: z - 0.38, maxZ: z + 0.38 }];
  });
}

/**
 * O que está sob o pixel. A parede alta da sala em foco é sólida: o que aparece nela é a
 * própria sala, nunca a sala ou o bot escondidos atrás.
 */
function pickAt(px: number, py: number): { botId: string | null; roomId: string | null } {
  const { view, viewport } = officeRuntime;
  const focused = useOfficeStore.getState().focusedRoomId;
  if (focused) {
    const { bounds } = OFFICE_ROOMS_BY_ID[focused]!;
    const wall = pickBoxAt(px, py, view, viewport, [
      { id: focused, minX: bounds.minX - 0.2, maxX: bounds.maxX, minY: 0, maxY: 3, minZ: bounds.minZ - 0.2, maxZ: bounds.minZ },
      { id: focused, minX: bounds.minX - 0.2, maxX: bounds.minX, minY: 0, maxY: 3, minZ: bounds.minZ - 0.2, maxZ: bounds.maxZ },
    ]);
    if (wall) return { botId: pickBoxAt(px, py, view, viewport, botBoxes(focused)), roomId: wall };
  }
  const ground = screenToGround(px, py, view, viewport);
  return { botId: pickBoxAt(px, py, view, viewport, botBoxes()), roomId: roomAt(ground.x, ground.z)?.id ?? null };
}

/**
 * Câmera ortográfica fixa em 45°/30°, igual à da sala aprovada, com arrastar, zoom e
 * enquadramento. Os eventos ficam no palco, que também contém os rótulos.
 */
export function OfficeCameraRig({ stage }: { stage: HTMLElement }) {
  const camera = useThree((state) => state.camera) as OrthographicCamera;
  const size = useThree((state) => state.size);
  const reducedMotion = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useFrame((_, delta) => {
    const runtime = officeRuntime;
    runtime.viewport = { width: size.width, height: size.height };
    const store = useOfficeStore.getState();
    const insets = currentInsets();
    const floor = floorFit(runtime.viewport);
    runtime.floorZoom = floor.zoom;

    const room = store.focusedRoomId ? OFFICE_ROOMS_BY_ID[store.focusedRoomId] : null;
    if (store.framing === "floor") runtime.goal = floor;
    else if (store.framing === "room" && room) runtime.goal = fitView(room.bounds, runtime.viewport, insets, { margin: FLOOR_MARGIN });

    const step = !runtime.placed || reducedMotion.current ? 1 : 1 - Math.exp(-EASE_PER_SECOND * Math.min(delta, 0.05));
    runtime.placed = true;
    const { view, goal } = runtime;
    view.x += (goal.x - view.x) * step;
    view.z += (goal.z - view.z) * step;
    view.zoom += (goal.zoom - view.zoom) * step;

    camera.position.set(view.x - FORWARD[0] * DISTANCE, -FORWARD[1] * DISTANCE, view.z - FORWARD[2] * DISTANCE);
    camera.lookAt(view.x, 0, view.z);
    if (camera.zoom !== view.zoom) {
      camera.zoom = view.zoom;
      camera.updateProjectionMatrix();
    }
  });

  useEffect(() => {
    const pointers = new Map<number, { x: number; y: number }>();
    let dragged = false;
    let startX = 0;
    let startY = 0;
    let pinch = 0;

    const local = (event: { clientX: number; clientY: number }) => {
      const rect = stage.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const limits = () => zoomLimits(officeRuntime.floorZoom);
    const moveGoal = (next: typeof officeRuntime.goal) => {
      const { min, max } = limits();
      officeRuntime.goal = clampView(next, FLOOR_BOUNDS, min, max);
      useOfficeStore.getState().markFree();
    };
    const isBackground = (event: Event) => !(event.target as HTMLElement).closest("button, a, input, textarea");

    const onDown = (event: PointerEvent) => {
      if (!isBackground(event)) return;
      stage.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, local(event));
      if (pointers.size === 1) {
        dragged = false;
        startX = event.clientX;
        startY = event.clientY;
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        dragged = true;
      }
    };

    const hover = (point: { x: number; y: number }) => {
      const { botId, roomId } = pickAt(point.x, point.y);
      useOfficeStore.getState().setHovered(roomId, botId);
      stage.style.cursor = botId || roomId ? "pointer" : "grab";
    };

    const onMove = (event: PointerEvent) => {
      const point = local(event);
      const last = pointers.get(event.pointerId);
      if (!last) {
        if (isBackground(event)) hover(point);
        else useOfficeStore.getState().setHovered(null, null);
        return;
      }
      pointers.set(event.pointerId, point);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch > 0) {
          const { min, max } = limits();
          const next = Math.min(max, Math.max(min, officeRuntime.goal.zoom * (distance / pinch)));
          moveGoal(zoomViewAt(officeRuntime.goal, next, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2, officeRuntime.viewport));
          officeRuntime.view = { ...officeRuntime.goal };
        }
        pinch = distance;
        return;
      }
      if (!dragged && Math.hypot(event.clientX - startX, event.clientY - startY) < CLICK_SLOP) return;
      dragged = true;
      stage.style.cursor = "grabbing";
      moveGoal(panView(officeRuntime.goal, point.x - last.x, point.y - last.y));
      // Arrastar acompanha o dedo; a suavização é para os comandos.
      officeRuntime.view = { ...officeRuntime.goal };
    };

    const onUp = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (dragged || pointers.size > 0) return;
      const point = local(event);
      const store = useOfficeStore.getState();
      const { botId, roomId } = pickAt(point.x, point.y);
      if (botId) {
        store.selectBot(botId);
        return;
      }
      if (roomId) {
        if (roomId !== store.focusedRoomId) useHQStore.getState().clearSelection();
        store.focusRoom(roomId);
      } else {
        useHQStore.getState().clearSelection();
      }
    };

    const onCancel = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
    };

    const onWheel = (event: WheelEvent) => {
      if (!isBackground(event)) return;
      event.preventDefault();
      const point = local(event);
      const { min, max } = limits();
      const unit = event.deltaMode === 1 ? 16 : 1;
      const next = Math.min(max, Math.max(min, officeRuntime.goal.zoom * Math.exp(-event.deltaY * unit * (event.ctrlKey ? 0.01 : 0.0016))));
      moveGoal(zoomViewAt(officeRuntime.goal, next, point.x, point.y, officeRuntime.viewport));
    };

    const onLeave = () => useOfficeStore.getState().setHovered(null, null);

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea")) return;
      const store = useOfficeStore.getState();
      if (event.key === "Escape") {
        // Primeiro fecha a gaveta; só depois volta ao andar.
        if (useHQStore.getState().selectedBotId) useHQStore.getState().clearSelection();
        else store.backToFloor();
        return;
      }
      const pan: Record<string, [number, number]> = {
        ArrowLeft: [KEY_PAN, 0],
        ArrowRight: [-KEY_PAN, 0],
        ArrowUp: [0, KEY_PAN],
        ArrowDown: [0, -KEY_PAN],
      };
      const move = pan[event.key];
      if (move) {
        event.preventDefault();
        moveGoal(panView(officeRuntime.goal, move[0], move[1]));
      } else if (event.key === "+" || event.key === "=") zoomStep(1.25);
      else if (event.key === "-") zoomStep(0.8);
    };

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onCancel);
    stage.addEventListener("pointerleave", onLeave);
    stage.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onCancel);
      stage.removeEventListener("pointerleave", onLeave);
      stage.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [stage]);

  return null;
}
