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
  caio: mail("caio.rezende"),
  renata: mail("renata.okabe"),
  diego: mail("diego.martins"),
  luana: mail("luana.ferraz"),
  tiago: mail("tiago.nunes"),
  bianca: mail("bianca.sales"),
  rafael: mail("rafael.coutinho"),
} as const;

/**
 * Logins do GitHub. O do Tiago aparece nos PRs, mas ele ainda não vinculou no cadastro: é o caso
 * que mostra o que se perde sem o vínculo.
 */
export const LOGIN = {
  marina: "marina-lopes",
  renata: "rokabe",
  diego: "diegomartins",
  luana: "luaferraz",
  tiago: "tnunes-dev",
  bianca: "bsales",
  rafael: "rafacoutinho",
} as const;

export const SQUAD: readonly Person[] = [
  { email: EMAIL.marina, name: "Marina Lopes", role: "pm", title: "Product manager", github: LOGIN.marina },
  { email: EMAIL.caio, name: "Caio Rezende", role: "design", title: "Product designer", github: null },
  { email: EMAIL.renata, name: "Renata Okabe", role: "techlead", title: "Tech lead", github: LOGIN.renata },
  { email: EMAIL.diego, name: "Diego Martins", role: "dev", title: "Dev back-end", github: LOGIN.diego },
  { email: EMAIL.luana, name: "Luana Ferraz", role: "dev", title: "Dev front-end", github: LOGIN.luana },
  { email: EMAIL.tiago, name: "Tiago Nunes", role: "dev", title: "Dev full-stack", github: null },
  { email: EMAIL.bianca, name: "Bianca Sales", role: "dev", title: "Dev mobile", github: LOGIN.bianca },
  { email: EMAIL.rafael, name: "Rafael Coutinho", role: "qa", title: "QA", github: LOGIN.rafael },
];

/** Os bots da Operação que fazem o lado automação do squad. */
export const AUTOMATION_BOTS = { daily: "forge", github: "pulse", notion: "atlas" } as const;

export const PROJECTS: readonly Project[] = [
  { id: "portal", name: "Portal do Cliente", owner: EMAIL.marina },
  { id: "vendas", name: "App de Vendas", owner: EMAIL.marina },
  { id: "dados", name: "Plataforma de Dados", owner: EMAIL.renata },
];

const epic = (id: string, projectId: string, title: string, owner: string, status: Epic["status"], statusUpdatedAt: number, due: number): Epic => ({ id, projectId, title, owner, status, statusUpdatedAt, due });

