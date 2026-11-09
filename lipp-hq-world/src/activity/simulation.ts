import { botForTask, nudgeTarget, nudgeText } from "./actions";
import { applyEvent, type ActivityEvent, type ActivityState } from "./events";
import { LINK_PROBLEM_LABEL, linkGithub } from "./identity";
import {
  blockedStories,
  PLACE_LABEL,
  firstName,
  githubSuggestedStatus,
  nextFreeAt,
  personOf,
  prOf,
  prsAwaitingReview,
  prsOfStory,
  reviewCandidates,
  staleStories,
  storiesWithoutCriteria,
  storyOf,
  waitingSince,
  whereIs,
} from "./selectors";
import { AUTOMATION_BOTS, CALENDAR, CHANNELS, EMAIL, LOGIN, SUGGESTED_CRITERIA, squadSnapshot } from "./squad";
import type { ActionResult, ActivitySource, AppAction } from "./source";
import { DAY_END, DAY_START, MINUTE, ageLabel, at, clockLabel } from "./time";
import type { Actor, ActivitySnapshot, BotTaskKind, Instant, Source, Subject } from "./types";
import { BOT_TASK_LABEL, EPIC_STATUS_LABEL, REVIEW_LABEL, STORY_STATUS_LABEL } from "./types";

/**
 * Um dia de trabalho do squad fictício, das 9h às 18h, determinístico pela semente: a mesma
 * semente dá o mesmo dia, as mesmas ações dão as mesmas consequências. A semente só mexe nos
 * minutos e no movimento dos canais; as situações do dia são sempre as mesmas, para a
 * demonstração ter o que mostrar.
 *
 * O roteiro é uma fila de passos. Um passo é um evento pronto ou uma intenção que olha o estado
 * daquele instante antes de decidir (é assim que o bot escolhe quem está livre para revisar).
 */

/** O dia de 9 horas passa em 15 minutos na velocidade 1. */
export const REAL_DAY_MS = 15 * MINUTE;
export const TIME_SCALE = (DAY_END - DAY_START) / REAL_DAY_MS;
export const SPEEDS = [1, 2, 4, 8] as const;
export type Speed = (typeof SPEEDS)[number];
export const DEFAULT_SEED = 7;

/** PRNG pequeno e conhecido (mulberry32): mesma semente, mesma sequência, em qualquer navegador. */
export function random(seed: number) {
  let value = seed >>> 0;
  const next = () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)) };
}

type Draft = Omit<ActivityEvent, "id">;
interface Outcome {
  events: Draft[];
  later?: Array<{ at: Instant; run: Intent }>;
}
type Intent = (state: ActivityState, at: Instant) => Outcome;
interface Step {
  at: Instant;
  seq: number;
  run: Intent;
}

const person = (email: string): Actor => ({ kind: "person", email });
const gh = (login: string): Actor => ({ kind: "github", login });
const bot = (botId: string): Actor => ({ kind: "bot", botId });
const APP: Actor = { kind: "app" };
const storySubject = (id: string): Subject => ({ kind: "story", id });
const prSubject = (number: number): Subject => ({ kind: "pr", number });
const personSubject = (email: string): Subject => ({ kind: "person", email });

/** Monta um evento sem id: o id vem da ordem em que a simulação o emite. */
function draft<Type extends ActivityEvent["type"]>(atTime: Instant, source: Source, actor: Actor, subject: Subject, type: Type, data: Extract<ActivityEvent, { type: Type }>["data"]): Draft {
  return { at: atTime, source, actor, subject, type, data } as Draft;
}

const only = (...events: Draft[]): Intent => () => ({ events });

const presenceAt = (atTime: Instant, email: string, availability: Extract<ActivityEvent, { type: "m365.presence" }>["data"]["availability"]) =>
  draft(atTime, "m365", person(email), personSubject(email), "m365.presence", { availability });
const statusAt = (atTime: Instant, email: string, status: { emoji: string; text: string } | null) => draft(atTime, "slack", person(email), personSubject(email), "slack.status", { status });

export class SimulatedDay implements ActivitySource {
  readonly kind = "simulacao" as const;
  private readonly queue: Step[] = [];
  private seq = 0;
  private emitted = 0;
  private tasks = 0;
  private prNumber = 147;
  /** Até quando cada bot está ocupado: o pedido seguinte espera a vez. */
  private readonly botBusy = new Map<string, Instant>();
  private readonly rng: ReturnType<typeof random>;

  constructor(readonly seed: number = DEFAULT_SEED) {
    this.rng = random(seed);
    this.script();
  }

  initial(): ActivitySnapshot {
    return squadSnapshot();
  }

  /** Quando é o próximo passo agendado; o harness usa para saber se ainda há o que acontecer. */
  get nextAt(): Instant | null {
    return this.queue[0]?.at ?? null;
  }

