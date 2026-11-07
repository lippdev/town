import type {
  ActivitySnapshot,
  Actor,
  AppMessage,
  Availability,
  BotTaskKind,
  CiState,
  Criterion,
  EpicStatus,
  Environment,
  Instant,
  PullRequest,
  ReviewState,
  SlackStatus,
  Source,
  StoryStatus,
  Subject,
  CalendarEvent,
} from "./types";

/**
 * O formato único de evento: quem, o quê, sobre o quê, quando e de que fonte. A simulação gera
 * estes eventos; um conector real traduz o webhook (ou a leitura periódica) para eles. A cena e o
 * painel só leem o estado que sai daqui, então trocar a simulação por conectores não mexe neles.
 */
interface EventBase<Type extends string, Data> {
  /** Único e estável: o mesmo evento chegando duas vezes é aplicado uma só. */
  id: string;
  at: Instant;
  source: Source;
  actor: Actor;
  subject: Subject;
  type: Type;
  data: Data;
}

export type ActivityEvent =
  // Notion
  | EventBase<"notion.story_status", { storyId: string; status: StoryStatus }>
  | EventBase<"notion.story_assigned", { storyId: string; assignee: string }>
  | EventBase<"notion.story_blocked", { storyId: string; reason: string; waitingOn: string | null }>
  | EventBase<"notion.story_unblocked", { storyId: string; note: string }>
  | EventBase<"notion.criterion_added", { storyId: string; criterion: Criterion }>
  | EventBase<"notion.criterion_checked", { storyId: string; criterionId: string }>
  | EventBase<"notion.epic_status", { epicId: string; status: EpicStatus }>
  // GitHub
  | EventBase<"github.pr_opened", Pick<PullRequest, "number" | "title" | "branch" | "draft" | "reviewers">>
  | EventBase<"github.push", { number: number }>
  | EventBase<"github.review_requested", { number: number; reviewer: string }>
  | EventBase<"github.review_submitted", { number: number; state: ReviewState }>
  | EventBase<"github.ci", { number: number; state: CiState }>
  | EventBase<"github.pr_merged", { number: number }>
  | EventBase<"github.deploy", { id: string; environment: Environment; numbers: number[]; status: "success" | "failure" }>
  // Slack: só sinais e as mensagens do próprio app
  | EventBase<"slack.status", { status: SlackStatus | null }>
  | EventBase<"slack.huddle_started", { huddleId: string; channel: string }>
  | EventBase<"slack.huddle_joined", { huddleId: string }>
  | EventBase<"slack.huddle_left", { huddleId: string }>
  | EventBase<"slack.channel_activity", { channel: string; messages: number }>
  | EventBase<"slack.app_message", Omit<AppMessage, "at" | "from">>
  // Microsoft 365
  | EventBase<"m365.presence", { availability: Availability }>
  | EventBase<"m365.event_created", { event: CalendarEvent }>
  // Bots
  | EventBase<"bot.task_started", { taskId: string; kind: BotTaskKind; requestedBy: "app" | "rotina" }>
  | EventBase<"bot.task_done", { taskId: string; result: string }>
  | EventBase<"bot.pr_summary", { number: number; text: string }>
  // Cadastro do próprio Lipp HQ: é o que liga o login do GitHub ao e-mail.
  | EventBase<"app.github_linked", { email: string; login: string | null }>;

export type ActivityEventType = ActivityEvent["type"];
export type EventOf<Type extends ActivityEventType> = Extract<ActivityEvent, { type: Type }>;

/** O estado "agora": o retrato inicial com todos os eventos até `at` aplicados. */
export interface ActivityState extends ActivitySnapshot {
  /** Os eventos aplicados, em ordem: é o histórico do dia e o feed. */
  feed: ActivityEvent[];
}

/** Ordem total: mesmo instante, decide o id. Assim dois conectores nunca discordam da ordem. */
export const eventOrder = (a: ActivityEvent, b: ActivityEvent) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function initialState(snapshot: ActivitySnapshot): ActivityState {
  return { ...snapshot, feed: [] };
}

const emailOf = (actor: Actor) => (actor.kind === "person" ? actor.email : null);
const loginOf = (actor: Actor) => (actor.kind === "github" ? actor.login : null);

