import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { ArrowRightLeft, Bot, Megaphone, type LucideIcon } from "lucide-react";
import { NUDGE_CHANNEL, assigneeOptions, botRequestPreview, lastBotRequest, nudgePreview, nudgeStatus, type NudgeReason, type RequestableTask } from "@/activity/actions";
import { PLACE_LABEL, personOf, prsAwaitingReview } from "@/activity/selectors";
import type { AppAction } from "@/activity/source";
import { clockLabel } from "@/activity/time";
import { BOT_TASK_LABEL, type PullRequest, type Story, type Subject } from "@/activity/types";
import { actionKey, useTechStore } from "./techStore";
import { subjectLabel } from "./techViews";
import "./tech-actions.css";

/**
 * As três ações do cenário (cobrar, reatribuir, pedir ao bot), numa implementação só, usada onde a
 * pergunta aparece: gaveta do épico e da pessoa, árvore de Projetos e itens do Painel. Cada ação abre
 * um painel que diz o que vai acontecer antes de enviar; enviar passa por `useTechStore.perform`, que
 * fala com `ActivityRuntime.perform`. A tela nunca muda o estado por conta própria.
 */

/** Onde a ação está: a mesma HU na gaveta e no Painel abre painéis separados, um de cada vez. */
export const ActionPlace = createContext("tela");

const run = (action: AppAction) => useTechStore.getState().perform(action);
const first = (name: string) => name.split(" ")[0]!;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

interface PanelHandle {
  open: boolean;
  domId: string;
  toggle: () => void;
  close: () => void;
  trigger: RefObject<HTMLButtonElement | null>;
}

/** Um painel aberto por vez na tela inteira. Fechado pelo Esc, o foco volta ao botão. */
function usePanel(action: AppAction): PanelHandle {
  const place = useContext(ActionPlace);
  const key = `${place}|${actionKey(action)}`;
  const open = useTechStore((store) => store.openAction === key);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && (!document.activeElement || document.activeElement === document.body)) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  return {
    open,
    domId: `acao-${key.replace(/[^a-z0-9]+/gi, "-")}`,
    toggle: () => useTechStore.getState().setOpenAction(open ? null : key),
    close: () => {
      useTechStore.getState().setOpenAction(null);
      trigger.current?.focus();
    },
    trigger,
  };
}

function Trigger({ panel, kind, target, icon: Icon, children }: { panel: PanelHandle; kind: string; target: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <button ref={panel.trigger} type="button" className="ta-trigger" aria-expanded={panel.open} aria-controls={panel.open ? panel.domId : undefined} data-action={kind} data-action-target={target} onClick={panel.toggle}>
      <Icon size={13} aria-hidden />
      {children}
    </button>
  );
}

