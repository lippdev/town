import type { ActivityEvent, ActivityState } from "./events";
import { directoryOf, personByGithub, resolveActor, type Directory } from "./identity";
import { DAY, DAY_END, DAY_START, MINUTE, ageLabel, clockLabel } from "./time";
import type { CalendarEvent, Epic, EpicStatus, Huddle, Instant, Person, PullRequest, Story, Subject } from "./types";
import { EPIC_STAGES, trackOf } from "./types";

/**
 * As perguntas de acompanhamento, respondidas a partir do estado. A cena e o painel usam estas
 * mesmas funções: se um dia discordarem, o defeito está na tela, não no dado.
 */

/** Sem movimento no Notion por mais que isto, a HU conta como parada. */
export const DEFAULT_STALE_MS = DAY;
/** Revisão esperando mais que isto põe o épico em risco. */
export const REVIEW_WAIT_MS = DAY;
/** CI quebrado há mais que isto, sem novo push, põe o épico em risco. */
export const CI_BROKEN_MS = 20 * MINUTE;
/** Quem tem reunião começando antes disto não conta como livre para revisar agora. */
const FREE_AHEAD_MS = 30 * MINUTE;

const directoryCache = new WeakMap<readonly Person[], Directory>();
export function directory(state: Pick<ActivityState, "people">): Directory {
  let known = directoryCache.get(state.people);
  if (!known) {
    known = directoryOf(state.people);
    directoryCache.set(state.people, known);
  }
  return known;
}

export const personOf = (state: ActivityState, email: string | null) => (email ? state.people.find((person) => person.email === email) ?? null : null);
export const firstName = (state: ActivityState, email: string | null) => personOf(state, email)?.name.split(" ")[0] ?? "ninguém";
export const storyOf = (state: ActivityState, id: string) => state.stories.find((story) => story.id === id) ?? null;
export const epicOf = (state: ActivityState, id: string) => state.epics.find((epic) => epic.id === id) ?? null;
export const prOf = (state: ActivityState, number: number) => state.prs.find((pr) => pr.number === number) ?? null;
export const storiesOf = (state: ActivityState, epicId: string) => state.stories.filter((story) => story.epicId === epicId);
export const prsOfStory = (state: ActivityState, storyId: string) => state.prs.filter((pr) => pr.storyId === storyId);

// ─── Onde cada um está ───────────────────────────────────────────────────────

export type PlaceKind = "mesa" | "foco" | "chamada" | "reuniao" | "huddle" | "fora";

export const PLACE_LABEL: Record<PlaceKind, string> = {
  mesa: "Na mesa",
  foco: "Em foco",
  chamada: "Em chamada",
  reuniao: "Em reunião",
  huddle: "Em huddle",
  fora: "Fora",
};

export interface Whereabouts {
  kind: PlaceKind;
  meeting: CalendarEvent | null;
  huddle: Huddle | null;
  /** Até quando, se a agenda diz. */
  until: Instant | null;
}

export const meetingsOf = (state: ActivityState, email: string) => state.calendar.filter((entry) => entry.attendees.includes(email)).sort((a, b) => a.start - b.start);
export const currentMeeting = (state: ActivityState, email: string, at = state.at) => meetingsOf(state, email).find((entry) => entry.start <= at && at < entry.end) ?? null;
export const activeHuddleOf = (state: ActivityState, email: string) => state.huddles.find((huddle) => huddle.endedAt === null && huddle.participants.includes(email)) ?? null;

const FOCUS = /foco|focus/i;

/** Huddle que começou até isto antes da reunião ainda é o dela (quem abre a daily um pouco antes). */
const HUDDLE_EARLY_MS = 15 * MINUTE;

/** O huddle de uma reunião feita no Slack (a daily): o do canal dela, aberto na janela dela. */
export function huddleOfMeeting(state: ActivityState, meeting: CalendarEvent): Huddle | null {
  if (!meeting.huddleChannel) return null;
  return state.huddles.find((huddle) => huddle.channel === meeting.huddleChannel && huddle.startedAt >= meeting.start - HUDDLE_EARLY_MS && huddle.startedAt < meeting.end) ?? null;
}

/** A reunião em curso que acontece neste huddle, se houver. */
const meetingOfHuddle = (state: ActivityState, huddle: Huddle) =>
  state.calendar.find((entry) => entry.huddleChannel === huddle.channel && entry.start <= state.at && state.at < entry.end && huddleOfMeeting(state, entry)?.id === huddle.id) ?? null;

