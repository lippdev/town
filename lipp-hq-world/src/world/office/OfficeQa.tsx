import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3, type Scene, type WebGLRenderer } from "three";
import { useHQStore } from "@/state/useHQStore";
import { OFFICE_ROOMS_BY_ID, OFFICE_SEATS_BY_ID, roomAt } from "./officeLayout";
import { worldToScreen } from "./officeCamera";
import { officeRuntime, useOfficeStore } from "./officeStore";
import { seatedFigures } from "./OfficeScene";

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
        rigs: [...seatedFigures.keys()].sort(),
      };
    },
    /** Pixel do meio da figura na tela, para o harness clicar nela. */
    botPoint: (botId: string) => {
      const seat = OFFICE_SEATS_BY_ID[useOfficeStore.getState().seating.seats[botId] ?? ""];
      return seat ? worldToScreen([seat.x, 0.95, seat.z], officeRuntime.view, officeRuntime.viewport) : null;
    },
    /** Pixel de um ponto livre do chão da sala. */
    roomPoint: (roomId: string, localX = 0, localZ = 0) => {
      const room = OFFICE_ROOMS_BY_ID[roomId]!;
      return worldToScreen([room.center.x + localX, 0, room.center.z + localZ], officeRuntime.view, officeRuntime.viewport);
    },
    /** Medidas da figura sentada: pés, quadril e altura, em metros de cena. */
    figureInfo: (botId: string) => {
      const figure = seatedFigures.get(botId);
      if (!figure) return null;
      const parent = scene.getObjectByName(`bot-${botId}`);
      parent?.updateWorldMatrix(true, true);
      const world = (name: string) => parent?.getObjectByName(name)?.getWorldPosition(new Vector3()).toArray() ?? null;
      const hips = world("Hips");
      return {
        hips,
        footL: world("FootL"),
        fistL: world("FistL"),
        fistR: world("FistR"),
        head: world("Head"),
        roomOfHips: hips ? (roomAt(hips[0]!, hips[2]!)?.id ?? null) : null,
        visible: Boolean(parent),
      };
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
