import { activeScenario } from "@/world/office/officeScenario";

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
      { id: "comunidade", name: "Comunidade", members: ["echo"] },
      { id: "pesquisa", name: "Pesquisa", members: ["scout"] },
      { id: "product-operations", name: "Product Operations", members: ["atlas"] },
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

/** Quem responde pela equipe: o dono, ou o responsável no cenário de empresa. */
export const orgOwner = (): { name: string; role: string } => activeScenario()?.owner ?? ORG_OWNER;

/** A organização em uso: a do HQ, ou a do cenário de empresa, com um subgrupo por função. */
function orgDefinition(): { leadership: readonly string[]; teams: readonly OrgTeamDefinition[] } {
  const scenario = activeScenario();
  if (!scenario) return { leadership: ORG_LEADERSHIP, teams: ORG_TEAMS };
  return {
    leadership: scenario.leadership,
    teams: scenario.teams.map((team) => ({
      id: team.id,
      name: team.name,
      groups: scenario.bots.filter((bot) => bot.team === team.id).map((bot) => ({ id: bot.id, name: bot.role, members: [bot.id] })),
    })),
  };
}

/** Monta o organograma só com quem existe na frota, sem inventar ninguém nem esconder ninguém. */
export function buildOrgChart<Bot extends { id: string }>(bots: readonly Bot[]): OrgChart<Bot> {
  const definition = orgDefinition();
  const byId = new Map(bots.map((bot) => [bot.id, bot]));
  const present = (ids: readonly string[]) => ids.flatMap((id) => {
    const bot = byId.get(id);
    return bot ? [bot] : [];
  });
  const placed = new Set([
    ...definition.leadership,
    ...definition.teams.flatMap((team) => team.groups.flatMap((group) => group.members)),
  ]);
  return {
    leadership: present(definition.leadership),
    teams: definition.teams.flatMap((team) => {
      const groups = team.groups
        .map((group) => ({ id: group.id, name: group.name, members: present(group.members) }))
        .filter((group) => group.members.length > 0);
      const size = groups.reduce((total, group) => total + group.members.length, 0);
      return size > 0 ? [{ id: team.id, name: team.name, size, groups }] : [];
    }),
    unassigned: bots.filter((bot) => !placed.has(bot.id)),
  };
}

export interface RosterSection<Bot> {
  id: string;
  name: string;
  /** Só equipe recolhe: Direção e os sem lugar ficam sempre à vista. */
  collapsible: boolean;
  bots: Bot[];
}

/** A lista da sidebar: mesma organização do organograma, na ordem dele, sem seção vazia. */
export function buildRosterSections<Bot extends { id: string }>(bots: readonly Bot[]): RosterSection<Bot>[] {
  const { leadership, teams, unassigned } = buildOrgChart(bots);
  const sections: RosterSection<Bot>[] = [
    { id: "direcao", name: "Direção", collapsible: false, bots: leadership },
    ...teams.map((team) => ({
      id: team.id,
      name: team.name,
      collapsible: true,
      bots: team.groups.flatMap((group) => group.members),
    })),
    { id: "sem-equipe", name: "Sem equipe definida", collapsible: false, bots: unassigned },
  ];
  return sections.filter((section) => section.bots.length > 0);
}
