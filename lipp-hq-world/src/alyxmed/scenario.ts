import type { OfficeScenario, ScenarioBot, ScenarioPanel, ScenarioPost } from "@/world/office/officeScenario";

/**
 * A Alyx Med na demonstração do prédio: a equipe de bots da própria empresa, seis equipes de três,
 * cada uma no seu andar, e a direção. Fonte única do cenário: a cena e a interface leem só daqui.
 *
 * Só tipos podem ser importados aqui (ver `officeScenario.ts`): este arquivo chega antes do prédio.
 * Tudo é exemplo. Clínicas, números e conversas são fictícios; as imagens são as oficiais publicadas
 * em alyxmed.com.br, em `public/alyxmed/`.
 */

const ASSETS = "/alyxmed";
const LOGO_RATIO = 1920 / 742.48;
const SCREEN_RATIO = 1128 / 705;
const INK = "#111829";

const quarter = Math.PI / 2;
/** Parede do fundo (norte) e parede oeste do andar, por dentro. */
const NORTH = -8.9;
const WEST = -11.1;

/** A marca na parede do fundo, acima da placa com o nome do andar. */
const logoPlaque = (x = -0.2): ScenarioPanel => ({ url: `${ASSETS}/logo-texto-claro.svg`, at: [x, 2.42, NORTH], width: 2.6, height: 0.62, background: INK, pad: 0.14, ratio: LOGO_RATIO });
/** Uma tela do sistema, como TV de parede. */
const screen = (file: string, at: readonly [number, number, number], rotationY = 0, width = 2.4): ScenarioPanel => ({ url: `${ASSETS}/${file}`, at, width, height: width / SCREEN_RATIO, rotationY, background: "#0b1220", pad: 0.04, ratio: SCREEN_RATIO });

const post = (key: string, zone: string, x: number, z: number, yaw: number): ScenarioPost => ({ key, zone, x, z, yaw });

const TEAM_COLOR = {
  direcao: "#2c8ea7",
  leads: "#0ea5e9",
  tarefas: "#f59e0b",
  social: "#ec4899",
  dev: "#8b5cf6",
  performance: "#22c55e",
  processos: "#f97316",
} as const;

type TeamId = Exclude<keyof typeof TEAM_COLOR, "direcao">;

const bot = (team: TeamId | null, id: string, name: string, role: string, responsibility: string, seat: string): ScenarioBot => ({
  id: `alyx-${id}`,
  name,
  role,
  responsibility,
  color: TEAM_COLOR[team ?? "direcao"],
  team,
  seat,
});

const BOTS: ScenarioBot[] = [
  bot(null, "alyx", "Alyx", "Direção geral", "Coordena as seis equipes e prepara o resumo do dia para o Filipe.", "comando-0"),

  bot("leads", "lia", "Lia", "Qualificação de leads", "Qualifica as clínicas que chegam pelo site e pelas campanhas.", "expansao-5-cabine-1"),
  bot("leads", "davi", "Davi", "Prospecção de clínicas", "Encontra clínicas com o perfil do Alyx Med e faz o primeiro contato.", "expansao-5-cabine-2"),
  bot("leads", "bia", "Bia", "Agenda de demonstrações", "Marca a demonstração do Alyx Med com a clínica e prepara o roteiro.", "expansao-5-bancada"),

  bot("tarefas", "otto", "Otto", "Backlog e prioridades", "Organiza o backlog da empresa e propõe a prioridade da semana.", "expansao-4-quadro"),
  bot("tarefas", "nina", "Nina", "Prazos e rotina", "Acompanha prazos e cobra o que está parado.", "expansao-4-mesa-a"),
  bot("tarefas", "rui", "Rui", "Atas e combinados", "Registra decisões das reuniões e transforma em tarefas.", "expansao-4-mesa-b"),

  bot("social", "mel", "Mel", "Pauta e calendário", "Planeja a pauta do Instagram e do LinkedIn.", "expansao-2-bancada-a"),
  bot("social", "caio", "Caio", "Posts e carrosséis", "Escreve e monta posts e carrosséis para aprovação.", "expansao-2-bancada-b"),
  bot("social", "lara", "Lara", "Respostas e comentários", "Responde comentários e mensagens no Instagram e no LinkedIn.", "expansao-2-bancada-c"),

  bot("dev", "theo", "Theo", "Agenda e prontuário com IA", "Constrói a agenda e o prontuário com transcrição por IA.", "expansao-3-posto-1"),
  bot("dev", "iris", "Iris", "Convênios e faturamento", "Cuida de convênios, guias e faturamento sem glosa.", "expansao-3-posto-2"),
  bot("dev", "enzo", "Enzo", "Financeiro e qualidade", "Cuida do módulo financeiro e dos testes antes de cada entrega.", "expansao-3-posto-3"),

  bot("performance", "gael", "Gael", "Campanhas", "Monta e ajusta as campanhas de mídia paga para clínicas.", "expansao-7-mesa-1"),
  bot("performance", "vera", "Vera", "CPL e funil", "Acompanha o custo por lead e onde o funil perde clínicas.", "expansao-7-mesa-2"),
  bot("performance", "dora", "Dora", "Conversão de trial", "Acompanha as clínicas em teste até virarem clientes.", "expansao-7-mesa-3"),

  bot("processos", "ana", "Ana", "Onboarding de clínicas", "Conduz a implantação: importa agenda, cadastros e usuários.", "engenharia-0"),
  bot("processos", "leo", "Leo", "Suporte", "Atende as dúvidas das clínicas e abre chamado para o Desenvolvimento.", "comunidade-0"),
  bot("processos", "clara", "Clara", "LGPD e SIPNI", "Cuida da LGPD e do envio de vacinas ao SIPNI.", "pesquisa-0"),
];

