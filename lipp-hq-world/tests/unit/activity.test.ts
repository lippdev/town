import { describe, expect, it } from "vitest";
import { applyEvent, foldEvents, initialState, storyIdOf, type ActivityEvent, type ActivityState } from "@/activity/events";
import { directoryOf, identityCoverage, linkGithub, prAuthor, resolveActor, unidentifiedLogins } from "@/activity/identity";
import {
  blockersOf,
  botTasksToday,
  directory,
  doingNow,
  epicHealth,
  githubSuggestedStatus,
  nextFreeAt,
  personLoad,
  presenceBuckets,
  prOf,
  prsAwaitingReview,
  reviewCandidates,
  staleStories,
  storiesWithoutCriteria,
  storyOf,
  trackingAnswers,
  whereIs,
} from "@/activity/selectors";
import { DEFAULT_SEED, REAL_DAY_MS, SimulatedDay, TIME_SCALE, random, simulatedStateAt } from "@/activity/simulation";
import { ActivityRuntime, type AppAction } from "@/activity/source";
import { EMAIL, LOGIN, SQUAD, squadSnapshot } from "@/activity/squad";
import { DAY, DAY_END, DAY_START, HOUR, MINUTE, ageLabel, at, clockLabel } from "@/activity/time";

const day = (until: number, seed = DEFAULT_SEED) => simulatedStateAt(seed, until);

/** Um dia com ações: avança, age, avança. */
function runWith(steps: Array<[number, AppAction | null]>, seed = DEFAULT_SEED) {
  const runtime = new ActivityRuntime(new SimulatedDay(seed));
  const notes: string[] = [];
  for (const [when, action] of steps) {
    runtime.advanceTo(when);
    if (action) {
      const result = runtime.perform(action);
      notes.push(result.ok ? result.note : `erro: ${result.problem}`);
    }
  }
  return { runtime, notes };
}

describe("identidade", () => {
  it("o e-mail é a chave; o GitHub só resolve quem vinculou", () => {
    const dir = directoryOf(SQUAD);
    expect(resolveActor(dir, { kind: "person", email: "Marina.Lopes@lipp.example" })?.name).toBe("Marina Lopes");
    expect(resolveActor(dir, { kind: "github", login: "@DiegoMartins" })?.email).toBe(EMAIL.diego);
    expect(resolveActor(dir, { kind: "github", login: LOGIN.tiago })).toBeNull();
    expect(resolveActor(dir, { kind: "bot", botId: "pulse" })).toBeNull();
    expect(prAuthor(dir, { author: LOGIN.tiago })).toBeNull();
  });

  it("vincular o GitHub valida e-mail, formato e login repetido", () => {
    expect(linkGithub(SQUAD, "ninguem@lipp.example", "x")).toEqual({ problem: "email-desconhecido" });
    expect(linkGithub(SQUAD, EMAIL.tiago, "-ruim")).toEqual({ problem: "login-invalido" });
    expect(linkGithub(SQUAD, EMAIL.tiago, "a".repeat(40))).toEqual({ problem: "login-invalido" });
    expect(linkGithub(SQUAD, EMAIL.tiago, LOGIN.diego)).toEqual({ problem: "login-em-uso" });
    const linked = linkGithub(SQUAD, EMAIL.tiago, "@TNunes-Dev");
    expect("people" in linked && linked.people.find((person) => person.email === EMAIL.tiago)?.github).toBe("tnunes-dev");
    const unlinked = linkGithub(SQUAD, EMAIL.diego, "");
    expect("people" in unlinked && unlinked.people.find((person) => person.email === EMAIL.diego)?.github).toBeNull();
  });

  it("mostra o que falta para quem não vinculou", () => {
    const snapshot = squadSnapshot();
    expect(unidentifiedLogins(snapshot.people, snapshot.prs)).toEqual([{ login: LOGIN.tiago, prs: 1, reviews: 0 }]);
    const coverage = identityCoverage(snapshot.people);
    expect(coverage.filter((entry) => !entry.sources.github).map((entry) => entry.email).sort()).toEqual([EMAIL.caio, EMAIL.tiago].sort());
    expect(coverage.every((entry) => entry.sources.notion && entry.sources.slack && entry.sources.m365)).toBe(true);
  });

  it("vincular pelo cadastro atribui também os PRs que já existiam", () => {
    const { runtime, notes } = runWith([
      [at(10), { kind: "vincular_github", email: EMAIL.tiago, login: "tnunes-dev" }],
      [at(10, 1), { kind: "vincular_github", email: EMAIL.caio, login: LOGIN.diego }],
    ]);
    expect(notes[0]).toContain("@tnunes-dev");
    expect(notes[1]).toContain("já está vinculado");
    const state = runtime.state;
    expect(prAuthor(directory(state), prOf(state, 140)!)?.name).toBe("Tiago Nunes");
    expect(unidentifiedLogins(state.people, state.prs)).toEqual([]);
    expect(state.feed.filter((item) => item.type === "app.github_linked")).toHaveLength(1);
  });
});

