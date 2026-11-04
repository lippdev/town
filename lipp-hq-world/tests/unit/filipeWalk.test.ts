import { describe, expect, it } from "vitest";
import { advanceWalk, initialWalk, WALK_ROUTE, WALK_SPEED, walkPose } from "@/world/office/filipeWalk";

function run(seconds: number, dt = 1 / 60) {
  let state = initialWalk();
  // conta passos: somar dt em ponto flutuante pode dar um passo a mais conforme o dt
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) state = advanceWalk(state, dt);
  return state;
}

const lap = WALK_ROUTE.reduce((sum, stop, i) => {
  const next = WALK_ROUTE[(i + 1) % WALK_ROUTE.length]!;
  return sum + Math.hypot(next.x - stop.x, next.z - stop.z) / WALK_SPEED + stop.pause;
}, 0);

describe("passeio do Filipe", () => {
  it("começa parado na primeira parada", () => {
    const pose = walkPose(initialWalk());
    expect(pose).toMatchObject({ x: WALK_ROUTE[0]!.x, z: WALK_ROUTE[0]!.z, walking: false });
  });

  it("escolhe a arte certa para cada diagonal da tela", () => {
    const seen = new Set<string>();
    let state = initialWalk();
    for (let t = 0; t < lap; t += 0.02) {
      state = advanceWalk(state, 0.02);
      const pose = walkPose(state);
      if (!pose.walking) continue;
      const to = WALK_ROUTE[(state.leg + 1) % WALK_ROUTE.length]!;
      const from = WALK_ROUTE[state.leg]!;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      // na tela: direita = +x -z, baixo = +x +z
      const right = dx - dz > 0;
      const down = dx + dz > 0;
      expect(pose.mirrored).toBe(!right);
      expect(pose.facing).toBe(down ? "front" : "back");
      seen.add(`${pose.facing}${pose.mirrored}`);
    }
    expect(seen.size).toBe(4);
  });

  it("anda a mesma distância, sem depender da taxa de quadros", () => {
    const slow = run(5, 1 / 20);
    const fast = run(5, 1 / 120);
    expect(slow.distance).toBeCloseTo(fast.distance, 1);
  });

  it("não para nem descontrola com um quadro muito longo", () => {
    const state = advanceWalk(initialWalk(), lap * 3.5);
    expect(state.leg).toBeGreaterThanOrEqual(0);
    expect(state.leg).toBeLessThan(WALK_ROUTE.length);
    expect(Number.isFinite(state.distance)).toBe(true);
  });

  it("volta ao início depois de uma volta", () => {
    const state = advanceWalk(initialWalk(), lap);
    expect(walkPose(state).x).toBeCloseTo(WALK_ROUTE[0]!.x, 3);
    expect(walkPose(state).z).toBeCloseTo(WALK_ROUTE[0]!.z, 3);
  });
});
