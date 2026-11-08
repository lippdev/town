import { useMemo, type ReactNode } from "react";
import { Link2, Moon } from "lucide-react";
import type { ActivityState } from "@/activity/events";
import { PLACE_LABEL, type HealthLevel, type PlaceKind } from "@/activity/selectors";
import { ageLabel, clockLabel, spanLabel, whenLabel } from "@/activity/time";
import { EPIC_STATUS_LABEL, STORY_STATUS_LABEL, TRACK_LABEL, trackOf, type Person, type PullRequest, type Subject } from "@/activity/types";
import { ActionPlace, PrActions, StoryActions } from "./TechActions";
import { PrAuthor, Section } from "./TechHud";
import { useTechStore } from "./techStore";
import { dailyBoard, destinationOf, subjectKey, type DailyBoard } from "./techViews";
import { HealthBadge, openDestination, openPerson, openSubject, useNow, ViewHead, Who } from "./viewParts";

/**
 * A visão Painel: o dashboard de acompanhamento com os mesmos dados da cena. Responde à daily de
 * cima para baixo: o que precisa de ação, depois a saúde dos épicos, o time agora e os bots. Cada
 * número vem com o contexto, e cada item abre a origem (a gaveta do épico ou da pessoa).
 */
/** Um número com o contexto que o torna útil, e o atalho para a lista dele. */
function Tile({ id, label, value, context, tone, target }: { id: string; label: string; value: number | string; context: string; tone: "red" | "amber" | "ok" | "dim"; target: string }) {
  return (
    <a className={`tv-tile tv-tile-${tone}`} href={`#${target}`} data-panel-count={id} data-value={value} data-context={context} onClick={(event) => {
      event.preventDefault();
      const section = document.getElementById(target);
      section?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      section?.querySelector<HTMLElement>("button, a")?.focus({ preventScroll: true });
    }}>
      <span className="tv-tile-label">{label}</span>
      <strong>{value}</strong>
      <small>{context}</small>
    </a>
  );
}

/** Um item do painel: a linha inteira abre a origem; nomes de pessoa abrem a pessoa. */
function Item({ subject, state, id, label, children, extra, data }: { subject: Subject; state: ActivityState; id: string; label: string; children: ReactNode; extra?: ReactNode; data?: Record<string, string> }) {
  const destination = destinationOf(state, subject);
  return (
    <li className="tv-item" data-panel-item {...data}>
      {destination ? (
        <button type="button" className="tv-item-main" onClick={() => openDestination(destination)}>
          <span className="tech-row-id">{id}</span>
          <span className="tech-row-main">
            {label}
            <small>{children}</small>
          </span>
        </button>
      ) : (
        <div className="tv-item-main">
          <span className="tech-row-id">{id}</span>
          <span className="tech-row-main">
            {label}
            <small>{children}</small>
          </span>
        </div>
      )}
      {extra && <div className="tv-item-extra">{extra}</div>}
    </li>
  );
}

function PanelList({ name, title, count, empty, children, hint }: { name: string; title: string; count: number; empty: string; children: ReactNode; hint?: string }) {
  return (
    <Section title={title} count={count} id={`painel-${name}`}>
      {hint && <p className="tv-hint">{hint}</p>}
      <ul className="tech-list tv-list" data-panel-list={name}>
        {children}
        {count === 0 && <li className="tech-empty">{empty}</li>}
      </ul>
    </Section>
  );
}

/** Os PRs da carga de alguém: cada número abre a gaveta da pessoa, onde eles estão listados. */
function LoadLinks({ prs, person, what }: { prs: readonly PullRequest[]; person: Person; what: string }) {
  return prs.map((pr, index) => (
    <span key={pr.number}>
      {index > 0 && " "}
      <button type="button" className="tech-link" data-load-pr={pr.number} onClick={() => openPerson(person.email)} title={`#${pr.number} ${pr.title} (${what}): abrir ${person.name}`}>
        #{pr.number}
      </button>
    </span>
  ));
}

const PRESENCE_ORDER: PlaceKind[] = ["reuniao", "chamada", "huddle", "foco", "fora", "mesa"];

