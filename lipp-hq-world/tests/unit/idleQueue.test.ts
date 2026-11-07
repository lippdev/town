import { describe, expect, it, vi } from "vitest";
import { idleSequence } from "@/world/office/idleQueue";
import { readPortrait, savePortrait } from "@/avatar/robot/portraitCache";

function fakeHost() {
  const queue: Array<() => void> = [];
  return {
    queue,
    host: {
      requestIdleCallback: (callback: () => void) => queue.push(callback),
      cancelIdleCallback: vi.fn(),
      setTimeout: () => 0,
      clearTimeout: () => undefined,
    },
    async next() {
      queue.shift()?.();
      await new Promise((resolve) => setTimeout(resolve));
    },
  };
}

describe("trabalho em folga", () => {
  it("roda um passo por folga, em ordem, esperando a promessa", async () => {
    const { host, next, queue } = fakeHost();
    const done: string[] = [];
    idleSequence([async () => done.push("a"), () => done.push("b")], host);
    expect(done).toEqual([]);
    await next();
    expect(done).toEqual(["a"]);
    await next();
    expect(done).toEqual(["a", "b"]);
    await next();
    expect(queue).toEqual([]);
  });

  it("um passo que falha não para os outros", async () => {
    const { host, next } = fakeHost();
    const done: string[] = [];
    idleSequence([() => { throw new Error("sem rede"); }, () => done.push("b")], host);
    await next();
    await next();
    expect(done).toEqual(["b"]);
  });

  it("cancelar impede o que ainda não rodou", async () => {
    const { host, next } = fakeHost();
    const done: string[] = [];
    const cancel = idleSequence([() => done.push("a"), () => done.push("b")], host);
    await next();
    cancel();
    await next();
    expect(done).toEqual(["a"]);
  });

  it("sem requestIdleCallback cai no relógio", () => {
    const setTimeoutSpy = vi.fn(() => 1);
    idleSequence([() => undefined], { setTimeout: setTimeoutSpy, clearTimeout: () => undefined });
    expect(setTimeoutSpy).toHaveBeenCalledOnce();
  });
});

describe("cache de retratos", () => {
  const memory = () => {
    const map = new Map<string, string>();
    return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
  };
  const portrait = { still: "a", sheet: "b" };

  it("devolve o retrato da mesma aparência e ignora outra", () => {
    const storage = memory();
    savePortrait(storage, "forge", { color: "#f00" }, portrait);
    expect(readPortrait(storage, "forge", { color: "#f00" })).toEqual(portrait);
    expect(readPortrait(storage, "forge", { color: "#0f0" })).toBeNull();
    expect(readPortrait(storage, "ink", { color: "#f00" })).toBeNull();
  });

  it("sobrevive a armazenamento ausente, cheio ou corrompido", () => {
    expect(readPortrait(null, "forge", {})).toBeNull();
    expect(() => savePortrait({ getItem: () => null, setItem: () => { throw new Error("cheio"); } }, "forge", {}, portrait)).not.toThrow();
    expect(readPortrait({ getItem: () => "{nao", setItem: () => undefined }, "forge", {})).toBeNull();
    expect(readPortrait({ getItem: () => "{}", setItem: () => undefined }, "forge", {})).toBeNull();
  });
});
