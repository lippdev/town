import { describe, expect, it } from "vitest";
import { AGENTS } from "@/agents/agents";
import { ORG_LEADERSHIP, ORG_TEAMS, buildOrgChart, buildRosterSections } from "@/agents/organization";

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
      ["Comunidade", ["echo"]],
      ["Pesquisa", ["scout"]],
      ["Product Operations", ["atlas"]],
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

describe("seções da sidebar", () => {
  const summary = (bots: Array<{ id: string }>) => buildRosterSections(bots).map((section) => [section.name, section.collapsible, ids(section.bots)]);

  it("separa a direção da equipe Open Source, que é a única que recolhe", () => {
    expect(summary(AGENTS)).toEqual([
      ["Direção", false, ["argos"]],
      ["Open Source", true, ["forge", "pulse", "echo", "scout", "atlas", "ink"]],
    ]);
  });

  it("some com a seção que ficou vazia, como numa busca", () => {
    expect(summary([{ id: "ink" }])).toEqual([["Open Source", true, ["ink"]]]);
    expect(summary([{ id: "argos" }])).toEqual([["Direção", false, ["argos"]]]);
    expect(summary([])).toEqual([]);
  });

  it("mostra quem não tem lugar definido em uma seção própria", () => {
    expect(summary([{ id: "novo" }])).toEqual([["Sem equipe definida", false, ["novo"]]]);
  });
});
