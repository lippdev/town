import { describe, expect, it } from "vitest";
import { sampleMeeting, SCENARIOS } from "@/world/office/officeMeeting";

describe("encontros demonstrativos", () => {
  for (const scenario of ["trio", "briefing"] as const) {
    it(`${scenario}: reúne, alterna falas e devolve cada participante ao posto`, () => {
      const start = sampleMeeting(scenario, 0);
      const meeting = sampleMeeting(scenario, start.gather + 1);
      const end = sampleMeeting(scenario, start.duration);
      expect(Object.keys(meeting.poses)).toHaveLength(SCENARIOS[scenario].participants.length);
      expect(Object.values(meeting.poses).filter((pose) => pose.talk === 1)).toHaveLength(1);
      for (const [id, pose] of Object.entries(meeting.poses)) {
        expect(pose.standing).toBe(0);
        expect(pose.x).toBeGreaterThan(5.1);
        expect(pose.z).toBeGreaterThan(4.2);
        expect(end.poses[id]!.x).toBeCloseTo(start.poses[id]!.x);
        expect(end.poses[id]!.z).toBeCloseTo(start.poses[id]!.z);
        expect(end.poses[id]!.standing).toBe(0);
      }
    });
    it(`${scenario}: ninguém se sobrepõe durante entrada, reunião e saída`, () => {
      const { duration } = sampleMeeting(scenario, 0);
      for (let t = 0; t <= duration; t += 0.1) {
        const poses = Object.values(sampleMeeting(scenario, t).poses);
        for (let a = 0; a < poses.length; a++) for (let b = a + 1; b < poses.length; b++) {
          expect(Math.hypot(poses[a]!.x - poses[b]!.x, poses[a]!.z - poses[b]!.z), `t=${t} ${a}/${b}`).toBeGreaterThan(0.62);
        }
      }
    });
  }
});

import { buildOffice } from "@/world/office/officeRooms";
import { OFFICE_ROOMS } from "@/world/office/officeLayout";
it("trajetos passam pelos vãos e deixam folga dos móveis", () => {
  const build = buildOffice();
  const hits = new Set<string>();
  const { duration } = sampleMeeting("briefing", 0);
  for (let t = 0; t < duration; t += 0.08) for (const [id, pose] of Object.entries(sampleMeeting("briefing", t).poses)) {
    if (!pose.feet) continue;
    for (const [room, items] of Object.entries(build.footprints)) for (const item of items) {
      if (pose.x > item.minX - 0.20 && pose.x < item.maxX + 0.20 && pose.z > item.minZ - 0.20 && pose.z < item.maxZ + 0.20) hits.add(`${id} ${room} ${item.label} ${pose.x.toFixed(1)},${pose.z.toFixed(1)}`);
    }
    for (const room of OFFICE_ROOMS) {
      for (const side of ["north", "south", "east", "west"] as const) {
        const horizontal = side === "north" || side === "south";
        const wall = side === "north" ? room.bounds.minZ : side === "south" ? room.bounds.maxZ : side === "west" ? room.bounds.minX : room.bounds.maxX;
        const along = horizontal ? pose.x : pose.z;
        const min = horizontal ? room.bounds.minX : room.bounds.minZ;
        const max = horizontal ? room.bounds.maxX : room.bounds.maxZ;
        if (Math.abs((horizontal ? pose.z : pose.x) - wall) > 0.22 || along < min - 0.1 || along > max + 0.1) continue;
        const pass = room.doors.some((door) => door.side === side && Math.abs(along - ((horizontal ? room.center.x : room.center.z) + door.offset)) < door.width / 2 - 0.20);
        if (!pass) hits.add(`${id} parede ${room.id} ${side}`);
      }
    }
  }
  for (const geometry of build.fixed.values()) geometry.dispose();
  for (const batch of Object.values(build.raised)) for (const geometry of batch.values()) geometry.dispose();
  expect([...hits]).toEqual([]);
});