/**
 * Agenda e huddle mandam; depois vêm presença do Teams e status do Slack. Na reunião feita em
 * huddle (a daily), a sala é de quem entrou no huddle, convidado ou não; convidado que não entrou
 * segue onde estava.
 */
export function whereIs(state: ActivityState, email: string): Whereabouts {
  const presence = state.presence[email] ?? "offline";
  const none = { meeting: null, huddle: null, until: null };
  if (presence === "offline") return { kind: "fora", ...none };
  const huddle = activeHuddleOf(state, email);
  const huddleMeeting = huddle ? meetingOfHuddle(state, huddle) : null;
  if (huddleMeeting) return { kind: "reuniao", meeting: huddleMeeting, huddle, until: huddleMeeting.end };
  const invited = currentMeeting(state, email);
  const meeting = invited?.huddleChannel ? null : invited;
  if (meeting?.place === "sala") return { kind: "reuniao", meeting, huddle: null, until: meeting.end };
  if (huddle) return { kind: "huddle", meeting: null, huddle, until: null };
  if (meeting) return { kind: "chamada", meeting, huddle: null, until: meeting.end };
  if (presence === "ausente") return { kind: "fora", ...none };
  const status = state.slackStatus[email];
  if (presence === "naoperturbe" || (status && FOCUS.test(status.text))) return { kind: "foco", ...none };
  return { kind: "mesa", ...none };
}

/** O evento do feed diz respeito à pessoa: foi ela, foi para ela ou foi sobre ela. */
export function involves(state: ActivityState, event: ActivityEvent, email: string): boolean {
  const person = resolveActor(directory(state), event.actor);
  if (person?.email === email) return true;
  if (event.subject.kind === "person" && event.subject.email === email) return true;
  if (event.type === "slack.app_message" && event.data.to === email) return true;
  if (event.type === "notion.story_assigned" && event.data.assignee === email) return true;
  const login = personOf(state, email)?.github;
  return Boolean(login && event.type === "github.review_requested" && event.data.reviewer === login);
}

const WORK_SIGNAL_MS = 40 * MINUTE;

/** O último sinal de trabalho da pessoa, se recente. */
function lastWorkSignal(state: ActivityState, email: string): string | null {
  const dir = directory(state);
  for (let index = state.feed.length - 1; index >= 0; index -= 1) {
    const event = state.feed[index]!;
    if (state.at - event.at > WORK_SIGNAL_MS) return null;
    if (resolveActor(dir, event.actor)?.email !== email) continue;
    switch (event.type) {
      case "github.review_submitted":
        return event.data.state === "commented" ? `revisando PR #${event.data.number}` : `revisou PR #${event.data.number}`;
      case "github.push":
      case "github.pr_opened":
        return `no PR #${event.data.number}`;
      case "github.pr_merged":
        return `mesclou PR #${event.data.number}`;
      case "github.deploy":
        return `deploy em ${event.data.environment === "producao" ? "produção" : "homologação"}`;
      case "notion.story_status":
        return event.data.status === "concluida" ? `concluiu ${event.data.storyId}` : `em ${event.data.storyId}`;
      case "notion.story_unblocked":
      case "notion.criterion_added":
      case "notion.criterion_checked":
        return `em ${event.data.storyId}`;
      case "notion.epic_status":
        return `no épico ${event.data.epicId}`;
      default:
        break;
    }
  }
  return null;
}

/** O rótulo curto sobre a cabeça: "Daily", "revisando PR #142", "foco", "Almoço". */
export function doingNow(state: ActivityState, email: string): string {
  const where = whereIs(state, email);
  const status = state.slackStatus[email];
  switch (where.kind) {
    case "reuniao":
      return where.meeting!.title;
    case "chamada":
      return `${where.meeting!.title} (remota)`;
    case "huddle":
      return `huddle em #${where.huddle!.channel}`;
    case "fora":
      return status?.text ?? "fora";
    case "foco": {
      const story = state.stories.find((item) => item.assignee === email && item.status === "andamento");
      return story ? `foco · ${story.id}` : "foco";
    }
    case "mesa": {
      const signal = lastWorkSignal(state, email);
      if (signal) return signal;
      const story = state.stories.find((item) => item.assignee === email && item.status === "andamento");
      return story ? `em ${story.id}` : "disponível";
    }
  }
}

