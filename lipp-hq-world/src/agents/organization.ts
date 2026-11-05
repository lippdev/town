/**
 * Como a equipe se organiza. O Hermes não informa hierarquia nem equipes: isto é definido
 * aqui, a partir das funções dos agentes, e é o único lugar a mudar para reorganizar.
 */
export const ORG_OWNER = { name: "Filipe", role: "Responsável pela equipe" } as const;

/** A linha de comando, de cima para baixo. As equipes respondem ao último nome da lista. */
export const ORG_LEADERSHIP: readonly string[] = ["argos", "forge"];

export interface OrgTeamDefinition {
  id: string;
  name: string;
  purpose: string;
  members: readonly string[];
}

export const ORG_TEAMS: readonly OrgTeamDefinition[] = [
  {
    id: "produto-engenharia",
    name: "Produto e Engenharia",
    purpose: "Decide o que construir e acompanha a entrega.",
    members: ["atlas", "pulse", "scout"],
  },
  {
    id: "comunicacao",
    name: "Comunicação",
    purpose: "Conversa com a audiência e publica o que a equipe faz.",
    members: ["echo", "ink"],
  },
];

export interface OrgChart<Bot> {
  leadership: Bot[];
  teams: Array<Omit<OrgTeamDefinition, "members"> & { members: Bot[] }>;
  /** Bots da frota que ainda não têm lugar definido aqui. */
  unassigned: Bot[];
}

/** Monta o organograma só com quem existe na frota, sem inventar ninguém nem esconder ninguém. */
export function buildOrgChart<Bot extends { id: string }>(bots: readonly Bot[]): OrgChart<Bot> {
  const byId = new Map(bots.map((bot) => [bot.id, bot]));
  const present = (ids: readonly string[]) => ids.flatMap((id) => {
    const bot = byId.get(id);
    return bot ? [bot] : [];
  });
  const placed = new Set([...ORG_LEADERSHIP, ...ORG_TEAMS.flatMap((team) => team.members)]);
  return {
    leadership: present(ORG_LEADERSHIP),
    teams: ORG_TEAMS
      .map((team) => ({ ...team, members: present(team.members) }))
      .filter((team) => team.members.length > 0),
    unassigned: bots.filter((bot) => !placed.has(bot.id)),
  };
}
