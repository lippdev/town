import type { ActivityState } from "./events";
import { resolveActor } from "./identity";
import { botTasksRunning, directory, firstName, personLoad, personOf, prOf, reviewCandidates, storyOf, whereIs, type PersonLoad, type PlaceKind } from "./selectors";
import { AUTOMATION_BOTS } from "./squad";
import type { AppAction } from "./source";
import { ageLabel } from "./time";
import { BOT_TASK_LABEL, STORY_STATUS_LABEL, type BotTask, type Instant, type Person, type Story, type Subject } from "./types";

/**
 * O que a tela precisa saber em volta de cada ação: antes de enviar (para quem vai, o que diz, quem
 * pode receber, se o bot está livre) e depois (a cobrança está esperando resposta?). A simulação usa
 * as mesmas funções para decidir, então o botão "Cobrar Marina" nunca cobra outra pessoa.
 */

// ─── Cobrar ──────────────────────────────────────────────────────────────────

/** Por que essa pessoa: é quem a trava espera, é o QA da HU em QA, ou é a responsável. */
export type NudgeReason = "trava" | "qa" | "responsavel";

export function nudgeTarget(state: ActivityState, story: Story): { email: string; reason: NudgeReason } | null {
  if (story.blocked?.waitingOn) return { email: story.blocked.waitingOn, reason: "trava" };
  const qa = state.people.find((person) => person.role === "qa")?.email ?? null;
  if (story.status === "qa" && qa) return { email: qa, reason: "qa" };
  return story.assignee ? { email: story.assignee, reason: "responsavel" } : null;
}

/** A mensagem do Lipp HQ para quem destrava. É o único texto que a ação cria. */
export function nudgeText(state: ActivityState, story: Story, email: string, now: Instant = state.at): string {
  const name = firstName(state, email);
  return story.blocked
    ? `Oi, ${name}! A ${story.id} (${story.title}) está travada ${ageLabel(now - story.blocked.since)} esperando você: ${story.blocked.reason}`
    : `Oi, ${name}! A ${story.id} (${story.title}) está em "${STORY_STATUS_LABEL[story.status]}" sem atualização ${ageLabel(now - story.updatedAt)}. Ainda é isso?`;
}

export interface NudgePreview {
  person: Person;
  reason: NudgeReason;
  text: string;
  /** Onde está agora: em reunião presencial ou fora, a resposta espera. */
  where: PlaceKind;
}

/** O que o botão "Cobrar" mostra antes de enviar; nulo quando não há a quem cobrar. */
export function nudgePreview(state: ActivityState, storyId: string): NudgePreview | null {
  const story = storyOf(state, storyId);
  if (!story || story.status === "concluida") return null;
  const target = nudgeTarget(state, story);
  const person = target ? personOf(state, target.email) : null;
  if (!target || !person) return null;
  return { person, reason: target.reason, text: nudgeText(state, story, person.email), where: whereIs(state, person.email).kind };
}

export interface NudgeStatus {
  to: string;
  at: Instant;
  text: string;
  /** Quando a cobrança teve resposta (a pessoa mexeu na HU, ela destravou ou foi concluída). */
  answeredAt: Instant | null;
}

/**
 * A última cobrança da HU, lida do feed: a mensagem do app sobre a HU (a de reatribuição é sobre a
 * pessoa, não conta). Conta como resposta qualquer movimento no Notion da HU feito por quem foi
 * cobrado, a HU destravar (seja por quem for) ou ser concluída.
 */
export function nudgeStatus(state: ActivityState, storyId: string): NudgeStatus | null {
  let index = -1;
  for (let cursor = state.feed.length - 1; cursor >= 0; cursor -= 1) {
    const event = state.feed[cursor]!;
    if (event.type === "slack.app_message" && event.actor.kind === "app" && event.subject.kind === "story" && event.subject.id === storyId) {
      index = cursor;
      break;
    }
  }
  if (index < 0) return null;
  const sent = state.feed[index]!;
  if (sent.type !== "slack.app_message") return null;
  const dir = directory(state);
  let answeredAt: Instant | null = null;
  for (const event of state.feed.slice(index + 1)) {
    if (event.subject.kind !== "story" || event.subject.id !== storyId) continue;
    const byTarget = event.source === "notion" && resolveActor(dir, event.actor)?.email === sent.data.to;
    const resolved = event.type === "notion.story_unblocked" || (event.type === "notion.story_status" && event.data.status === "concluida");
    if (byTarget || resolved) {
      answeredAt = event.at;
      break;
    }
  }
  return { to: sent.data.to, at: sent.at, text: sent.data.text, answeredAt };
}

