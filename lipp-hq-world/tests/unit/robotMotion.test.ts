import { describe, expect, it } from "vitest";
import { AGENTS } from "@/agents/agents";
import { ROBOT_EXPRESSIONS } from "@/avatar/robot/robotLook";
import { PORTRAIT_FRAMES, REACTION_MS, REST_FRAME, REST_POSE, ROBOT_MOTIONS, portraitFrame, reactionStrength, robotMotionFor, robotPose, robotReactionFor, type RobotPose } from "@/avatar/robot/robotMotion";

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

const FRAME_SECONDS = 1 / 60;
const closeToRest = (pose: RobotPose) => {
  expect(pose.x).toBeCloseTo(REST_POSE.x);
  expect(pose.y).toBeCloseTo(REST_POSE.y);
  expect(pose.scale).toBeCloseTo(REST_POSE.scale);
  expect(pose.yaw).toBeCloseTo(REST_POSE.yaw);
  expect(pose.face).toBeCloseTo(REST_POSE.face);
  expect(pose.rotate % 360).toBeCloseTo(REST_POSE.rotate);
};

describe("robotPose", () => {
  it.each(ROBOT_MOTIONS)("%s fica em repouso sem hover nem clique", (motion) => {
    closeToRest(robotPose(motion, 1.23, 0, null));
  });

  it.each(ROBOT_MOTIONS)("%s começa e termina a reação em repouso", (motion) => {
    closeToRest(robotPose(motion, 0, 0, 0));
    closeToRest(robotPose(motion, 0, 0, 1));
  });

  it.each(ROBOT_MOTIONS)("%s se move sem saltos a 60 fps no hover", (motion) => {
    let previous = robotPose(motion, 0, 1, null);
    for (let frame = 1; frame < 300; frame++) {
      const pose = robotPose(motion, frame * FRAME_SECONDS, 1, null);
      expect(Math.abs(pose.x - previous.x)).toBeLessThan(0.8);
      expect(Math.abs(pose.y - previous.y)).toBeLessThan(0.8);
      expect(Math.abs(pose.rotate - previous.rotate)).toBeLessThan(2.5);
      expect(Math.abs(pose.scale - previous.scale)).toBeLessThan(0.05);
      previous = pose;
    }
  });

  it.each(ROBOT_MOTIONS)("%s se move sem saltos a 60 fps na reação", (motion) => {
    const steps = Math.round((REACTION_MS[motion] / 1000) * 60);
    let previous = robotPose(motion, 0, 0, 0);
    for (let step = 1; step <= steps; step++) {
      const pose = robotPose(motion, 0, 0, step / steps);
      expect(Math.abs(pose.x - previous.x)).toBeLessThan(1.6);
      expect(Math.abs(pose.y - previous.y)).toBeLessThan(1.6);
      expect(Math.abs(pose.rotate - previous.rotate)).toBeLessThan(15);
      expect(Math.abs(pose.scale - previous.scale)).toBeLessThan(0.05);
      previous = pose;
    }
  });

  it("cada hover produz um movimento diferente", () => {
    const signature = (motion: (typeof ROBOT_MOTIONS)[number]) =>
      [0.11, 0.37, 0.71, 1.03].map((t) => {
        const pose = robotPose(motion, t, 1, null);
        return [pose.x, pose.y, pose.rotate, pose.scale, pose.yaw].map((value) => value.toFixed(2)).join();
      }).join("|");
    expect(new Set(ROBOT_MOTIONS.map(signature)).size).toBe(ROBOT_MOTIONS.length);
  });

  it("o movimento contínuo cede lugar no meio da reação", () => {
    expect(robotPose("espiar", 0.55, 1, 0.5).yaw).toBeCloseTo(0);
  });
});

describe("reactionStrength", () => {
  it("sobe rápido e volta a zero", () => {
    expect(reactionStrength(0)).toBe(0);
    expect(reactionStrength(0.2)).toBe(1);
    expect(reactionStrength(1)).toBe(0);
  });
});

describe("portraitFrame", () => {
  it("fica no retrato parado em repouso", () => {
    expect(portraitFrame(0, 0)).toBe(REST_FRAME);
  });

  it("vai de uma ponta à outra da virada", () => {
    expect(portraitFrame(-1, 0)).toBe(0);
    expect(portraitFrame(1, 0)).toBe(REST_FRAME * 2);
    expect(portraitFrame(9, 0)).toBe(REST_FRAME * 2);
  });

  it("usa os quadros de reação quando o rosto muda", () => {
    expect(portraitFrame(0.5, 0.2)).toBeGreaterThan(REST_FRAME * 2);
    expect(portraitFrame(0, 1)).toBe(PORTRAIT_FRAMES - 1);
  });
});