const demo = (text: string) => `${text} Demonstração: dados fictícios.`;

export const ALYXMED: OfficeScenario = {
  id: "alyxmed",
  brand: {
    name: "Alyx Med",
    slogan: "Da agenda ao DRE, sua clínica em um sistema só.",
    site: "alyxmed.com.br",
    logoOnDark: `${ASSETS}/logo-texto-claro.svg`,
    logoOnLight: `${ASSETS}/logo-texto-escuro.svg`,
    icon: `${ASSETS}/icon-512.png`,
    colors: { primary: "#2c8ea7", deep: "#1d6b82", ink: INK, paper: "#f3f4f6" },
  },
  owner: { name: "Filipe", role: "Responsável pela Alyx Med" },
  leadership: ["alyx-alyx"],
  teams: [
    { id: "leads", name: "Leads", floor: "expansao-5" },
    { id: "tarefas", name: "Tarefas", floor: "expansao-4" },
    { id: "social", name: "Social Media", floor: "expansao-2" },
    { id: "dev", name: "Desenvolvimento", floor: "expansao-3" },
    { id: "performance", name: "Performance", floor: "expansao-7" },
    { id: "processos", name: "Processos", floor: "operacao" },
  ],
  bots: BOTS,
  floors: {
    "expansao-2": {
      level: 2,
      openShaft: 0,
      title: "Social Media",
      zones: {
        bancadas: { name: "Estúdio de conteúdo", purpose: demo("Pauta, posts e respostas do Instagram e do LinkedIn.") },
        lounge: { name: "Lounge", purpose: demo("Onde a equipe de Social Media se reúne.") },
        apoio: { name: "Apoio", purpose: demo("Armários e material de gravação.") },
      },
      posts: [post("bancada-a", "bancadas", -7.3, -4.83, 0), post("bancada-b", "bancadas", -5.6, -4.83, 0), post("bancada-c", "bancadas", -3.9, -4.83, 0)],
      panels: [logoPlaque(), screen("mod-visao.jpg", [WEST, 1.85, 0], quarter)],
    },
    "expansao-3": {
      level: 3,
      openShaft: 1,
      title: "Desenvolvimento",
      zones: {
        "baia-norte": { name: "Produto clínico", purpose: demo("Agenda, prontuário com IA e convênios.") },
        "baia-sul": { name: "Financeiro e qualidade", purpose: demo("Módulo financeiro e testes antes de cada entrega.") },
        reuniao: { name: "Sala de revisão", purpose: demo("Revisão de código e planejamento da entrega.") },
        apoio: { name: "Apoio", purpose: demo("Armários e equipamentos de teste.") },
      },
      posts: [post("posto-1", "baia-norte", -8.4, -6.8, quarter), post("posto-2", "baia-norte", -8.4, -3, quarter), post("posto-3", "baia-sul", -8.4, 3, quarter)],
      panels: [logoPlaque(), screen("mod-clinica.jpg", [WEST, 2.1, 0], quarter)],
    },
    "expansao-4": {
      level: 4,
      openShaft: 2,
      title: "Tarefas",
      zones: {
        oficina: { name: "Quadro de prioridades", purpose: demo("Backlog da empresa e prioridade da semana.") },
        mesas: { name: "Mesas de planejamento", purpose: demo("Prazos, rotina e combinados das reuniões.") },
        apoio: { name: "Apoio", purpose: demo("Balcão de apoio.") },
      },
      posts: [post("quadro", "oficina", -2.4, -7.3, -0.3), post("mesa-a", "mesas", -6.4, 4.7, 0), post("mesa-b", "mesas", 0.4, 4.7, 0)],
      panels: [logoPlaque(), screen("mod-visao.jpg", [WEST, 1.85, -1.6], quarter)],
    },
    "expansao-5": {
      level: 5,
      openShaft: 0,
      title: "Leads",
      zones: {
        cabines: { name: "Cabines de contato", purpose: demo("Prospecção e qualificação de clínicas.") },
        bancada: { name: "Agenda de demos", purpose: demo("Demonstrações do Alyx Med marcadas com as clínicas.") },
        jardim: { name: "Lounge", purpose: demo("Espaço da equipe de Leads.") },
      },
      posts: [post("cabine-1", "cabines", -9.6, -6.75, quarter), post("cabine-2", "cabines", -9.6, -2.25, quarter), post("bancada", "bancada", -1.2, -1.83, 0)],
      panels: [logoPlaque(), screen("mod-clinica.jpg", [-8.3, 1.85, NORTH])],
    },
    "expansao-7": {
      base: "expansao-5",
      level: 7,
      openShaft: 1,
      title: "Performance",
      zones: {
        cabines: { name: "Salas de análise", purpose: demo("Funil, CPL e conversão de trial.") },
        bancada: { name: "Mesa de performance", purpose: demo("Campanhas de mídia paga para clínicas.") },
        jardim: { name: "Lounge", purpose: demo("Espaço da equipe de Performance.") },
      },
      posts: [post("mesa-1", "bancada", -2.6, -1.83, 0), post("mesa-2", "bancada", -1.2, -1.83, 0), post("mesa-3", "bancada", 0.2, -1.83, 0)],
      panels: [logoPlaque(), screen("mod-financeiro.jpg", [-8.3, 1.85, NORTH])],
    },
  },
  operacao: {
    title: "Processos",
    rooms: {
      engenharia: { name: "Onboarding", purpose: demo("Implantação das clínicas novas: agenda, cadastros e usuários.") },
      comando: { name: "Direção geral", purpose: demo("A Alyx coordena as equipes e resume o dia para o Filipe.") },
      comunidade: { name: "Suporte", purpose: demo("Dúvidas das clínicas e chamados para o Desenvolvimento.") },
      pesquisa: { name: "LGPD e SIPNI", purpose: demo("Proteção de dados e envio de vacinas ao SIPNI.") },
      hall: { name: "Hall", purpose: demo("Recepção do andar e bancada compartilhada.") },
      produto: { name: "Base de conhecimento", purpose: demo("Manuais e respostas prontas do suporte.") },
      conteudo: { name: "Treinamento", purpose: demo("Treinamento das equipes das clínicas.") },
      operacoes: { name: "Implantação", purpose: demo("Acompanhamento das clínicas em implantação.") },
      reunioes: { name: "Reuniões", purpose: demo("Mesa de reunião do andar.") },
    },
    panels: [logoPlaque(-1.9), screen("mod-financeiro.jpg", [WEST, 1.8, -6.6], quarter, 2.2)],
  },
  lobby: { panels: [{ url: `${ASSETS}/logo-texto-claro.svg`, at: [-4.35, 1.8, -8.8], width: 4.8, height: 1.1, background: INK, pad: 0.16, ratio: LOGO_RATIO }] },
  facade: { url: `${ASSETS}/logo-texto-claro.svg`, background: INK, pad: 0.16, ratio: LOGO_RATIO },
};
