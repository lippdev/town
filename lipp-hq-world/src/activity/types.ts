/**
 * O modelo do trabalho do setor de tecnologia, no formato das ferramentas de verdade:
 * Notion (Projeto → Épico → HU → critérios de aceite), GitHub (PRs, revisões, CI, deploys),
 * Slack (só sinais: status, huddle, canal com movimento) e Microsoft 365 (agenda e presença).
 *
 * Nada aqui sabe de onde os dados vêm. A simulação e os conectores reais entregam a mesma coisa:
 * um retrato inicial (`ActivitySnapshot`) e eventos normalizados (`ActivityEvent`). Este arquivo
 * não importa React nem three.
 */

/** Instante em milissegundos desde 1970, em UTC. A tela converte para o horário de Brasília. */
export type Instant = number;

export type Source = "notion" | "github" | "slack" | "m365" | "bot" | "app";

export const SOURCE_LABEL: Record<Source, string> = {
  notion: "Notion",
  github: "GitHub",
  slack: "Slack",
  m365: "Microsoft 365",
  bot: "Bot",
  app: "Lipp HQ",
};

// ─── Pessoas e identidade ─────────────────────────────────────────────────────

export type Role = "po" | "design" | "techlead" | "dev" | "diretor";

export const ROLE_LABEL: Record<Role, string> = {
  po: "Produto",
  design: "UX",
  techlead: "Tech lead",
  dev: "Desenvolvimento",
  diretor: "Diretoria",
};

/**
 * Uma pessoa do squad. O e-mail corporativo é a chave: Notion, Slack e Microsoft 365 identificam
 * por ele. O GitHub é pessoal, e só entra quando a pessoa vincula o login no cadastro.
 */
export interface Person {
  email: string;
  name: string;
  role: Role;
  /** Cargo como aparece no cadastro: "Dev back-end", "PO sênior", "Tech lead"… */
  title: string;
  /** Login do GitHub vinculado no cadastro; nulo é "ainda não vinculou". */
  github: string | null;
}

/**
 * Quem fez. Cada fonte fala do jeito dela: Notion, Slack e M365 já chegam com e-mail; o GitHub
 * chega com login, e a ligação com a pessoa é feita na leitura, pelo cadastro. Assim vincular o
 * GitHub atribui também o que já tinha acontecido.
 */
export type Actor =
  | { kind: "person"; email: string }
  | { kind: "github"; login: string }
  | { kind: "bot"; botId: string }
  /** O próprio Lipp HQ, nas ações que alguém pede pela tela. */
  | { kind: "app" };

/** Sobre o quê. */
export type Subject =
  | { kind: "project"; id: string }
  | { kind: "epic"; id: string }
  | { kind: "story"; id: string }
  | { kind: "pr"; number: number }
  | { kind: "deploy"; id: string }
  | { kind: "meeting"; id: string }
  | { kind: "huddle"; id: string }
  | { kind: "channel"; id: string }
  | { kind: "person"; email: string };

// ─── Notion ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  /** Responsável pelo projeto no Notion. */
  owner: string;
}

export type Track = "discovery" | "delivery";

export const TRACK_LABEL: Record<Track, string> = { discovery: "Discovery", delivery: "Delivery" };

/** O caminho de um épico: as três etapas do discovery levam às quatro do delivery. */
export const EPIC_STAGES = [
  { id: "ideia", track: "discovery", label: "Ideia" },
  { id: "pesquisa", track: "discovery", label: "Pesquisa" },
  { id: "validado", track: "discovery", label: "Validado" },
  { id: "planejado", track: "delivery", label: "Planejado" },
  { id: "andamento", track: "delivery", label: "Em andamento" },
  { id: "homologacao", track: "delivery", label: "Homologação" },
  { id: "entregue", track: "delivery", label: "Entregue" },
] as const satisfies ReadonlyArray<{ id: string; track: Track; label: string }>;

export type EpicStatus = (typeof EPIC_STAGES)[number]["id"];

export const trackOf = (status: EpicStatus): Track => EPIC_STAGES.find((stage) => stage.id === status)!.track;
export const EPIC_STATUS_LABEL = Object.fromEntries(EPIC_STAGES.map((stage) => [stage.id, stage.label])) as Record<EpicStatus, string>;

export interface Epic {
  id: string;
  projectId: string;
  title: string;
  owner: string;
  /** Status do épico no Notion. Quem atualiza é gente ou bot; pode estar atrás do GitHub. */
  status: EpicStatus;
  statusUpdatedAt: Instant;
  /** Data combinada de entrega. */
  due: Instant;
}

export type StoryStatus = "backlog" | "pronta" | "andamento" | "revisao" | "qa" | "concluida";

export const STORY_STATUS_LABEL: Record<StoryStatus, string> = {
  backlog: "Backlog",
  pronta: "Pronta",
  andamento: "Em andamento",
  revisao: "Em revisão",
  qa: "Em QA",
  concluida: "Concluída",
};

export const STORY_FLOW: readonly StoryStatus[] = ["backlog", "pronta", "andamento", "revisao", "qa", "concluida"];

export interface Criterion {
  id: string;
  text: string;
  done: boolean;
  /** Bot que sugeriu, quando não foi gente. A sugestão fica marcada até alguém revisar. */
  suggestedBy?: string;
}

export interface Blocker {
  reason: string;
  /** Quem precisa agir para destravar, quando se sabe. */
  waitingOn: string | null;
  since: Instant;
}

