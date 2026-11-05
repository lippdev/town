import type { ConversationItem } from "./conversationModel";

const MINUTE = 60_000;

type Script = (at: (minutesAgo: number) => number) => ConversationItem[];

/** Conversas fictícias dos sete bots de referência. Nenhuma linha vem de atividade real. */
const SCRIPTS: Record<string, Script> = {
  pulse: (at) => [
    { kind: "message", id: "pulse-1", author: "user", text: "O CI da main está vermelho desde o último merge?", at: at(14) },
    {
      kind: "steps",
      id: "pulse-2",
      tools: ["GitHub", "CI"],
      durationMs: 38_000,
      steps: [
        { id: "pulse-2a", label: "Li as últimas 12 execuções do CI" },
        { id: "pulse-2b", label: "Comparei o merge #212 com o commit anterior" },
        { id: "pulse-2c", label: "Rodei o teste que falha contra as duas versões" },
      ],
    },
    {
      kind: "consult",
      id: "pulse-3",
      withBotId: "argos",
      question: "Alguém mudou a imagem do runner hoje?",
      answer: "Não. A infraestrutura está igual desde ontem à noite.",
    },
    { kind: "message", id: "pulse-4", author: "bot", text: "Achei a causa: o merge #212 removeu uma variável que o teste de release ainda lê. O caminho mais rápido é reverter e refazer a mudança com calma.", at: at(13) },
    {
      kind: "approval",
      id: "pulse-5",
      title: "Pulse quer reverter o merge #212 na main",
      detail: "Desfaz só esse merge. O CI deve voltar ao verde em cerca de 4 minutos.",
      fields: [
        { label: "Ação", value: "Reverter merge" },
        { label: "Repositório", value: "lipp-hq-world" },
        { label: "Quem decide", value: "você" },
      ],
      expires: "expira em 24 h",
    },
  ],
  argos: (at) => [
    { kind: "message", id: "argos-1", author: "user", text: "Como está a operação hoje?", at: at(52) },
    { kind: "message", id: "argos-2", author: "bot", text: "Tudo estável. Duas rotinas rodaram de madrugada sem falha e nenhum alerta ficou aberto. O único ponto de atenção é o CI da main, que o Pulse já está investigando.", at: at(51) },
  ],
  forge: (at) => [
    { kind: "message", id: "forge-1", author: "bot", text: "O briefing de hoje está pronto: três PRs esperando revisão, uma decisão sua sobre o CI e o rascunho do post de lançamento para ler.", at: at(35) },
    { kind: "message", id: "forge-2", author: "user", text: "Coloca o post como prioridade depois do CI.", at: at(30) },
    { kind: "message", id: "forge-3", author: "bot", text: "Feito. Avisei Ink e reordenei o briefing.", at: at(29) },
  ],
  echo: (at) => [
    { kind: "message", id: "echo-1", author: "user", text: "O que a comunidade achou da última versão?", at: at(90) },
    {
      kind: "steps",
      id: "echo-2",
      tools: ["Discord", "GitHub"],
      durationMs: 116_000,
      steps: [
        { id: "echo-2a", label: "Li 84 mensagens desde o lançamento" },
        { id: "echo-2b", label: "Agrupei as issues novas por assunto" },
      ],
    },
    { kind: "message", id: "echo-3", author: "bot", text: "No geral, positivo. A reclamação que mais se repete é a falta de atalho para a busca. Escrevi uma resposta curta reconhecendo isso.", at: at(88) },
    {
      kind: "approval",
      id: "echo-4",
      title: "Echo quer publicar a resposta no Discord",
      detail: "Sai no canal #novidades, assinada pela equipe.",
      fields: [
        { label: "Canal", value: "#novidades" },
        { label: "Alcance", value: "cerca de 1.200 pessoas" },
        { label: "Quem decide", value: "você" },
      ],
      expires: "expira em 9 h",
    },
  ],
  scout: (at) => [
    { kind: "message", id: "scout-1", author: "bot", text: "Encontrei duas ferramentas novas de orquestração de agentes que valem uma olhada. Nenhuma ameaça o que estamos construindo, mas uma tem uma boa ideia de aprovação por ação.", at: at(180) },
  ],
  atlas: (at) => [
    { kind: "message", id: "atlas-1", author: "user", text: "Resume o que entra no próximo ciclo.", at: at(240) },
    { kind: "message", id: "atlas-2", author: "bot", text: "Três frentes: conversas no centro do produto, kanban ligado aos bots e memória revisável. Deixei o restante no backlog com o motivo de cada corte.", at: at(238) },
  ],
  ink: (at) => [
    { kind: "message", id: "ink-1", author: "bot", text: "O rascunho do post está pronto para você ler. Deixei duas opções de título no topo.", at: at(25) },
  ],
};

export function demoThread(botId: string, now: number): ConversationItem[] {
  return SCRIPTS[botId]?.((minutesAgo) => now - minutesAgo * MINUTE) ?? [];
}

/** A resposta na demonstração nunca finge ter feito o que foi pedido. */
export const demoReply = (botName: string) =>
  `Esta é uma resposta de exemplo: nada foi enviado nem executado. Com o Hermes conectado, sua mensagem iria para uma sessão real de ${botName}.`;