/** Quem está em reunião, foco, huddle ou fora, agora. */
export function presenceBuckets(state: ActivityState): Record<PlaceKind, string[]> {
  const buckets: Record<PlaceKind, string[]> = { mesa: [], foco: [], chamada: [], reuniao: [], huddle: [], fora: [] };
  for (const person of state.people) buckets[whereIs(state, person.email).kind].push(person.email);
  return buckets;
}

// ─── A daily é o huddle do Slack ─────────────────────────────────────────────

/** Até quanto depois do início o convidado que não entrou ainda é "ainda não entrou", não ausente. */
export const DAILY_GRACE_MS = 8 * MINUTE;

export interface DailyAttendance {
  meeting: CalendarEvent;
  /** O huddle da reunião, se alguém já o começou. */
  huddle: Huddle | null;
  /** Quem está no huddle agora, e portanto na sala: convidado ou não. */
  inRoom: string[];
  /** Convidados que não entraram, ainda dentro da tolerância. */
  notYet: string[];
  /** Convidados que não entraram, passada a tolerância. Quem não foi convidado nunca conta. */
  absent: string[];
  /** A partir de quando quem não entrou conta como ausente. */
  graceUntil: Instant;
}

/**
 * Quem está na daily, quem ainda não entrou e quem faltou, pela regra: ausente é o convidado da
 * agenda que não entrou no huddle. Nos primeiros 8 minutos ele "ainda não entrou"; quem entra
 * atrasado sai da lista. Nulo fora de uma reunião feita em huddle. Prédio, Painel e barra lateral
 * leem daqui.
 */
export function dailyAttendance(state: ActivityState, at: Instant = state.at): DailyAttendance | null {
  const meeting = state.calendar.find((entry) => entry.huddleChannel && entry.start <= at && at < entry.end);
  if (!meeting) return null;
  const huddle = huddleOfMeeting(state, meeting);
  // Entrou e saiu antes do fim continua tendo entrado: só falta quem nunca entrou.
  const joined = new Set<string>();
  for (const event of state.feed) {
    if (event.at > at || event.actor.kind !== "person") continue;
    if ((event.type === "slack.huddle_started" || event.type === "slack.huddle_joined") && event.data.huddleId === huddle?.id) joined.add(event.actor.email);
  }
  for (const email of huddle?.participants ?? []) joined.add(email);
  const missing = meeting.attendees.filter((email) => !joined.has(email));
  const graceUntil = meeting.start + DAILY_GRACE_MS;
  const late = at < graceUntil;
  return { meeting, huddle, inRoom: huddle?.endedAt === null ? [...huddle.participants] : [], notYet: late ? missing : [], absent: late ? [] : missing, graceUntil };
}

/** Os três grupos da daily, na ordem em que as telas mostram. */
export const DAILY_MARKS = ["na-sala", "ainda-nao-entrou", "ausente"] as const;
export type DailyMark = (typeof DAILY_MARKS)[number];
export const DAILY_MARK_LABEL: Record<DailyMark, string> = { "na-sala": "Na sala", "ainda-nao-entrou": "Ainda não entrou", ausente: "Ausente" };

export const dailyGroups = (attendance: DailyAttendance): Record<DailyMark, string[]> => ({ "na-sala": attendance.inRoom, "ainda-nao-entrou": attendance.notYet, ausente: attendance.absent });

export function dailyMarkOf(attendance: DailyAttendance | null, email: string): DailyMark | null {
  if (!attendance) return null;
  const groups = dailyGroups(attendance);
  return DAILY_MARKS.find((mark) => groups[mark].includes(email)) ?? null;
}

/** O próximo instante em que a pessoa sai de reunião, chamada ou huddle, a partir de `from`. */
export function nextFreeAt(state: ActivityState, email: string, from = state.at): Instant {
  let at = from;
  for (const entry of meetingsOf(state, email)) {
    if (entry.start <= at && at < entry.end) at = entry.end;
  }
  return at;
}

// ─── PRs e revisões ──────────────────────────────────────────────────────────

const approved = (pr: PullRequest) => pr.reviews.some((review) => review.state === "approved");

/** Esperando desde quando: a abertura ou a última revisão, o que for mais recente. */
export const waitingSince = (pr: PullRequest) => Math.max(pr.openedAt, ...pr.reviews.map((review) => review.at));

export function prsAwaitingReview(state: ActivityState): PullRequest[] {
  return state.prs
    .filter((pr) => pr.state === "open" && !pr.draft && !approved(pr) && (pr.reviewers.length > 0 || pr.reviews.length === 0))
    .sort((a, b) => waitingSince(a) - waitingSince(b) || a.number - b.number);
}

