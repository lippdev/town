import { at } from "./time";
import type { ActivitySnapshot, CalendarEvent, Criterion, Epic, Person, Project, PullRequest, Story } from "./types";
import { storyIdOf } from "./events";

/**
 * O squad fictício do cenário de tecnologia. Ninguém aqui existe: nomes, e-mails (no domínio
 * reservado `.example`), logins, projetos e PRs são inventados para a demonstração. A estrutura é
 * a das ferramentas reais, para a simulação poder dar lugar aos conectores sem mexer na cena.
 */
export const DOMAIN = "lipp.example";
const mail = (name: string) => `${name}@${DOMAIN}`;

export const EMAIL = {
  marina: mail("marina.lopes"),
  bianca: mail("bianca.sales"),
  caio: mail("caio.rezende"),
  renata: mail("renata.okabe"),
  diego: mail("diego.martins"),
  luana: mail("luana.ferraz"),
  otavio: mail("otavio.prado"),
} as const;

/**
 * Logins do GitHub. O da Luana aparece nos PRs, mas ela ainda não vinculou no cadastro: é o caso
 * que mostra o que se perde sem o vínculo.
 */
export const LOGIN = {
  marina: "marina-lopes",
  renata: "rokabe",
  diego: "diegomartins",
  luana: "luaferraz",
} as const;

/** O login de cada um no GitHub, vinculado ou não: a simulação sabe com que conta cada pessoa abre PR. */
export const LOGIN_BY_EMAIL: Readonly<Record<string, string>> = {
  [EMAIL.marina]: LOGIN.marina,
  [EMAIL.renata]: LOGIN.renata,
  [EMAIL.diego]: LOGIN.diego,
  [EMAIL.luana]: LOGIN.luana,
};

/** O squad no formato do time real: uma pessoa por papel, e o diretor sentado no andar com ele. */
export const SQUAD: readonly Person[] = [
  { email: EMAIL.marina, name: "Marina Lopes", role: "po", title: "PO sênior", github: LOGIN.marina },
  { email: EMAIL.bianca, name: "Bianca Sales", role: "po", title: "PO júnior", github: null },
  { email: EMAIL.caio, name: "Caio Rezende", role: "design", title: "UX designer", github: null },
  { email: EMAIL.renata, name: "Renata Okabe", role: "techlead", title: "Tech lead", github: LOGIN.renata },
  { email: EMAIL.diego, name: "Diego Martins", role: "dev", title: "Dev back-end", github: LOGIN.diego },
  { email: EMAIL.luana, name: "Luana Ferraz", role: "dev", title: "Dev front-end", github: null },
  { email: EMAIL.otavio, name: "Otávio Prado", role: "diretor", title: "Diretor de tecnologia", github: null },
];

/** Os bots da Operação que fazem o lado automação do squad. */
export const AUTOMATION_BOTS = { daily: "forge", github: "pulse", notion: "atlas" } as const;

/** Todos os projetos são produtos do app central HubSmart. */
export const PROJECTS: readonly Project[] = [
  { id: "franquias", name: "HubSmart · Franquias", owner: EMAIL.marina },
  { id: "icatu", name: "HubSmart · Previdência Icatu", owner: EMAIL.marina },
  { id: "besmart", name: "HubSmart · Vendedor BeSmart", owner: EMAIL.bianca },
];

const epic = (id: string, projectId: string, title: string, owner: string, status: Epic["status"], statusUpdatedAt: number, due: number): Epic => ({ id, projectId, title, owner, status, statusUpdatedAt, due });

