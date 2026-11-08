import { actorName } from "@/activity/describe";
import type { ActivityState } from "@/activity/events";
import { prAuthor } from "@/activity/identity";
import {
  blockedStories,
  blockersOf,
  botTasksToday,
  directory,
  doingNow,
  epicHealth,
  epicOf,
  meetingsOf,
  personLoad,
  personOf,
  presenceBuckets,
  prOf,
  prsAwaitingReview,
  prsOfStory,
  prsWithoutAuthor,
  reviewCandidates,
  staleStories,
  storiesOf,
  storiesWithoutCriteria,
  storyOf,
  upcomingReviewers,
  waitingSince,
  whereIs,
  type EpicHealth,
  type HealthLevel,
  type HealthReason,
  type PlaceKind,
  type ReviewCandidate,
  type UpcomingReviewer,
  type Whereabouts,
} from "@/activity/selectors";
import { clockLabel as clock } from "@/activity/time";
import { BOT_TASK_LABEL, trackOf, type BotTask, type Epic, type Person, type Project, type PullRequest, type Story, type Subject, type Track } from "@/activity/types";

/**
 * O que as visões Projetos e Painel mostram, montado a partir do mesmo `ActivityState` da cena e
 * pelos mesmos seletores. Nada aqui guarda cópia: cada chamada lê o estado do instante. Sem React.
 */

// ─── Pessoas ─────────────────────────────────────────────────────────────────

/** Uma pessoa como aparece numa propriedade: o nome e, se estiver fora, o porquê. */
export interface PersonTag {
  email: string;
  name: string;
  /** "Férias até 16/11", "fora": nulo quando está trabalhando. */
  away: string | null;
}

export function personTag(state: ActivityState, email: string | null): PersonTag | null {
  const person = personOf(state, email);
  if (!person) return null;
  const away = whereIs(state, person.email).kind === "fora" ? state.slackStatus[person.email]?.text ?? "fora" : null;
  return { email: person.email, name: person.name, away };
}

// ─── Projetos: a árvore do Notion ────────────────────────────────────────────

export interface StoryNode {
  story: Story;
  assignee: PersonTag | null;
  /** Travada: desde quando e esperando quem. Mesma lista de `blockedStories`. */
  blocked: { reason: string; since: number; waitingOn: PersonTag | null } | null;
  /** Sem movimento no Notion: mesma lista de `staleStories`. */
  stale: boolean;
  /** Pronta ou em curso sem critério: mesma lista de `storiesWithoutCriteria`. */
  withoutCriteria: boolean;
  criteriaDone: number;
  prs: PullRequest[];
  /** Os outros motivos da saúde do épico que caem nesta HU: CI quebrado, PR sem revisão, responsável fora. */
  risks: HealthReason[];
}

export interface EpicNode {
  epic: Epic;
  owner: PersonTag | null;
  track: Track;
  health: EpicHealth;
  stories: StoryNode[];
}

export interface ProjectNode {
  project: Project;
  owner: PersonTag | null;
  epics: EpicNode[];
  summary: { stories: number; done: number; blocked: number; withoutCriteria: number; health: Record<HealthLevel, number> };
}

/** Motivos que a HU já mostra com marca própria (travada, parada, sem critério). */
const FLAGGED = new Set<HealthReason["kind"]>(["hu-travada", "hu-parada", "hu-sem-criterio"]);

export function projectTree(state: ActivityState): ProjectNode[] {
  const blocked = new Set(blockedStories(state).map((story) => story.id));
  const stale = new Set(staleStories(state).map((story) => story.id));
  const withoutCriteria = new Set(storiesWithoutCriteria(state).map((story) => story.id));
  const storyNode = (story: Story, health: EpicHealth): StoryNode => {
    const prs = prsOfStory(state, story.id);
    const touches = (subject: Subject) => (subject.kind === "story" && subject.id === story.id) || (subject.kind === "pr" && prs.some((pr) => pr.number === subject.number));
    return {
      story,
      assignee: personTag(state, story.assignee),
      blocked: blocked.has(story.id) && story.blocked ? { reason: story.blocked.reason, since: story.blocked.since, waitingOn: personTag(state, story.blocked.waitingOn) } : null,
      stale: stale.has(story.id),
      withoutCriteria: withoutCriteria.has(story.id),
      criteriaDone: story.criteria.filter((criterion) => criterion.done).length,
      prs,
      risks: health.reasons.filter((reason) => !FLAGGED.has(reason.kind) && touches(reason.subject)),
    };
  };
  return state.projects.map((project) => {
    const epics = state.epics
      .filter((epic) => epic.projectId === project.id)
      .map((epic): EpicNode => {
        const health = epicHealth(state, epic.id);
        return { epic, owner: personTag(state, epic.owner), track: trackOf(epic.status), health, stories: storiesOf(state, epic.id).map((story) => storyNode(story, health)) };
      });
    const stories = epics.flatMap((epic) => epic.stories);
    const health: Record<HealthLevel, number> = { "no-prazo": 0, "em-risco": 0, travado: 0 };
    for (const epic of epics) health[epic.health.level] += 1;
    return {
      project,
      owner: personTag(state, project.owner),
      epics,
      summary: {
        stories: stories.length,
        done: stories.filter((node) => node.story.status === "concluida").length,
        blocked: stories.filter((node) => node.blocked).length,
        withoutCriteria: stories.filter((node) => node.withoutCriteria).length,
        health,
      },
    };
  });
}

