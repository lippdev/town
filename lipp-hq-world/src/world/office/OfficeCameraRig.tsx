import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrthographicCamera } from "three";
import { useHQStore } from "@/state/useHQStore";
import { BUILDING_ROOMS_BY_ID, FACADE_BOUNDS_LEVELS, HIDEOUT, floorAtLevel, neighborView, viewRoomAt } from "./officeBuilding";
import { OFFICE_SEATS_BY_ID } from "./officeLayout";
import {
  FORWARD,
  clampView,
  panView,
  pickBoxAt,
  screenToGround,
  zoomLimits,
  zoomViewAt,
  type PickBox,
} from "./officeCamera";
import { secretSpotsOf, useSecretStore, type SecretSpotId } from "./officeSecrets";
import { aimCamera, applyTravel, cameraEaseStep, panBounds, humanActors, officeRuntime, robotActors, stepTravel, triggerSpot, useOfficeStore, zoomStep } from "./officeStore";

/** Longe o bastante para nada cruzar o plano próximo; na ortográfica não muda o tamanho. */
/** Longe o bastante para o prédio mais perto, com a tela no zoom mínimo, não ser cortado. */
const DISTANCE = 200;
/** Arrastar menos que isto ainda é clique. */
const CLICK_SLOP = 5;
const KEY_PAN = 60;

/**
 * Caixas de clique dos robôs: bem mais barato e estável que testar a malha. Vão do chão ao
 * alto da cabeça, de onde o robô estiver agora; na sala em foco, só os daquela sala.
 */
function botBoxes(onlyRoom?: string): PickBox[] {
  const { seating, buildingView } = useOfficeStore.getState();
  // Bot só existe no escritório: fora dele, um clique nunca acha quem não está na tela.
  if (buildingView !== "operacao") return [];
  return Object.entries(seating.seats).flatMap(([botId, seatId]) => {
    const seat = OFFICE_SEATS_BY_ID[seatId];
    if (!seat || (onlyRoom && seat.roomId !== onlyRoom)) return [];
    const actor = robotActors.get(botId);
    const x = actor?.position.x ?? seat.x;
    const z = actor?.position.z ?? seat.z;
    const top = actor ? actor.position.y + actor.rig.height : 2.1;
    return [{ id: botId, minX: x - 0.38, maxX: x + 0.38, minY: 0, maxY: top, minZ: z - 0.38, maxZ: z + 0.38 }];
  });
}

/** Pessoa anda: a caixa dela sai de onde ela está agora. */
function humanBoxes(onlyRoom?: string): PickBox[] {
  const { humans } = useOfficeStore.getState();
  return [...humanActors].flatMap(([id, actor]) => {
    // Quem ainda está chegando não tem corpo à vista, e não se clica no que não se vê.
    if (!actor.holder.visible) return [];
    if (onlyRoom && humans.find((human) => human.id === id)?.roomId !== onlyRoom) return [];
    const { x, z } = actor.position;
    return [{ id, minX: x - 0.3, maxX: x + 0.3, minY: 0, maxY: 1.55, minZ: z - 0.3, maxZ: z + 0.3 }];
  });
}

/** Separa a resposta do clique: a mesma lista de caixas serve para bot e pessoa. */
function who(id: string | null): { botId: string | null; humanId: string | null } {
  if (id && humanActors.has(id)) return { botId: null, humanId: id };
  return { botId: id, humanId: null };
}

/**
 * O que está sob o pixel. A parede alta da sala em foco é sólida: o que aparece nela é a
 * própria sala, nunca a sala ou o bot escondidos atrás.
 */
