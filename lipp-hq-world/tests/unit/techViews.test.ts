import { describe, expect, it } from "vitest";
import { epicHealth, presenceBuckets, prOf, reviewCandidates, trackingAnswers, upcomingReviewers, whereIs } from "@/activity/selectors";
import { DEFAULT_SEED, simulatedStateAt } from "@/activity/simulation";
import { EMAIL } from "@/activity/squad";
import { DAY_END, DAY_START, MINUTE, at, clockLabel } from "@/activity/time";
import { searchWithView, viewFrom } from "@/tech/techStore";
import { attentionExpansion, attentionOnly, dailyBoard, destinationOf, fullExpansion, needsAttention, personTag, projectTree, subjectKey, subjectLabel } from "@/tech/techViews";

const day = (until: number) => simulatedStateAt(DEFAULT_SEED, until);
/** Um instante a cada 20 minutos do dia simulado. */
const DAY_SAMPLES = Array.from({ length: 27 }, (_, index) => DAY_START + 20 * MINUTE * (index + 1) - MINUTE);

describe("visão Projetos: a árvore do Notion", () => {
  it("tem todo projeto, épico e HU uma vez só, na hierarquia Projeto → Épico → HU", () => {
    const state = day(at(10, 20));
    const tree = projectTree(state);
    expect(tree.map((node) => node.project.id)).toEqual(state.projects.map((project) => project.id));
    const epics = tree.flatMap((node) => node.epics);
    expect(epics.map((node) => node.epic.id).sort()).toEqual(state.epics.map((epic) => epic.id).sort());
    for (const project of tree) for (const epic of project.epics) expect(epic.epic.projectId).toBe(project.project.id);
    const stories = epics.flatMap((node) => node.stories);
    expect(stories.map((node) => node.story.id).sort()).toEqual(state.stories.map((story) => story.id).sort());
    for (const epic of epics) for (const story of epic.stories) expect(story.story.epicId).toBe(epic.epic.id);
  });

  it("marca as mesmas HUs travadas, paradas e sem critério que trackingAnswers, o dia inteiro", () => {
    for (const instant of DAY_SAMPLES) {
      const state = day(instant);
      const answers = trackingAnswers(state);
      const stories = projectTree(state).flatMap((node) => node.epics.flatMap((epic) => epic.stories));
      expect(stories.filter((node) => node.blocked).map((node) => node.story.id).sort()).toEqual([...answers.travadas].sort());
      expect(stories.filter((node) => node.stale).map((node) => node.story.id).sort()).toEqual([...answers.paradas].sort());
      expect(stories.filter((node) => node.withoutCriteria).map((node) => node.story.id).sort()).toEqual([...answers.semCriterio].sort());
      const health = Object.fromEntries(projectTree(state).flatMap((node) => node.epics.map((epic) => [epic.epic.id, epic.health.level])));
      expect(health).toEqual(answers.saude);
    }
  });

  it("diz desde quando e por quem a HU travada espera, e quem do time está fora", () => {
    const state = day(at(10, 20));
    const story = projectTree(state).flatMap((node) => node.epics.flatMap((epic) => epic.stories)).find((node) => node.story.id === "HU-27")!;
    expect(story.blocked).not.toBeNull();
    expect(story.blocked!.since).toBe(state.stories.find((item) => item.id === "HU-27")!.blocked!.since);
    expect(story.blocked!.waitingOn?.email).toBe(state.stories.find((item) => item.id === "HU-27")!.blocked!.waitingOn);
    expect(personTag(state, EMAIL.bianca)?.away).toBe("Férias até 16/11");
    expect(personTag(state, EMAIL.diego)?.away).toBeNull();
    expect(personTag(state, null)).toBeNull();
  });

  it("a HU traz os outros motivos do épico que caem nela: responsável fora, PR sem revisão", () => {
    const state = day(at(10, 20));
    const stories = projectTree(state).flatMap((node) => node.epics.flatMap((epic) => epic.stories));
    const hu37 = stories.find((node) => node.story.id === "HU-37")!;
    expect(hu37.risks.map((reason) => reason.kind)).toEqual(["responsavel-fora"]);
    expect(needsAttention(hu37)).toBe(true);
    const hu31 = stories.find((node) => node.story.id === "HU-31")!;
    expect(hu31.risks.map((reason) => reason.kind)).toContain("pr-sem-revisao");
    // Cada motivo de épico fora do prazo aparece em alguma HU, ou é do próprio épico (prazo).
    for (const epic of projectTree(state).flatMap((node) => node.epics)) {
      const shown = new Set(epic.stories.flatMap((node) => [...node.risks.map((reason) => reason.text)]));
      for (const reason of epic.health.reasons.filter((item) => ["ci-quebrado", "pr-sem-revisao", "responsavel-fora"].includes(item.kind))) expect(shown.has(reason.text)).toBe(true);
    }
  });

  it("liga cada PR à sua HU e conta critérios marcados", () => {
    const state = day(at(14, 0));
    const stories = projectTree(state).flatMap((node) => node.epics.flatMap((epic) => epic.stories));
    for (const node of stories) {
      expect(node.prs.map((pr) => pr.number)).toEqual(state.prs.filter((pr) => pr.storyId === node.story.id).map((pr) => pr.number));
      expect(node.criteriaDone).toBe(node.story.criteria.filter((criterion) => criterion.done).length);
    }
    expect(stories.flatMap((node) => node.prs).length).toBe(state.prs.filter((pr) => pr.storyId).length);
  });

  it("o resumo do projeto soma os épicos e as HUs dele", () => {
    const state = day(at(11, 21));
    for (const project of projectTree(state)) {
      const stories = project.epics.flatMap((epic) => epic.stories);
      expect(project.summary.stories).toBe(stories.length);
      expect(project.summary.blocked).toBe(stories.filter((node) => node.blocked).length);
      expect(project.summary.health["no-prazo"] + project.summary.health["em-risco"] + project.summary.health.travado).toBe(project.epics.length);
    }
  });

  it("abrir o que pede atenção mostra toda HU marcada; o filtro esconde só o que está em dia", () => {
    const state = day(at(10, 20));
    const tree = projectTree(state);
    const open = attentionExpansion(tree);
    for (const project of tree) {
      expect(open.has(project.project.id)).toBe(true);
      for (const epic of project.epics) for (const story of epic.stories) if (needsAttention(story)) expect(open.has(epic.epic.id)).toBe(true);
    }
    const all = fullExpansion(tree);
    expect(all.size).toBe(state.projects.length + state.epics.length + state.stories.length);
    const filtered = attentionOnly(tree).flatMap((node) => node.epics);
    const marked = tree.flatMap((node) => node.epics.flatMap((epic) => epic.stories)).filter(needsAttention);
    expect(filtered.flatMap((epic) => epic.stories).map((node) => node.story.id).sort()).toEqual(marked.map((node) => node.story.id).sort());
    expect(filtered.every((epic) => epic.stories.length > 0 || epic.health.level !== "no-prazo")).toBe(true);
  });
});