function updateStory(state: ActivityState, storyId: string, at: Instant, change: (story: ActivityState["stories"][number]) => Partial<ActivityState["stories"][number]>): ActivityState["stories"] {
  return state.stories.map((story) => (story.id === storyId ? { ...story, ...change(story), updatedAt: Math.max(story.updatedAt, at) } : story));
}

function updatePr(state: ActivityState, number: number, at: Instant, change: (pr: PullRequest) => Partial<PullRequest>): PullRequest[] {
  return state.prs.map((pr) => (pr.number === number ? { ...pr, ...change(pr), updatedAt: Math.max(pr.updatedAt, at) } : pr));
}

/** Liga o PR à HU pelo id que aparece no título ou na branch: "HU-31", "hu-31", "feat/HU-31-…". */
export function storyIdOf(title: string, branch: string): string | null {
  const match = /\bHU-(\d+)\b/i.exec(`${title} ${branch}`);
  return match ? `HU-${match[1]}` : null;
}

/**
 * Aplica um evento. Puro: devolve um estado novo e nunca muda o anterior. Evento repetido ou
 * sobre algo que não existe é ignorado, sem quebrar: um webhook atrasado não derruba a tela.
 */
export function applyEvent(state: ActivityState, event: ActivityEvent): ActivityState {
  if (state.feed.some((known) => known.id === event.id)) return state;
  const next = reduce(state, event);
  return { ...next, at: Math.max(state.at, event.at), feed: [...state.feed, event] };
}