export const EPICS: readonly Epic[] = [
  // O Notion ainda diz "planejado", mas já há PR mesclado: é o status que o Atlas corrige pelo GitHub.
  epic("E-1", "portal", "Login sem senha", EMAIL.renata, "planejado", at(16, 0, -14), at(18, 0, 3)),
  epic("E-2", "portal", "Segunda via de boleto", EMAIL.luana, "andamento", at(10, 0, -6), at(18, 0, 1)),
  epic("E-3", "portal", "Pesquisa de satisfação", EMAIL.caio, "pesquisa", at(11, 0, -5), at(18, 0, 10)),
  epic("E-4", "vendas", "Catálogo offline", EMAIL.tiago, "planejado", at(15, 0, -3), at(18, 0, 12)),
  epic("E-5", "vendas", "Checkout em 1 toque", EMAIL.marina, "validado", at(17, 0, -1), at(18, 0, 21)),
  epic("E-6", "dados", "Painel de churn", EMAIL.renata, "ideia", at(9, 0, -9), at(18, 0, 30)),
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
  story("HU-27", "E-1", "Definir expiração do link mágico", EMAIL.diego, "andamento", ["Link expira no tempo definido por produto", "Link usado uma vez não vale de novo"], 1, at(10, 0, -9), at(16, 40, -1), {
    reason: "Esperando decisão de produto: o link vale 15 minutos ou 24 horas?",
    waitingOn: EMAIL.marina,
    since: at(16, 40, -1),
  }),
  story("HU-28", "E-1", "Enviar link mágico por e-mail", EMAIL.diego, "concluida", ["E-mail sai em até 10 s", "Link abre o app ou o navegador"], 2, at(10, 0, -9), at(15, 30, -1)),
  story("HU-29", "E-1", "Tela de \"confira seu e-mail\"", EMAIL.luana, "andamento", ["Mostra o e-mail digitado", "Botão de reenviar depois de 30 s", "Funciona no celular"], 1, at(10, 0, -9), at(17, 10, -1)),
  story("HU-30", "E-1", "Entrar pelo link no app", EMAIL.tiago, "qa", ["Abre o app já logado", "Link vencido explica o que fazer"], 2, at(10, 0, -9), at(17, 40, -1)),
  story("HU-31", "E-2", "Gerar PDF da segunda via", EMAIL.diego, "revisao", ["PDF com código de barras legível", "Valor atualizado com juros do dia"], 2, at(9, 0, -8), at(16, 15, -4)),
  story("HU-32", "E-2", "Enviar segunda via por e-mail", EMAIL.luana, "andamento", ["Anexa o PDF", "Assunto com o mês de referência"], 0, at(9, 0, -8), at(11, 20, -2)),
  story("HU-33", "E-2", "Histórico de boletos", EMAIL.tiago, "andamento", [], 0, at(9, 0, -8), at(14, 0, -1)),
  story("HU-34", "E-2", "Boleto vencido recalcula juros", EMAIL.diego, "qa", ["Juros de 1% ao mês, pró-rata", "Multa de 2% uma vez só"], 2, at(9, 0, -8), at(12, 0, -1)),
  story("HU-35", "E-3", "Roteiro das entrevistas", EMAIL.caio, "andamento", ["Cinco perguntas abertas", "Validado com a PM"], 1, at(11, 0, -5), at(17, 0, -1)),
  story("HU-36", "E-3", "Protótipo do questionário", EMAIL.caio, "pronta", [], 0, at(11, 0, -5), at(11, 0, -5)),
  story("HU-37", "E-4", "Sincronizar catálogo em segundo plano", EMAIL.bianca, "pronta", ["Sincroniza no Wi-Fi", "Não trava a tela", "Mostra quando sincronizou"], 0, at(15, 0, -3), at(15, 0, -3)),
  story("HU-38", "E-4", "Indicador de modo offline", EMAIL.bianca, "backlog", [], 0, at(15, 0, -3), at(15, 0, -3)),
  story("HU-39", "E-4", "Cache das fotos do catálogo", EMAIL.tiago, "backlog", ["Até 200 MB", "Some ao sair da conta"], 0, at(15, 0, -3), at(15, 0, -3)),
  story("HU-40", "E-5", "Mapear meios de pagamento salvos", EMAIL.marina, "pronta", [], 0, at(17, 0, -1), at(17, 0, -1)),
  story("HU-41", "E-5", "Comparar o checkout dos concorrentes", EMAIL.caio, "concluida", ["Cinco concorrentes", "Prints e tempo de cada um"], 2, at(10, 0, -12), at(16, 0, -2)),
  story("HU-42", "E-6", "Levantar fontes de dados de cancelamento", EMAIL.renata, "backlog", ["Lista com dono de cada fonte"], 0, at(9, 0, -9), at(9, 0, -9)),
];