// ─── Reatribuir ──────────────────────────────────────────────────────────────

export interface AssigneeOption {
  person: Person;
  load: PersonLoad;
  where: PlaceKind;
  /** "Férias até 16/11", "Almoço", "fora": nulo quando está trabalhando. */
  away: string | null;
  current: boolean;
}

/** Quem pode receber a HU, na ordem do squad, com a carga de cada um e quem está fora. */
export function assigneeOptions(state: ActivityState, storyId: string): AssigneeOption[] {
  const story = storyOf(state, storyId);
  return state.people.map((person) => {
    const where = whereIs(state, person.email).kind;
    return {
      person,
      load: personLoad(state, person.email)!,
      where,
      away: where === "fora" ? state.slackStatus[person.email]?.text ?? "fora" : null,
      current: story?.assignee === person.email,
    };
  });
}

// ─── Pedir ao bot ────────────────────────────────────────────────────────────

export type RequestableTask = Extract<AppAction, { kind: "pedir_bot" }>["task"];

export const REQUESTABLE_TASKS: readonly RequestableTask[] = ["resumir_pr", "cobrar_revisao", "completar_criterios"];

/** Notion é com o Atlas; GitHub é com o Pulse. */
export const botForTask = (task: RequestableTask) => (task === "completar_criterios" ? AUTOMATION_BOTS.notion : AUTOMATION_BOTS.github);

const BOT_NAME: Record<string, string> = { forge: "Forge", pulse: "Pulse", atlas: "Atlas" };
export const botName = (botId: string) => BOT_NAME[botId] ?? botId;

export interface BotRequestPreview {
  botId: string;
  bot: string;
  label: string;
  /** O que o bot vai fazer, em uma frase. */
  plan: string;
  /** A tarefa em que o bot está agora: com ela, a nova começa depois. */
  busyWith: BotTask | null;
  /** Já há um pedido igual, da tela, ainda sem terminar. */
  pending: BotTask | null;
}

const sameTarget = (a: Subject, b: Subject) => JSON.stringify(a) === JSON.stringify(b);

export function botRequestPreview(state: ActivityState, task: RequestableTask, target: Subject): BotRequestPreview | null {
  const botId = botForTask(task);
  const bot = botName(botId);
  let plan: string;
  if (target.kind === "pr") {
    const pr = prOf(state, target.number);
    if (!pr) return null;
    if (task === "resumir_pr") {
      const author = state.people.find((person) => person.github === pr.author);
      plan = `${bot} vai ${author && whereIs(state, author.email).kind !== "fora" ? `até a mesa de ${author.name.split(" ")[0]}` : "ao quadro"}, lê o PR #${pr.number} (CI, revisões, HU e critérios) e deixa um resumo nele.`;
    } else {
      const free = reviewCandidates(state, pr).filter((candidate) => !pr.reviewers.includes(candidate.person.github!));
      plan = free.length
        ? `${bot} pede a revisão do PR #${pr.number} a quem está livre agora pela agenda (${free.map((candidate) => candidate.person.name.split(" ")[0]).join(", ")}) e manda a mensagem do app.`
        : `Ninguém está livre agora pela agenda: ${bot} confere de novo quando começar e explica quem está ocupado.`;
    }
  } else if (target.kind === "story") {
    const story = storyOf(state, target.id);
    if (!story) return null;
    plan = `${bot} vai ao quadro e sugere critérios de aceite na ${story.id}, marcados como sugestão até alguém revisar.`;
  } else return null;
  const running = botTasksRunning(state).filter((item) => item.botId === botId);
  return {
    botId,
    bot,
    label: BOT_TASK_LABEL[task],
    plan,
    busyWith: running[0] ?? null,
    pending: running.find((item) => item.requestedBy === "app" && item.kind === task && sameTarget(item.target, target)) ?? null,
  };
}

/** A última tarefa pedida pela tela para esse alvo, rodando ou feita. */
export function lastBotRequest(state: ActivityState, task: RequestableTask, target: Subject): BotTask | null {
  return [...state.botTasks].reverse().find((item) => item.requestedBy === "app" && item.kind === task && sameTarget(item.target, target)) ?? null;
}