/** A HU pede atenção: travada, parada, sem critério, ou é o motivo de o épico estar em risco. */
export const needsAttention = (node: StoryNode) => Boolean(node.blocked) || node.stale || node.withoutCriteria || node.risks.length > 0;

/** O que abrir para ver tudo que pede atenção: os projetos e os épicos fora do prazo ou com HU marcada. */
export function attentionExpansion(tree: readonly ProjectNode[]): Set<string> {
  const open = new Set<string>();
  for (const project of tree) {
    open.add(project.project.id);
    for (const epic of project.epics) if (epic.health.level !== "no-prazo" || epic.stories.some(needsAttention)) open.add(epic.epic.id);
  }
  return open;
}

/** Tudo aberto: projetos, épicos e HUs (as HUs abrem critérios e PRs). */
export function fullExpansion(tree: readonly ProjectNode[]): Set<string> {
  const open = new Set<string>();
  for (const project of tree) {
    open.add(project.project.id);
    for (const epic of project.epics) {
      open.add(epic.epic.id);
      for (const story of epic.stories) open.add(story.story.id);
    }
  }
  return open;
}

/** Filtro "só o que pede atenção": épicos fora do prazo ou com HU marcada, e só as HUs marcadas. */
export function attentionOnly(tree: readonly ProjectNode[]): ProjectNode[] {
  return tree
    .map((project) => ({
      ...project,
      epics: project.epics
        .map((epic) => ({ ...epic, stories: epic.stories.filter(needsAttention) }))
        .filter((epic) => epic.stories.length > 0 || epic.health.level !== "no-prazo"),
    }))
    .filter((project) => project.epics.length > 0);
}

// ─── Painel: as perguntas da daily ───────────────────────────────────────────

export interface BlockedItem {
  story: Story;
  epic: Epic | null;
  assignee: PersonTag | null;
  reason: string;
  since: number;
  waitingOn: PersonTag | null;
  /** Onde está agora quem precisa destravar: dá para chamar já ou só depois da reunião. */
  waitingWhere: Whereabouts | null;
}

export interface StaleItem {
  story: Story;
  epic: Epic | null;
  assignee: PersonTag | null;
  idleMs: number;
}

export interface ReviewItem {
  pr: PullRequest;
  story: Story | null;
  author: Person | null;
  waitingMs: number;
  /** Revisões pedidas e ainda sem resposta, com a pessoa quando o login é de alguém. */
  requested: Array<{ login: string; person: PersonTag | null; where: PlaceKind | null }>;
  candidates: ReviewCandidate[];
  /** Ninguém livre agora: quem fica livre e quando, do mais cedo para o mais tarde. */
  upcoming: UpcomingReviewer[];
}

export interface CriteriaItem {
  story: Story;
  epic: Epic | null;
  assignee: PersonTag | null;
}

export interface AuthorItem {
  pr: PullRequest;
  story: Story | null;
}

export interface BotItem {
  task: BotTask;
  bot: string;
  label: string;
  target: string;
}

export interface PresenceItem {
  person: Person;
  /** "Daily até 09:45", "#squad-portal", "Férias até 16/11". */
  detail: string;
}

export interface EpicItem {
  epic: Epic;
  project: Project | null;
  owner: PersonTag | null;
  health: EpicHealth;
  /** Os motivos na ordem da gravidade, como o quadro. */
  reasons: HealthReason[];
}

export interface LoadItem {
  person: Person;
  where: PlaceKind;
  doing: string;
  stories: Story[];
  prs: PullRequest[];
  reviews: PullRequest[];
  github: boolean;
}

export interface DailyBoard {
  blocked: BlockedItem[];
  stale: StaleItem[];
  reviews: ReviewItem[];
  withoutCriteria: CriteriaItem[];
  withoutAuthor: AuthorItem[];
  bots: BotItem[];
  presence: Record<PlaceKind, PresenceItem[]>;
  epics: EpicItem[];
  load: LoadItem[];
}

const HEALTH_ORDER: HealthLevel[] = ["travado", "em-risco", "no-prazo"];

/** "PR #142", "HU-31", "E-2 · Segunda via de boleto", "daily". */
export function subjectLabel(state: ActivityState, subject: Subject): string {
  switch (subject.kind) {
    case "pr":
      return `PR #${subject.number}`;
    case "story":
      return subject.id;
    case "epic":
      return `${subject.id} · ${epicOf(state, subject.id)?.title ?? ""}`.trim();
    case "project":
      return state.projects.find((project) => project.id === subject.id)?.name ?? subject.id;
    case "person":
      return personOf(state, subject.email)?.name ?? subject.email;
    case "meeting":
      return state.calendar.find((entry) => entry.id === subject.id)?.title ?? "reunião";
    case "channel":
      return `#${subject.id}`;
    case "huddle":
      return "huddle";
    case "deploy":
      return "deploy";
  }
}

