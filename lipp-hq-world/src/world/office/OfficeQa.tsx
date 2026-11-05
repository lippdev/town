import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { Scene, WebGLRenderer } from "three";
import { useHQStore } from "@/state/useHQStore";
import { OFFICE_ROOMS_BY_ID, OFFICE_SEATS_BY_ID } from "./officeLayout";
import { worldToScreen } from "./officeCamera";
import { humanActors, humanFigures, officeRuntime, robotActors, useOfficeStore } from "./officeStore";

declare global {
  interface Window {
    /** Ponte de leitura para o harness scripts/visual-qa/office.mjs. */
    __HQ_OFFICE_QA__?: ReturnType<typeof officeQaApi>;
  }
}

function officeQaApi(gl: WebGLRenderer, scene: Scene) {
  return {
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
        focusedRoomId: store.focusedRoomId,
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
          position: humanActors.get(human.id)?.position ?? null,
          heading: humanActors.get(human.id)?.heading ?? null,
          worn: humanFigures.get(human.id)?.snapshot() ?? null,
        })),
        humansWaiting: store.humansWaiting,
        humansError: store.humansError,
        selectedHumanId: store.selectedHumanId,
      };
    },
    /** Pixel do meio da pessoa, onde ela estiver agora. */
    humanPoint: (id: string) => {
      const position = humanActors.get(id)?.position;
      return position ? worldToScreen([position.x, position.y + 0.7, position.z], officeRuntime.view, officeRuntime.viewport) : null;
    },
    /** Pixel do meio do robô na tela, onde ele estiver agora, para o harness clicar nele. */
    botPoint: (botId: string) => {
      const robot = robotActors.get(botId);
      const seat = OFFICE_SEATS_BY_ID[useOfficeStore.getState().seating.seats[botId] ?? ""];
      if (robot) return worldToScreen([robot.position.x, robot.position.y + robot.rig.height / 2, robot.position.z], officeRuntime.view, officeRuntime.viewport);
      return seat ? worldToScreen([seat.x, 1.5, seat.z], officeRuntime.view, officeRuntime.viewport) : null;
    },
    /** Pixel de um ponto livre do chão da sala. */
    roomPoint: (roomId: string, localX = 0, localZ = 0) => {
      const room = OFFICE_ROOMS_BY_ID[roomId]!;
      return worldToScreen([room.center.x + localX, 0, room.center.z + localZ], officeRuntime.view, officeRuntime.viewport);
    },
  };
}

/** Só leitura: nada aqui muda a cena. */
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