  private schedule(atTime: Instant, run: Intent) {
    const step = { at: atTime, seq: (this.seq += 1), run };
    let index = this.queue.length;
    while (index > 0 && (this.queue[index - 1]!.at > step.at || (this.queue[index - 1]!.at === step.at && this.queue[index - 1]!.seq > step.seq))) index -= 1;
    this.queue.splice(index, 0, step);
  }

  private stamp(event: Draft): ActivityEvent {
    this.emitted += 1;
    return { ...event, id: `s${this.seed}-${String(this.emitted).padStart(5, "0")}` } as ActivityEvent;
  }

  pull(until: Instant, current: ActivityState): ActivityEvent[] {
    const out: ActivityEvent[] = [];
    let state = current;
    while (this.queue.length > 0 && this.queue[0]!.at <= until) {
      const step = this.queue.shift()!;
      // A intenção olha o estado daquele instante, não o de agora.
      const outcome = step.run({ ...state, at: Math.max(state.at, step.at) }, step.at);
      for (const raw of outcome.events) {
        // Nada sai do futuro: o que a intenção marcou para depois entra na fila.
        if (raw.at > step.at) {
          this.schedule(raw.at, only(raw));
          continue;
        }
        const event = this.stamp({ ...raw, at: step.at });
        state = applyEvent(state, event);
        out.push(event);
      }
      for (const next of outcome.later ?? []) this.schedule(Math.max(next.at, step.at), next.run);
    }
    return out;
  }

  // ─── Roteiro do dia ────────────────────────────────────────────────────────

  private jitter(hour: number, minute: number, spread = 3) {
    return at(hour, minute + this.rng.int(-spread, spread));
  }

