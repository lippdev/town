import type { AgentDefinition } from "@/types/hq";

/** Os sete agentes existentes no OpenMausBot. Nomes e funções não são renomeados. */
export const AGENTS: AgentDefinition[] = [
  {
    id: "argos",
    name: "Argos",
    role: "Direção geral",
    responsibility: "Supervisão da operação e da infraestrutura.",
    roomId: "operacoes",
    color: "#2563eb",
    accent: "#93c5fd",
  },
  {
    id: "forge",
    name: "Forge",
    role: "Coordenação operacional",
    responsibility: "Coordena o fluxo de Open Source e consolida o briefing executivo.",
    roomId: "comando",
    color: "#f97316",
    accent: "#fdba74",
  },
  {
    id: "pulse",
    name: "Pulse",
    role: "GitHub Intelligence",
    responsibility: "Commits, pull requests, CI e releases.",
    roomId: "engenharia",
    color: "#3b82f6",
    accent: "#22d3ee",
  },
  {
    id: "echo",
    name: "Echo",
    role: "Comunidade",
    responsibility: "Feedback e audiência.",
    roomId: "comunidade",
    color: "#a855f7",
    accent: "#d8b4fe",
  },
  {
    id: "scout",
    name: "Scout",
    role: "Pesquisa",
    responsibility: "Discovery, oportunidades e riscos.",
    roomId: "pesquisa",
    color: "#22c55e",
    accent: "#86efac",
  },
  {
    id: "atlas",
    name: "Atlas",
    role: "Product Operations",
    responsibility: "Backlog, PRDs e documentação de produto.",
    roomId: "produto",
    color: "#f59e0b",
    accent: "#fcd34d",
  },
  {
    id: "ink",
    name: "Ink",
    role: "Conteúdo",
    responsibility: "Editorial e comunicação.",
    roomId: "conteudo",
    color: "#ec4899",
    accent: "#f9a8d4",
  },
];

export const AGENTS_BY_ID: Record<string, AgentDefinition> = Object.fromEntries(
  AGENTS.map((agent) => [agent.id, agent]),
);

export const HALL_ROOM_ID = "hall";
export const MEETING_ROOM_ID = "reunioes";

/** Projetos acompanhados pela Lipp HQ, exibidos em painel contextual discreto. */
export const PROJECTS = [
  "Console Mode",
  "Tako Launcher",
  "Tako Store",
  "JoyChromium",
  "Postaí",
] as const;
