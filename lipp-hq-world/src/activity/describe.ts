import type { ActivityEvent, ActivityState } from "./events";
import { directory, personOf } from "./selectors";
import { resolveActor } from "./identity";
import { AVAILABILITY_LABEL, BOT_TASK_LABEL, CI_LABEL, ENVIRONMENT_LABEL, EPIC_STATUS_LABEL, REVIEW_LABEL, STORY_STATUS_LABEL, type Actor } from "./types";

const BOT_NAME: Record<string, string> = { forge: "Forge", pulse: "Pulse", atlas: "Atlas" };

/** "Diego Martins", "tnunes-dev (não identificado)", "Pulse" ou "Lipp HQ". */
export function actorName(state: ActivityState, actor: Actor): string {
  const person = resolveActor(directory(state), actor);
  if (person) return person.name;
  if (actor.kind === "github") return actor.login === "github-actions" ? "GitHub Actions" : `${actor.login} (autor não identificado)`;
  if (actor.kind === "bot") return BOT_NAME[actor.botId] ?? actor.botId;
  if (actor.kind === "app") return "Lipp HQ";
  return actor.email;
}

/**
 * Uma linha do feed, em português. Mensagem entre pessoas não existe no modelo, então não tem como
 * aparecer aqui: o que tem texto é só o que o app ou um bot enviou.
 */
export function describeEvent(state: ActivityState, event: ActivityEvent): string {
  const who = actorName(state, event.actor);
  const name = (email: string) => (email.startsWith("#") ? email : personOf(state, email)?.name ?? email);
  switch (event.type) {
    case "notion.story_status":
      return `${who} moveu ${event.data.storyId} para ${STORY_STATUS_LABEL[event.data.status]}`;
    case "notion.story_assigned":
      return `${who} passou ${event.data.storyId} para ${name(event.data.assignee)}`;
    case "notion.story_blocked":
      return `${who} marcou ${event.data.storyId} como travada: ${event.data.reason}`;
    case "notion.story_unblocked":
      return `${who} destravou ${event.data.storyId}. ${event.data.note}`;
    case "notion.criterion_added":
      return `${who} ${event.data.criterion.suggestedBy ? "sugeriu" : "acrescentou"} critério na ${event.data.storyId}: ${event.data.criterion.text}`;
    case "notion.criterion_checked":
      return `${who} marcou um critério da ${event.data.storyId}`;
    case "notion.epic_status":
      return `${who} mudou ${event.data.epicId} para ${EPIC_STATUS_LABEL[event.data.status]}`;
    case "github.pr_opened":
      return `${who} abriu o PR #${event.data.number}: ${event.data.title}`;
    case "github.push":
      return `${who} subiu commits no PR #${event.data.number}`;
    case "github.review_requested":
      return `${who} pediu a revisão do PR #${event.data.number} a ${actorName(state, { kind: "github", login: event.data.reviewer })}`;
    case "github.review_submitted":
      return `${who} ${REVIEW_LABEL[event.data.state]} o PR #${event.data.number}`;
    case "github.ci":
      return `${CI_LABEL[event.data.state]} no PR #${event.data.number}`;
    case "github.pr_merged":
      return `${who} mesclou o PR #${event.data.number}`;
    case "github.deploy":
      return `Deploy em ${ENVIRONMENT_LABEL[event.data.environment]} ${event.data.status === "success" ? "concluído" : "falhou"}: ${event.data.numbers.map((number) => `#${number}`).join(", ")}`;
    case "slack.status":
      return event.data.status ? `${who} pôs o status ${event.data.status.emoji} ${event.data.status.text}` : `${who} limpou o status`;
    case "slack.huddle_started":
      return `${who} começou um huddle em #${event.data.channel}`;
    case "slack.huddle_joined":
      return `${who} entrou no huddle`;
    case "slack.huddle_left":
      return `${who} saiu do huddle`;
    case "slack.channel_activity":
      return `#${event.data.channel}: ${event.data.messages} ${event.data.messages === 1 ? "mensagem" : "mensagens"}`;
    case "slack.app_message":
      return `${who} → ${name(event.data.to)}: ${event.data.text}`;
    case "m365.presence":
      return `${who}: ${AVAILABILITY_LABEL[event.data.availability]} no Teams`;
    case "m365.event_created":
      return `${who} marcou ${event.data.event.title}`;
    case "bot.task_started":
      return `${who} começou: ${BOT_TASK_LABEL[event.data.kind]}`;
    case "bot.task_done":
      return `${who} terminou: ${event.data.result}`;
    case "bot.pr_summary":
      return `${who} resumiu o PR #${event.data.number}`;
    case "app.github_linked":
      return event.data.login ? `Cadastro: ${name(event.data.email)} vinculou o GitHub @${event.data.login}` : `Cadastro: ${name(event.data.email)} desfez o vínculo com o GitHub`;
  }
}

/** Ruído que não interessa no histórico de uma pessoa: presença muda a toda hora. */
export const isNoise = (event: ActivityEvent) => event.type === "slack.channel_activity" || event.type === "m365.presence";