describe("eventos e estado agora", () => {
  const base = () => initialState(squadSnapshot());
  const event = (id: string, when: number, fields: Pick<ActivityEvent, "type" | "data" | "actor" | "subject" | "source">) => ({ id, at: when, ...fields }) as ActivityEvent;

  it("liga PR à HU pelo título ou pela branch", () => {
    expect(storyIdOf("HU-31: gera o PDF", "x")).toBe("HU-31");
    expect(storyIdOf("Arruma o build", "feat/hu-29-tela")).toBe("HU-29");
    expect(storyIdOf("Arruma o build", "chore/node")).toBeNull();
    expect(storyIdOf("THU-31", "x")).toBeNull();
  });

  it("evento repetido é aplicado uma vez só, e sobre algo desconhecido não quebra", () => {
    const opened = event("e1", at(10), { type: "github.pr_opened", source: "github", actor: { kind: "github", login: LOGIN.luana }, subject: { kind: "pr", number: 900 }, data: { number: 900, title: "HU-29: ajuste", branch: "b", draft: false, reviewers: [] } });
    const once = applyEvent(base(), opened);
    expect(applyEvent(once, opened)).toBe(once);
    expect(once.prs.find((pr) => pr.number === 900)?.storyId).toBe("HU-29");
    const ghost = event("e2", at(10, 5), { type: "notion.story_status", source: "notion", actor: { kind: "person", email: EMAIL.diego }, subject: { kind: "story", id: "HU-999" }, data: { storyId: "HU-999", status: "qa" } });
    expect(applyEvent(once, ghost).stories).toEqual(once.stories);
  });

  it("a ordem de chegada não muda o resultado", () => {
    const events = new SimulatedDay(3).pull(at(13), base());
    const shuffled = [...events].reverse();
    expect(foldEvents(squadSnapshot(), shuffled).prs).toEqual(foldEvents(squadSnapshot(), events).prs);
    expect(foldEvents(squadSnapshot(), shuffled).presence).toEqual(foldEvents(squadSnapshot(), events).presence);
  });

  it("o huddle acaba quando o último sai", () => {
    const actor = (email: string) => ({ kind: "person" as const, email });
    const subject = { kind: "huddle" as const, id: "h" };
    let state: ActivityState = base();
    state = applyEvent(state, event("h1", at(10), { type: "slack.huddle_started", source: "slack", actor: actor(EMAIL.diego), subject, data: { huddleId: "h", channel: "squad-portal" } }));
    state = applyEvent(state, event("h2", at(10, 1), { type: "slack.huddle_joined", source: "slack", actor: actor(EMAIL.luana), subject, data: { huddleId: "h" } }));
    state = applyEvent(state, event("h3", at(10, 5), { type: "slack.huddle_left", source: "slack", actor: actor(EMAIL.diego), subject, data: { huddleId: "h" } }));
    expect(state.huddles[0]).toMatchObject({ participants: [EMAIL.luana], endedAt: null });
    state = applyEvent(state, event("h4", at(10, 9), { type: "slack.huddle_left", source: "slack", actor: actor(EMAIL.luana), subject, data: { huddleId: "h" } }));
    expect(state.huddles[0]).toMatchObject({ participants: [], endedAt: at(10, 9) });
  });

  it("nunca guarda conteúdo de mensagem entre pessoas: o canal só conta", () => {
    const state = day(DAY_END);
    expect(Object.values(state.channels).every((channel) => Object.keys(channel).sort().join() === "id,lastAt,today")).toBe(true);
    // Toda mensagem com texto saiu do próprio app ou de um bot dele.
    expect(state.messages.length).toBeGreaterThan(0);
    expect(state.messages.every((message) => message.from.kind === "app" || message.from.kind === "bot")).toBe(true);
    expect(state.feed.filter((item) => item.type === "slack.app_message").every((item) => item.actor.kind === "app" || item.actor.kind === "bot")).toBe(true);
  });
});

