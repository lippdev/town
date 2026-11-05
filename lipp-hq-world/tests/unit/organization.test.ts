import { describe, expect, it } from "vitest";
import { AGENTS } from "@/agents/agents";
import { ORG_LEADERSHIP, ORG_TEAMS, buildOrgChart } from "@/agents/organization";

const ids = (bots: Array<{ id: string }>) => bots.map((bot) => bot.id);

describe("organização", () => {
  it("coloca cada agente de referência em exatamente um lugar", () => {
    const placed = [...ORG_LEADERSHIP, ...ORG_TEAMS.flatMap((team) => team.members)];
    expect([...placed].sort()).toEqual(AGENTS.map((agent) => agent.id).sort());
  });

  it("não sobra ninguém com a equipe completa", () => {
    const chart = buildOrgChart(AGENTS);
    expect(ids(chart.leadership)).toEqual(["argos", "forge"]);
    expect(chart.teams.map((team) => ids(team.members))).toEqual([["atlas", "pulse", "scout"], ["echo", "ink"]]);
    expect(chart.unassigned).toEqual([]);
  });

  it("mostra só quem existe na frota e tira equipes vazias", () => {
    const chart = buildOrgChart([{ id: "pulse" }]);
    expect(chart.leadership).toEqual([]);
    expect(chart.teams.map((team) => team.name)).toEqual(["Produto e Engenharia"]);
    expect(ids(chart.teams[0]!.members)).toEqual(["pulse"]);
  });

  it("não esconde bot sem lugar definido", () => {
    expect(ids(buildOrgChart([{ id: "novo" }, { id: "argos" }]).unassigned)).toEqual(["novo"]);
  });
});
