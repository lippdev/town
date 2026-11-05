import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGENTS } from "@/agents/agents";
import { ROBOT_EXPRESSIONS } from "@/avatar/robot/robotLook";
import { ROBOT_MOTIONS, robotMotionFor, robotReactionFor } from "@/avatar/robot/robotMotion";

describe("robotMotionFor", () => {
  it("dá um jeito diferente a cada bot de referência", () => {
    const motions = AGENTS.map((agent) => robotMotionFor(agent.id));
    expect(new Set(motions).size).toBe(AGENTS.length);
  });

  it("mantém o mesmo jeito para um bot desconhecido", () => {
    expect(robotMotionFor("bot-novo")).toBe(robotMotionFor("bot-novo"));
    expect(ROBOT_MOTIONS).toContain(robotMotionFor("bot-novo"));
  });
});

describe("robotReactionFor", () => {
  it("sempre muda o rosto em relação à expressão salva", () => {
    for (const agent of AGENTS) {
      for (const saved of ROBOT_EXPRESSIONS) expect(robotReactionFor(agent.id, saved)).not.toBe(saved);
    }
  });
});

describe("office.css", () => {
  const css = readFileSync("src/styles/office.css", "utf8");

  it("tem as animações de todos os jeitos", () => {
    for (const motion of ROBOT_MOTIONS) {
      expect(css).toContain(`[data-motion="${motion}"]`);
      expect(css).toContain(`@keyframes agent-hover-${motion}`);
      expect(css).toContain(`@keyframes agent-face-${motion}`);
      expect(css).toContain(`@keyframes agent-click-${motion}`);
    }
  });
});
