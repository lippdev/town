import { useEffect, type ReactNode } from "react";
import { FlaskConical, Link2, Pause, Play, RotateCcw, X } from "lucide-react";
import { describeEvent, isNoise } from "@/activity/describe";
import type { ActivityState } from "@/activity/events";
import { blockersOf, dailyAttendance, dailyGroups, directory, doingNow, epicHealth, githubSuggestedStatus, HEALTH_LABEL, meetingsOf, personHistory, personLoad, personOf, PLACE_LABEL, presenceBuckets, prsOfStory, reviewCandidates, storiesOf, trackingAnswers, upcomingReviewers, whereIs } from "@/activity/selectors";
import { prAuthor } from "@/activity/identity";
import { nudgeStatus } from "@/activity/actions";
import { SPEEDS, simulatedStateAt } from "@/activity/simulation";
import { DAY_END, at, clockLabel, whenLabel } from "@/activity/time";
import { AVAILABILITY_LABEL, CI_LABEL, EPIC_STATUS_LABEL, REVIEW_LABEL, ROLE_LABEL, STORY_STATUS_LABEL, TRACK_LABEL, trackOf, type PullRequest, type Story } from "@/activity/types";
import { useDrawerInset } from "@/components/office/OfficeHud";
import { useHQStore } from "@/state/useHQStore";
import { escapeLayers, useOfficeStore } from "@/world/office/officeStore";
import { ActionPlace, PrActions, StoryActions } from "./TechActions";
import { emailOfHuman, squadHumanId, squadHumans } from "./techPeople";
import { RegistryDrawer } from "./TechRegistry";
import { HEALTH_COLOR, TECH_FLOOR_ID } from "./techPlaces";
import { techSceneRuntime } from "./TechScene";
import { useTechStore, type TechView } from "./techStore";
import { subjectKey } from "./techViews";
import "./tech.css";

declare global {
  interface Window {
    /** Ponte do harness `qa:tecnologia`: lê o estado e mexe no relógio, nada mais. */
    __HQ_TECH_QA__?: ReturnType<typeof techQaApi>;
  }
}

