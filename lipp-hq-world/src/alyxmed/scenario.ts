import type { ConversationItem } from "@/components/office/conversationModel";
import type { OfficeScenario, ScenarioBot, ScenarioMeeting, ScenarioPanel, ScenarioPost, ScenarioSpot, ScenarioTask } from "@/world/office/officeScenario";

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

const meet = (title: string, start: string, end: string): ScenarioMeeting => ({ title, start, end });
/** Três lugares de pé lado a lado, de frente para a câmera. */
const row = (x: number, z: number, gap = 1.2, yaw = 0): ScenarioSpot[] => [-1, 0, 1].map((step) => ({ x: x + step * gap, z, yaw }));
/** Atrás do sofá do lounge, no andar de Leads e no de Performance (a mesma planta). */
const LOUNGE_SPOTS = row(8, 3.4, 1.1);

const demo = (text: string) => `${text} Demonstração: dados fictícios.`;

/** Cartão de exemplo. As clínicas e os números são inventados para a demonstração. */
const task = (owner: string, n: number, column: ScenarioTask["column"], title: string): ScenarioTask => ({ id: `alyx-${owner}-${n}`, owner: `alyx-${owner}`, title, column });

const TASKS: ScenarioTask[] = [
  task("alyx", 1, "fazendo", "Resumo do dia das seis equipes para o Filipe"),
  task("alyx", 2, "revisao", "Prioridade da semana: prontuário com IA antes do app do paciente"),

  task("lia", 1, "fazendo", "Qualificar 12 clínicas que pediram teste pelo site"),
  task("lia", 2, "revisao", "Clínica Bem Viver: plano de 5 profissionais, aguardando aprovação do desconto"),
  task("lia", 3, "feito", "Separar leads de odontologia dos de medicina"),
  task("davi", 1, "fazendo", "Lista de clínicas de dermatologia em Campinas para o primeiro contato"),
  task("davi", 2, "afazer", "Mensagem de retorno para quem não respondeu em 7 dias"),
  task("davi", 3, "revisao", "Primeira mensagem para clínicas de dermatologia, aguardando aprovação do texto"),
  task("bia", 1, "fazendo", "Clínica Vida+ pediu demo do prontuário com IA, agendada qui 14h"),
  task("bia", 2, "revisao", "Roteiro da demo para clínicas com convênio"),
  task("bia", 3, "feito", "Demo da Odonto Sorriso Pleno feita, enviar proposta"),

  task("otto", 1, "fazendo", "Ordenar o backlog da semana por impacto nas clínicas"),
  task("otto", 2, "revisao", "Proposta: adiar o relatório de comissões para a próxima sprint"),
  task("nina", 1, "fazendo", "Cobrar as 4 tarefas paradas há mais de 3 dias"),
  task("nina", 2, "afazer", "Prazo da implantação da Clínica São Lucas: sexta"),
  task("nina", 3, "revisao", "Novo prazo do relatório de glosas, aguardando aprovação"),
  task("rui", 1, "fazendo", "Ata da reunião de prioridades, com dono para cada combinado"),
  task("rui", 2, "feito", "Transformar os combinados de ontem em 6 tarefas"),
  task("rui", 3, "revisao", "Ata da reunião de prioridades, aguardando aprovação"),

  task("mel", 1, "fazendo", "Calendário de novembro: 3 posts por semana no Instagram"),
  task("mel", 2, "afazer", "Pauta: o que a LGPD exige do prontuário eletrônico"),
  task("mel", 3, "revisao", "Calendário de dezembro, aguardando aprovação"),
  task("caio", 1, "revisao", "Carrossel 'faturamento de convênios sem glosa', aguardando aprovação"),
  task("caio", 2, "fazendo", "Post 'da agenda ao DRE' com a tela de visão geral"),
  task("caio", 3, "feito", "Vídeo curto: confirmação de consulta pelo WhatsApp"),
  task("lara", 1, "fazendo", "Responder 9 comentários do post sobre prontuário com IA"),
  task("lara", 2, "revisao", "Resposta padrão para quem pergunta o preço nos comentários"),

  task("theo", 1, "revisao", "PR: transcrição por IA no prontuário, revisão"),
  task("theo", 2, "fazendo", "Agenda: arrastar consulta entre profissionais"),
  task("theo", 3, "feito", "Correção do lembrete duplicado de consulta"),
  task("iris", 1, "fazendo", "Validação da guia TISS antes do envio ao convênio"),
  task("iris", 2, "afazer", "Relatório de glosas por convênio"),
  task("iris", 3, "revisao", "PR: aviso de campo errado na guia TISS, revisão"),
  task("enzo", 1, "fazendo", "Testes do fechamento de caixa no módulo financeiro"),
  task("enzo", 2, "revisao", "PR: DRE por unidade da clínica, revisão"),

  task("gael", 1, "fazendo", "Campanha Clínicas RJ: trocar os criativos da semana"),
  task("gael", 2, "revisao", "Nova campanha para clínicas de odontologia, aguardando aprovação do orçamento"),
  task("vera", 1, "fazendo", "CPL da campanha Clínicas RJ caiu 18% na semana"),
  task("vera", 2, "afazer", "Onde o funil perde clínicas entre o teste e a demo"),
  task("vera", 3, "revisao", "Relatório semanal do funil, aguardando aprovação"),
  task("dora", 1, "fazendo", "Acompanhar 7 clínicas no 10º dia de teste"),
  task("dora", 2, "revisao", "E-mail de fim de teste com oferta de implantação"),

  task("ana", 1, "fazendo", "Onboarding da Clínica São Lucas: importar agenda"),
  task("ana", 2, "afazer", "Cadastrar os 6 usuários da Clínica Aurora"),
  task("ana", 3, "feito", "Treinamento da recepção do Centro Médico Horizonte"),
  task("ana", 4, "revisao", "Plano de implantação da Clínica Aurora, aguardando aprovação"),
  task("leo", 1, "fazendo", "Chamado: Clínica Vida+ não vê o repasse do mês"),
  task("leo", 2, "revisao", "Abrir chamado no Desenvolvimento: lembrete fora do horário"),
  task("clara", 1, "fazendo", "Envio das vacinas da semana ao SIPNI"),
  task("clara", 2, "revisao", "Termo de consentimento LGPD para o prontuário com IA"),
];