function pickAt(px: number, py: number): { botId: string | null; humanId: string | null; roomId: string | null } {
  const { view, viewport } = officeRuntime;
  const { focusedRoomId: focused, buildingView } = useOfficeStore.getState();
  // Com o prédio fechado, não há sala nem gente para achar.
  if (buildingView === "exterior") return { botId: null, humanId: null, roomId: null };
  if (focused) {
    const { bounds } = BUILDING_ROOMS_BY_ID[focused]!;
    const wall = pickBoxAt(px, py, view, viewport, [
      { id: focused, minX: bounds.minX - 0.2, maxX: bounds.maxX, minY: 0, maxY: 3, minZ: bounds.minZ - 0.2, maxZ: bounds.minZ },
      { id: focused, minX: bounds.minX - 0.2, maxX: bounds.minX, minY: 0, maxY: 3, minZ: bounds.minZ - 0.2, maxZ: bounds.maxZ },
    ]);
    if (wall) return { ...who(pickBoxAt(px, py, view, viewport, [...botBoxes(focused), ...humanBoxes(focused)])), roomId: wall };
  }
  const ground = screenToGround(px, py, view, viewport);
  return { ...who(pickBoxAt(px, py, view, viewport, [...botBoxes(), ...humanBoxes()])), roomId: viewRoomAt(buildingView, ground.x, ground.z)?.id ?? null };
}

/** O segredo sob o pixel, se houver. Só a estante aberta tem o que fazer com o livro de longe. */
function spotAt(px: number, py: number): SecretSpotId | null {
  const { buildingView, mode } = useOfficeStore.getState();
  if (mode !== "demo") return null;
  const spots = secretSpotsOf(buildingView);
  if (spots.length === 0) return null;
  return pickBoxAt(px, py, officeRuntime.view, officeRuntime.viewport, spots.map((spot) => ({ id: spot.id, ...spot.box }))) as SecretSpotId | null;
}

/** O pavimento da fachada sob o pixel, com o prédio fechado. */
function levelAt(px: number, py: number): number | null {
  if (useOfficeStore.getState().buildingView !== "exterior") return null;
  const hit = pickBoxAt(px, py, officeRuntime.view, officeRuntime.viewport, FACADE_BOUNDS_LEVELS);
  return hit === null ? null : Number(hit);
}

/**
 * Câmera ortográfica fixa em 45°/30°, igual à da sala aprovada, com arrastar, zoom e
 * enquadramento. Os eventos ficam no palco, que também contém os rótulos.
 */