export interface ReviewCandidate {
  person: Person;
  /** Revisões já pedidas a ela e ainda abertas. */
  pending: number;
  /** Até quando está livre, pela agenda. */
  freeUntil: Instant | null;
}

export function pendingReviewsOf(state: ActivityState, login: string) {
  return state.prs.filter((pr) => pr.state === "open" && pr.reviewers.includes(login));
}

/**
 * Quem pode revisar agora: dev ou tech lead com GitHub vinculado (sem login não dá para pedir
 * revisão), que não é o autor, está na mesa e não tem reunião nos próximos 30 minutos. Foco é
 * "não perturbe": fica de fora de propósito.
 */
export function reviewCandidates(state: ActivityState, pr: Pick<PullRequest, "author">): ReviewCandidate[] {
  return state.people
    .filter((person) => (person.role === "dev" || person.role === "techlead") && person.github && person.github !== pr.author)
    .filter((person) => whereIs(state, person.email).kind === "mesa")
    .map((person) => {
      const next = meetingsOf(state, person.email).find((entry) => entry.start > state.at);
      return { person, pending: pendingReviewsOf(state, person.github!).length, freeUntil: next?.start ?? null };
    })
    .filter((candidate) => candidate.freeUntil === null || candidate.freeUntil - state.at >= FREE_AHEAD_MS)
    .sort((a, b) => a.pending - b.pending || a.person.name.localeCompare(b.person.name));
}

export interface UpcomingReviewer {
  person: Person;
  pending: number;
  /** Quando passa a contar como livre para revisar, pela regra de `reviewCandidates`. */
  freeAt: Instant;
  /** Até quando fica livre, pela agenda. */
  freeUntil: Instant | null;
}

/** Os lugares que a agenda deixa prever: foco, huddle e "fora" não dizem quando acabam. */
const PREDICTABLE = new Set<PlaceKind>(["mesa", "reuniao", "chamada"]);

/**
 * Quem ainda não pode revisar agora, mas fica livre hoje, e quando: a mesma regra de
 * `reviewCandidates` (dev ou tech lead com GitHub, que não é o autor, sem reunião nos 30 minutos
 * seguintes) aplicada à agenda. Na daily o squad inteiro está na sala e ninguém está livre; isto
 * diz "Renata livre às 09:45". Do mais cedo para o mais tarde. Não muda `reviewCandidates`.
 */
export function upcomingReviewers(state: ActivityState, pr: Pick<PullRequest, "author">, until: Instant = DAY_END): UpcomingReviewer[] {
  const now = new Set(reviewCandidates(state, pr).map((candidate) => candidate.person.email));
  const upcoming: UpcomingReviewer[] = [];
  for (const person of state.people) {
    if ((person.role !== "dev" && person.role !== "techlead") || !person.github || person.github === pr.author || now.has(person.email)) continue;
    if (!PREDICTABLE.has(whereIs(state, person.email).kind)) continue;
    const meetings = meetingsOf(state, person.email);
    let freeAt = state.at;
    let freeUntil: Instant | null = null;
    for (;;) {
      freeAt = nextFreeAt(state, person.email, freeAt);
      const next = meetings.find((entry) => entry.start > freeAt);
      freeUntil = next?.start ?? null;
      if (!next || next.start - freeAt >= FREE_AHEAD_MS) break;
      freeAt = next.end;
    }
    if (freeAt <= state.at || freeAt >= until) continue;
    upcoming.push({ person, pending: pendingReviewsOf(state, person.github).length, freeAt, freeUntil });
  }
  return upcoming.sort((a, b) => a.freeAt - b.freeAt || a.pending - b.pending || a.person.name.localeCompare(b.person.name));
}

// ─── HUs ─────────────────────────────────────────────────────────────────────

const OPEN_WORK = new Set<Story["status"]>(["andamento", "revisao", "qa"]);

/** HUs em andamento, revisão ou QA sem movimento há mais de `olderThan`. Travadas têm lista própria. */
export function staleStories(state: ActivityState, olderThan = DEFAULT_STALE_MS): Story[] {
  return state.stories.filter((story) => OPEN_WORK.has(story.status) && !story.blocked && state.at - story.updatedAt > olderThan).sort((a, b) => a.updatedAt - b.updatedAt);
}

export const blockedStories = (state: ActivityState) => state.stories.filter((story) => story.blocked && story.status !== "concluida").sort((a, b) => a.blocked!.since - b.blocked!.since);