/** O que um bot sugere quando pedem para completar os critérios. Ficam marcados como sugestão. */
export const SUGGESTED_CRITERIA: Readonly<Record<string, readonly string[]>> = {
  "HU-33": ["Lista os últimos 12 boletos", "Mostra pago, em aberto e vencido", "Baixa a segunda via de cada um"],
  "HU-36": ["Até dez perguntas", "Funciona sem login", "Leva menos de três minutos"],
  "HU-38": ["Faixa visível em todas as telas", "Some sozinha ao voltar a conexão"],
  "HU-40": ["Cartões e Pix salvos aparecem primeiro", "Mostra o final do cartão, nunca o número", "Funciona com um toque"],
  "HU-32": ["Envia em até 1 min", "Avisa se o e-mail voltar"],
  "HU-42": ["Diz a frequência de atualização de cada fonte"],
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
  pr(140, "HU-30: entra pelo link no app", "feat/HU-30-deep-link", LOGIN.tiago, { openedAt: at(11, 0, -2), state: "merged", mergedAt: at(17, 20, -1), updatedAt: at(17, 20, -1), reviews: [{ by: LOGIN.renata, state: "approved", at: at(16, 50, -1) }] }),
  // Parado: aberto na sexta, revisão pedida à Renata e nenhuma resposta.
  pr(142, "HU-31: gera o PDF da segunda via", "feat/HU-31-pdf-segunda-via", LOGIN.diego, { openedAt: at(16, 10, -4), updatedAt: at(16, 15, -4), reviewers: [LOGIN.renata] }),
  pr(143, "HU-34: recalcula juros do boleto vencido", "feat/HU-34-juros", LOGIN.diego, { openedAt: at(9, 30, -2), state: "merged", mergedAt: at(11, 30, -1), updatedAt: at(11, 30, -1), reviews: [{ by: LOGIN.luana, state: "approved", at: at(11, 0, -1) }] }),
  // Sem HU no título nem na branch: aparece no GitHub, mas não pertence a épico nenhum.
  pr(144, "Atualiza o Node do build para 22", "chore/node-22", LOGIN.renata, { openedAt: at(18, 0, -1), updatedAt: at(18, 5, -1), reviewers: [LOGIN.diego] }),
];

const meeting = (id: string, title: string, start: number, end: number, attendees: readonly string[], place: CalendarEvent["place"], huddleChannel?: string): CalendarEvent => ({ id, title, start, end, attendees: [...attendees], place, ...(huddleChannel ? { huddleChannel } : {}) });

/** O canal do squad, onde a daily acontece em huddle. */
export const DAILY_CHANNEL = "squad-portal";

const PRESENT = [EMAIL.marina, EMAIL.caio, EMAIL.renata, EMAIL.diego, EMAIL.luana, EMAIL.tiago, EMAIL.rafael];

/** A agenda do dia, como o Outlook devolveria: título, horário, quem vai e onde. */
export const CALENDAR: readonly CalendarEvent[] = [
  // A daily é o huddle do canal do squad: vai à sala quem entra nele; o convite diz quem faltou.
  meeting("daily", "Daily", at(9, 30), at(9, 45), [...PRESENT, EMAIL.bianca], "sala", DAILY_CHANNEL),
  meeting("cliente-portal", "Alinhamento com o cliente do Portal", at(10, 0), at(11, 30), [EMAIL.marina], "remoto"),
  meeting("entrevista", "Entrevista técnica", at(10, 30), at(11, 15), [EMAIL.diego], "remoto"),
  meeting("comite", "Comitê de produto", at(11, 30), at(12, 0), [EMAIL.marina], "remoto"),
  meeting("trimestral", "Planejamento do trimestre", at(13, 0), at(14, 0), [EMAIL.marina], "remoto"),
  meeting("refinamento", "Refinamento", at(14, 0), at(15, 0), [EMAIL.marina, EMAIL.renata, EMAIL.diego, EMAIL.luana, EMAIL.caio, EMAIL.tiago, EMAIL.rafael], "sala"),
  meeting("plano-testes", "Plano de testes do checkout", at(15, 0), at(15, 30), [EMAIL.rafael, EMAIL.marina], "remoto"),
  meeting("um-a-um", "1:1 Marina e Renata", at(16, 0), at(16, 30), [EMAIL.marina, EMAIL.renata], "sala"),
];

export const CHANNELS = ["squad-portal", "squad-vendas", "tecnologia", "design", "incidentes"] as const;

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