  private script() {
    const later = (hour: number, minute: number, ...events: Array<(atTime: Instant) => Draft>) => {
      const when = this.jitter(hour, minute);
      this.schedule(when, only(...events.map((make) => make(when))));
    };

    // Chegadas: a Bianca está de férias, e o Tiago chega depois da daily.
    const arrivals: Array<[string, number, number]> = [
      [EMAIL.marina, 9, 1], [EMAIL.renata, 9, 3], [EMAIL.diego, 9, 7], [EMAIL.luana, 9, 11], [EMAIL.caio, 9, 16], [EMAIL.rafael, 9, 21], [EMAIL.tiago, 10, 12],
    ];
    for (const [email, hour, minute] of arrivals) later(hour, minute, (when) => presenceAt(when, email, "disponivel"));
    const departures: Array<[string, number, number]> = [
      [EMAIL.rafael, 17, 30], [EMAIL.caio, 17, 40], [EMAIL.diego, 17, 44], [EMAIL.marina, 17, 50], [EMAIL.luana, 17, 54], [EMAIL.renata, 17, 57], [EMAIL.tiago, 17, 58],
    ];
    for (const [email, hour, minute] of departures) later(hour, minute, (when) => statusAt(when, email, null), (when) => presenceAt(when, email, "offline"));

    // Reunião: o Teams põe "em reunião" quem está conectado, e devolve ao fim. A daily é huddle do
    // Slack, que o Teams não vê.
    for (const meeting of CALENDAR.filter((entry) => !entry.huddleChannel)) {
      this.schedule(meeting.start, (state, when) => ({
        events: meeting.attendees.filter((email) => state.presence[email] && state.presence[email] !== "offline").map((email) => presenceAt(when, email, "reuniao")),
      }));
      this.schedule(meeting.end, (state, when) => ({
        events: meeting.attendees.filter((email) => state.presence[email] === "reuniao").map((email) => presenceAt(when, email, "disponivel")),
      }));
    }

    // Foco: status no Slack e "não perturbe" no Teams.
    const focus: Array<[string, [number, number], [number, number]]> = [
      [EMAIL.luana, [9, 50], [11, 0]],
      [EMAIL.renata, [13, 4], [13, 58]],
      [EMAIL.tiago, [10, 40], [11, 50]],
    ];
    for (const [email, [h1, m1], [h2, m2]] of focus) {
      later(h1, m1, (when) => statusAt(when, email, { emoji: "🎧", text: "Foco" }), (when) => presenceAt(when, email, "naoperturbe"));
      later(h2, m2, (when) => statusAt(when, email, null), (when) => presenceAt(when, email, "disponivel"));
    }

    // Almoço: cada um no seu horário.
    const lunch: Array<[string, number, number, number]> = [
      [EMAIL.marina, 12, 0, 58], [EMAIL.rafael, 12, 0, 55], [EMAIL.diego, 12, 5, 55], [EMAIL.caio, 12, 10, 55], [EMAIL.luana, 12, 15, 60], [EMAIL.renata, 12, 20, 40], [EMAIL.tiago, 12, 40, 50],
    ];
    for (const [email, hour, minute, length] of lunch) {
      const start = this.jitter(hour, minute, 4);
      const end = start + length * MINUTE;
      this.schedule(start, only(statusAt(start, email, { emoji: "🍽️", text: "Almoço" }), presenceAt(start, email, "ausente")));
      this.schedule(end, only(statusAt(end, email, null), presenceAt(end, email, "disponivel")));
    }

    // Huddles: só quem entrou e quando; o que se fala não existe aqui.
    const huddles: Array<{ id: string; channel: string; start: [number, number]; people: string[]; length: number }> = [
      { id: "huddle-portal", channel: "squad-portal", start: [11, 17], people: [EMAIL.renata, EMAIL.diego, EMAIL.rafael], length: 22 },
      { id: "huddle-vendas", channel: "squad-vendas", start: [15, 36], people: [EMAIL.tiago, EMAIL.rafael], length: 14 },
      { id: "huddle-design", channel: "design", start: [16, 40], people: [EMAIL.caio, EMAIL.luana], length: 28 },
    ];
    for (const huddle of huddles) {
      const start = this.jitter(huddle.start[0], huddle.start[1], 2);
      const subject: Subject = { kind: "huddle", id: huddle.id };
      huddle.people.forEach((email, index) => {
        const join = start + index * MINUTE;
        this.schedule(join, only(index === 0 ? draft(join, "slack", person(email), subject, "slack.huddle_started", { huddleId: huddle.id, channel: huddle.channel }) : draft(join, "slack", person(email), subject, "slack.huddle_joined", { huddleId: huddle.id })));
        const leave = start + (huddle.length + index) * MINUTE;
        this.schedule(leave, only(draft(leave, "slack", person(email), subject, "slack.huddle_left", { huddleId: huddle.id })));
      });
    }

    this.dailyHuddle();

    // HU-29: PR aberto, CI quebra durante o foco da Luana, ela conserta, a Renata aprova, mescla e sobe.
    later(9, 50, (when) => draft(when, "github", gh(LOGIN.luana), prSubject(145), "github.pr_opened", { number: 145, title: "HU-29: tela de confira seu e-mail", branch: "feat/HU-29-confira-email", draft: false, reviewers: [LOGIN.renata] }));
    later(9, 51, (when) => draft(when, "notion", person(EMAIL.luana), storySubject("HU-29"), "notion.story_status", { storyId: "HU-29", status: "revisao" }));
    later(10, 4, (when) => draft(when, "github", gh("github-actions"), prSubject(145), "github.ci", { number: 145, state: "failure" }));
    later(10, 48, (when) => draft(when, "github", gh(LOGIN.luana), prSubject(145), "github.push", { number: 145 }));
    later(10, 57, (when) => draft(when, "github", gh("github-actions"), prSubject(145), "github.ci", { number: 145, state: "success" }));
    this.reviewWhenFree(this.jitter(11, 41, 1), EMAIL.renata, 145, { merge: true, deployTo: "homologacao" });

    // HU-33: o Tiago abre PR com o login que ainda não vinculou.
    later(13, 40, (when) => draft(when, "github", gh(LOGIN.tiago), prSubject(147), "github.pr_opened", { number: 147, title: "HU-33: histórico de boletos", branch: "feat/HU-33-historico", draft: false, reviewers: [LOGIN.diego] }));
    later(13, 41, (when) => draft(when, "notion", person(EMAIL.tiago), storySubject("HU-33"), "notion.story_status", { storyId: "HU-33", status: "revisao" }));
    later(13, 50, (when) => draft(when, "github", gh("github-actions"), prSubject(147), "github.ci", { number: 147, state: "success" }));
    this.reviewWhenFree(this.jitter(16, 15, 2), EMAIL.diego, 147, { merge: true, deployTo: null, toQa: true });

    // HU-27: a decisão só sai depois do refinamento, a menos que alguém cobre antes.
    this.schedule(this.jitter(15, 8, 2), (state, when) => this.unblock(state, when, "HU-27", EMAIL.marina, "Decisão: o link vale 15 minutos e pode ser reenviado."));

    // QA: um bug devolve a HU-34; a HU-30 passa.
    later(15, 40, (when) => draft(when, "notion", person(EMAIL.rafael), storySubject("HU-34"), "notion.story_status", { storyId: "HU-34", status: "andamento" }));
    later(16, 10, (when) => draft(when, "notion", person(EMAIL.rafael), storySubject("HU-30"), "notion.story_status", { storyId: "HU-30", status: "concluida" }));

    // Discovery: a pesquisa valida; o checkout passa para o delivery no fim do dia.
    later(16, 50, (when) => draft(when, "notion", person(EMAIL.caio), { kind: "epic", id: "E-3" }, "notion.epic_status", { epicId: "E-3", status: "validado" }));
    later(16, 52, (when) => draft(when, "notion", person(EMAIL.caio), storySubject("HU-35"), "notion.story_status", { storyId: "HU-35", status: "concluida" }));
    later(17, 0, (when) => draft(when, "github", gh(LOGIN.renata), { kind: "deploy", id: "d-0312" }, "github.deploy", { id: "d-0312", environment: "producao", numbers: [138, 140, 143], status: "success" }));
    later(17, 20, (when) => draft(when, "notion", person(EMAIL.marina), { kind: "epic", id: "E-5" }, "notion.epic_status", { epicId: "E-5", status: "planejado" }));

    // Rotinas dos bots: pauta da daily, cobrança de revisão parada e status dos épicos pelo GitHub.
    this.schedule(at(9, 12), (_state, when) => this.botTask(when, AUTOMATION_BOTS.daily, "pauta_daily", { kind: "meeting", id: "daily" }, "rotina"));
    this.schedule(this.jitter(9, 40, 2), (_state, when) => this.botTask(when, AUTOMATION_BOTS.notion, "atualizar_epico", { kind: "project", id: "todos" }, "rotina"));
    this.schedule(this.jitter(11, 3, 1), (state, when) => {
      const oldest = prsAwaitingReview(state).find((pr) => pr.storyId && when - waitingSince(pr) > 24 * 60 * MINUTE);
      return oldest ? this.botTask(when, AUTOMATION_BOTS.github, "cobrar_revisao", prSubject(oldest.number), "rotina") : { events: [] };
    });
    this.schedule(this.jitter(17, 10, 2), (_state, when) => this.botTask(when, AUTOMATION_BOTS.notion, "atualizar_epico", { kind: "project", id: "todos" }, "rotina"));

    // Movimento dos canais: só a contagem, para a cena saber onde há conversa.
    for (const channel of CHANNELS) {
      let when = DAY_START + this.rng.int(2, 15) * MINUTE;
      while (when < DAY_END) {
        const lunchtime = when >= at(12) && when < at(13);
        const messages = this.rng.int(1, lunchtime ? 2 : 6);
        const moment = when;
        this.schedule(moment, only(draft(moment, "slack", APP, { kind: "channel", id: channel }, "slack.channel_activity", { channel, messages })));
        when += this.rng.int(lunchtime ? 18 : 6, lunchtime ? 35 : 22) * MINUTE;
      }
    }
  }