/** Pronta ou em curso sem critério de aceite: ninguém sabe dizer quando acaba. Backlog ainda pode. */
export function storiesWithoutCriteria(state: ActivityState): Story[] {
  return state.stories.filter((story) => story.criteria.length === 0 && story.status !== "backlog" && story.status !== "concluida");
}

// ─── Épicos ──────────────────────────────────────────────────────────────────

export type HealthLevel = "no-prazo" | "em-risco" | "travado";

export const HEALTH_LABEL: Record<HealthLevel, string> = { "no-prazo": "No prazo", "em-risco": "Em risco", travado: "Travado" };

export type HealthReasonKind = "hu-travada" | "ci-quebrado" | "pr-sem-revisao" | "hu-parada" | "hu-sem-criterio" | "responsavel-fora" | "prazo";

export interface HealthReason {
  kind: HealthReasonKind;
  text: string;
  subject: Subject;
}

export interface EpicHealth {
  level: HealthLevel;
  reasons: HealthReason[];
  done: number;
  total: number;
}

/** O que trava ou ameaça o épico, cada coisa com o porquê e o item a abrir. */
export function epicHealth(state: ActivityState, epicId: string, staleMs = DEFAULT_STALE_MS): EpicHealth {
  const epic = epicOf(state, epicId);
  const stories = storiesOf(state, epicId);
  const done = stories.filter((story) => story.status === "concluida").length;
  if (!epic || epic.status === "entregue") return { level: "no-prazo", reasons: [], done, total: stories.length };
  const reasons: HealthReason[] = [];
  const at = state.at;
  for (const story of stories) {
    if (story.status === "concluida") continue;
    const subject: Subject = { kind: "story", id: story.id };
    if (story.blocked) {
      const who = story.blocked.waitingOn ? ` de ${personOf(state, story.blocked.waitingOn)?.name ?? story.blocked.waitingOn}` : "";
      reasons.push({ kind: "hu-travada", text: `${story.id} travada esperando decisão${who} (${ageLabel(at - story.blocked.since)})`, subject });
    }
    for (const pr of prsOfStory(state, story.id).filter((item) => item.state === "open")) {
      if (pr.ci === "failure" && pr.ciSince !== null && at - pr.ciSince > CI_BROKEN_MS) reasons.push({ kind: "ci-quebrado", text: `CI quebrado no PR #${pr.number} (${ageLabel(at - pr.ciSince)})`, subject: { kind: "pr", number: pr.number } });
      if (prsAwaitingReview(state).includes(pr) && at - waitingSince(pr) > REVIEW_WAIT_MS) reasons.push({ kind: "pr-sem-revisao", text: `PR #${pr.number} esperando revisão ${ageLabel(at - waitingSince(pr))}`, subject: { kind: "pr", number: pr.number } });
    }
    if (!story.blocked && OPEN_WORK.has(story.status) && at - story.updatedAt > staleMs) reasons.push({ kind: "hu-parada", text: `${story.id} parada ${ageLabel(at - story.updatedAt)}`, subject });
    if (story.criteria.length === 0 && story.status !== "backlog") reasons.push({ kind: "hu-sem-criterio", text: `${story.id} ${story.status === "pronta" ? "pronta" : "em curso"} sem critério de aceite`, subject });
    if (story.assignee && (story.status === "pronta" || OPEN_WORK.has(story.status)) && state.presence[story.assignee] === "offline" && state.slackStatus[story.assignee]) {
      reasons.push({ kind: "responsavel-fora", text: `${story.id} com ${personOf(state, story.assignee)?.name ?? story.assignee}, que está fora (${state.slackStatus[story.assignee]!.text})`, subject });
    }
  }
  const left = epic.due - at;
  if (stories.length > 0 && left < 2 * DAY && done / stories.length < 0.6) reasons.push({ kind: "prazo", text: `Entrega ${left <= 0 ? "vencida" : left <= 1.5 * DAY ? "amanhã" : `em ${Math.round(left / DAY)} dias`} com ${done} de ${stories.length} HUs concluídas`, subject: { kind: "epic", id: epic.id } });
  const level: HealthLevel = reasons.some((reason) => reason.kind === "hu-travada") ? "travado" : reasons.length > 0 ? "em-risco" : "no-prazo";
  return { level, reasons, done, total: stories.length };
}