export function OfficeCameraRig({ stage }: { stage: HTMLElement }) {
  const camera = useThree((state) => state.camera) as OrthographicCamera;
  const size = useThree((state) => state.size);
  const gl = useThree((state) => state.gl);
  const reducedMotion = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useFrame((_, delta) => {
    const runtime = officeRuntime;
    runtime.viewport = { width: size.width, height: size.height };
    aimCamera();

    if (runtime.travel.flight) {
      stepTravel(delta);
    } else {
      const step = !runtime.placed || reducedMotion.current ? 1 : cameraEaseStep(delta);
      const { view, goal } = runtime;
      view.x += (goal.x - view.x) * step;
      view.z += (goal.z - view.z) * step;
      view.zoom += (goal.zoom - view.zoom) * step;
    }
    runtime.placed = true;
    // Câmera, âncora, fachada e andar mudam juntos, antes de desenhar: nenhum quadro vê um sem o outro.
    if (applyTravel()) gl.shadowMap.needsUpdate = true;
    const { view } = runtime;
    const lift = runtime.travel.elevation - runtime.travel.root;

    camera.position.set(view.x - FORWARD[0] * DISTANCE, lift - FORWARD[1] * DISTANCE, view.z - FORWARD[2] * DISTANCE);
    camera.lookAt(view.x, lift, view.z);
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
      officeRuntime.goal = clampView(next, panBounds(), min, max);
      useOfficeStore.getState().markFree();
    };
    const isBackground = (event: Event) => !(event.target as HTMLElement).closest("button, a, input, textarea");
    /** Na viagem a cena não tem chão parado para apontar: o gesto espera a chegada. A barra lateral não. */
    const moving = () => officeRuntime.travel.flight !== null;

    const onDown = (event: PointerEvent) => {
      if (!isBackground(event) || moving()) return;
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
      if (moving()) {
        useOfficeStore.getState().setHovered(null, null);
        useOfficeStore.getState().setHoveredLevel(null);
        useSecretStore.getState().setActiveSpot(null);
        stage.style.cursor = "";
        return;
      }
      const { botId, humanId, roomId } = pickAt(point.x, point.y);
      const store = useOfficeStore.getState();
      store.setHovered(roomId, botId, humanId);
      // Bot ou pessoa na frente de um segredo ganham: é neles que se está clicando.
      const spot = botId || humanId ? null : spotAt(point.x, point.y);
      useSecretStore.getState().setActiveSpot(spot);
      if (spot) {
        stage.style.cursor = "pointer";
        store.setHoveredLevel(null);
        return;
      }
      // Só pavimento com interior responde: os outros são fachada.
      const level = levelAt(point.x, point.y);
      const usable = level !== null && floorAtLevel(level) ? level : null;
      store.setHoveredLevel(usable);
      stage.style.cursor = botId || humanId || roomId || usable !== null ? "pointer" : "grab";
    };

    const onMove = (event: PointerEvent) => {
      const point = local(event);
      const last = pointers.get(event.pointerId);
      if (!last) {
        if (isBackground(event)) hover(point);
        else useOfficeStore.getState().setHovered(null, null);
        return;
      }
      if (moving()) { pointers.clear(); pinch = 0; dragged = true; return; }
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
      if (dragged || pointers.size > 0 || moving()) return;
      const point = local(event);
      const store = useOfficeStore.getState();
      const level = levelAt(point.x, point.y);
      const floor = level === null ? null : floorAtLevel(level);
      if (floor) {
        store.goToView(floor);
        return;
      }
      const { botId, humanId, roomId } = pickAt(point.x, point.y);
      const spot = botId || humanId ? null : spotAt(point.x, point.y);
      if (spot) {
        triggerSpot(spot);
        return;
      }
      if (botId) {
        store.selectBot(botId);
        return;
      }
      if (humanId) {
        store.selectHuman(humanId);
        return;
      }
      if (roomId) {
        if (roomId !== store.focusedRoomId) {
          useHQStore.getState().clearSelection();
          store.clearHuman();
        }
        store.focusRoom(roomId);
      } else {
        useHQStore.getState().clearSelection();
        store.clearHuman();
      }
    };

    const onCancel = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
    };

    const onWheel = (event: WheelEvent) => {
      if (!isBackground(event)) return;
      event.preventDefault();
      if (moving()) return;
      const point = local(event);
      const { min, max } = limits();
      const unit = event.deltaMode === 1 ? 16 : 1;
      const next = Math.min(max, Math.max(min, officeRuntime.goal.zoom * Math.exp(-event.deltaY * unit * (event.ctrlKey ? 0.01 : 0.0016))));
      moveGoal(zoomViewAt(officeRuntime.goal, next, point.x, point.y, officeRuntime.viewport));
    };

    const onLeave = () => {
      useOfficeStore.getState().setHovered(null, null);
      useOfficeStore.getState().setHoveredLevel(null);
      useSecretStore.getState().setActiveSpot(null);
    };

    const onKey = (event: KeyboardEvent) => {
      const workspace = stage.parentElement?.querySelector<HTMLElement>("[data-office-view]");
      if (workspace && workspace.dataset.officeView !== "escritorio") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [data-scene-keys-off]")) return;
      const store = useOfficeStore.getState();
      if (event.key === "Escape") {
        // O menu da conta ouve o Esc por conta própria: a cena não reage junto.
        if (stage.ownerDocument.querySelector("[data-account-menu]")) return;
        // Primeiro fecha a gaveta; só depois volta ao andar.
        if (useHQStore.getState().selectedBotId) useHQStore.getState().clearSelection();
        else if (store.selectedHumanId) store.clearHuman();
        else if (store.framing !== "floor") store.backToFloor();
        // Do esconderijo, sai por onde entrou.
        else if (store.buildingView === HIDEOUT) store.goToView("diretoria");
        // Já vendo o andar inteiro, mais um Esc sai do prédio.
        else store.goToView("exterior");
        return;
      }
      if ((event.key === "PageUp" || event.key === "PageDown") && store.mode === "demo") {
        event.preventDefault();
        store.goToView(neighborView(store.buildingView, event.key === "PageUp" ? 1 : -1));
        return;
      }
      if (moving()) return;
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