  /**
   * A daily é o huddle do canal do squad. A tech lead abre às 09:30, quem está no escritório entra
   * no primeiro par de minutos, o Caio entra atrasado (dentro da tolerância) e quem está fora não
   * entra. Os minutos vêm de um sorteio próprio da semente, para não mexer no resto do dia.
   */
  private dailyHuddle() {
    const daily = CALENDAR.find((entry) => entry.huddleChannel)!;
    const rng = random(this.seed + 101);
    const subject: Subject = { kind: "huddle", id: "huddle-daily" };
    const joins: Array<[string, Instant]> = [
      [EMAIL.renata, daily.start],
      ...[EMAIL.marina, EMAIL.diego, EMAIL.luana, EMAIL.rafael].map((email): [string, Instant] => [email, daily.start + rng.int(0, 2) * MINUTE]),
      [EMAIL.caio, at(9, 36 + rng.int(0, 1))],
    ];
    joins.forEach(([email, join], index) => {
      // Só entra quem está conectado: quem chega depois ou está de férias não aparece.
      this.schedule(join, (state) =>
        state.presence[email] && state.presence[email] !== "offline"
          ? { events: [index === 0 ? draft(join, "slack", person(email), subject, "slack.huddle_started", { huddleId: "huddle-daily", channel: daily.huddleChannel! }) : draft(join, "slack", person(email), subject, "slack.huddle_joined", { huddleId: "huddle-daily" })] }
          : { events: [] },
      );
    });
    this.schedule(daily.end, (state) => ({
      events: (state.huddles.find((huddle) => huddle.id === "huddle-daily" && huddle.endedAt === null)?.participants ?? []).map((email) => draft(daily.end, "slack", person(email), subject, "slack.huddle_left", { huddleId: "huddle-daily" })),
    }));
  }

  // ─── Intenções reutilizáveis ───────────────────────────────────────────────

