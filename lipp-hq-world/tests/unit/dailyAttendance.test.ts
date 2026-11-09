import { describe, expect, it } from "vitest";
import { applyEvent, type ActivityEvent, type ActivityState } from "@/activity/events";
import { DAILY_GRACE_MS, dailyAttendance, dailyMarkOf, whereIs } from "@/activity/selectors";
import { DEFAULT_SEED, simulatedStateAt } from "@/activity/simulation";
import { DAILY_CHANNEL, EMAIL } from "@/activity/squad";
import { at } from "@/activity/time";
import { formatSquadStatus } from "@/tech/techRosterStatus";
import { dailyBoard } from "@/tech/techViews";

const day = (until: number, seed = DEFAULT_SEED) => simulatedStateAt(seed, until);

describe("a daily é o huddle do Slack", () => {
  it("antes de começar e depois de acabar, não há daily", () => {
    expect(dailyAttendance(day(at(9, 29)))).toBeNull();
    expect(dailyAttendance(day(at(9, 45)))).toBeNull();
  });

  it("na tolerância: quem não entrou ainda não entrou, ninguém ausente", () => {
    const state = day(at(9, 35));
    const daily = dailyAttendance(state)!;
    expect(daily.meeting.id).toBe("daily");
    expect(daily.huddle?.channel).toBe(DAILY_CHANNEL);
    expect([...daily.inRoom].sort()).toEqual([EMAIL.marina, EMAIL.renata, EMAIL.diego, EMAIL.luana].sort());
    expect([...daily.notYet].sort()).toEqual([EMAIL.caio, EMAIL.bianca].sort());
    expect(daily.absent).toEqual([]);
    expect(daily.graceUntil).toBe(at(9, 30) + DAILY_GRACE_MS);
    expect(dailyMarkOf(daily, EMAIL.caio)).toBe("ainda-nao-entrou");
    expect(dailyMarkOf(daily, EMAIL.renata)).toBe("na-sala");
  });

  it("depois de 09:38: quem não entrou é ausente; o atrasado entrou e está na sala", () => {
    const state = day(at(9, 40));
    const daily = dailyAttendance(state)!;
    expect(daily.notYet).toEqual([]);
    expect(daily.absent).toEqual([EMAIL.bianca]);
    // O diretor não é convidado: nunca conta, e fica na mesa.
    expect(dailyMarkOf(daily, EMAIL.otavio)).toBeNull();
    expect(whereIs(state, EMAIL.otavio).kind).toBe("mesa");
    expect(daily.inRoom).toContain(EMAIL.caio);
    expect(whereIs(state, EMAIL.caio).kind).toBe("reuniao");
    // Às 09:38 em ponto já é ausente.
    expect(dailyAttendance(day(at(9, 38)))!.absent).toContain(EMAIL.bianca);
  });

  it("o atraso é determinístico pela semente e cai sempre entre 09:36 e 09:37", () => {
    for (const seed of [1, 7, 42, 99]) {
      const join = day(at(9, 44), seed).feed.find((event) => event.type === "slack.huddle_joined" && event.actor.kind === "person" && event.actor.email === EMAIL.caio)!;
      expect([at(9, 36), at(9, 37)]).toContain(join.at);
      expect(day(at(9, 44), seed).feed.map((event) => event.id)).toEqual(day(at(9, 44), seed).feed.map((event) => event.id));
    }
  });

  it("quem não foi convidado nunca conta como ausente, mas entrando no huddle vai para a sala", () => {
    const base = day(at(9, 40));
    // Tira o Diego do convite: entrou no huddle, então está na sala, e não está em nenhuma lista de falta.
    const state: ActivityState = { ...base, calendar: base.calendar.map((entry) => (entry.id === "daily" ? { ...entry, attendees: entry.attendees.filter((email) => email !== EMAIL.diego) } : entry)) };
    const daily = dailyAttendance(state)!;
    expect(daily.inRoom).toContain(EMAIL.diego);
    expect(whereIs(state, EMAIL.diego).kind).toBe("reuniao");
    // E quem não é convidado e não entrou não aparece em lista nenhuma.
    const without: ActivityState = { ...state, calendar: state.calendar.map((entry) => (entry.id === "daily" ? { ...entry, attendees: entry.attendees.filter((email) => email !== EMAIL.bianca) } : entry)) };
    expect(dailyAttendance(without)!.absent).not.toContain(EMAIL.bianca);
    expect(dailyMarkOf(dailyAttendance(without), EMAIL.bianca)).toBeNull();
  });

  it("quem entrou e saiu antes do fim não vira ausente", () => {
    const base = day(at(9, 40));
    const left: ActivityEvent = { id: "x-left", at: at(9, 40), source: "slack", actor: { kind: "person", email: EMAIL.luana }, subject: { kind: "huddle", id: "huddle-daily" }, type: "slack.huddle_left", data: { huddleId: "huddle-daily" } };
    const state = applyEvent(base, left);
    const daily = dailyAttendance(state)!;
    expect(daily.inRoom).not.toContain(EMAIL.luana);
    expect(daily.absent).not.toContain(EMAIL.luana);
    expect(whereIs(state, EMAIL.luana).kind).toBe("mesa");
  });

  it("Painel e barra lateral leem a mesma presença da daily", () => {
    for (const clock of [at(9, 31), at(9, 35), at(9, 38), at(9, 40), at(9, 44)]) {
      const state = day(clock);
      const daily = dailyAttendance(state);
      expect(dailyBoard(state).daily).toEqual(daily);
      for (const person of state.people) {
        const mark = dailyMarkOf(daily, person.email);
        expect(formatSquadStatus(state, person.email).daily).toBe(mark === "na-sala" ? null : mark);
      }
    }
  });
});