function techQaApi() {
  return {
    answers: () => trackingAnswers(useTechStore.getState().state),
    clock: () => clockLabel(useTechStore.getState().state.at),
    at: () => useTechStore.getState().state.at,
    jumpTo: (instant: number) => useTechStore.getState().jumpTo(instant),
    /** "11:17": só para frente, como o relógio. */
    jumpToClock: (clock: string) => {
      const [hour, minute] = clock.split(":").map(Number);
      useTechStore.getState().jumpTo(at(hour!, minute!));
    },
    setSpeed: (speed: (typeof SPEEDS)[number]) => useTechStore.getState().setSpeed(speed),
    pause: (paused: boolean) => useTechStore.getState().setPaused(paused),
    /** Máquina sem GPU: a cena divide o quadro lento em passos curtos e anda no tempo real. */
    realTime: (on: boolean) => {
      techSceneRuntime.realTime = on;
    },
    speed: () => useTechStore.getState().speed,
    where: (email: string) => whereIs(useTechStore.getState().state, email).kind,
    /** A daily agora: "na-sala", "ainda-nao-entrou" e "ausente", ou nulo fora dela. */
    daily: () => {
      const daily = dailyAttendance(useTechStore.getState().state);
      return daily ? dailyGroups(daily) : null;
    },
    plans: () => useTechStore.getState().people.map((plan) => ({ email: plan.email, place: plan.place.key, zone: plan.place.zone })),
    scene: () => Object.fromEntries(techSceneRuntime.people),
    board: () => techSceneRuntime.board,
    robots: () => [...techSceneRuntime.robots.entries()].map(([taskId, robot]) => ({ taskId, ...robot })),
    tasks: () => useTechStore.getState().state.botTasks,
    story: (id: string) => useTechStore.getState().state.stories.find((story) => story.id === id) ?? null,
    pr: (number: number) => useTechStore.getState().state.prs.find((pr) => pr.number === number) ?? null,
    messages: () => useTechStore.getState().state.messages,
    people: () => useTechStore.getState().state.people,
    // Visões Projetos e Painel: a prova "o prédio e o painel dizem o mesmo".
    view: () => useTechStore.getState().view,
    setView: (view: TechView) => useTechStore.getState().setView(view),
    candidates: (number: number) => {
      const { state } = useTechStore.getState();
      const pr = state.prs.find((item) => item.number === number);
      return pr ? reviewCandidates(state, pr).map((candidate) => candidate.person.email) : [];
    },
    /** Ninguém livre agora: quem fica livre e quando, "email@09:45". */
    upcoming: (number: number) => {
      const { state } = useTechStore.getState();
      const pr = state.prs.find((item) => item.number === number);
      return pr ? upcomingReviewers(state, pr).map((item) => `${item.person.email}@${clockLabel(item.freeAt)}`) : [];
    },
    stories: () => useTechStore.getState().state.stories.map((story) => story.id),
    reasons: (epicId: string) => blockersOf(useTechStore.getState().state, epicId).map((reason) => reason.text),
    /** Os motivos do épico como "tipo|sujeito" ("pr-sem-revisao|pr:142"), na ordem da gaveta. */
    reasonKeys: (epicId: string) => blockersOf(useTechStore.getState().state, epicId).map((reason) => `${reason.kind}|${subjectKey(reason.subject)}`),
    /** Os seis grupos do "Time agora", inclusive chamada e mesa. */
    presence: () => presenceBuckets(useTechStore.getState().state),
    /** Carga por pessoa: quantas HUs, PRs abertos e revisões pedidas. */
    load: () => {
      const { state } = useTechStore.getState();
      return Object.fromEntries(state.people.map((person) => {
        const load = personLoad(state, person.email)!;
        return [person.email, { stories: load.stories.length, prs: load.prs.length, reviews: load.reviews.length }];
      }));
    },
    render: () => ({ frames: techSceneRuntime.frames, paused: techSceneRuntime.paused, pendingAtPause: [...techSceneRuntime.pendingAtPause], pausedFrames: techSceneRuntime.pausedFrames, loop: techSceneRuntime.loop() }),
    // Ações e cadastro: a prova lê o efeito, nunca age por aqui (age pela interface).
    nudge: (storyId: string) => nudgeStatus(useTechStore.getState().state, storyId),
    /** "10:17": quando a HU destravou hoje, ou nulo. */
    unblockedAt: (storyId: string) => {
      const event = useTechStore.getState().state.feed.find((item) => item.type === "notion.story_unblocked" && item.data.storyId === storyId);
      return event ? clockLabel(event.at) : null;
    },
    /** O mesmo dia, da mesma semente, sem nenhuma ação: o caminho de comparação. */
    baseline: (clock: string) => {
      const [hour, minute] = clock.split(":").map(Number);
      return trackingAnswers(simulatedStateAt(useTechStore.getState().seed, at(hour!, minute!)));
    },
    baselineUnblock: (storyId: string) => {
      const event = simulatedStateAt(useTechStore.getState().seed, DAY_END).feed.find((item) => item.type === "notion.story_unblocked" && item.data.storyId === storyId);
      return event ? clockLabel(event.at) : null;
    },
    /** A carga de uma pessoa, com os ids: HUs, PRs abertos e revisões pedidas. */
    loadOf: (email: string) => {
      const load = personLoad(useTechStore.getState().state, email);
      return load ? { stories: load.stories.map((story) => story.id), prs: load.prs.map((pr) => pr.number), reviews: load.reviews.map((pr) => pr.number) } : null;
    },
    visit: (taskId: string) => {
      const visit = useTechStore.getState().visits.find((item) => item.taskId === taskId);
      return visit ? { botId: visit.botId, key: visit.place.key, node: visit.place.node, x: visit.place.spot.x, z: visit.place.spot.z } : null;
    },
    openAction: () => useTechStore.getState().openAction,
    registryOpen: () => useTechStore.getState().registry !== null,
  };
}