  /**
   * A pessoa revisa quando estiver na mesa: comenta, depois aprova. Fora da mesa, tenta de novo
   * quando ela sair da reunião. Aprovado, o autor mescla e, se pedido, sobe para homologação.
   */
  private reviewWhenFree(start: Instant, email: string, number: number, options: { merge: boolean; deployTo: "homologacao" | null; toQa?: boolean }) {
    const attempt: Intent = (state, when) => {
      const pr = prOf(state, number);
      const reviewer = personOf(state, email);
      if (!pr || pr.state !== "open" || !reviewer?.github) return { events: [] };
      const where = whereIs(state, email).kind;
      if (where !== "mesa" && where !== "foco") return { events: [], later: [{ at: Math.max(nextFreeAt(state, email, when), when + 10 * MINUTE) + 4 * MINUTE, run: attempt }] };
      const approveAt = when + 14 * MINUTE;
      const after: Array<{ at: Instant; run: Intent }> = [
        { at: approveAt, run: only(draft(approveAt, "github", gh(reviewer.github), prSubject(number), "github.review_submitted", { number, state: "approved" })) },
      ];
      if (options.merge) after.push({ at: approveAt + 9 * MINUTE, run: (later, mergeAt) => this.merge(later, mergeAt, number, options) });
      return { events: [draft(when, "github", gh(reviewer.github), prSubject(number), "github.review_submitted", { number, state: "commented" })], later: after };
    };
    this.schedule(start, attempt);
  }

  private merge(state: ActivityState, when: Instant, number: number, options: { deployTo: "homologacao" | null; toQa?: boolean }): Outcome {
    const pr = prOf(state, number);
    if (!pr || pr.state !== "open") return { events: [] };
    const events: Draft[] = [draft(when, "github", gh(pr.author), prSubject(number), "github.pr_merged", { number })];
    const later: Outcome["later"] = [];
    const story = pr.storyId ? storyOf(state, pr.storyId) : null;
    const assignee = story?.assignee ?? null;
    if (story && assignee && (options.toQa || options.deployTo) && story.status === "revisao") {
      events.push(draft(when + MINUTE, "notion", person(assignee), storySubject(story.id), "notion.story_status", { storyId: story.id, status: "qa" }));
    }
    if (options.deployTo) {
      const deployAt = when + 12 * MINUTE;
      const id = `d-${number}`;
      later.push({ at: deployAt, run: only(draft(deployAt, "github", gh(pr.author), { kind: "deploy", id }, "github.deploy", { id, environment: options.deployTo, numbers: [number], status: "success" })) });
    }
    return { events, later };
  }

  private unblock(state: ActivityState, when: Instant, storyId: string, email: string, note: string): Outcome {
    const story = storyOf(state, storyId);
    if (!story?.blocked) return { events: [] };
    return {
      events: [
        draft(when, "notion", person(email), storySubject(storyId), "notion.story_unblocked", { storyId, note }),
        ...(story.assignee ? [draft(when + 6 * MINUTE, "notion", person(story.assignee), storySubject(storyId), "notion.story_status", { storyId, status: story.status })] : []),
      ],
    };
  }

  /** Começa a tarefa de um bot. Ele vai até o lugar, trabalha e só então o resultado aparece. */
  private botTask(when: Instant, botId: string, kind: BotTaskKind, target: Subject, requestedBy: "app" | "rotina"): Outcome {
    const startAt = Math.max(when, this.botBusy.get(botId) ?? when);
    const taskId = `t${this.seed}-${(this.tasks += 1)}`;
    const length = { resumir_pr: 9, completar_criterios: 11, cobrar_revisao: 7, atualizar_epico: 9, pauta_daily: 12 }[kind] * MINUTE;
    const doneAt = startAt + length;
    this.botBusy.set(botId, doneAt);
    const started = draft(startAt, "bot", bot(botId), target, "bot.task_started", { taskId, kind, requestedBy });
    const finish: Intent = (later, finishAt) => {
      const work = this.botWork(later, finishAt, botId, kind, target);
      return { events: [...work.events, draft(finishAt, "bot", bot(botId), target, "bot.task_done", { taskId, result: work.result })], ...(work.later ? { later: work.later } : {}) };
    };
    if (startAt === when) return { events: [started], later: [{ at: doneAt, run: finish }] };
    return { events: [], later: [{ at: startAt, run: only(started) }, { at: doneAt, run: finish }] };
  }