export const EPICS: readonly Epic[] = [
  // O Notion ainda diz "planejado", mas já há PR mesclado: é o status que o Atlas corrige pelo GitHub.
  epic("E-1", "franquias", "Acesso do franqueado sem senha", EMAIL.renata, "planejado", at(16, 0, -14), at(18, 0, 3)),
  epic("E-2", "franquias", "Boleto de royalties do franqueado", EMAIL.luana, "andamento", at(10, 0, -6), at(18, 0, 1)),
  epic("E-3", "franquias", "Pesquisa com franqueados", EMAIL.caio, "pesquisa", at(11, 0, -5), at(18, 0, 10)),
  epic("E-4", "icatu", "Contratação de previdência Icatu", EMAIL.marina, "planejado", at(15, 0, -3), at(18, 0, 12)),
  epic("E-5", "icatu", "Gestão de admin da previdência", EMAIL.marina, "validado", at(17, 0, -1), at(18, 0, 21)),
  epic("E-6", "besmart", "Comissão do vendedor BeSmart", EMAIL.bianca, "ideia", at(9, 0, -9), at(18, 0, 30)),
];

const criteria = (storyId: string, texts: readonly string[], done = 0): Criterion[] => texts.map((text, index) => ({ id: `${storyId}-c${index + 1}`, text, done: index < done }));

const story = (id: string, epicId: string, title: string, assignee: string | null, status: Story["status"], texts: readonly string[], done: number, createdAt: number, updatedAt: number, blocked: Story["blocked"] = null): Story => ({
  id,
  epicId,
  title,
  assignee,
  status,
  criteria: criteria(id, texts, done),
  blocked,
  createdAt,
  updatedAt,
});

export const STORIES: readonly Story[] = [
  story("HU-27", "E-1", "Definir expiração do link mágico", EMAIL.diego, "andamento", ["Link expira no tempo definido por produto", "Link usado uma vez não vale de novo"], 1, at(10, 0, -9), at(17, 0, -1), {
    reason: "Esperando decisão de produto: o link vale 15 minutos ou 24 horas?",
    waitingOn: EMAIL.marina,
    since: at(17, 0, -1),
  }),
  story("HU-28", "E-1", "Enviar link mágico por e-mail", EMAIL.diego, "concluida", ["E-mail sai em até 10 s", "Link abre o app ou o navegador"], 2, at(10, 0, -9), at(15, 30, -1)),
  story("HU-29", "E-1", "Tela de \"confira seu e-mail\"", EMAIL.luana, "andamento", ["Mostra o e-mail digitado", "Botão de reenviar depois de 30 s", "Funciona no celular"], 1, at(10, 0, -9), at(17, 10, -1)),
  story("HU-30", "E-1", "Entrar pelo link no HubSmart", EMAIL.luana, "qa", ["Abre o HubSmart já logado na franquia", "Link vencido explica o que fazer"], 2, at(10, 0, -9), at(17, 40, -1)),
  story("HU-31", "E-2", "Gerar PDF do boleto de royalties", EMAIL.diego, "revisao", ["PDF com código de barras legível", "Valor de royalties do mês atualizado"], 2, at(9, 0, -8), at(16, 15, -4)),
  story("HU-32", "E-2", "Enviar boleto de royalties por e-mail", EMAIL.luana, "andamento", ["Anexa o PDF", "Assunto com o mês de referência"], 0, at(9, 0, -8), at(11, 20, -2)),
  story("HU-33", "E-2", "Histórico de boletos do franqueado", EMAIL.luana, "andamento", [], 0, at(9, 0, -8), at(14, 0, -1)),
  story("HU-34", "E-2", "Boleto vencido recalcula juros", EMAIL.diego, "qa", ["Juros de 1% ao mês, pró-rata", "Multa de 2% uma vez só"], 2, at(9, 0, -8), at(12, 0, -1)),
  story("HU-35", "E-3", "Roteiro das entrevistas com franqueados", EMAIL.caio, "andamento", ["Cinco perguntas abertas", "Validado com o PO"], 1, at(11, 0, -5), at(17, 0, -1)),
  story("HU-36", "E-3", "Protótipo do questionário", EMAIL.caio, "pronta", [], 0, at(11, 0, -5), at(11, 0, -5)),
  story("HU-37", "E-4", "Mapear regras de portabilidade da Icatu", EMAIL.bianca, "pronta", ["Lista as regras de portabilidade", "Validado com a Icatu", "Prazo de cada etapa"], 0, at(15, 0, -3), at(15, 0, -3)),
  story("HU-38", "E-4", "Simular a contribuição mensal", EMAIL.luana, "backlog", [], 0, at(15, 0, -3), at(15, 0, -3)),
  story("HU-39", "E-4", "Contratar o plano com assinatura digital", EMAIL.diego, "backlog", ["Assinatura pelo HubSmart", "Comprovante por e-mail"], 0, at(15, 0, -3), at(15, 0, -3)),
  story("HU-40", "E-5", "Mapear perfis de acesso do admin", EMAIL.marina, "pronta", [], 0, at(17, 0, -1), at(17, 0, -1)),
  story("HU-41", "E-5", "Comparar painéis de admin de seguradoras", EMAIL.caio, "concluida", ["Cinco seguradoras", "Prints e fluxo de cada uma"], 2, at(10, 0, -12), at(16, 0, -2)),
  story("HU-42", "E-6", "Levantar regras de comissão do vendedor", EMAIL.bianca, "backlog", ["Lista com dono de cada regra"], 0, at(9, 0, -9), at(9, 0, -9)),
];

