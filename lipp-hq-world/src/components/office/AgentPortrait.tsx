import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/app/useReducedMotion";
import { PORTRAIT_FRAMES, REACTION_MS, REST_FRAME, portraitFrame, robotMotionFor, robotPose } from "@/avatar/robot/robotMotion";

/** Quanto tempo o movimento leva para ligar: curto, para responder assim que o mouse chega. */
const HOVER_IN_MS = 90;
/** E para desligar: mais longo, para o robô voltar ao lugar sem corte. */
const HOVER_OUT_MS = 320;
/** Os movimentos foram medidos para 32 px: na linha compacta, o avatar tem 24 px. */
const DISTANCE_SCALE = 0.75;

const framePosition = (frame: number) => `${(frame / (PORTRAIT_FRAMES - 1)) * 100}% 0`;

/**
 * Retrato animado de um agente, na linha da sidebar. O laço só roda enquanto há movimento:
 * parado, o retrato não custa nada. Com movimento reduzido no sistema, ele fica imóvel.
 */
export function AgentPortrait({ botId, sheet }: { botId: string; sheet: string }) {
  const node = useRef<HTMLSpanElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const sprite = node.current;
    const row = sprite?.closest("button");
    if (!sprite || !row || reduced) return;

    const motion = robotMotionFor(botId);
    let frameRequest: number | null = null;
    let previous = 0;
    let seconds = 0;
    let hover = 0;
    let wanted = false;
    let reactionStart: number | null = null;
    let lastFrame = REST_FRAME;

    const rest = () => {
      sprite.style.transform = "";
      sprite.style.willChange = "";
      sprite.style.backgroundPosition = framePosition(REST_FRAME);
      lastFrame = REST_FRAME;
      seconds = 0;
    };

    const tick = (now: number) => {
      const delta = Math.min(now - previous, 50);
      previous = now;
      hover = wanted ? Math.min(1, hover + delta / HOVER_IN_MS) : Math.max(0, hover - delta / HOVER_OUT_MS);
      seconds += delta / 1000;
      let reaction: number | null = null;
      if (reactionStart !== null) {
        reaction = (now - reactionStart) / REACTION_MS[motion];
        if (reaction >= 1) {
          reaction = null;
          reactionStart = null;
        }
      }
      if (hover === 0 && reaction === null) {
        frameRequest = null;
        rest();
        return;
      }
      const pose = robotPose(motion, seconds, hover, reaction);
      sprite.style.transform = `translate3d(${(pose.x * DISTANCE_SCALE).toFixed(2)}px, ${(pose.y * DISTANCE_SCALE).toFixed(2)}px, 0) rotate(${pose.rotate.toFixed(2)}deg) scale(${pose.scale.toFixed(3)})`;
      const frame = portraitFrame(pose.yaw, pose.face);
      if (frame !== lastFrame) {
        sprite.style.backgroundPosition = framePosition(frame);
        lastFrame = frame;
      }
      frameRequest = requestAnimationFrame(tick);
    };

    const start = () => {
      if (frameRequest !== null) return;
      sprite.style.willChange = "transform";
      previous = performance.now();
      frameRequest = requestAnimationFrame(tick);
    };
    const enter = () => {
      wanted = true;
      start();
    };
    const leave = () => {
      wanted = row.matches(":focus-visible");
    };
    const focus = () => {
      if (row.matches(":focus-visible")) enter();
    };
    const blur = () => {
      wanted = row.matches(":hover");
    };
    const click = () => {
      reactionStart = performance.now();
      start();
    };

    row.addEventListener("pointerenter", enter);
    row.addEventListener("pointerleave", leave);
    row.addEventListener("focus", focus);
    row.addEventListener("blur", blur);
    row.addEventListener("click", click);
    if (row.matches(":hover")) enter();
    return () => {
      row.removeEventListener("pointerenter", enter);
      row.removeEventListener("pointerleave", leave);
      row.removeEventListener("focus", focus);
      row.removeEventListener("blur", blur);
      row.removeEventListener("click", click);
      if (frameRequest !== null) cancelAnimationFrame(frameRequest);
      rest();
    };
  }, [botId, reduced]);

  return (
    <span
      ref={node}
      className="agent-sprite"
      data-agent-sprite={botId}
      style={{ backgroundImage: `url(${sheet})`, backgroundSize: `${PORTRAIT_FRAMES * 100}% 100%`, backgroundPosition: framePosition(REST_FRAME) }}
    />
  );
}