  /** O trabalho em si, lido do estado no fim da tarefa: o resultado é o que o bot achou. */
  private botWork(state: ActivityState, when: Instant, botId: string, kind: BotTaskKind, target: Subject): { events: Draft[]; result: string; later?: Outcome["later"] } {
    switch (kind) {
      case "pauta_daily": {
        const blocked = blockedStories(state).map((story) => story.id);
        const waiting = prsAwaitingReview(state).map((pr) => `#${pr.number}`);
        const missing = storiesWithoutCriteria(state).map((story) => story.id);
        const stale = staleStories(state).map((story) => story.id);
        const lines = [
          blocked.length ? `travadas: ${blocked.join(", ")}` : null,
          waiting.length ? `PRs esperando revisão: ${waiting.join(", ")}` : null,
          stale.length ? `HUs paradas: ${stale.join(", ")}` : null,
          missing.length ? `sem critério de aceite: ${missing.join(", ")}` : null,
        ].filter(Boolean);
        const text = `Pauta da daily (${clockLabel(state.at)}) · ${lines.length ? lines.join(" · ") : "nada pendente"}`;
        return { events: [draft(when, "slack", bot(botId), { kind: "channel", id: "squad-portal" }, "slack.app_message", { id: `m-${botId}-${when}`, to: "#squad-portal", text, about: target })], result: text };
      }
      case "atualizar_epico": {
        const changes = state.epics.flatMap((epic) => {
          const suggested = githubSuggestedStatus(state, epic);
          return suggested ? [{ epic, suggested }] : [];
        });
        if (changes.length === 0) return { events: [], result: "Nada a mudar: o status no Notion já bate com o GitHub." };
        return {
          events: changes.map(({ epic, suggested }) => draft(when, "notion", bot(botId), { kind: "epic", id: epic.id }, "notion.epic_status", { epicId: epic.id, status: suggested })),
          result: changes.map(({ epic, suggested }) => `${epic.id} ${epic.title}: ${EPIC_STATUS_LABEL[epic.status]} → ${EPIC_STATUS_LABEL[suggested]}`).join(" · "),
        };
      }
      case "resumir_pr": {
        const pr = target.kind === "pr" ? prOf(state, target.number) : null;
        if (!pr) return { events: [], result: "PR não encontrado." };
        const story = pr.storyId ? storyOf(state, pr.storyId) : null;
        const author = state.people.find((item) => item.github === pr.author);
        const nameOf = (login: string) => state.people.find((item) => item.github === login)?.name ?? login;
        const reviews = pr.reviews.length ? pr.reviews.map((review) => `${nameOf(review.by)} ${REVIEW_LABEL[review.state]}`).join(", ") : pr.reviewers.length ? `revisão pedida a ${pr.reviewers.map(nameOf).join(", ")}, sem resposta` : "ninguém revisou";
        const criteria = story ? `${story.criteria.filter((criterion) => criterion.done).length} de ${story.criteria.length} critérios marcados` : "sem HU ligada";
        const text = [
          `PR #${pr.number} ${pr.state === "merged" ? "mesclado" : "aberto"} ${ageLabel(when - pr.openedAt)} por ${author?.name ?? `${pr.author} (autor não identificado)`}`,
          story ? `${story.id} · ${story.title} (${STORY_STATUS_LABEL[story.status]})` : "não cita HU no título nem na branch",
          pr.ci ? `CI ${pr.ci === "success" ? "passando" : pr.ci === "failure" ? "quebrado" : "rodando"}` : "sem CI",
          reviews,
          criteria,
        ].join(" · ");
        return { events: [draft(when, "bot", bot(botId), prSubject(pr.number), "bot.pr_summary", { number: pr.number, text })], result: text };
      }
      case "completar_criterios": {
        const story = target.kind === "story" ? storyOf(state, target.id) : null;
        if (!story) return { events: [], result: "HU não encontrada." };
        const known = new Set(story.criteria.map((criterion) => criterion.text));
        const texts = (SUGGESTED_CRITERIA[story.id] ?? [`"${story.title}" funciona no celular e no navegador`, "Erro mostra o que fazer a seguir", "Medido em produção depois da entrega"]).filter((text) => !known.has(text));
        if (texts.length === 0) return { events: [], result: `${story.id} já tinha esses critérios.` };
        const base = story.criteria.length;
        return {
          events: texts.map((text, index) => draft(when, "notion", bot(botId), storySubject(story.id), "notion.criterion_added", { storyId: story.id, criterion: { id: `${story.id}-b${base + index + 1}`, text, done: false, suggestedBy: botId } })),
          result: `${texts.length} critérios sugeridos na ${story.id}, marcados como sugestão até alguém revisar.`,
        };
      }
      case "cobrar_revisao": {
        const pr = target.kind === "pr" ? prOf(state, target.number) : null;
        if (!pr || pr.state !== "open") return { events: [], result: "O PR não está mais aberto." };
        const candidate = reviewCandidates(state, pr).find((item) => !pr.reviewers.includes(item.person.github!)) ?? reviewCandidates(state, pr)[0];
        if (!candidate) {
          const busy = state.people
            .filter((item) => (item.role === "dev" || item.role === "techlead") && item.github !== pr.author)
            .map((item) => {
              const where = whereIs(state, item.email).kind;
              const next = state.calendar.filter((entry) => entry.attendees.includes(item.email) && entry.start > when).sort((x, y) => x.start - y.start)[0];
              if (!item.github) return `${firstName(state, item.email)} sem GitHub vinculado`;
              if (where === "mesa" && next) return `${firstName(state, item.email)} tem ${next.title} às ${clockLabel(next.start)}`;
              return `${firstName(state, item.email)} ${PLACE_LABEL[where].toLocaleLowerCase("pt-BR")}`;
            });
          return { events: [], result: `Ninguém livre para revisar o PR #${pr.number} agora (${busy.join(", ")}).` };
        }
        const login = candidate.person.github!;
        const text = `Oi, ${candidate.person.name.split(" ")[0]}! O PR #${pr.number} (${pr.title}) espera revisão ${ageLabel(when - waitingSince(pr))}. Você está livre agora pela agenda: consegue olhar?`;
        this.reviewWhenFree(when + 18 * MINUTE, candidate.person.email, pr.number, { merge: true, deployTo: pr.storyId ? "homologacao" : null });
        return {
          events: [
            draft(when, "github", bot(botId), prSubject(pr.number), "github.review_requested", { number: pr.number, reviewer: login }),
            draft(when, "slack", bot(botId), personSubject(candidate.person.email), "slack.app_message", { id: `m-${botId}-${when}`, to: candidate.person.email, text, about: prSubject(pr.number) }),
          ],
          result: `Pediu a revisão do PR #${pr.number} a ${candidate.person.name}, livre agora e sem outra revisão pendente.`,
        };
      }
    }
  }