const say = (id: string, author: "user" | "bot", text: string): ConversationItem => ({ kind: "message", id, author, text });
const ask = (id: string, title: string, detail: string, fields: Array<[string, string]>): ConversationItem => ({
  kind: "approval",
  id,
  title,
  detail,
  fields: [...fields.map(([label, value]) => ({ label, value })), { label: "Quem decide", value: "você" }],
  expires: "expira em 24 h",
});

/** Conversas de exemplo com o Filipe. Nenhuma linha vem de atividade real. */
const TALKS: Record<string, ConversationItem[]> = {
  "alyx-alyx": [
    say("alyx-1", "user", "Como estão as equipes hoje?"),
    say("alyx-2", "bot", "Tudo andando. Leads tem a demo da Clínica Vida+ na quinta, Desenvolvimento está revisando a transcrição por IA e Performance investiga a queda do CPL no RJ. Duas coisas esperam você: o carrossel de convênios e o desconto da Clínica Bem Viver."),
  ],
  "alyx-lia": [
    say("lia-1", "bot", "Das 12 clínicas que pediram teste ontem, 5 têm o perfil ideal: mais de 3 profissionais e convênio. Já passei as 5 para a Bia marcar demo."),
    ask("lia-2", "Lia quer oferecer 10% de desconto à Clínica Bem Viver", "Plano de 5 profissionais, pagamento anual. Exemplo da demonstração.", [["Clínica", "Bem Viver (fictícia)"], ["Desconto", "10% no anual"]]),
  ],
  "alyx-davi": [
    say("davi-1", "user", "Achou clínicas novas para contato?"),
    say("davi-2", "bot", "Montei uma lista de 20 clínicas de dermatologia em Campinas que ainda usam agenda em planilha. Mando a primeira mensagem amanhã cedo."),
  ],
  "alyx-bia": [
    say("bia-1", "bot", "A Clínica Vida+ pediu demo do prontuário com IA. Agendei quinta às 14h com a diretora e a recepção."),
    say("bia-2", "user", "Mostra também o faturamento de convênios, eles atendem três."),
    say("bia-3", "bot", "Combinado, coloquei no roteiro logo depois do prontuário."),
  ],
  "alyx-otto": [
    say("otto-1", "bot", "Reordenei o backlog: o prontuário com IA sobe, o relatório de comissões desce. Quer ver a proposta?"),
    ask("otto-2", "Otto quer adiar o relatório de comissões", "Vai para a próxima sprint, para o Desenvolvimento fechar a transcrição por IA.", [["Sprint", "atual → próxima"]]),
  ],
  "alyx-nina": [
    say("nina-1", "bot", "Quatro tarefas estão paradas há mais de 3 dias. Já cobrei os donos; a mais antiga é o relatório de glosas da Iris."),
  ],
  "alyx-rui": [
    say("rui-1", "user", "Registrou o que combinamos na reunião de prioridades?"),
    say("rui-2", "bot", "Sim. Seis combinados, cada um com dono e prazo, já estão no Kanban."),
  ],
  "alyx-mel": [
    say("mel-1", "bot", "O calendário de novembro está pronto: três posts por semana, com um tema de LGPD e um de convênios."),
  ],
  "alyx-caio": [
    say("caio-1", "bot", "Terminei o carrossel 'faturamento de convênios sem glosa': são 7 telas, com a tela do módulo financeiro no fim."),
    ask("caio-2", "Caio quer publicar o carrossel no Instagram", "Sai amanhã às 11h, no perfil da Alyx Med. Exemplo da demonstração.", [["Rede", "Instagram"], ["Quando", "amanhã, 11h"]]),
  ],
  "alyx-lara": [
    say("lara-1", "bot", "O post sobre prontuário com IA teve 9 comentários com dúvidas. Respondi 6; os 3 sobre preço eu deixei para você ver a resposta padrão."),
  ],
  "alyx-theo": [
    say("theo-1", "user", "Como está a transcrição por IA no prontuário?"),
    { kind: "steps", id: "theo-2", tools: ["GitHub", "Testes"], steps: [{ id: "theo-2a", label: "Rodei os testes do prontuário" }, { id: "theo-2b", label: "Abri o PR da transcrição para revisão" }] },
    { kind: "consult", id: "theo-3", withBotId: "alyx-clara", question: "A transcrição pode guardar o áudio da consulta?", answer: "Só com consentimento do paciente. Guarde o texto e descarte o áudio." },
    say("theo-4", "bot", "O PR está em revisão. Segui a orientação da Clara: o áudio é descartado depois da transcrição."),
  ],
  "alyx-iris": [
    say("iris-1", "bot", "Estou validando a guia TISS antes do envio: os campos errados agora aparecem antes de a guia sair, não depois da glosa."),
  ],
  "alyx-enzo": [
    say("enzo-1", "bot", "Os testes do fechamento de caixa passaram. O PR do DRE por unidade está esperando revisão do Theo."),
  ],
  "alyx-gael": [
    say("gael-1", "bot", "Troquei os criativos da campanha Clínicas RJ. A nova campanha de odontologia está pronta, falta o orçamento."),
    ask("gael-2", "Gael quer ativar a campanha de odontologia", "Orçamento de exemplo, só para a demonstração.", [["Campanha", "Clínicas de odontologia"], ["Duração", "14 dias"]]),
  ],
  "alyx-vera": [
    say("vera-1", "user", "Por que o CPL do RJ mudou?"),
    say("vera-2", "bot", "O CPL da campanha Clínicas RJ caiu 18% na semana depois da troca de criativos. O vídeo de confirmação pelo WhatsApp foi o que mais trouxe clínicas."),
  ],
  "alyx-dora": [
    say("dora-1", "bot", "Sete clínicas estão no 10º dia de teste. Três já usam a agenda todo dia; escrevi o e-mail de fim de teste para as outras quatro."),
  ],
  "alyx-ana": [
    say("ana-1", "bot", "Comecei o onboarding da Clínica São Lucas: importar a agenda dos últimos 6 meses e cadastrar os profissionais."),
    say("ana-2", "user", "Precisa de algo deles?"),
    say("ana-3", "bot", "Só a planilha de convênios. Já pedi à recepção."),
  ],
  "alyx-leo": [
    say("leo-1", "bot", "A Clínica Vida+ não vê o repasse do mês. Parece filtro de data; vou abrir chamado no Desenvolvimento se não for."),
  ],
  "alyx-clara": [
    say("clara-1", "bot", "O envio das vacinas da semana ao SIPNI está em andamento. Também revisei o termo de consentimento para o prontuário com IA."),
  ],
};

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
    { id: "leads", name: "Leads", floor: "expansao-5", meetingRoom: "expansao-5-jardim", spots: LOUNGE_SPOTS, meetings: [meet("Daily de Leads", "09:00", "09:30"), meet("Revisão das demos da semana", "15:00", "15:30")] },
    { id: "tarefas", name: "Tarefas", floor: "expansao-4", meetingRoom: "expansao-4-oficina", spots: row(-6.6, -5.75), meetings: [meet("Prioridades do dia", "09:30", "10:00"), meet("Fechamento do dia", "16:30", "17:00")] },
    { id: "social", name: "Social Media", floor: "expansao-2", meetingRoom: "expansao-2-lounge", spots: row(6.8, 3.2), meetings: [meet("Pauta da semana", "10:00", "10:30"), meet("Aprovação de posts", "14:00", "14:30")] },
    { id: "dev", name: "Desenvolvimento", floor: "expansao-3", meetingRoom: "expansao-3-reuniao", spots: row(6.8, 3.6, 1.4), meetings: [meet("Daily de Desenvolvimento", "09:15", "09:45"), meet("Revisão de PRs", "14:30", "15:00")] },
    { id: "performance", name: "Performance", floor: "expansao-7", meetingRoom: "expansao-7-jardim", spots: LOUNGE_SPOTS, meetings: [meet("Leitura do funil", "10:30", "11:00"), meet("Ajuste das campanhas", "16:00", "16:30")] },
    { id: "processos", name: "Processos", floor: "operacao", meetingRoom: "reunioes", spots: row(7.1, 4.8, 1.1), meetings: [meet("Clínicas em implantação", "11:00", "11:30"), meet("Chamados da semana", "15:30", "16:00")] },
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
  activity: { seed: 20261116, tasks: TASKS, talks: TALKS },
};