export function DailyPanel() {
  const state = useNow();
  const board: DailyBoard = useMemo(() => dailyBoard(state), [state]);
  const oldest = <T,>(items: T[], age: (item: T) => number) => (items.length ? Math.max(...items.map(age)) : 0);
  const health = { travado: 0, "em-risco": 0, "no-prazo": 0 } as Record<HealthLevel, number>;
  for (const item of board.epics) health[item.health.level] += 1;
  const freeReviewers = new Set(board.reviews.flatMap((item) => item.candidates.map((candidate) => candidate.person.email)));
  // Na daily ninguém está livre: o resumo diz quando abre a primeira vaga.
  const nextFree = Math.min(...board.reviews.flatMap((item) => item.upcoming.map((upcoming) => upcoming.freeAt)));
  const reviewersContext = freeReviewers.size
    ? `${freeReviewers.size} ${freeReviewers.size === 1 ? "pessoa livre" : "pessoas livres"} para revisar`
    : `ninguém livre agora${Number.isFinite(nextFree) ? ` · próxima às ${clockLabel(nextFree)}` : ""}`;
  // HUs e PRs distintos: um PR sem autor e esperando revisão é um PR só, como uma HU travada sem critério.
  const actionStories = new Set([...board.blocked, ...board.stale, ...board.withoutCriteria].map((item) => item.story.id));
  const actionPrs = new Set([...board.reviews, ...board.withoutAuthor].map((item) => item.pr.number));
  const presenceCount = (kind: PlaceKind) => board.presence[kind].length;
  const firstBlocked = board.blocked[0];
  return (
    <ActionPlace.Provider value="painel">
      <ViewHead title="Painel">Acompanhamento do squad: o que precisa de ação primeiro, depois épicos, time e bots</ViewHead>
      <div className="tv-scroll">
        <div className="tv-panel" data-panel>
          <nav className="tv-tiles" aria-label="Resumo do painel">
            <Tile id="travadas" label="HUs travadas" value={board.blocked.length} tone={board.blocked.length ? "red" : "ok"} target="painel-travadas" context={firstBlocked ? `mais antiga ${ageLabel(state.at - firstBlocked.since)}${firstBlocked.waitingOn ? `, espera ${firstBlocked.waitingOn.name.split(" ")[0]}` : ""}` : "nada travado"} />
            <Tile id="revisoes" label="PRs esperando revisão" value={board.reviews.length} tone={board.reviews.length ? "amber" : "ok"} target="painel-revisoes" context={board.reviews.length ? `mais antigo ${ageLabel(oldest(board.reviews, (item) => item.waitingMs))} · ${reviewersContext}` : "fila vazia"} />
            <Tile id="paradas" label="HUs paradas" value={board.stale.length} tone={board.stale.length ? "amber" : "ok"} target="painel-paradas" context={board.stale.length ? `sem movimento no Notion há ${spanLabel(oldest(board.stale, (item) => item.idleMs))} na pior` : "tudo se mexendo"} />
            <Tile id="sem-criterio" label="HUs sem critério" value={board.withoutCriteria.length} tone={board.withoutCriteria.length ? "amber" : "ok"} target="painel-sem-criterio" context="prontas ou em curso" />
            <Tile id="epicos" label="Épicos travados ou em risco" value={health.travado + health["em-risco"]} tone={health.travado ? "red" : health["em-risco"] ? "amber" : "ok"} target="painel-epicos" context={`${health.travado} travado · ${health["em-risco"]} em risco · ${health["no-prazo"]} no prazo`} />
            <Tile id="time" label="Disponíveis agora" value={presenceCount("mesa")} tone="dim" target="painel-time" context={`de ${state.people.length} · ${presenceCount("reuniao") + presenceCount("chamada")} em reunião, ${presenceCount("huddle")} em huddle, ${presenceCount("foco")} em foco, ${presenceCount("fora")} fora`} />
          </nav>

          <div className="tv-columns-2">
            <div className="tv-col">
              <h3 className="tv-group">
                Precisa de ação{" "}
                <small data-panel-action-count data-stories={actionStories.size} data-prs={actionPrs.size}>
                  {actionStories.size} {actionStories.size === 1 ? "HU" : "HUs"} · {actionPrs.size} {actionPrs.size === 1 ? "PR" : "PRs"}
                </small>
              </h3>
              <PanelList name="travadas" title="HUs travadas" count={board.blocked.length} empty="Nenhuma HU travada.">
                {board.blocked.map((item) => (
                  <Item
                    key={item.story.id}
                    subject={{ kind: "story", id: item.story.id }}
                    state={state}
                    id={item.story.id}
                    label={item.story.title}
                    data={{ "data-story": item.story.id }}
                    extra={
                      <>
                        <span>
                          Esperando <Who person={item.waitingOn} empty="ninguém definido" />
                          {item.waitingWhere && item.waitingWhere.kind !== "mesa" ? ` · ${PLACE_LABEL[item.waitingWhere.kind].toLocaleLowerCase("pt-BR")}${item.waitingWhere.until ? ` até ${clockLabel(item.waitingWhere.until)}` : ""}` : item.waitingWhere ? " · na mesa agora" : ""}
                        </span>
                        <span>
                          Responsável <Who person={item.assignee} />
                        </span>
                        <StoryActions story={item.story} only={["cobrar"]} />
                      </>
                    }
                  >
                    {item.reason} · desde {whenLabel(item.since, state.at)} ({ageLabel(state.at - item.since)}) · {item.epic?.id} {item.epic?.title}
                  </Item>
                ))}
              </PanelList>
              <PanelList name="revisoes" title="PRs esperando revisão" count={board.reviews.length} empty="Nenhum PR esperando revisão." hint="Quem pode revisar agora: dev ou tech lead com GitHub vinculado, na mesa, sem reunião nos próximos 30 min. Quem está em foco fica de fora. Sem ninguém livre, a agenda diz quem fica livre e quando.">
                {board.reviews.map((item) => (
                  <Item
                    key={item.pr.number}
                    subject={{ kind: "pr", number: item.pr.number }}
                    state={state}
                    id={`#${item.pr.number}`}
                    label={item.pr.title}
                    data={{ "data-pr": String(item.pr.number), "data-candidates": item.candidates.map((candidate) => candidate.person.email).join(","), "data-upcoming": item.candidates.length ? "" : item.upcoming.map((upcoming) => `${upcoming.person.email}@${clockLabel(upcoming.freeAt)}`).join(",") }}
                    extra={
                      <>
                        <span>
                          Autor <PrAuthor state={state} pr={item.pr} />
                        </span>
                        <span>
                          Pedida a{" "}
                          {item.requested.length ? (
                            item.requested.map((request, index) => (
                              <span key={request.login}>
                                {index > 0 && ", "}
                                {request.person ? <Who person={request.person} /> : <span className="tech-unknown">{request.login}</span>}
                                {request.where && request.where !== "mesa" ? <span className="tv-dim"> ({PLACE_LABEL[request.where].toLocaleLowerCase("pt-BR")})</span> : null}
                              </span>
                            ))
                          ) : (
                            <span className="tv-dim">ninguém</span>
                          )}
                        </span>
                        <span data-review-candidates>
                          Pode revisar agora{" "}
                          {item.candidates.length ? (
                            item.candidates.map((candidate, index) => (
                              <span key={candidate.person.email}>
                                {index > 0 && ", "}
                                <Who person={{ email: candidate.person.email, name: candidate.person.name, away: null }} />
                                <span className="tv-dim">
                                  {" "}
                                  ({candidate.pending} na fila{candidate.freeUntil ? `, livre até ${clockLabel(candidate.freeUntil)}` : ""})
                                </span>
                              </span>
                            ))
                          ) : (
                            <>
                              <span className="tv-dim">ninguém livre agora</span>
                              {item.upcoming.length > 0 ? (
                                <span className="tv-upcoming" data-review-upcoming>
                                  {" · "}
                                  {item.upcoming.map((upcoming, index) => (
                                    <span key={upcoming.person.email} data-upcoming={upcoming.person.email} data-free-at={clockLabel(upcoming.freeAt)}>
                                      {index > 0 && ", "}
                                      <Who person={{ email: upcoming.person.email, name: upcoming.person.name, away: null }} /> livre às {clockLabel(upcoming.freeAt)}
                                      <span className="tv-dim">
                                        {" "}
                                        ({upcoming.pending} na fila{upcoming.freeUntil ? `, até ${clockLabel(upcoming.freeUntil)}` : ""})
                                      </span>
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span className="tv-dim"> · ninguém fica livre hoje pela agenda</span>
                              )}
                            </>
                          )}
                        </span>
                        <PrActions pr={item.pr} />
                      </>
                    }
                  >
                    esperando há {spanLabel(item.waitingMs)} · {item.pr.ci ? (item.pr.ci === "failure" ? "CI quebrado" : item.pr.ci === "success" ? "CI passou" : "CI rodando") : "sem CI"}
                    {item.story ? ` · ${item.story.id}` : " · sem HU"}
                  </Item>
                ))}
              </PanelList>
              <PanelList name="paradas" title="HUs paradas" count={board.stale.length} empty="Nenhuma HU parada." hint="Em andamento, revisão ou QA sem movimento no Notion há mais de 1 dia (travadas têm lista própria).">
                {board.stale.map((item) => (
                  <Item
                    key={item.story.id}
                    subject={{ kind: "story", id: item.story.id }}
                    state={state}
                    id={item.story.id}
                    label={item.story.title}
                    data={{ "data-story": item.story.id }}
                    extra={
                      <>
                        <span>
                          Responsável <Who person={item.assignee} />
                        </span>
                        <StoryActions story={item.story} only={["cobrar", "reatribuir"]} />
                      </>
                    }
                  >
                    {STORY_STATUS_LABEL[item.story.status]} · sem movimento há {spanLabel(item.idleMs)} · {item.epic?.id} {item.epic?.title}
                  </Item>
                ))}
              </PanelList>
              <PanelList name="sem-criterio" title="HUs sem critério de aceite" count={board.withoutCriteria.length} empty="Toda HU pronta ou em curso tem critério.">
                {board.withoutCriteria.map((item) => (
                  <Item
                    key={item.story.id}
                    subject={{ kind: "story", id: item.story.id }}
                    state={state}
                    id={item.story.id}
                    label={item.story.title}
                    data={{ "data-story": item.story.id }}
                    extra={
                      <>
                        <span>
                          Responsável <Who person={item.assignee} />
                        </span>
                        <StoryActions story={item.story} only={["criterios"]} />
                      </>
                    }
                  >
                    {STORY_STATUS_LABEL[item.story.status]} · {item.epic?.id} {item.epic?.title}
                  </Item>
                ))}
              </PanelList>
              <PanelList name="sem-autor" title="PRs sem autor identificado" count={board.withoutAuthor.length} empty="Todo PR aberto tem autor no cadastro." hint="O login do GitHub não está vinculado a ninguém do cadastro: o PR não conta na carga de ninguém.">
                {board.withoutAuthor.map((item) => (
                  <Item
                    key={item.pr.number}
                    subject={{ kind: "pr", number: item.pr.number }}
                    state={state}
                    id={`#${item.pr.number}`}
                    label={item.pr.title}
                    data={{ "data-pr": String(item.pr.number) }}
                    extra={
                      <div className="ta-bar">
                        <button type="button" className="ta-trigger" onClick={() => useTechStore.getState().openRegistry()} data-open-registry="login">
                          <Link2 size={13} aria-hidden /> Vincular {item.pr.author} no cadastro
                        </button>
                      </div>
                    }
                  >
                    <span className="tech-unknown">autor não identificado</span> · login {item.pr.author} · {item.story ? item.story.id : "sem HU"}
                  </Item>
                ))}
              </PanelList>
            </div>

            <div className="tv-col">
              <Section title="Saúde dos épicos" count={board.epics.length} id="painel-epicos">
                <ul className="tech-list tv-list" data-panel-list="epicos">
                  {board.epics.map((item) => (
                    <li key={item.epic.id} className="tv-item tv-epic-item" data-panel-epic={item.epic.id} data-health={item.health.level}>
                      <button type="button" className="tv-item-main" onClick={() => openSubject(state, { kind: "epic", id: item.epic.id })}>
                        <span className="tech-row-id">{item.epic.id}</span>
                        <span className="tech-row-main">
                          {item.epic.title}
                          <small>
                            {item.project?.name} · {TRACK_LABEL[trackOf(item.epic.status)]} · {EPIC_STATUS_LABEL[item.epic.status]} · {item.health.done}/{item.health.total} HUs · entrega {whenLabel(item.epic.due, state.at)}
                          </small>
                        </span>
                        <HealthBadge level={item.health.level} />
                      </button>
                      {item.reasons.length > 0 && (
                        <ul className="tv-reasons" data-epic-reasons={item.epic.id}>
                          {item.reasons.map((reason) => {
                            const destination = destinationOf(state, reason.subject);
                            return (
                              <li key={reason.text} className={`reason-${reason.kind}`} data-reason-kind={reason.kind} data-reason-subject={subjectKey(reason.subject)}>
                                {destination ? (
                                  <button type="button" className="tech-link" onClick={() => openDestination(destination)}>
                                    {reason.text}
                                  </button>
                                ) : (
                                  reason.text
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <p className="tv-item-extra">
                        <span>
                          Responsável <Who person={item.owner} />
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title="Time agora" count={state.people.length} id="painel-time">
                <ul className="tv-presence" data-panel-list="presenca">
                  {PRESENCE_ORDER.map((kind) => (
                    <li key={kind} data-panel-presence={kind}>
                      <span className={`tv-presence-label tv-presence-${kind}`}>
                        {kind === "foco" && <Moon size={11} aria-hidden />}
                        {PLACE_LABEL[kind]} <small>{board.presence[kind].length}</small>
                      </span>
                      <span className="tv-presence-people">
                        {board.presence[kind].length === 0 && <span className="tv-dim">ninguém</span>}
                        {board.presence[kind].map((item) => (
                          <span key={item.person.email} className="tv-presence-person" data-person={item.person.email}>
                            <Who person={{ email: item.person.email, name: item.person.name, away: null }} />
                            {item.detail && <span className="tv-dim"> · {item.detail}</span>}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>

              <PanelList name="bots" title="O que os bots fizeram hoje" count={board.bots.length} empty="Nenhum bot trabalhou hoje ainda.">
                {board.bots.map((item) => (
                  <Item key={item.task.id} subject={item.task.target} state={state} id={clockLabel(item.task.startedAt)} label={`${item.bot}: ${item.label}`} data={{ "data-task": item.task.id }}>
                    {item.target} · {item.task.requestedBy === "app" ? "pedido pela tela" : "rotina"} · {item.task.doneAt ? `pronto às ${clockLabel(item.task.doneAt)}` : "trabalhando agora"}
                    {item.task.result ? ` · ${item.task.result}` : ""}
                  </Item>
                ))}
              </PanelList>
            </div>
          </div>

          <Section title="Carga por pessoa" count={board.load.length} id="painel-carga">
            <div className="tv-load-wrap">
              <table className="tv-load" data-panel-list="carga">
                <thead>
                  <tr>
                    <th scope="col">Pessoa</th>
                    <th scope="col">Agora</th>
                    <th scope="col">HUs abertas</th>
                    <th scope="col">PRs abertos</th>
                    <th scope="col">Revisões pedidas</th>
                  </tr>
                </thead>
                <tbody>
                  {board.load.map((item) => (
                    <tr key={item.person.email} data-panel-load={item.person.email} data-stories={item.stories.length} data-prs={item.prs.length} data-reviews={item.reviews.length}>
                      <th scope="row">
                        <Who person={{ email: item.person.email, name: item.person.name, away: null }} />
                        <small>{item.person.title}</small>
                      </th>
                      <td>
                        {PLACE_LABEL[item.where]}
                        <small>{item.doing}</small>
                      </td>
                      <td>
                        <strong>{item.stories.length}</strong>
                        <small>
                          {item.stories.map((story, index) => (
                            <span key={story.id}>
                              {index > 0 && " "}
                              <button type="button" className="tech-link" onClick={() => openSubject(state, { kind: "story", id: story.id })}>
                                {story.id}
                              </button>
                            </span>
                          ))}
                        </small>
                      </td>
                      <td>
                        {item.github ? <strong>{item.prs.length}</strong> : <span className="tech-unknown" title="Sem GitHub vinculado: os PRs aparecem como autor não identificado">sem GitHub</span>}
                        <small>
                          <LoadLinks prs={item.prs} person={item.person} what="PR aberto" />
                        </small>
                      </td>
                      <td>
                        {item.github ? <strong>{item.reviews.length}</strong> : <span className="tv-dim">—</span>}
                        <small>
                          <LoadLinks prs={item.reviews} person={item.person} what="revisão pedida" />
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <p className="panel-warn tv-privacy">Squad fictício num dia simulado. Mensagens entre pessoas não entram aqui: só status, presença, agenda, Notion, GitHub e o que os bots fizeram.</p>
        </div>
      </div>
    </ActionPlace.Provider>
  );
}