/** Onde um item do painel leva: a gaveta do épico (com a HU em destaque) ou a da pessoa. */
export type Destination = { kind: "epic"; epicId: string; storyId: string | null } | { kind: "person"; email: string };

export function destinationOf(state: ActivityState, subject: Subject): Destination | null {
  switch (subject.kind) {
    case "epic":
      return epicOf(state, subject.id) ? { kind: "epic", epicId: subject.id, storyId: null } : null;
    case "story": {
      const story = storyOf(state, subject.id);
      return story ? { kind: "epic", epicId: story.epicId, storyId: story.id } : null;
    }
    case "pr": {
      const pr = prOf(state, subject.number);
      return pr?.storyId ? destinationOf(state, { kind: "story", id: pr.storyId }) : null;
    }
    case "person":
      return personOf(state, subject.email) ? { kind: "person", email: subject.email } : null;
    default:
      return null;
  }
}

function presenceDetail(state: ActivityState, email: string, where: Whereabouts): string {
  const until = where.until ? ` até ${clock(where.until)}` : "";
  switch (where.kind) {
    case "reuniao":
    case "chamada":
      return `${where.meeting!.title}${until}`;
    case "huddle":
      return `#${where.huddle!.channel}`;
    case "fora":
      return state.slackStatus[email]?.text ?? "fora";
    case "foco": {
      const next = meetingsOf(state, email).find((entry) => entry.start > state.at);
      return next ? `não perturbe · livre até ${clock(next.start)}` : "não perturbe";
    }
    case "mesa":
      return "";
  }
}

export function dailyBoard(state: ActivityState): DailyBoard {
  const dir = directory(state);
  const epicOfStory = (story: Story) => epicOf(state, story.epicId);
  const buckets = presenceBuckets(state);
  const presence = Object.fromEntries(
    (Object.keys(buckets) as PlaceKind[]).map((kind) => [kind, buckets[kind].map((email) => ({ person: personOf(state, email)!, detail: presenceDetail(state, email, whereIs(state, email)) }))]),
  ) as Record<PlaceKind, PresenceItem[]>;
  return {
    blocked: blockedStories(state).map((story) => ({
      story,
      epic: epicOfStory(story),
      assignee: personTag(state, story.assignee),
      reason: story.blocked!.reason,
      since: story.blocked!.since,
      waitingOn: personTag(state, story.blocked!.waitingOn),
      waitingWhere: story.blocked!.waitingOn ? whereIs(state, story.blocked!.waitingOn) : null,
    })),
    stale: staleStories(state).map((story) => ({ story, epic: epicOfStory(story), assignee: personTag(state, story.assignee), idleMs: state.at - story.updatedAt })),
    reviews: prsAwaitingReview(state).map((pr) => ({
      pr,
      story: pr.storyId ? storyOf(state, pr.storyId) : null,
      author: prAuthor(dir, pr),
      waitingMs: state.at - waitingSince(pr),
      requested: pr.reviewers.map((login) => {
        const person = state.people.find((item) => item.github === login) ?? null;
        return { login, person: person ? personTag(state, person.email) : null, where: person ? whereIs(state, person.email).kind : null };
      }),
      candidates: reviewCandidates(state, pr),
      upcoming: upcomingReviewers(state, pr),
    })),
    withoutCriteria: storiesWithoutCriteria(state).map((story) => ({ story, epic: epicOfStory(story), assignee: personTag(state, story.assignee) })),
    withoutAuthor: prsWithoutAuthor(state)
      .filter((pr) => pr.state === "open")
      .map((pr) => ({ pr, story: pr.storyId ? storyOf(state, pr.storyId) : null })),
    bots: botTasksToday(state).map((task) => ({ task, bot: actorName(state, { kind: "bot", botId: task.botId }), label: BOT_TASK_LABEL[task.kind], target: subjectLabel(state, task.target) })),
    presence,
    epics: state.epics
      .map((epic) => {
        const health = epicHealth(state, epic.id);
        return { epic, project: state.projects.find((project) => project.id === epic.projectId) ?? null, owner: personTag(state, epic.owner), health, reasons: blockersOf(state, epic.id) };
      })
      .sort((a, b) => HEALTH_ORDER.indexOf(a.health.level) - HEALTH_ORDER.indexOf(b.health.level)),
    load: state.people.map((person) => {
      const load = personLoad(state, person.email)!;
      return { person, where: whereIs(state, person.email).kind, doing: doingNow(state, person.email), stories: load.stories, prs: load.prs, reviews: load.reviews, github: Boolean(person.github) };
    }),
  };
}