  // ─── Ações da tela ─────────────────────────────────────────────────────────

  perform(action: AppAction, state: ActivityState): ActionResult {
    const now = state.at;
    const result = this.plan(action, state, now);
    if (!result.ok) return result;
    const events: ActivityEvent[] = [];
    for (const raw of result.events) {
      if (raw.at > now) this.schedule(raw.at, only(raw));
      else events.push(this.stamp({ ...raw, at: now }));
    }
    return { ok: true, note: result.note, events };
  }

  private plan(action: AppAction, state: ActivityState, now: Instant): { ok: true; events: Draft[]; note: string } | { ok: false; problem: string } {
    switch (action.kind) {
      case "cobrar": {
        const story = storyOf(state, action.storyId);
        if (!story || story.status === "concluida") return { ok: false, problem: "Essa HU não está aberta." };
        // Quem destrava: a pessoa esperada, o QA em QA, senão o responsável. A tela mostra a mesma
        // pessoa e o mesmo texto antes de enviar (`nudgePreview`).
        const target = nudgeTarget(state, story)?.email;
        if (!target) return { ok: false, problem: "A HU não tem responsável para cobrar." };
        const text = nudgeText(state, story, target, now);
        const answerAt = now + 12 * MINUTE;
        const wasBlocked = Boolean(story.blocked);
        // Responde quando der: numa chamada dá para olhar o Slack; em sala, huddle ou fora, não.
        const answer: Intent = (later, when) => {
          const where = whereIs(later, target).kind;
          if (where === "reuniao" || where === "huddle" || where === "fora") return { events: [], later: [{ at: Math.max(nextFreeAt(later, target, when), when + 10 * MINUTE) + 4 * MINUTE, run: answer }] };
          return this.answerNudge(later, when, story.id, target, wasBlocked);
        };
        this.schedule(answerAt, answer);
        return {
          ok: true,
          note: `Mensagem enviada a ${personOf(state, target)?.name ?? target}. A resposta vem quando ${firstName(state, target)} puder olhar o Slack.`,
          events: [draft(now, "slack", APP, storySubject(story.id), "slack.app_message", { id: `m-app-${now}-${story.id}`, to: target, text, about: storySubject(story.id) })],
        };
      }
      case "reatribuir": {
        const story = storyOf(state, action.storyId);
        const next = personOf(state, action.to);
        if (!story) return { ok: false, problem: "HU não encontrada." };
        if (!next) return { ok: false, problem: "Essa pessoa não está no cadastro." };
        if (story.assignee === next.email) return { ok: false, problem: `${next.name} já é responsável pela ${story.id}.` };
        const before = personOf(state, story.assignee);
        if (story.status === "pronta" || story.status === "backlog") {
          const startAt = Math.max(nextFreeAt(state, next.email, now), now) + 15 * MINUTE;
          this.schedule(startAt, (later, when) => {
            const current = storyOf(later, story.id);
            return current && current.assignee === next.email && (current.status === "pronta" || current.status === "backlog")
              ? { events: [draft(when, "notion", person(next.email), storySubject(story.id), "notion.story_status", { storyId: story.id, status: "andamento" })] }
              : { events: [] };
          });
        }
        const text = `Oi, ${next.name.split(" ")[0]}! A ${story.id} (${story.title}) passou para você pelo Lipp HQ.${before ? ` Antes estava com ${before.name}.` : ""}`;
        return {
          ok: true,
          note: `${story.id} agora é de ${next.name}.`,
          events: [
            draft(now, "notion", APP, storySubject(story.id), "notion.story_assigned", { storyId: story.id, assignee: next.email }),
            draft(now, "slack", APP, personSubject(next.email), "slack.app_message", { id: `m-app-${now}-${story.id}-r`, to: next.email, text, about: storySubject(story.id) }),
          ],
        };
      }
      case "pedir_bot": {
        const botId = botForTask(action.task);
        if (action.target.kind === "pr" && !prOf(state, action.target.number)) return { ok: false, problem: "PR não encontrado." };
        if (action.target.kind === "story" && !storyOf(state, action.target.id)) return { ok: false, problem: "HU não encontrada." };
        const start = Math.max(now, this.botBusy.get(botId) ?? now);
        const outcome = this.botTask(now, botId, action.task, action.target, "app");
        for (const next of outcome.later ?? []) this.schedule(next.at, next.run);
        return {
          ok: true,
          note: `${BOT_TASK_LABEL[action.task]}: ${botId === "atlas" ? "Atlas" : "Pulse"} ${start > now ? `começa às ${clockLabel(start)}, depois da tarefa atual` : "está indo"}.`,
          events: outcome.events,
        };
      }
      case "vincular_github": {
        const linked = linkGithub(state.people, action.email, action.login);
        if ("problem" in linked) return { ok: false, problem: LINK_PROBLEM_LABEL[linked.problem] };
        const login = linked.people.find((item) => item.email === action.email.trim().toLocaleLowerCase())?.github ?? null;
        return {
          ok: true,
          note: login ? `GitHub @${login} vinculado.` : "Vínculo com o GitHub desfeito.",
          events: [draft(now, "app", APP, personSubject(action.email.trim().toLocaleLowerCase()), "app.github_linked", { email: action.email.trim().toLocaleLowerCase(), login })],
        };
      }
    }
  }