/** Liga o cenário: põe o squad na cena, faz o relógio andar e abre a ponte da prova. */
function useTechBoot() {
  useEffect(() => {
    useOfficeStore.getState().setSquad(squadHumans());
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      useTechStore.getState().tick(now - last);
      last = now;
    }, 200);
    window.__HQ_TECH_QA__ = techQaApi();
    // Épico e pessoa dividem a gaveta: abrir um fecha o outro.
    const yieldDrawer = () => {
      useTechStore.getState().selectEpic(null);
      useTechStore.getState().closeRegistry();
      useTechStore.getState().setOpenAction(null);
    };
    const offOffice = useOfficeStore.subscribe((state, previous) => {
      if (state.selectedHumanId && state.selectedHumanId !== previous.selectedHumanId) yieldDrawer();
    });
    const offBots = useHQStore.subscribe((state, previous) => {
      if (state.selectedBotId && state.selectedBotId !== previous.selectedBotId) yieldDrawer();
    });
    return () => {
      window.clearInterval(timer);
      offOffice();
      offBots();
      delete window.__HQ_TECH_QA__;
      useOfficeStore.getState().setSquad([]);
    };
  }, []);
}

/** O selo e o relógio do dia simulado, sempre à vista na barra de cima. */
export function TechClock() {
  const at = useTechStore((store) => store.state.at);
  const speed = useTechStore((store) => store.speed);
  const paused = useTechStore((store) => store.paused);
  const ended = useTechStore((store) => store.ended);
  const store = useTechStore.getState();
  return (
    <div className="tech-clock" role="group" aria-label="Relógio da simulação" data-tech-clock>
      <span className="office-chip tech-chip" title="Squad fictício e dia simulado: nenhum dado real">
        <FlaskConical size={12} aria-hidden /> Simulação
      </span>
      <time className="tech-time" data-sim-time aria-live="off">
        <span className="tech-date">ter 10/11 · </span>
        {clockLabel(at)}
      </time>
      {ended ? (
        <button type="button" className="office-button" onClick={() => store.restart()} data-sim-restart>
          <RotateCcw size={13} aria-hidden /> Dia encerrado · recomeçar
        </button>
      ) : (
        <button type="button" className="office-icon" aria-label={paused ? "Continuar" : "Pausar"} title={paused ? "Continuar" : "Pausar"} aria-pressed={paused} data-sim-pause onClick={() => store.setPaused(!paused)}>
          {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
        </button>
      )}
      <div className="tech-speeds" role="group" aria-label="Velocidade">
        {SPEEDS.map((option) => (
          <button key={option} type="button" aria-pressed={speed === option} className={speed === option ? "active" : undefined} data-sim-speed={option} onClick={() => store.setSpeed(option)}>
            {option}×
          </button>
        ))}
      </div>
    </div>
  );
}

export function Section({ title, children, count, id }: { title: string; children: ReactNode; count?: number; id?: string }) {
  return (
    <section className="tech-section" id={id}>
      <h3>
        {title}
        {count !== undefined && <small>{count}</small>}
      </h3>
      {children}
    </section>
  );
}

/** Quem abriu o PR, ou o login com o aviso de que ninguém o vinculou. */
export function PrAuthor({ state, pr }: { state: ActivityState; pr: PullRequest }) {
  const author = prAuthor(directory(state), pr);
  return author ? <span>{author.name}</span> : <span className="tech-unknown" title="Ninguém vinculou este login no cadastro">autor não identificado ({pr.author})</span>;
}

const PR_STATE_LABEL = { open: "aberto", merged: "mesclado", closed: "fechado" } as const;
const reviewerName = (state: ActivityState, login: string) => personOf(state, state.people.find((person) => person.github === login)?.email ?? null)?.name ?? login;

/** Um PR numa linha. `detailed` acrescenta o estado e todas as revisões, para a árvore de Projetos. */
export function PrLine({ state, pr, detailed = false, actions }: { state: ActivityState; pr: PullRequest; detailed?: boolean; actions?: ReactNode }) {
  const last = pr.reviews.at(-1);
  return (
    <li className="tech-row" data-pr={pr.number} data-pr-state={pr.state}>
      <span className="tech-row-id">#{pr.number}</span>
      <span className="tech-row-main">
        {pr.title}
        <small>
          <PrAuthor state={state} pr={pr} /> · {detailed && pr.state === "open" ? `${pr.draft ? "rascunho" : "aberto"} · ` : ""}
          {pr.state === "open" ? (pr.ci ? CI_LABEL[pr.ci] : "sem CI") : PR_STATE_LABEL[pr.state]}
          {detailed
            ? pr.reviews.length
              ? ` · ${pr.reviews.map((review) => `${reviewerName(state, review.by)} ${REVIEW_LABEL[review.state]}`).join(", ")}`
              : pr.state === "open" && pr.reviewers.length
                ? ` · esperando revisão de ${pr.reviewers.map((login) => reviewerName(state, login)).join(", ")}`
                : pr.state === "open" ? " · sem revisão pedida" : ""
            : last
              ? ` · ${reviewerName(state, last.by)} ${REVIEW_LABEL[last.state]}`
              : pr.state === "open" && pr.reviewers.length
                ? " · esperando revisão"
                : ""}
        </small>
        {pr.summary && <small className="tech-summary" data-pr-summary>Resumo do {pr.summary.by === "pulse" ? "Pulse" : pr.summary.by}: {pr.summary.text}</small>}
      </span>
      {actions}
    </li>
  );
}

export function StoryLine({ story, onOpen, actions }: { story: Story; onOpen?: () => void; actions?: ReactNode }) {
  const criteria = story.criteria.length ? `${story.criteria.filter((criterion) => criterion.done).length}/${story.criteria.length} critérios` : "sem critério";
  const body = (
    <>
      <span className="tech-row-id">{story.id}</span>
      <span className="tech-row-main">
        {story.title}
        <small>
          {STORY_STATUS_LABEL[story.status]} · {criteria}
          {story.blocked ? ` · travada: ${story.blocked.reason}` : ""}
        </small>
      </span>
    </>
  );
  return (
    <li className={story.blocked ? "tech-row blocked" : "tech-row"} data-story={story.id}>
      {onOpen ? (
        <button type="button" className="tech-row-button" onClick={onOpen}>
          {body}
        </button>
      ) : (
        body
      )}
      {actions}
    </li>
  );
}

/** A gaveta de uma pessoa do squad: agora, HUs, PRs, revisões e o dia dela. */
function PersonDrawer() {
  const selectedHumanId = useOfficeStore((store) => store.selectedHumanId);
  const state = useTechStore((store) => store.state);
  const plan = useTechStore((store) => store.people.find((item) => squadHumanId(item.email) === selectedHumanId));
  const email = selectedHumanId ? emailOfHuman(selectedHumanId) : null;
  const node = useDrawerInset(Boolean(email));
  if (!email) return null;
  const person = personOf(state, email)!;
  const load = personLoad(state, email)!;
  const where = whereIs(state, email);
  const status = state.slackStatus[email];
  const history = personHistory(state, email, 60).filter((event) => !isNoise(event)).slice(0, 14);
  // Quem não abre PR no dia a dia (produto, design) não perde nada visível sem o vínculo.
  const opensPrs = person.role === "dev" || person.role === "techlead";
  return (
    <ActionPlace.Provider value="gaveta-pessoa">
    <aside ref={node} className="drawer office-demo-panel tech-drawer" aria-label={`Pessoa ${person.name}`} data-tech-person={email}>
      <header className="drawer-head">
        <div className="drawer-title">
          <strong>{person.name}</strong>
          <span className="panel-tag">squad · simulação</span>
          <button type="button" className="panel-close" onClick={() => useOfficeStore.getState().clearHuman()} aria-label="Fechar (Esc)" title="Fechar (Esc)">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="drawer-sub">
          <span className="panel-role">
            {person.title} · {ROLE_LABEL[person.role]} · {person.email}
          </span>
        </div>
      </header>
      <div className="drawer-body">
        <p className={`tech-now tech-now-${where.kind}`} data-doing-now>
          {plan?.heading ?? doingNow(state, email)}
          <small>
            {PLACE_LABEL[where.kind]}
            {where.until ? ` até ${clockLabel(where.until)}` : ""}
          </small>
        </p>
        <dl className="panel-stats tech-signals">
          <div>
            <dt>Teams</dt>
            <dd>{AVAILABILITY_LABEL[state.presence[email] ?? "offline"]}</dd>
          </div>
          <div>
            <dt>Slack</dt>
            <dd>{status ? `${status.emoji} ${status.text}` : "sem status"}</dd>
          </div>
        </dl>
        <Section title="Agenda de hoje" count={meetingsOf(state, email).length}>
          <ul className="tech-list">
            {meetingsOf(state, email).map((meeting) => (
              <li key={meeting.id} className={meeting.start <= state.at && state.at < meeting.end ? "tech-row now" : meeting.end <= state.at ? "tech-row past" : "tech-row"}>
                <span className="tech-row-id">{clockLabel(meeting.start)}</span>
                <span className="tech-row-main">
                  {meeting.title}
                  <small>{meeting.place === "sala" ? "sala de reunião" : "remota"} · até {clockLabel(meeting.end)}</small>
                </span>
              </li>
            ))}
            {meetingsOf(state, email).length === 0 && <li className="tech-empty">Nada na agenda.</li>}
          </ul>
        </Section>
        <Section title="HUs" count={load.stories.length}>
          <ul className="tech-list">
            {load.stories.map((story) => (
              <StoryLine key={story.id} story={story} onOpen={() => useTechStore.getState().selectEpic(story.epicId, story.id)} actions={<StoryActions story={story} />} />
            ))}
            {load.stories.length === 0 && <li className="tech-empty">Nenhuma HU aberta no nome dela.</li>}
          </ul>
        </Section>
        <Section title="PRs abertos" count={load.prs.length}>
          {person.github ? (
            <ul className="tech-list">
              {load.prs.map((pr) => (
                <PrLine key={pr.number} state={state} pr={pr} actions={<PrActions pr={pr} />} />
              ))}
              {load.prs.length === 0 && <li className="tech-empty">Nenhum PR aberto por @{person.github}.</li>}
            </ul>
          ) : (
            // O app não sabe de quem é um login sem vínculo: nenhum login é sugerido aqui. Os logins
            // sem pessoa ficam no cadastro, onde se escolhe a quem vincular.
            <p className={opensPrs ? "panel-warn" : "tech-empty"} data-github-missing>
              GitHub não vinculado.
              {opensPrs ? ` Até o vínculo, PRs e revisões de ${person.name.split(" ")[0]} não entram na carga.` : ""}
              <button type="button" className="ta-trigger tr-link-button" onClick={() => useTechStore.getState().openRegistry(email)} data-open-registry={email}>
                <Link2 size={13} aria-hidden /> Vincular
              </button>
            </p>
          )}
        </Section>
        <Section title="Revisões pedidas" count={load.reviews.length}>
          <ul className="tech-list">
            {load.reviews.map((pr) => (
              <PrLine key={pr.number} state={state} pr={pr} />
            ))}
            {load.reviews.length === 0 && <li className="tech-empty">Nenhuma revisão esperando.</li>}
          </ul>
        </Section>
        <Section title="Hoje">
          <ol className="tech-feed">
            {history.map((event) => (
              <li key={event.id}>
                <time>{clockLabel(event.at)}</time>
                <span>{describeEvent(state, event)}</span>
              </li>
            ))}
            {history.length === 0 && <li className="tech-empty">Nada ainda.</li>}
          </ol>
        </Section>
        <p className="panel-warn">Pessoa fictícia, num dia simulado. Mensagens entre pessoas não entram aqui: só status, presença, agenda e o que o Lipp HQ enviou.</p>
      </div>
    </aside>
    </ActionPlace.Provider>
  );
}

/** A gaveta de um épico: saúde com os motivos, as HUs e os PRs ligados. */
function EpicDrawer() {
  const epicId = useTechStore((store) => store.selectedEpicId);
  const highlight = useTechStore((store) => store.highlightStoryId);
  const state = useTechStore((store) => store.state);
  const epic = epicId ? state.epics.find((item) => item.id === epicId) ?? null : null;
  const node = useDrawerInset(Boolean(epic));
  useEffect(() => {
    const close = () => {
      if (!useTechStore.getState().selectedEpicId) return false;
      useTechStore.getState().selectEpic(null);
      return true;
    };
    escapeLayers.add(close);
    return () => {
      escapeLayers.delete(close);
    };
  }, []);
  // Quem abre uma HU pela árvore ou pelo painel chega nela, mesmo no fim da lista.
  useEffect(() => {
    if (highlight) node.current?.querySelector(".tech-story.highlight")?.scrollIntoView({ block: "nearest" });
  }, [epicId, highlight, node]);
  if (!epic) return null;
  const health = epicHealth(state, epic.id);
  const project = state.projects.find((item) => item.id === epic.projectId);
  const suggested = githubSuggestedStatus(state, epic);
  return (
    <ActionPlace.Provider value="gaveta-epico">
    <aside ref={node} className="drawer office-demo-panel tech-drawer" aria-label={`Épico ${epic.title}`} data-tech-epic={epic.id}>
      <header className="drawer-head">
        <div className="drawer-title">
          <span className="agent-dot" style={{ background: HEALTH_COLOR[health.level] }} aria-hidden />
          <strong>
            {epic.id} · {epic.title}
          </strong>
          <button type="button" className="panel-close" onClick={() => useTechStore.getState().selectEpic(null)} aria-label="Fechar (Esc)" title="Fechar (Esc)">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="drawer-sub">
          <span className="panel-role">
            {project?.name} · {TRACK_LABEL[trackOf(epic.status)]} · {EPIC_STATUS_LABEL[epic.status]} no Notion · responsável {personOf(state, epic.owner)?.name}
          </span>
        </div>
      </header>
      <div className="drawer-body">
        <p className={`tech-health tech-health-${health.level}`} data-epic-health={health.level}>
          {HEALTH_LABEL[health.level]}
          <small>
            {health.done} de {health.total} HUs concluídas · entrega {whenLabel(epic.due, state.at)}
          </small>
        </p>
        <Section title={health.level === "no-prazo" ? "Nada travando" : "O que trava ou ameaça"} count={health.reasons.length}>
          <ul className="tech-list" data-epic-reasons>
            {health.reasons.map((reason) => (
              <li key={reason.text} className={`tech-row reason-${reason.kind}`}>
                <span className="tech-row-main">{reason.text}</span>
              </li>
            ))}
          </ul>
        </Section>
        {suggested && <p className="panel-warn">Pelo GitHub, este épico já está em {EPIC_STATUS_LABEL[suggested]}; o Notion ainda diz {EPIC_STATUS_LABEL[epic.status]}.</p>}
        <Section title="HUs" count={storiesOf(state, epic.id).length}>
          <ul className="tech-list">
            {storiesOf(state, epic.id).map((story) => (
              <li key={story.id} className={story.id === highlight ? "tech-story highlight" : "tech-story"}>
                <ul className="tech-list">
                  <StoryLine story={story} />
                </ul>
                <p className="tech-story-meta">
                  {story.assignee ? (
                    <button type="button" className="tech-link" onClick={() => useOfficeStore.getState().selectHuman(squadHumanId(story.assignee!))}>
                      {personOf(state, story.assignee)?.name}
                    </button>
                  ) : (
                    "sem responsável"
                  )}
                </p>
                <StoryActions story={story} />
                {story.criteria.length > 0 && (
                  <ul className="tech-criteria">
                    {story.criteria.map((criterion) => (
                      <li key={criterion.id} className={criterion.done ? "done" : undefined}>
                        {criterion.text}
                        {criterion.suggestedBy && <em> · sugestão do {criterion.suggestedBy === "atlas" ? "Atlas" : criterion.suggestedBy}</em>}
                      </li>
                    ))}
                  </ul>
                )}
                <ul className="tech-list">
                  {prsOfStory(state, story.id).map((pr) => (
                    <PrLine key={pr.number} state={state} pr={pr} actions={<PrActions pr={pr} />} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </aside>
    </ActionPlace.Provider>
  );
}

/** Quanto tempo um aviso fica à vista; a leitura de tela já o anunciou ao chegar. */
const NOTICE_MS = 15_000;

function Notices() {
  const notices = useTechStore((store) => store.notices);
  const newest = notices.at(-1)?.id ?? null;
  useEffect(() => {
    if (newest === null) return;
    const timer = window.setTimeout(() => useTechStore.getState().dismissNotice(newest), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [newest]);
  if (notices.length === 0) return null;
  return (
    <div className="tech-notices" role="status" aria-live="polite">
      {notices.map((notice) => (
        <p key={notice.id} className={`tech-notice ${notice.tone}`} data-notice>
          {notice.text}
          <button type="button" className="panel-close" aria-label="Dispensar" onClick={() => useTechStore.getState().dismissNotice(notice.id)}>
            <X size={13} aria-hidden />
          </button>
        </p>
      ))}
    </div>
  );
}

/** O que o cenário põe na interface: gavetas e avisos. A barra de cima mostra o relógio. */
export function TechHud() {
  useTechBoot();
  return (
    <>
      <PersonDrawer />
      <EpicDrawer />
      <RegistryDrawer />
      <Notices />
    </>
  );
}

export { TECH_FLOOR_ID };
export default TechHud;