function reduce(state: ActivityState, event: ActivityEvent): ActivityState {
  const { at } = event;
  switch (event.type) {
    case "notion.story_status":
      return { ...state, stories: updateStory(state, event.data.storyId, at, (story) => ({ status: event.data.status, blocked: event.data.status === "concluida" ? null : story.blocked })) };
    case "notion.story_assigned":
      return { ...state, stories: updateStory(state, event.data.storyId, at, () => ({ assignee: event.data.assignee })) };
    case "notion.story_blocked":
      return { ...state, stories: updateStory(state, event.data.storyId, at, () => ({ blocked: { reason: event.data.reason, waitingOn: event.data.waitingOn, since: at } })) };
    case "notion.story_unblocked":
      return { ...state, stories: updateStory(state, event.data.storyId, at, () => ({ blocked: null })) };
    case "notion.criterion_added":
      return {
        ...state,
        stories: updateStory(state, event.data.storyId, at, (story) => ({
          criteria: story.criteria.some((criterion) => criterion.id === event.data.criterion.id) ? story.criteria : [...story.criteria, event.data.criterion],
        })),
      };
    case "notion.criterion_checked":
      return { ...state, stories: updateStory(state, event.data.storyId, at, (story) => ({ criteria: story.criteria.map((criterion) => (criterion.id === event.data.criterionId ? { ...criterion, done: true } : criterion)) })) };
    case "notion.epic_status":
      return { ...state, epics: state.epics.map((epic) => (epic.id === event.data.epicId ? { ...epic, status: event.data.status, statusUpdatedAt: at } : epic)) };

    case "github.pr_opened": {
      const author = loginOf(event.actor);
      if (!author || state.prs.some((pr) => pr.number === event.data.number)) return state;
      const pr: PullRequest = {
        ...event.data,
        author,
        storyId: storyIdOf(event.data.title, event.data.branch),
        state: "open",
        reviews: [],
        ci: "pending",
        ciSince: at,
        openedAt: at,
        updatedAt: at,
        mergedAt: null,
        summary: null,
      };
      return { ...state, prs: [...state.prs, pr] };
    }
    case "github.push":
      return { ...state, prs: updatePr(state, event.data.number, at, () => ({ ci: "pending", ciSince: at })) };
    case "github.review_requested":
      return { ...state, prs: updatePr(state, event.data.number, at, (pr) => ({ reviewers: pr.reviewers.includes(event.data.reviewer) ? pr.reviewers : [...pr.reviewers, event.data.reviewer] })) };
    case "github.review_submitted": {
      const by = loginOf(event.actor);
      if (!by) return state;
      return { ...state, prs: updatePr(state, event.data.number, at, (pr) => ({ reviewers: pr.reviewers.filter((login) => login !== by), reviews: [...pr.reviews, { by, state: event.data.state, at }] })) };
    }
    case "github.ci":
      return { ...state, prs: updatePr(state, event.data.number, at, (pr) => ({ ci: event.data.state, ciSince: pr.ci === event.data.state ? pr.ciSince : at })) };
    case "github.pr_merged":
      return { ...state, prs: updatePr(state, event.data.number, at, () => ({ state: "merged", mergedAt: at, reviewers: [] })) };
    case "github.deploy": {
      const by = loginOf(event.actor) ?? (event.actor.kind === "bot" ? event.actor.botId : "?");
      if (state.deploys.some((deploy) => deploy.id === event.data.id)) return state;
      return { ...state, deploys: [...state.deploys, { ...event.data, at, by }] };
    }

    case "slack.status": {
      const email = emailOf(event.actor);
      return email ? { ...state, slackStatus: { ...state.slackStatus, [email]: event.data.status } } : state;
    }
    case "slack.huddle_started": {
      const email = emailOf(event.actor);
      if (state.huddles.some((huddle) => huddle.id === event.data.huddleId)) return state;
      return { ...state, huddles: [...state.huddles, { id: event.data.huddleId, channel: event.data.channel, participants: email ? [email] : [], startedAt: at, endedAt: null }] };
    }
    case "slack.huddle_joined": {
      const email = emailOf(event.actor);
      if (!email) return state;
      return { ...state, huddles: state.huddles.map((huddle) => (huddle.id === event.data.huddleId && huddle.endedAt === null && !huddle.participants.includes(email) ? { ...huddle, participants: [...huddle.participants, email] } : huddle)) };
    }
    case "slack.huddle_left": {
      const email = emailOf(event.actor);
      if (!email) return state;
      return {
        ...state,
        huddles: state.huddles.map((huddle) => {
          if (huddle.id !== event.data.huddleId || huddle.endedAt !== null) return huddle;
          const participants = huddle.participants.filter((participant) => participant !== email);
          // O huddle acaba quando sai o último: é assim que o Slack o encerra.
          return { ...huddle, participants, endedAt: participants.length === 0 ? at : null };
        }),
      };
    }
    case "slack.channel_activity": {
      const known = state.channels[event.data.channel] ?? { id: event.data.channel, lastAt: at, today: 0 };
      return { ...state, channels: { ...state.channels, [event.data.channel]: { ...known, lastAt: at, today: known.today + event.data.messages } } };
    }
    case "slack.app_message": {
      const from = event.actor.kind === "bot" ? { kind: "bot" as const, botId: event.actor.botId } : { kind: "app" as const };
      return { ...state, messages: [...state.messages, { ...event.data, from, at }] };
    }

    case "m365.presence": {
      const email = emailOf(event.actor);
      return email ? { ...state, presence: { ...state.presence, [email]: event.data.availability } } : state;
    }
    case "m365.event_created":
      if (state.calendar.some((entry) => entry.id === event.data.event.id)) return state;
      return { ...state, calendar: [...state.calendar, event.data.event] };

    case "bot.task_started": {
      if (event.actor.kind !== "bot" || state.botTasks.some((task) => task.id === event.data.taskId)) return state;
      const task = { id: event.data.taskId, botId: event.actor.botId, kind: event.data.kind, target: event.subject, requestedBy: event.data.requestedBy, startedAt: at, doneAt: null, result: null };
      return { ...state, botTasks: [...state.botTasks, task] };
    }
    case "bot.task_done":
      return { ...state, botTasks: state.botTasks.map((task) => (task.id === event.data.taskId ? { ...task, doneAt: at, result: event.data.result } : task)) };
    case "app.github_linked":
      return { ...state, people: state.people.map((person) => (person.email === event.data.email ? { ...person, github: event.data.login } : person)) };
    case "bot.pr_summary": {
      const by = event.actor.kind === "bot" ? event.actor.botId : "app";
      return { ...state, prs: updatePr(state, event.data.number, at, () => ({ summary: { text: event.data.text, by, at } })) };
    }
  }
}

/** Dobra uma lista de eventos, na ordem total, a partir do retrato. */
export function foldEvents(snapshot: ActivitySnapshot, events: readonly ActivityEvent[]): ActivityState {
  return [...events].sort(eventOrder).reduce(applyEvent, initialState(snapshot));
}
