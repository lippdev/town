import { describe, expect, it } from "vitest";
import { sampleVisit, TALK_START, TALK_END, VISIT_DURATION, useVisitStore } from "@/world/office/officeVisit";
import { OFFICE_SEATS_BY_ID } from "@/world/office/officeLayout";

describe("visita demonstrativa", () => {
  it("volta ao mesmo posto, sem saltos ao longo da sequência", () => {
    const home = OFFICE_SEATS_BY_ID["engenharia-0"]!;
    const end = sampleVisit(VISIT_DURATION);
    expect(end.visitor.x).toBeCloseTo(home.x);
    expect(end.visitor.z).toBeCloseTo(home.z);
    expect(end.visitor.standing).toBe(0);
    let previous = sampleVisit(0).visitor;
    for (let time = 0.02; time <= VISIT_DURATION; time += 0.02) {
      const current = sampleVisit(time).visitor;
      expect(Math.hypot(current.x - previous.x, current.z - previous.z)).toBeLessThan(0.04);
      previous = current;
      // Mesa de mapas: x [-7.95,-5.95], z [-.725,.525], mais folga do corpo.
      expect(current.x > -8.2 && current.x < -5.7 && current.z > -0.97 && current.z < 0.77).toBe(false);
    }
  });
  it("vira durante o deslocamento sem pausas nem mudança de velocidade nas curvas", () => {
    let curves = 0;
    for (let time = 1.61; time < TALK_START - 1.61; time += 0.01) {
      const a = sampleVisit(time).visitor;
      const b = sampleVisit(time + 0.001).visitor;
      expect(a.walk).toBeGreaterThan(0);
      expect(Math.hypot(b.x - a.x, b.z - a.z) / 0.001).toBeCloseTo(0.85, 2);
      const turn = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
      expect(Math.abs(turn)).toBeLessThan(0.02);
      if (Math.abs(turn) > 0.0001) curves++;
    }
    expect(curves).toBeGreaterThan(20);
  });
  it("alterna fala e escuta com os dois em pé", () => {
    const first = sampleVisit(TALK_START + 1);
    const second = sampleVisit(TALK_START + 3);
    expect(first.visitor.talk).toBe(1);
    expect(first.host.talk).toBe(0.2);
    expect(second.visitor.talk).toBe(0.2);
    expect(second.host.talk).toBe(1);
    expect(first.host.standing).toBe(1);
    expect(sampleVisit(TALK_END + 2).host.standing).toBe(0);
  });
  it("pausa congela o relógio; reiniciar e concluir liberam o ensaio", () => {
    const store = useVisitStore;
    store.getState().start();
    store.getState().advance(0.05);
    store.getState().togglePause();
    const time = store.getState().time;
    store.getState().advance(1);
    expect(store.getState().time).toBe(time);
    store.getState().start();
    expect(store.getState().time).toBe(0);
    expect(store.getState().paused).toBe(false);
    store.setState({ time: VISIT_DURATION - 0.01 });
    store.getState().advance(0.05);
    expect(store.getState().active).toBe(false);
    expect(store.getState().label).toBe("Visita concluída");
    store.getState().reset();
  });
});