describe("onde cada um está", () => {
  it("daily na sala por quem entrou no huddle; Caio ainda na mesa, Tiago atrasado e Bianca de férias", () => {
    const state = day(at(9, 35));
    expect(whereIs(state, EMAIL.marina).kind).toBe("reuniao");
    expect(doingNow(state, EMAIL.renata)).toBe("Daily");
    // Convidado que não entrou no huddle não vai à sala.
    expect(whereIs(state, EMAIL.caio).kind).toBe("mesa");
    expect(whereIs(state, EMAIL.tiago).kind).toBe("fora");
    expect(doingNow(state, EMAIL.bianca)).toBe("Férias até 16/11");
    expect(presenceBuckets(state).reuniao).toHaveLength(5);
    expect(presenceBuckets(day(at(9, 40))).reuniao).toHaveLength(6);
  });

  it("depois da daily cada um volta; reunião remota fica na mesa", () => {
    const state = day(at(10, 20));
    expect(whereIs(state, EMAIL.renata).kind).toBe("mesa");
    expect(whereIs(state, EMAIL.marina)).toMatchObject({ kind: "chamada", until: at(11, 30) });
    expect(whereIs(state, EMAIL.luana).kind).toBe("foco");
  });

  it("huddle junta quem entrou; almoço tira do andar", () => {
    const huddle = day(at(11, 26));
    expect(presenceBuckets(huddle).huddle.sort()).toEqual([EMAIL.diego, EMAIL.rafael, EMAIL.renata].sort());
    expect(doingNow(huddle, EMAIL.diego)).toBe("huddle em #squad-portal");
    const lunch = day(at(12, 30));
    expect(whereIs(lunch, EMAIL.marina).kind).toBe("fora");
    expect(doingNow(lunch, EMAIL.marina)).toBe("Almoço");
  });

  it("o rótulo mostra a revisão em curso", () => {
    const state = day(at(11, 50));
    expect(doingNow(state, EMAIL.renata)).toMatch(/PR #145/);
  });

  it("nextFreeAt pula reuniões encostadas", () => {
    const state = day(at(10, 30));
    expect(nextFreeAt(state, EMAIL.marina)).toBe(at(12));
    expect(nextFreeAt(state, EMAIL.luana)).toBe(at(10, 30));
  });
});

describe("perguntas de acompanhamento", () => {
  it("PRs esperando revisão, do que espera há mais tempo", () => {
    expect(prsAwaitingReview(day(at(9))).map((pr) => pr.number)).toEqual([142, 144]);
    expect(prsAwaitingReview(day(at(10))).map((pr) => pr.number)).toEqual([142, 144, 145]);
  });

  it("quem pode revisar agora: livre na agenda, não autor e com GitHub vinculado", () => {
    const state = day(at(10, 35));
    const pr = prOf(state, 144)!;
    const names = reviewCandidates(state, pr).map((candidate) => candidate.person.email);
    expect(names).not.toContain(EMAIL.renata); // autora
    expect(names).not.toContain(EMAIL.tiago); // sem GitHub vinculado
    expect(names).not.toContain(EMAIL.diego); // em entrevista
    expect(names).not.toContain(EMAIL.luana); // em foco
    expect(names).not.toContain(EMAIL.marina); // PM não revisa código
    const later = day(at(13, 35));
    // Às 13h35 o refinamento das 14h já tira os dois; às 15h30, quem tem menos revisão pendente vem primeiro.
    expect(reviewCandidates(later, prOf(later, 144)!)).toEqual([]);
    const free = day(at(15, 30));
    expect(reviewCandidates(free, prOf(free, 144)!).map((candidate) => candidate.person.email)).toEqual([EMAIL.luana, EMAIL.diego]);
  });

  it("HUs sem critério de aceite e paradas há mais de N", () => {
    const state = day(at(9, 5));
    expect(storiesWithoutCriteria(state).map((story) => story.id)).toEqual(["HU-33", "HU-36", "HU-40"]);
    expect(staleStories(state).map((story) => story.id)).toEqual(["HU-31", "HU-32"]);
    expect(staleStories(state, 3 * DAY).map((story) => story.id)).toEqual(["HU-31"]);
    expect(staleStories(state, 6 * HOUR).map((story) => story.id)).toEqual(["HU-31", "HU-32", "HU-34", "HU-33", "HU-35", "HU-29", "HU-30"]);
  });

  it("o que trava o épico, na ordem da gravidade", () => {
    const state = day(at(9, 5));
    expect(blockersOf(state, "E-1").map((reason) => reason.kind)).toEqual(["hu-travada"]);
    expect(blockersOf(state, "E-2").map((reason) => reason.kind)).toEqual(["pr-sem-revisao", "hu-parada", "hu-parada", "hu-sem-criterio", "prazo"]);
    expect(blockersOf(state, "E-4")[0]?.text).toContain("Bianca Sales");
    expect(epicHealth(state, "E-6").level).toBe("no-prazo");
  });

  it("épico muda de saúde ao longo do dia: o Login sem senha destrava", () => {
    expect(epicHealth(day(at(10, 35)), "E-1").level).toBe("travado");
    expect(epicHealth(day(at(10, 35)), "E-1").reasons.map((reason) => reason.kind)).toContain("ci-quebrado");
    expect(epicHealth(day(at(15, 30)), "E-1").level).toBe("no-prazo");
  });

  it("o GitHub sugere status sem voltar épico atrás e sem opinar sobre discovery", () => {
    const state = day(at(9));
    expect(githubSuggestedStatus(state, state.epics.find((epic) => epic.id === "E-1")!)).toBe("andamento");
    expect(githubSuggestedStatus(state, state.epics.find((epic) => epic.id === "E-3")!)).toBeNull();
    expect(githubSuggestedStatus(state, state.epics.find((epic) => epic.id === "E-4")!)).toBeNull();
  });

  it("o que os bots fizeram hoje", () => {
    const state = day(DAY_END);
    const tasks = botTasksToday(state);
    expect(tasks.map((task) => `${task.botId}:${task.kind}`)).toEqual(["forge:pauta_daily", "atlas:atualizar_epico", "pulse:cobrar_revisao", "atlas:atualizar_epico"]);
    expect(tasks.every((task) => task.doneAt !== null && task.result)).toBe(true);
    expect(tasks[0]!.result).toContain("HU-27");
    expect(state.epics.find((epic) => epic.id === "E-1")!.status).toBe("andamento");
  });

  it("carga por pessoa", () => {
    const load = personLoad(day(at(9, 5)), EMAIL.diego)!;
    expect(load.stories.map((story) => story.id)).toEqual(["HU-27", "HU-31", "HU-34"]);
    expect(load.prs.map((pr) => pr.number)).toEqual([142]);
    expect(load.reviews.map((pr) => pr.number)).toEqual([144]);
    expect(personLoad(day(at(9, 5)), EMAIL.tiago)!.prs).toEqual([]);
  });
});

describe("simulação", () => {
  it("o PRNG repete a sequência", () => {
    const a = random(42);
    const b = random(42);
    expect([a.next(), a.next(), a.int(1, 6)]).toEqual([b.next(), b.next(), b.int(1, 6)]);
  });

  it("mesma semente, mesmo dia; outra semente muda os minutos, não as situações", () => {
    const first = day(DAY_END, 11);
    const again = day(DAY_END, 11);
    expect(again.feed).toEqual(first.feed);
    const other = day(DAY_END, 12);
    expect(other.feed.map((event) => event.at)).not.toEqual(first.feed.map((event) => event.at));
    expect(trackingAnswers(other).saude).toEqual(trackingAnswers(first).saude);
  });

  it("um dia de 9 horas cabe em 15 minutos na velocidade 1", () => {
    expect(REAL_DAY_MS).toBe(15 * MINUTE);
    expect(TIME_SCALE).toBe(36);
    expect(clockLabel(DAY_START)).toBe("09:00");
    expect(clockLabel(DAY_END)).toBe("18:00");
    expect(ageLabel(4 * DAY + HOUR)).toBe("há 4 dias");
  });

  it("CI quebra e é consertado", () => {
    expect(prOf(day(at(10, 20)), 145)!.ci).toBe("failure");
    expect(prOf(day(at(11, 10)), 145)!.ci).toBe("success");
  });

  it("o relógio anda sem evento, e nunca volta", () => {
    const runtime = new ActivityRuntime(new SimulatedDay());
    runtime.advanceTo(at(9, 3));
    expect(runtime.state.at).toBe(at(9, 3));
    runtime.advanceTo(at(9, 1));
    expect(runtime.state.at).toBe(at(9, 3));
  });
});

describe("ações com efeito", () => {
  it("cobrar quem trava: mensagem do app agora, decisão quando ela puder olhar", () => {
    const { runtime, notes } = runWith([
      [at(10, 5), { kind: "cobrar", storyId: "HU-27" }],
      [at(10, 30), null],
    ]);
    expect(notes[0]).toContain("Marina Lopes");
    const message = runtime.state.messages.at(-1)!;
    expect(message).toMatchObject({ from: { kind: "app" }, to: EMAIL.marina });
    expect(message.text).toContain("HU-27");
    expect(storyOf(runtime.state, "HU-27")!.blocked).toBeNull();
    expect(epicHealth(runtime.state, "E-1").level).not.toBe("travado");
  });

  it("cobrar HU parada sem PR: a pessoa abre o PR e a HU vai para revisão", () => {
    const { runtime } = runWith([
      [at(13, 20), { kind: "cobrar", storyId: "HU-32" }],
      [at(14, 0), null],
    ]);
    const story = storyOf(runtime.state, "HU-32")!;
    expect(story.status).toBe("revisao");
    expect(runtime.state.prs.find((pr) => pr.storyId === "HU-32" && pr.state === "open")?.author).toBe(LOGIN.luana);
  });

  it("reatribuir tira a HU de quem está fora, e quem recebe começa", () => {
    const { runtime, notes } = runWith([
      [at(10, 30), { kind: "reatribuir", storyId: "HU-37", to: EMAIL.tiago }],
      [at(10, 31), null],
    ]);
    expect(notes[0]).toContain("Tiago Nunes");
    expect(storyOf(runtime.state, "HU-37")!.assignee).toBe(EMAIL.tiago);
    expect(blockersOf(runtime.state, "E-4").map((reason) => reason.kind)).not.toContain("responsavel-fora");
    runtime.advanceTo(at(12));
    expect(storyOf(runtime.state, "HU-37")!.status).toBe("andamento");
  });

  it("pedir ao bot para completar critérios: ele vai, faz, e a HU sai da lista", () => {
    const { runtime, notes } = runWith([[at(10), { kind: "pedir_bot", task: "completar_criterios", target: { kind: "story", id: "HU-40" } }]]);
    expect(notes[0]).toContain("Atlas");
    expect(runtime.state.botTasks.at(-1)).toMatchObject({ botId: "atlas", kind: "completar_criterios", doneAt: null });
    runtime.advanceTo(at(10, 5));
    expect(storyOf(runtime.state, "HU-40")!.criteria).toEqual([]);
    runtime.advanceTo(at(10, 15));
    const criteria = storyOf(runtime.state, "HU-40")!.criteria;
    expect(criteria).toHaveLength(3);
    expect(criteria.every((criterion) => criterion.suggestedBy === "atlas")).toBe(true);
    expect(storiesWithoutCriteria(runtime.state).map((story) => story.id)).not.toContain("HU-40");
    expect(epicHealth(runtime.state, "E-5").level).toBe("no-prazo");
  });

  it("cobrar revisão às 13h30 explica que todos têm o refinamento", () => {
    const { runtime } = runWith([
      [at(13, 30), { kind: "pedir_bot", task: "cobrar_revisao", target: { kind: "pr", number: 144 } }],
      [at(13, 40), null],
    ]);
    expect(runtime.state.botTasks.at(-1)!.result).toContain("Refinamento às 14:00");
    expect(runtime.state.botTasks.at(-1)!.result).toContain("Tiago sem GitHub vinculado");
  });

  it("pedir ao bot para resumir e para cobrar revisão", () => {
    const { runtime } = runWith([
      [at(15, 20), { kind: "pedir_bot", task: "resumir_pr", target: { kind: "pr", number: 144 } }],
      [at(15, 21), { kind: "pedir_bot", task: "cobrar_revisao", target: { kind: "pr", number: 144 } }],
      [at(15, 45), null],
    ]);
    const pr = prOf(runtime.state, 144)!;
    expect(pr.summary?.by).toBe("pulse");
    expect(pr.summary?.text).toContain("sem HU");
    expect(pr.summary?.text).toContain("Diego Martins");
    // O segundo pedido espera o Pulse terminar o primeiro.
    const [summary, nudge] = runtime.state.botTasks.slice(-2);
    expect(nudge!.startedAt).toBe(summary!.doneAt);
    expect(pr.reviewers.length).toBeGreaterThan(1);
    runtime.advanceTo(DAY_END);
    expect(prOf(runtime.state, 144)!.state).toBe("merged");
  });

  it("ação sobre o que não existe explica, sem mudar nada", () => {
    const { runtime, notes } = runWith([[at(10), { kind: "cobrar", storyId: "HU-28" }]]);
    expect(notes[0]).toMatch(/^erro/);
    expect(runtime.state.messages.filter((message) => message.from.kind === "app")).toEqual([]);
  });

  it("as mesmas ações dão as mesmas consequências", () => {
    const steps: Array<[number, AppAction | null]> = [
      [at(10), { kind: "cobrar", storyId: "HU-27" }],
      [at(11), { kind: "pedir_bot", task: "cobrar_revisao", target: { kind: "pr", number: 144 } }],
      [DAY_END, null],
    ];
    expect(runWith(steps).runtime.state.feed).toEqual(runWith(steps).runtime.state.feed);
  });
});
