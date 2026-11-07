import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Box3, OrthographicCamera, type Scene, type WebGLRenderer } from "three";
import { useHQStore } from "@/state/useHQStore";
import { BUILDING_HEIGHT, BUILDING_ROOMS_BY_ID, CROWN_HEIGHT, FACADE_BOUNDS, HELIPAD, STORY } from "./officeBuilding";
import { OFFICE_SEATS_BY_ID } from "./officeLayout";
import { worldToScreen } from "./officeCamera";
import { SECRET_SPOTS, useSecretStore } from "./officeSecrets";
import { humanActors, humanFigures, officeRuntime, robotActors, sceneryActors, useOfficeStore } from "./officeStore";

declare global {
  interface Window {
    /** Ponte de leitura para o harness scripts/visual-qa/office.mjs. */
    __HQ_OFFICE_QA__?: ReturnType<typeof officeQaApi>;
  }
}

function officeQaApi(gl: WebGLRenderer, scene: Scene) {
  return {
    cutPlateBounds: () => {
      const plate = scene.getObjectByName("laje-do-corte");
      if (!plate?.visible) return null;
      const box = new Box3().setFromObject(plate);
      return { top: box.max.y, bottom: box.min.y };
    },
    renderInfo: () => {
      let lights = 0;
      let shadowLights = 0;
      scene.traverse((object) => {
        const light = object as { isLight?: boolean; castShadow?: boolean };
        if (light.isLight && object.visible) {
          lights += 1;
          if (light.castShadow) shadowLights += 1;
        }
      });
      const { graphicsMode, autoQuality } = useHQStore.getState();
      return {
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        programs: gl.info.programs?.length ?? 0,
        lights,
        shadowLights,
        pixelRatio: gl.getPixelRatio(),
        graphicsMode,
        autoQuality,
      };
    },
    state: () => {
      const store = useOfficeStore.getState();
      return {
        buildingView: store.buildingView,
        traveling: store.traveling,
        mountedFloors: store.mountedFloors,
        shownFloor: store.shownFloor,
        travel: { cut: officeRuntime.travel.cut, elevation: officeRuntime.travel.elevation, root: officeRuntime.travel.root, plate: officeRuntime.travel.plate, progress: officeRuntime.travel.progress },
        focusedRoomId: store.focusedRoomId,
        scenery: [...sceneryActors].map(([id, actor]) => ({ id, phase: actor.phase, position: actor.position, heading: actor.heading, chair: actor.chair })),
        chiefStatus: store.chiefStatus,
        daylight: store.daylight,
        framing: store.framing,
        load: store.load,
        figuresError: store.figuresError,
        selectedBotId: useHQStore.getState().selectedBotId,
        view: { ...officeRuntime.view },
        goal: { ...officeRuntime.goal },
        bots: store.bots.map((bot) => bot.id),
        seats: store.seating.seats,
        unseated: store.seating.unseated,
        rigs: [...robotActors.keys()].sort(),
        robots: Object.fromEntries([...robotActors].map(([id, actor]) => [id, { ...actor.position, flown: actor.flown, height: actor.rig.height, look: actor.rig.snapshot() }])),
        humans: store.humans.map((human) => ({
          id: human.id,
          name: human.name,
          phase: store.humanPhases[human.id] ?? null,
          floor: human.floor,
          mounted: humanActors.has(human.id),
          visible: humanActors.get(human.id)?.holder.visible ?? false,
          position: humanActors.get(human.id)?.position ?? null,
          heading: humanActors.get(human.id)?.heading ?? null,
          seat: human.chair,
          chairPose: humanActors.get(human.id)?.chair ?? null,
          worn: humanFigures.get(human.id)?.snapshot() ?? null,
        })),
        humansWaiting: store.humansWaiting,
        humansError: store.humansError,
        selectedHumanId: store.selectedHumanId,
        secrets: (({ doorOpen, found, clockHint, file, signal, engine, coin, coinFlips, activeSpot }) => ({ doorOpen, found, clockHint, file, signal, engine, coin, coinFlips, activeSpot }))(useSecretStore.getState()),
      };
    },
    /** Ossos que encostam nos móveis, em metros do andar, lidos do esqueleto vivo. */
    humanJoints: (id: string) => humanFigures.get(id)?.joints() ?? null,
    /**
     * Foto de perto, com câmera própria: corte ortográfico que só enxerga depois de `near`,
     * para o móvel vizinho não tapar a cadeira. A câmera da cena fica como está.
     */
    closeup: ({ eye, target, height = 1.8, near = 0.01, far = 12 }: { eye: [number, number, number]; target: [number, number, number]; height?: number; near?: number; far?: number }) => {
      const { width, height: pixels } = gl.domElement;
      const half = height / 2;
      const aspect = width / pixels;
      const camera = new OrthographicCamera(-half * aspect, half * aspect, half, -half, near, far);
      camera.position.set(...eye);
      camera.lookAt(...target);
      camera.updateMatrixWorld();
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/png");
    },
    /** Congela a viagem nesta fração do tempo (null solta): é o que deixa fotografar o meio dela. */
    holdTravel: (fraction: number | null) => {
      officeRuntime.travel.hold = fraction;
    },
    /** Pixel do meio da pessoa, onde ela estiver agora. */
    humanPoint: (id: string) => {
      const position = humanActors.get(id)?.position;
      return position ? worldToScreen([position.x, position.y + 0.7, position.z], officeRuntime.view, officeRuntime.viewport) : null;
    },
    /** Pixel do meio de uma figura de cenário: o harness prova que clicar nela não abre nada. */
    sceneryPoint: (id: string) => {
      const position = sceneryActors.get(id)?.position;
      return position ? worldToScreen([position.x, position.y + 1.0, position.z], officeRuntime.view, officeRuntime.viewport) : null;
    },
    /** Pixel do meio do robô na tela, onde ele estiver agora, para o harness clicar nele. */
    botPoint: (botId: string) => {
      const robot = robotActors.get(botId);
      const seat = OFFICE_SEATS_BY_ID[useOfficeStore.getState().seating.seats[botId] ?? ""];
      if (robot) return worldToScreen([robot.position.x, robot.position.y + robot.rig.height / 2, robot.position.z], officeRuntime.view, officeRuntime.viewport);
      return seat ? worldToScreen([seat.x, 1.5, seat.z], officeRuntime.view, officeRuntime.viewport) : null;
    },
    /** Só para provar o que está montado: há um objeto com este nome na cena? */
    objectNamed: (name: string) => scene.getObjectByName(name) !== undefined,
    objectVisible: (name: string) => {
      const object = scene.getObjectByName(name);
      if (!object) return false;
      for (let current = object; current; current = current.parent!) if (!current.visible) return false;
      return true;
    },
    /** Pixel do meio de um segredo: o harness clica na cena como quem usa o mouse. */
    secretPoint: (id: string) => {
      const box = SECRET_SPOTS.find((spot) => spot.id === id)!.box;
      return worldToScreen([(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2], officeRuntime.view, officeRuntime.viewport);
    },
    /** Pixel do meio de um pavimento na fachada, com o prédio fechado. */
    levelPoint: (level: number) => worldToScreen([FACADE_BOUNDS.maxX, (level + 0.5) * STORY, FACADE_BOUNDS.maxZ - 3], officeRuntime.view, officeRuntime.viewport),
    /** Pixel da ponta do mastro, para provar que a coroa cabe no enquadramento. */
    spirePoint: () => worldToScreen([HELIPAD.x + HELIPAD.mast.x, BUILDING_HEIGHT + CROWN_HEIGHT, HELIPAD.z + HELIPAD.mast.z], officeRuntime.view, officeRuntime.viewport),
    /** Pixel de um ponto livre do chão da sala. */
    roomPoint: (roomId: string, localX = 0, localZ = 0) => {
      const room = BUILDING_ROOMS_BY_ID[roomId]!;
      return worldToScreen([room.center.x + localX, 0, room.center.z + localZ], officeRuntime.view, officeRuntime.viewport);
    },
  };
}

/** Só leitura: nada aqui muda a cena. A foto de perto desenha um quadro a mais, e só. */
export function OfficeQa() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    window.__HQ_OFFICE_QA__ = officeQaApi(gl, scene);
    return () => {
      delete window.__HQ_OFFICE_QA__;
    };
  }, [gl, scene]);
  return null;
}
