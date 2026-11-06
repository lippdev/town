import { describe, expect, it } from "vitest";
import { HARD_STALL_MS, IDLE_STALL_MS, shouldStall } from "@/world/office/loadWatch";

describe("vigia do carregamento do escritório", () => {
  it("baixando normalmente não é travamento", () => {
    expect(shouldStall({ active: true, idleMs: 60_000, elapsedMs: 20_000 })).toBe(false);
  });

  it("parado há pouco tempo ainda não é travamento", () => {
    expect(shouldStall({ active: false, idleMs: IDLE_STALL_MS - 1, elapsedMs: 5_000 })).toBe(false);
  });

  it("sem download e sem arquivo novo pelo limite é travamento", () => {
    expect(shouldStall({ active: false, idleMs: IDLE_STALL_MS + 1, elapsedMs: 30_000 })).toBe(true);
  });

  it("o teto duro vale mesmo com download ativo", () => {
    expect(shouldStall({ active: true, idleMs: 0, elapsedMs: HARD_STALL_MS + 1 })).toBe(true);
  });

  it("teto é bem maior que o limite ocioso, para não competir com ele", () => {
    expect(HARD_STALL_MS).toBeGreaterThan(IDLE_STALL_MS * 3);
  });
});