/** O que trava o épico: só os motivos, na ordem da gravidade. */
export function blockersOf(state: ActivityState, epicId: string): HealthReason[] {
  const order: HealthReasonKind[] = ["hu-travada", "ci-quebrado", "pr-sem-revisao", "responsavel-fora", "hu-parada", "hu-sem-criterio", "prazo"];
  return [...epicHealth(state, epicId).reasons].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

/**
 * O status que o GitHub sugere para um épico de delivery: algo mesclado já é andamento; tudo em QA
 * ou concluído e em homologação é homologação; tudo concluído e em produção é entregue. Nunca
 * volta um épico atrás, e não opina sobre discovery.
 */
export function githubSuggestedStatus(state: ActivityState, epic: Epic): EpicStatus | null {
  if (trackOf(epic.status) !== "delivery") return null;
  const stories = storiesOf(state, epic.id);
  const prs = stories.flatMap((story) => prsOfStory(state, story.id));
  const merged = prs.filter((pr) => pr.state === "merged");
  const deployedTo = (environment: "homologacao" | "producao") => merged.every((pr) => state.deploys.some((deploy) => deploy.status === "success" && deploy.environment === environment && deploy.numbers.includes(pr.number)));
  let suggested: EpicStatus = epic.status;
  if (merged.length > 0) suggested = "andamento";
  if (stories.length > 0 && merged.length > 0 && stories.every((story) => story.status === "qa" || story.status === "concluida") && deployedTo("homologacao")) suggested = "homologacao";
  if (stories.length > 0 && merged.length > 0 && stories.every((story) => story.status === "concluida") && deployedTo("producao")) suggested = "entregue";
  const index = (status: EpicStatus) => EPIC_STAGES.findIndex((stage) => stage.id === status);
  return index(suggested) > index(epic.status) ? suggested : null;
}

// ─── Pessoas e bots ──────────────────────────────────────────────────────────

export interface PersonLoad {
  person: Person;
  stories: Story[];
  prs: PullRequest[];
  reviews: PullRequest[];
}

export function personLoad(state: ActivityState, email: string): PersonLoad | null {
  const person = personOf(state, email);
  if (!person) return null;
  const login = person.github;
  return {
    person,
    stories: state.stories.filter((story) => story.assignee === email && story.status !== "concluida"),
    prs: login ? state.prs.filter((pr) => pr.state === "open" && pr.author === login) : [],
    reviews: login ? pendingReviewsOf(state, login) : [],
  };
}

export const squadLoad = (state: ActivityState) => state.people.map((person) => personLoad(state, person.email)!);

/** PRs cujo autor não está no cadastro: o login aparece, a pessoa não. */
export const prsWithoutAuthor = (state: ActivityState) => state.prs.filter((pr) => !personByGithub(directory(state), pr.author));

export const botTasksToday = (state: ActivityState, dayStart = DAY_START) => state.botTasks.filter((task) => task.startedAt >= dayStart).sort((a, b) => a.startedAt - b.startedAt);
export const botTasksRunning = (state: ActivityState) => state.botTasks.filter((task) => task.doneAt === null);

/** O dia da pessoa no feed, do mais recente ao mais antigo. */
export const personHistory = (state: ActivityState, email: string, limit = 40) => state.feed.filter((event) => involves(state, event, email)).slice(-limit).reverse();

// ─── As respostas que a cena e o painel precisam dar iguais ──────────────────

export interface TrackingAnswers {
  at: string;
  travadas: string[];
  paradas: string[];
  revisoes: number[];
  semCriterio: string[];
  semAutor: number[];
  botsHoje: number;
  reuniao: string[];
  huddle: string[];
  foco: string[];
  fora: string[];
  saude: Record<string, HealthLevel>;
}

export function trackingAnswers(state: ActivityState, staleMs = DEFAULT_STALE_MS): TrackingAnswers {
  const buckets = presenceBuckets(state);
  return {
    at: clockLabel(state.at),
    travadas: blockedStories(state).map((story) => story.id),
    paradas: staleStories(state, staleMs).map((story) => story.id),
    revisoes: prsAwaitingReview(state).map((pr) => pr.number),
    semCriterio: storiesWithoutCriteria(state).map((story) => story.id),
    semAutor: prsWithoutAuthor(state).filter((pr) => pr.state === "open").map((pr) => pr.number),
    botsHoje: botTasksToday(state).length,
    reuniao: buckets.reuniao,
    huddle: buckets.huddle,
    foco: buckets.foco,
    fora: buckets.fora,
    saude: Object.fromEntries(state.epics.map((epic) => [epic.id, epicHealth(state, epic.id, staleMs).level])),
  };
}