describe("visão Painel: as respostas da daily", () => {
  it("responde exatamente o que trackingAnswers responde, a cada 20 minutos do dia", () => {
    for (const instant of DAY_SAMPLES) {
      const state = day(instant);
      const answers = trackingAnswers(state);
      const board = dailyBoard(state);
      expect(board.blocked.map((item) => item.story.id)).toEqual(answers.travadas);
      expect(board.stale.map((item) => item.story.id)).toEqual(answers.paradas);
      expect(board.reviews.map((item) => item.pr.number)).toEqual(answers.revisoes);
      expect(board.withoutCriteria.map((item) => item.story.id)).toEqual(answers.semCriterio);
      expect(board.withoutAuthor.map((item) => item.pr.number)).toEqual(answers.semAutor);
      expect(board.bots.length).toBe(answers.botsHoje);
      expect(board.presence.reuniao.map((item) => item.person.email)).toEqual(answers.reuniao);
      expect(board.presence.huddle.map((item) => item.person.email)).toEqual(answers.huddle);
      expect(board.presence.foco.map((item) => item.person.email)).toEqual(answers.foco);
      expect(board.presence.fora.map((item) => item.person.email)).toEqual(answers.fora);
      expect(Object.fromEntries(board.epics.map((item) => [item.epic.id, item.health.level]))).toEqual(answers.saude);
    }
  });

  it("cada PR esperando revisão traz quem pode revisar agora, pela mesma regra", () => {
    for (const instant of [at(10, 20), at(11, 21), at(15, 20)]) {
      const state = day(instant);
      for (const item of dailyBoard(state).reviews) {
        expect(item.candidates.map((candidate) => candidate.person.email)).toEqual(reviewCandidates(state, item.pr).map((candidate) => candidate.person.email));
        expect(item.waitingMs).toBeGreaterThanOrEqual(0);
      }
    }
    // Às 15:20 há gente livre para revisar o #147.
    const late = dailyBoard(day(at(15, 20))).reviews.find((item) => item.pr.number === 147)!;
    expect(late.candidates.length).toBeGreaterThan(0);
  });

  it("na daily ninguém está livre, e o painel diz quem fica livre e quando", () => {
    const state = day(at(9, 35));
    const board = dailyBoard(state);
    expect(board.reviews.length).toBeGreaterThan(0);
    for (const item of board.reviews) {
      // A regra de agora não muda: na daily o squad está na sala.
      expect(item.candidates).toEqual([]);
      expect(item.upcoming.map((upcoming) => upcoming.person.email)).toEqual(upcomingReviewers(state, item.pr).map((upcoming) => upcoming.person.email));
    }
    const pr142 = board.reviews.find((item) => item.pr.number === 142)!;
    expect(pr142.upcoming.map((upcoming) => [upcoming.person.email, clockLabel(upcoming.freeAt)])).toEqual([
      [EMAIL.luana, "09:45"],
      [EMAIL.renata, "09:45"],
    ]);
  });

  it("quem fica livre segue a regra de reviewCandidates no instante em que fica livre", () => {
    for (const instant of DAY_SAMPLES) {
      const state = day(instant);
      for (const pr of state.prs.filter((item) => item.state === "open")) {
        const now = reviewCandidates(state, pr).map((candidate) => candidate.person.email);
        const upcoming = upcomingReviewers(state, pr);
        // Do mais cedo para o mais tarde, no futuro, ainda hoje, e nunca quem já está livre.
        expect(upcoming.map((item) => item.freeAt)).toEqual([...upcoming.map((item) => item.freeAt)].sort((a, b) => a - b));
        for (const item of upcoming) {
          expect(item.freeAt).toBeGreaterThan(state.at);
          expect(item.freeAt).toBeLessThan(DAY_END);
          expect(now).not.toContain(item.person.email);
          expect(item.person.github).not.toBe(pr.author);
          expect(["dev", "techlead"]).toContain(item.person.role);
          // Na hora em que fica livre não está em reunião, e a próxima fica a 30 min ou mais.
          const meetings = state.calendar.filter((entry) => entry.attendees.includes(item.person.email));
          expect(meetings.some((entry) => entry.start <= item.freeAt && item.freeAt < entry.end)).toBe(false);
          if (item.freeUntil !== null) expect(item.freeUntil - item.freeAt).toBeGreaterThanOrEqual(30 * MINUTE);
          // Foco, huddle e fora não dizem quando acabam: ficam de fora.
          expect(["mesa", "reuniao", "chamada"]).toContain(whereIs(state, item.person.email).kind);
        }
      }
    }
    // Às 13:35 o refinamento das 14h tira todo mundo; depois dele, voltam.
    const before = day(at(13, 35));
    const pr = prOf(before, 144)!;
    expect(reviewCandidates(before, pr)).toEqual([]);
    expect(upcomingReviewers(before, pr).map((item) => clockLabel(item.freeAt))).toEqual(["15:00", "15:00"]);
  });

  it("presença cobre o time inteiro, cada pessoa num lugar só", () => {
    const state = day(at(11, 21));
    const presence = dailyBoard(state).presence;
    const everyone = Object.values(presence).flatMap((items) => items.map((item) => item.person.email));
    expect(everyone.sort()).toEqual(state.people.map((person) => person.email).sort());
    expect(Object.fromEntries(Object.entries(presence).map(([kind, items]) => [kind, items.map((item) => item.person.email)]))).toEqual(presenceBuckets(state));
    expect(presence.huddle.every((item) => item.detail.startsWith("#"))).toBe(true);
    expect(presence.fora.find((item) => item.person.email === EMAIL.bianca)?.detail).toBe("Férias até 16/11");
  });

  it("épicos na ordem da gravidade, com os mesmos motivos da gaveta", () => {
    const state = day(at(10, 20));
    const epics = dailyBoard(state).epics;
    const order = { travado: 0, "em-risco": 1, "no-prazo": 2 } as const;
    expect(epics.map((item) => order[item.health.level])).toEqual([...epics.map((item) => order[item.health.level])].sort());
    for (const item of epics) expect(item.reasons.map((reason) => reason.text).sort()).toEqual(epicHealth(state, item.epic.id).reasons.map((reason) => reason.text).sort());
  });

  it("carga por pessoa: HUs, PRs e revisões de cada um; sem GitHub, sem PR atribuído", () => {
    const state = day(at(14, 0));
    const load = dailyBoard(state).load;
    expect(load.map((item) => item.person.email)).toEqual(state.people.map((person) => person.email));
    const tiago = load.find((item) => item.person.email === EMAIL.tiago)!;
    expect(tiago.github).toBe(false);
    expect(tiago.prs).toEqual([]);
    const diego = load.find((item) => item.person.email === EMAIL.diego)!;
    expect(diego.stories.every((story) => story.assignee === EMAIL.diego && story.status !== "concluida")).toBe(true);
  });

  it("cada item leva à origem: HU e PR ao épico com a HU em destaque, pessoa à gaveta dela", () => {
    const state = day(at(10, 20));
    expect(destinationOf(state, { kind: "story", id: "HU-31" })).toEqual({ kind: "epic", epicId: "E-2", storyId: "HU-31" });
    const pr = state.prs.find((item) => item.storyId)!;
    expect(destinationOf(state, { kind: "pr", number: pr.number })).toEqual({ kind: "epic", epicId: state.stories.find((story) => story.id === pr.storyId)!.epicId, storyId: pr.storyId });
    expect(destinationOf(state, { kind: "epic", id: "E-1" })).toEqual({ kind: "epic", epicId: "E-1", storyId: null });
    expect(destinationOf(state, { kind: "person", email: EMAIL.diego })).toEqual({ kind: "person", email: EMAIL.diego });
    expect(destinationOf(state, { kind: "story", id: "HU-999" })).toBeNull();
    expect(destinationOf(state, { kind: "channel", id: "squad" })).toBeNull();
    expect(destinationOf(state, { kind: "meeting", id: "daily" })).toBeNull();
    // PR sem HU leva a quem abriu; sem HU e com login que ninguém vinculou, a lugar nenhum.
    const loose = { ...state, prs: state.prs.map((item) => (item.number === pr.number ? { ...item, storyId: null } : item)) };
    const author = state.people.find((person) => person.github === pr.author)!;
    expect(destinationOf(loose, { kind: "pr", number: pr.number })).toEqual({ kind: "person", email: author.email });
    const nobody = { ...loose, prs: loose.prs.map((item) => (item.number === pr.number ? { ...item, author: "login-solto" } : item)) };
    expect(destinationOf(nobody, { kind: "pr", number: pr.number })).toBeNull();
    expect(subjectKey({ kind: "pr", number: 142 })).toBe("pr:142");
    expect(subjectKey({ kind: "story", id: "HU-31" })).toBe("story:HU-31");
    expect(subjectLabel(state, { kind: "pr", number: 142 })).toBe("PR #142");
    expect(subjectLabel(state, { kind: "epic", id: "E-1" })).toBe("E-1 · Login sem senha");
  });
});

describe("visão na URL", () => {
  it("?visao= escolhe a visão; valor estranho é o prédio; o prédio não suja a URL", () => {
    expect(viewFrom("?escritorio=completo&cenario=tecnologia&visao=painel")).toBe("painel");
    expect(viewFrom("?visao=projetos")).toBe("projetos");
    expect(viewFrom("?visao=outra")).toBe("predio");
    expect(viewFrom("")).toBe("predio");
    expect(searchWithView("?escritorio=completo&cenario=tecnologia", "painel")).toBe("?escritorio=completo&cenario=tecnologia&visao=painel");
    expect(searchWithView("?escritorio=completo&visao=painel", "predio")).toBe("?escritorio=completo");
    expect(searchWithView("?visao=painel", "predio")).toBe("");
  });
});
