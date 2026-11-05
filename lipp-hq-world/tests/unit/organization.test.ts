import { describe, expect, it } from "vitest";
import { AGENTS } from "@/agents/agents";
import { ORG_LEADERSHIP, ORG_TEAMS, buildOrgChart } from "@/agents/organization";

const ids = (bots: Array<{ id: string }>) => bots.map((bot) => bot.id);

describe("organização", () => {
  it("coloca cada agente de referência em exatamente um lugar", () => {
    const placed = [
      ...ORG_LEADERSHIP,
      ...ORG_TEAMS.flatMap((team) => team.groups.flatMap((group) => group.members)),
    ];
    expect([...placed].sort()).toEqual(AGENTS.map((agent) => agent.id).sort());
  });

  it("deixa todos abaixo do Argos na equipe Open Source, divididos por função", () => {
    const chart = buildOrgChart(AGENTS);
    expect(ids(chart.leadership)).toEqual(["argos"]);
    expect(chart.teams.map((team) => [team.name, team.size])).toEqual([["Open Source", 6]]);
    expect(chart.teams[0]!.groups.map((group) => [group.name, ids(group.members)])).toEqual([
      ["Coordenação", ["forge"]],
      ["GitHub Intelligence", ["pulse"]],
      ["Product Operations", ["atlas"]],
      ["Pesquisa", ["scout"]],
      ["Comunidade", ["echo"]],
      ["Conteúdo", ["ink"]],
    ]);
    expect(chart.unassigned).toEqual([]);
  });

  it("mostra só quem existe na frota e tira subgrupos vazios", () => {
    const chart = buildOrgChart([{ id: "pulse" }]);
    expect(chart.leadership).toEqual([]);
    expect(chart.teams[0]!.size).toBe(1);
    expect(chart.teams[0]!.groups.map((group) => group.name)).toEqual(["GitHub Intelligence"]);
  });

  it("tira a equipe quando nenhum membro está na frota", () => {
    expect(buildOrgChart([{ id: "argos" }]).teams).toEqual([]);
  });

  it("não esconde bot sem lugar definido", () => {
    expect(ids(buildOrgChart([{ id: "novo" }, { id: "argos" }]).unassigned)).toEqual(["novo"]);
  });
});