/** O que um bot sugere quando pedem para completar os critérios. Ficam marcados como sugestão. */
export const SUGGESTED_CRITERIA: Readonly<Record<string, readonly string[]>> = {
  "HU-33": ["Lista os últimos 12 boletos de royalties", "Mostra pago, em aberto e vencido", "Baixa a segunda via de cada um"],
  "HU-36": ["Até dez perguntas", "Funciona sem login", "Leva menos de três minutos"],
  "HU-38": ["Mostra o valor acumulado em 10 e 20 anos", "Explica a diferença entre PGBL e VGBL"],
  "HU-40": ["Admin da Icatu vê só os contratos da Icatu", "Gestor da franquia não vê previdência de ninguém", "Toda troca de perfil fica registrada"],
  "HU-32": ["Envia em até 1 min", "Avisa se o e-mail voltar"],
  "HU-42": ["Diz quem aprova cada regra"],
};

const pr = (number: number, title: string, branch: string, author: string, fields: Partial<PullRequest> & Pick<PullRequest, "openedAt">): PullRequest => ({
  number,
  title,
  branch,
  author,
  storyId: storyIdOf(title, branch),
  state: "open",
  draft: false,
  reviewers: [],
  reviews: [],
  ci: "success",
  ciSince: fields.openedAt,
  updatedAt: fields.openedAt,
  mergedAt: null,
  summary: null,
  ...fields,
});

export const PULL_REQUESTS: readonly PullRequest[] = [
  pr(138, "HU-28: envia o link mágico por e-mail", "feat/HU-28-link-por-email", LOGIN.diego, { openedAt: at(10, 0, -2), state: "merged", mergedAt: at(15, 0, -1), updatedAt: at(15, 0, -1), reviews: [{ by: LOGIN.renata, state: "approved", at: at(14, 20, -1) }] }),
  pr(140, "HU-30: entra pelo link no HubSmart", "feat/HU-30-deep-link", LOGIN.luana, { openedAt: at(11, 0, -2), state: "merged", mergedAt: at(17, 20, -1), updatedAt: at(17, 20, -1), reviews: [{ by: LOGIN.renata, state: "approved", at: at(16, 50, -1) }] }),
  // Parado: aberto na sexta sem revisor, e ninguém olhou desde então.
  pr(142, "HU-31: gera o PDF do boleto de royalties", "feat/HU-31-pdf-royalties", LOGIN.diego, { openedAt: at(16, 10, -4), updatedAt: at(16, 15, -4) }),
  pr(143, "HU-34: recalcula juros do boleto vencido", "feat/HU-34-juros", LOGIN.diego, { openedAt: at(9, 30, -2), state: "merged", mergedAt: at(11, 30, -1), updatedAt: at(11, 30, -1), reviews: [{ by: LOGIN.luana, state: "approved", at: at(11, 0, -1) }] }),
  // Sem HU no título nem na branch: aparece no GitHub, mas não pertence a épico nenhum.
  pr(144, "Atualiza o Node do build para 22", "chore/node-22", LOGIN.renata, { openedAt: at(18, 0, -1), updatedAt: at(18, 5, -1), reviewers: [LOGIN.diego] }),
];