/** O painel da ação: o que vai acontecer, e o botão que envia. Esc ou Cancelar fecham sem enviar. */
function Panel({ panel, title, kind, children, confirm }: { panel: PanelHandle; title: string; kind: string; children: ReactNode; confirm: ReactNode }) {
  const node = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    node.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    node.current?.scrollIntoView({ block: "nearest" });
  }, []);
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    panel.close();
  };
  return (
    <div ref={node} id={panel.domId} className="ta-panel" role="group" aria-label={title} data-action-panel={kind} data-scene-keys-off onKeyDown={onKeyDown}>
      <p className="ta-title">{title}</p>
      {children}
      <div className="ta-buttons">
        {confirm}
        <button type="button" className="office-button" onClick={panel.close} data-action-cancel>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Cobrar ──────────────────────────────────────────────────────────────────

const NUDGE_REASON: Record<NudgeReason, string> = {
  trava: "É quem a trava espera",
  responsavel: "É quem responde pela HU",
};

export function NudgeAction({ story }: { story: Story }) {
  const state = useTechStore((store) => store.state);
  const action: AppAction = { kind: "cobrar", storyId: story.id };
  const panel = usePanel(action);
  const preview = nudgePreview(state, story.id);
  if (!preview) return null;
  const name = first(preview.person.name);
  const status = nudgeStatus(state, story.id);
  const waiting = Boolean(status && status.answeredAt === null);
  const later = preview.where === "reuniao" || preview.where === "huddle" || preview.where === "fora";
  return (
    <>
      <Trigger panel={panel} kind="cobrar" target={story.id} icon={Megaphone}>
        {waiting ? `Cobrar ${name} de novo` : `Cobrar ${name}`}
      </Trigger>
      {panel.open && (
        <Panel
          panel={panel}
          kind="cobrar"
          title={`Cobrar ${preview.person.name} sobre a ${story.id}`}
          confirm={
            <button
              type="button"
              className="office-button primary"
              data-autofocus
              data-action-confirm
              onClick={() => {
                if (run(action).ok) panel.close();
              }}
            >
              Enviar no {NUDGE_CHANNEL}
            </button>
          }
        >
          <p className="ta-why">
            {NUDGE_REASON[preview.reason]} · {PLACE_LABEL[preview.where].toLocaleLowerCase("pt-BR")}
            {later ? `: a resposta vem quando ${name} puder olhar o Slack` : ""}
          </p>
          <figure className="ta-message" data-nudge-message>
            <figcaption>
              Mensagem do Lipp HQ no {NUDGE_CHANNEL}, marcando {preview.person.name}
            </figcaption>
            <blockquote>{preview.text}</blockquote>
          </figure>
          <p className="ta-note">Sai no canal do squad, à vista do time, e não por mensagem direta. É o único texto que sai: a mensagem do próprio Lipp HQ. Ninguém escreve em nome de ninguém.</p>
        </Panel>
      )}
    </>
  );
}

/** "Cobrado às 10:05, aguardando resposta de Marina" até a resposta chegar pela simulação. */
export function NudgeLine({ storyId }: { storyId: string }) {
  const state = useTechStore((store) => store.state);
  const status = nudgeStatus(state, storyId);
  if (!status) return null;
  const name = first(personOf(state, status.to)?.name ?? status.to);
  return status.answeredAt === null ? (
    <p className="ta-status waiting" data-nudge-status="aguardando" data-nudge-story={storyId}>
      Cobrado às {clockLabel(status.at)}, aguardando resposta de {name}
    </p>
  ) : (
    <p className="ta-status done" data-nudge-status="respondida" data-nudge-story={storyId}>
      Cobrado às {clockLabel(status.at)}; {name} respondeu às {clockLabel(status.answeredAt)}
    </p>
  );
}

// ─── Reatribuir ──────────────────────────────────────────────────────────────

export function ReassignAction({ story }: { story: Story }) {
  const state = useTechStore((store) => store.state);
  const panel = usePanel({ kind: "reatribuir", storyId: story.id, to: "" });
  const [choice, setChoice] = useState<string | null>(null);
  useEffect(() => {
    if (!panel.open) setChoice(null);
  }, [panel.open]);
  if (story.status === "concluida") return null;
  const options = assigneeOptions(state, story.id);
  const current = personOf(state, story.assignee);
  const chosen = options.find((option) => option.person.email === choice) ?? null;
  const group = `${panel.domId}-para`;
  return (
    <>
      <Trigger panel={panel} kind="reatribuir" target={story.id} icon={ArrowRightLeft}>
        Reatribuir
      </Trigger>
      {panel.open && (
        <Panel
          panel={panel}
          kind="reatribuir"
          title={`Reatribuir a ${story.id}`}
          confirm={
            <button
              type="button"
              className="office-button primary"
              disabled={!chosen}
              data-action-confirm
              onClick={() => {
                if (chosen && run({ kind: "reatribuir", storyId: story.id, to: chosen.person.email }).ok) panel.close();
              }}
            >
              {chosen ? `Passar para ${first(chosen.person.name)}` : "Escolha quem recebe"}
            </button>
          }
        >
          <p className="ta-why">Hoje com {current?.name ?? "ninguém"}. Escolha quem recebe; a carga de cada um ajuda a decidir.</p>
          <div className="ta-people" role="radiogroup" aria-label={`Quem recebe a ${story.id}`}>
            {options.map((option, index) => {
              const { stories, prs, reviews } = option.load;
              const autofocus = choice === null ? options.findIndex((item) => !item.current) === index : choice === option.person.email;
              return (
                <label key={option.person.email} className={option.current ? "ta-person current" : "ta-person"} data-assignee-option={option.person.email} data-away={option.away ? "true" : undefined}>
                  <input
                    type="radio"
                    name={group}
                    value={option.person.email}
                    checked={choice === option.person.email}
                    disabled={option.current}
                    onChange={() => {
                      setChoice(option.person.email);
                      // A confirmação aparece embaixo da lista: traz o botão para a vista.
                      requestAnimationFrame(() => document.getElementById(panel.domId)?.querySelector("[data-action-confirm]")?.scrollIntoView({ block: "nearest" }));
                    }}
                    data-autofocus={autofocus ? true : undefined}
                  />
                  <span className="ta-person-name">
                    <strong>{option.person.name}</strong>
                    <small>{option.person.title}</small>
                  </span>
                  <span className="ta-person-load" data-load-stories={stories.length}>
                    {plural(stories.length, "HU", "HUs")}
                    {option.person.github ? ` · ${plural(prs.length, "PR", "PRs")} · ${plural(reviews.length, "revisão", "revisões")}` : " · sem GitHub"}
                  </span>
                  <span className="ta-person-state">
                    {option.current ? <em className="ta-current">responsável agora</em> : option.away ? <em className="tv-away">{option.away}</em> : option.where !== "mesa" ? PLACE_LABEL[option.where] : "na mesa"}
                  </span>
                </label>
              );
            })}
          </div>
          {chosen && (
            <p className="ta-summary" data-reassign-summary>
              A {story.id} sai de {current?.name ?? "ninguém"} e vai para {chosen.person.name}
              {chosen.away ? `, que está fora (${chosen.away})` : ""}. O Lipp HQ muda o responsável no Notion e avisa {first(chosen.person.name)} no Slack.
            </p>
          )}
        </Panel>
      )}
    </>
  );
}

// ─── Pedir ao bot ────────────────────────────────────────────────────────────

const BOT_SHORT: Record<RequestableTask, string> = { resumir_pr: "resumir o PR", cobrar_revisao: "pedir revisão", completar_criterios: "completar critérios" };

export function BotAction({ task, target }: { task: RequestableTask; target: Subject }) {
  const state = useTechStore((store) => store.state);
  const action: AppAction = { kind: "pedir_bot", task, target };
  const panel = usePanel(action);
  const record = useTechStore((store) => store.records[actionKey(action)]);
  const preview = botRequestPreview(state, task, target);
  if (!preview) return null;
  const last = lastBotRequest(state, task, target);
  const targetId = target.kind === "pr" ? `#${target.number}` : target.kind === "story" ? target.id : target.kind;
  const queued = record?.ok && (!last || record.at > last.startedAt);
  let line: ReactNode = null;
  if (queued) line = <p className="ta-status waiting" data-bot-request="pedido" data-bot-task={task} data-bot-target={targetId}>Pedido às {clockLabel(record.at)}: {record.text}</p>;
  else if (last && last.doneAt === null) line = <p className="ta-status waiting" data-bot-request="trabalhando" data-bot-task={task} data-bot-target={targetId}>{preview.bot} trabalhando desde {clockLabel(last.startedAt)}</p>;
  else if (last) line = <p className="ta-status done" data-bot-request="pronto" data-bot-task={task} data-bot-target={targetId}>{preview.bot} terminou às {clockLabel(last.doneAt!)}: {last.result}</p>;
  return (
    <>
      {!preview.pending && !queued && (
        <Trigger panel={panel} kind={`bot-${task}`} target={targetId} icon={Bot}>
          {preview.bot}: {BOT_SHORT[task]}
        </Trigger>
      )}
      {panel.open && !preview.pending && (
        <Panel
          panel={panel}
          kind={`bot-${task}`}
          title={`Pedir ao ${preview.bot}: ${preview.label.toLocaleLowerCase("pt-BR")}`}
          confirm={
            <button
              type="button"
              className="office-button primary"
              data-autofocus
              data-action-confirm
              onClick={() => {
                if (run(action).ok) panel.close();
              }}
            >
              Pedir ao {preview.bot}
            </button>
          }
        >
          <p className="ta-why">{preview.plan}</p>
          <p className="ta-note" data-bot-when={preview.busyWith ? "depois" : "agora"}>
            {preview.busyWith
              ? `${preview.bot} está em outra tarefa (${BOT_TASK_LABEL[preview.busyWith.kind].toLocaleLowerCase("pt-BR")} · ${subjectLabel(state, preview.busyWith.target)}): começa depois dela.`
              : `${preview.bot} está livre: começa já, e o robô vai até o lugar no andar.`}
          </p>
        </Panel>
      )}
      {line}
    </>
  );
}

// ─── Por item ────────────────────────────────────────────────────────────────

/** Tudo o que se pode fazer com uma HU: cobrar, reatribuir e, sem critério, pedir ao Atlas. */
export function StoryActions({ story, only }: { story: Story; only?: ReadonlyArray<"cobrar" | "reatribuir" | "criterios"> }) {
  if (story.status === "concluida") return null;
  const shows = (kind: "cobrar" | "reatribuir" | "criterios") => !only || only.includes(kind);
  return (
    <div className="ta-bar" data-story-actions={story.id}>
      {shows("cobrar") && <NudgeAction story={story} />}
      {shows("reatribuir") && <ReassignAction story={story} />}
      {shows("criterios") && story.criteria.length === 0 && <BotAction task="completar_criterios" target={{ kind: "story", id: story.id }} />}
      {shows("cobrar") && <NudgeLine storyId={story.id} />}
    </div>
  );
}

/** PR aberto: o Pulse resume, e se o PR espera revisão, pede a quem está livre. */
export function PrActions({ pr, only }: { pr: PullRequest; only?: ReadonlyArray<RequestableTask> }) {
  const awaiting = useTechStore((store) => prsAwaitingReview(store.state).some((item) => item.number === pr.number));
  if (pr.state !== "open") return null;
  const shows = (task: RequestableTask) => !only || only.includes(task);
  return (
    <div className="ta-bar" data-pr-actions={pr.number}>
      {shows("resumir_pr") && <BotAction task="resumir_pr" target={{ kind: "pr", number: pr.number }} />}
      {shows("cobrar_revisao") && awaiting && <BotAction task="cobrar_revisao" target={{ kind: "pr", number: pr.number }} />}
    </div>
  );
}