/** História de usuário. */
export interface Story {
  /** "HU-31": é este id que liga a HU ao PR, pelo título ou pela branch. */
  id: string;
  epicId: string;
  title: string;
  assignee: string | null;
  status: StoryStatus;
  criteria: Criterion[];
  blocked: Blocker | null;
  createdAt: Instant;
  /** Último movimento no Notion. Commit não conta: a HU parada é a que ninguém atualiza. */
  updatedAt: Instant;
}

// ─── GitHub ──────────────────────────────────────────────────────────────────

export type ReviewState = "approved" | "changes_requested" | "commented";
export type CiState = "pending" | "success" | "failure";

export const CI_LABEL: Record<CiState, string> = { pending: "CI rodando", success: "CI passou", failure: "CI quebrado" };
export const REVIEW_LABEL: Record<ReviewState, string> = { approved: "aprovou", changes_requested: "pediu mudanças", commented: "comentou" };

export interface Review {
  by: string;
  state: ReviewState;
  at: Instant;
}

export interface PullRequest {
  number: number;
  title: string;
  branch: string;
  /** Login de quem abriu. Vira pessoa só se alguém tiver vinculado esse login. */
  author: string;
  /** HU ligada pelo id no título ou na branch; nula quando o PR não cita nenhuma. */
  storyId: string | null;
  state: "open" | "merged" | "closed";
  draft: boolean;
  /** Logins com revisão pedida e ainda sem resposta. */
  reviewers: string[];
  reviews: Review[];
  ci: CiState | null;
  ciSince: Instant | null;
  openedAt: Instant;
  updatedAt: Instant;
  mergedAt: Instant | null;
  /** Resumo escrito por um bot, a pedido. */
  summary: { text: string; by: string; at: Instant } | null;
}

export type Environment = "homologacao" | "producao";
export const ENVIRONMENT_LABEL: Record<Environment, string> = { homologacao: "homologação", producao: "produção" };

export interface Deploy {
  id: string;
  environment: Environment;
  numbers: number[];
  status: "success" | "failure";
  at: Instant;
  by: string;
}

// ─── Microsoft 365 ───────────────────────────────────────────────────────────

/** Os valores de `availability` do Teams (Graph `presence`), em português. */
export type Availability = "disponivel" | "ocupado" | "reuniao" | "naoperturbe" | "ausente" | "offline";

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  disponivel: "Disponível",
  ocupado: "Ocupado",
  reuniao: "Em reunião",
  naoperturbe: "Não perturbe",
  ausente: "Ausente",
  offline: "Offline",
};

export interface CalendarEvent {
  id: string;
  title: string;
  start: Instant;
  end: Instant;
  attendees: string[];
  /** "sala" é a sala de reunião do andar; "remoto" é chamada, da própria mesa. */
  place: "sala" | "remoto";
  /**
   * A reunião acontece num huddle deste canal do Slack (a daily): quem está na sala é quem entrou
   * no huddle, não quem foi convidado. O convite só diz quem falta.
   */
  huddleChannel?: string;
}

// ─── Slack (só sinais) ───────────────────────────────────────────────────────

export interface SlackStatus {
  emoji: string;
  text: string;
}

export interface Huddle {
  id: string;
  channel: string;
  participants: string[];
  startedAt: Instant;
  endedAt: Instant | null;
}

/** Movimento num canal: só contagem e horário. O conteúdo nunca entra aqui. */
export interface ChannelPulse {
  id: string;
  lastAt: Instant;
  today: number;
}

/**
 * A única mensagem com texto no modelo: a que o próprio Lipp HQ (ou um bot dele) envia numa
 * ação. Mensagem entre pessoas não existe aqui, nem como contagem por pessoa.
 */
export interface AppMessage {
  id: string;
  from: { kind: "app" } | { kind: "bot"; botId: string };
  /** E-mail de quem recebe, ou "#canal". */
  to: string;
  /** Quem a mensagem marca no canal (o "@Nome"): é a quem a cobrança se dirige. */
  mentions?: string[];
  text: string;
  at: Instant;
  about: Subject | null;
}

// ─── Bots ────────────────────────────────────────────────────────────────────

export type BotTaskKind = "resumir_pr" | "completar_criterios" | "cobrar_revisao" | "atualizar_epico" | "pauta_daily";

export const BOT_TASK_LABEL: Record<BotTaskKind, string> = {
  resumir_pr: "Resumir PR",
  completar_criterios: "Completar critérios de aceite",
  cobrar_revisao: "Cobrar revisão",
  atualizar_epico: "Atualizar status do épico pelo GitHub",
  pauta_daily: "Preparar pauta da daily",
};

export interface BotTask {
  id: string;
  botId: string;
  kind: BotTaskKind;
  target: Subject;
  /** "app" quando alguém pediu pela tela; "rotina" quando é trabalho agendado do bot. */
  requestedBy: "app" | "rotina";
  startedAt: Instant;
  doneAt: Instant | null;
  result: string | null;
}

// ─── Retrato ─────────────────────────────────────────────────────────────────

/**
 * Tudo o que se sabe num instante. A sincronização inicial de um conector real entrega isto; a
 * partir daí só chegam eventos.
 */
export interface ActivitySnapshot {
  at: Instant;
  people: Person[];
  projects: Project[];
  epics: Epic[];
  stories: Story[];
  prs: PullRequest[];
  deploys: Deploy[];
  calendar: CalendarEvent[];
  presence: Record<string, Availability>;
  slackStatus: Record<string, SlackStatus | null>;
  huddles: Huddle[];
  channels: Record<string, ChannelPulse>;
  messages: AppMessage[];
  botTasks: BotTask[];
}
