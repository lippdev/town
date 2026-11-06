import { describe, expect, it } from "vitest";
import { brasiliaMinutes, currentMinutes, dayPhase, daylightAt, parseHourOverride, skyFor } from "@/world/office/dayCycle";

describe("ciclo de dia e noite", () => {
  it("lê a hora de Brasília, não a do computador", () => {
    // 21:30 UTC é 18:30 em Brasília (UTC-3).
    expect(brasiliaMinutes(new Date("2026-11-06T21:30:00Z"))).toBe(18 * 60 + 30);
    expect(brasiliaMinutes(new Date("2026-11-07T02:00:00Z"))).toBe(23 * 60);
    expect(brasiliaMinutes(new Date("2026-11-07T03:00:00Z"))).toBe(0);
  });

  it("é noite das 18h às 5h e dia das 6h às 17h", () => {
    expect(daylightAt(18 * 60)).toBe(0);
    expect(daylightAt(23 * 60)).toBe(0);
    expect(daylightAt(4 * 60 + 59)).toBe(0);
    expect(daylightAt(6 * 60)).toBe(1);
    expect(daylightAt(12 * 60)).toBe(1);
    expect(daylightAt(16 * 60 + 59)).toBe(1);
  });

  it("transita ao longo de uma hora em cada ponta", () => {
    expect(daylightAt(5 * 60 + 30)).toBeCloseTo(0.5);
    expect(daylightAt(17 * 60 + 15)).toBeCloseTo(0.75);
    expect(dayPhase(5 * 60 + 30)).toBe("amanhecer");
    expect(dayPhase(17 * 60 + 30)).toBe("entardecer");
    expect(dayPhase(12 * 60)).toBe("dia");
    expect(dayPhase(22 * 60)).toBe("noite");
  });

  it("aceita ?hora= só quando faz sentido", () => {
    expect(parseHourOverride("?hora=22:15")).toBe(22 * 60 + 15);
    expect(parseHourOverride("?modo=demonstracao&hora=7")).toBe(7 * 60);
    expect(parseHourOverride("?hora=25:00")).toBeNull();
    expect(parseHourOverride("?hora=abc")).toBeNull();
    expect(parseHourOverride("")).toBeNull();
    expect(currentMinutes("?hora=12:00", new Date("2026-11-06T21:30:00Z"))).toBe(12 * 60);
    expect(currentMinutes("", new Date("2026-11-06T21:30:00Z"))).toBe(18 * 60 + 30);
  });

  it("à noite é a cena de antes; de dia o céu clareia e as janelas apagam", () => {
    const night = skyFor(0);
    expect(night.background).toBe("#111828");
    expect(night.sun).toBe(3.3);
    expect(night.litWindows).toBe(1);
    const day = skyFor(1);
    expect(day.background).toBe("#9ec4ec");
    expect(day.sun).toBeGreaterThan(night.sun);
    expect(day.litWindows).toBeLessThan(0.3);
    const dusk = skyFor(0.5);
    expect(dusk.sun).toBeCloseTo((night.sun + day.sun) / 2);
  });
});