const meeting = (id: string, title: string, start: number, end: number, attendees: readonly string[], place: CalendarEvent["place"], huddleChannel?: string): CalendarEvent => ({ id, title, start, end, attendees: [...attendees], place, ...(huddleChannel ? { huddleChannel } : {}) });

/** O canal do squad, onde a daily acontece em huddle e as cobranças do Lipp HQ saem. */
export const DAILY_CHANNEL = "squad-hubsmart";

/** Quem vai à daily: o squad, sem o diretor. A Bianca é convidada, mas está de férias. */
const DAILY_INVITED = [EMAIL.marina, EMAIL.bianca, EMAIL.caio, EMAIL.renata, EMAIL.diego, EMAIL.luana];

/** A agenda do dia, como o Outlook devolveria: título, horário, quem vai e onde. */
export const CALENDAR: readonly CalendarEvent[] = [
  // A daily é o huddle do canal do squad: vai à sala quem entra nele; o convite diz quem faltou.
  meeting("daily", "Daily", at(9, 30), at(9, 45), DAILY_INVITED, "sala", DAILY_CHANNEL),
  meeting("rede-franquias", "Alinhamento com a rede de franquias", at(10, 0), at(11, 30), [EMAIL.marina], "remoto"),
  meeting("entrevista", "Entrevista técnica", at(10, 30), at(11, 15), [EMAIL.diego], "remoto"),
  meeting("comite", "Comitê de produto HubSmart", at(11, 30), at(12, 0), [EMAIL.marina, EMAIL.otavio], "remoto"),
  meeting("trimestral", "Planejamento do trimestre", at(13, 0), at(14, 0), [EMAIL.marina, EMAIL.otavio], "remoto"),
  meeting("refinamento", "Refinamento", at(14, 0), at(15, 0), [EMAIL.marina, EMAIL.renata, EMAIL.diego, EMAIL.luana, EMAIL.caio], "sala"),
  meeting("icatu", "Alinhamento com a Icatu", at(15, 0), at(15, 30), [EMAIL.marina, EMAIL.otavio], "remoto"),
  meeting("um-a-um", "1:1 Otávio e Renata", at(16, 0), at(16, 30), [EMAIL.otavio, EMAIL.renata], "sala"),
];

export const CHANNELS = [DAILY_CHANNEL, "previdencia-icatu", "tecnologia", "design", "incidentes"] as const;

/** Às 9h, antes de qualquer evento do dia: todos offline, e a Bianca de férias. */
export function squadSnapshot(): ActivitySnapshot {
  return {
    at: at(9, 0),
    people: SQUAD.map((person) => ({ ...person })),
    projects: PROJECTS.map((project) => ({ ...project })),
    epics: EPICS.map((item) => ({ ...item })),
    stories: STORIES.map((item) => ({ ...item, criteria: item.criteria.map((criterion) => ({ ...criterion })), blocked: item.blocked ? { ...item.blocked } : null })),
    prs: PULL_REQUESTS.map((item) => ({ ...item, reviewers: [...item.reviewers], reviews: item.reviews.map((review) => ({ ...review })) })),
    deploys: [
      { id: "d-0309", environment: "homologacao", numbers: [143], status: "success", at: at(12, 0, -1), by: LOGIN.diego },
      { id: "d-0310", environment: "homologacao", numbers: [138, 140], status: "success", at: at(17, 40, -1), by: LOGIN.renata },
    ],
    calendar: CALENDAR.map((item) => ({ ...item, attendees: [...item.attendees] })),
    presence: Object.fromEntries(SQUAD.map((person) => [person.email, "offline" as const])),
    slackStatus: Object.fromEntries(SQUAD.map((person) => [person.email, person.email === EMAIL.bianca ? { emoji: "🌴", text: "Férias até 16/11" } : null])),
    huddles: [],
    channels: Object.fromEntries(CHANNELS.map((channel) => [channel, { id: channel, lastAt: at(18, 30, -1), today: 0 }])),
    messages: [],
    botTasks: [],
  };
}