  /** A resposta a uma cobrança: o que a pessoa faz quando sai da reunião. */
  private answerNudge(state: ActivityState, when: Instant, storyId: string, email: string, wasBlocked: boolean): Outcome {
    const story = storyOf(state, storyId);
    if (!story || story.status === "concluida") return { events: [] };
    if (story.blocked) return this.unblock(state, when, storyId, email, "Decisão registrada depois da cobrança do Lipp HQ.");
    // Cobrou uma trava que outra pessoa já resolveu: não há o que responder.
    if (wasBlocked) return { events: [] };
    const actor = person(email);
    const subject = storySubject(storyId);
    switch (story.status) {
      case "backlog":
      case "pronta":
        return { events: [draft(when, "notion", actor, subject, "notion.story_status", { storyId, status: "andamento" })] };
      case "andamento": {
        // HU parada sem PR costuma ser trabalho pronto no computador de alguém: abre o PR e passa para revisão.
        const open = prsOfStory(state, storyId).find((pr) => pr.state === "open");
        const author = personOf(state, story.assignee)?.github;
        if (open || !author) return { events: [draft(when, "notion", actor, subject, "notion.story_status", { storyId, status: "revisao" })] };
        const number = (this.prNumber += 1);
        const reviewer = reviewCandidates(state, { author })[0]?.person.github ?? LOGIN.renata;
        return {
          events: [
            draft(when, "github", gh(author), prSubject(number), "github.pr_opened", { number, title: `${storyId}: ${story.title.toLocaleLowerCase("pt-BR")}`, branch: `feat/${storyId}`, draft: false, reviewers: [reviewer] }),
            draft(when + MINUTE, "notion", person(story.assignee ?? email), subject, "notion.story_status", { storyId, status: "revisao" }),
          ],
          later: [{ at: when + 9 * MINUTE, run: only(draft(when + 9 * MINUTE, "github", gh("github-actions"), prSubject(number), "github.ci", { number, state: "success" })) }],
        };
      }
      case "revisao":
        return { events: [draft(when, "notion", actor, subject, "notion.story_status", { storyId, status: "qa" })] };
      case "qa":
        return { events: [draft(when, "notion", actor, subject, "notion.story_status", { storyId, status: "concluida" })] };
      default:
        return { events: [] };
    }
  }
}

/** Atalho dos testes e do harness: o estado do dia num instante, sem ação nenhuma. */
export function simulatedStateAt(seed: number, until: Instant): ActivityState {
  const day = new SimulatedDay(seed);
  let state: ActivityState = { ...day.initial(), feed: [] };
  for (const event of day.pull(until, state)) state = applyEvent(state, event);
  return { ...state, at: until };
}

