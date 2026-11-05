/**
 * Como a equipe se organiza. O Hermes não informa hierarquia nem equipes: isto é definido
 * aqui, a partir das funções dos agentes, e é o único lugar a mudar para reorganizar.
 */
export const ORG_OWNER = { name: "Filipe", role: "Responsável pela equipe" } as const;

/** A linha de comando, de cima para baixo. As equipes respondem ao último nome da lista. */
export const ORG_LEADERSHIP: readonly string[] = ["argos"];

export interface OrgGroupDefinition {
  id: string;
  /** A função que reúne este subgrupo. */
  name: string;
  members: readonly string[];
}

export interface OrgTeamDefinition {
  id: string;
  name: string;
  groups: readonly OrgGroupDefinition[];
}

export const ORG_TEAMS: readonly OrgTeamDefinition[] = [
  {
    id: "open-source",
    name: "Open Source",
    groups: [
      { id: "coordenacao", name: "Coordenação", members: ["forge"] },
      { id: "github", name: "GitHub Intelligence", members: ["pulse"] },
      { id: "product-operations", name: "Product Operations", members: ["atlas"] },
      { id: "pesquisa", name: "Pesquisa", members: ["scout"] },
      { id: "comunidade", name: "Comunidade", members: ["echo"] },
      { id: "conteudo", name: "Conteúdo", members: ["ink"] },
    ],
  },
];

export interface OrgChart<Bot> {
  leadership: Bot[];
  teams: Array<{
    id: string;
    name: string;
    size: number;
    groups: Array<{ id: string; name: string; members: Bot[] }>;
  }>;
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
  const placed = new Set([
    ...ORG_LEADERSHIP,
    ...ORG_TEAMS.flatMap((team) => team.groups.flatMap((group) => group.members)),
  ]);
  return {
    leadership: present(ORG_LEADERSHIP),
    teams: ORG_TEAMS.flatMap((team) => {
      const groups = team.groups
        .map((group) => ({ id: group.id, name: group.name, members: present(group.members) }))
        .filter((group) => group.members.length > 0);
      const size = groups.reduce((total, group) => total + group.members.length, 0);
      return size > 0 ? [{ id: team.id, name: team.name, size, groups }] : [];
    }),
    unassigned: bots.filter((bot) => !placed.has(bot.id)),
  };
}
