import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/integrations/hermes/chatMessages";
import { conversationFromMessages, decideApproval, formatDuration, pendingApprovals, stepsSummary, type ConversationItem } from "@/components/office/conversationModel";
import { demoReply, demoThread } from "@/components/office/demoConversations";
import { AGENTS } from "@/agents/agents";

describe("conversationFromMessages", () => {
  it("junta ferramentas e resultados entre dois textos num único bloco", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", text: "olha o CI", at: 1000 },
      { id: "2", role: "assistant", text: "", tools: ["terminal", "web"], at: 2000 },
      { id: "3", role: "tool", text: "saída", toolName: "terminal", at: 3000 },
      { id: "4", role: "assistant", text: "", tools: ["terminal"], at: 4000 },
      { id: "5", role: "tool", text: "outra", toolName: "terminal", at: 43_000 },
      { id: "6", role: "assistant", text: "Pronto.", at: 44_000 },
    ];
    const items = conversationFromMessages(messages);
    expect(items.map((item) => item.kind)).toEqual(["message", "steps", "message"]);
    const steps = items[1] as Extract<ConversationItem, { kind: "steps" }>;
    expect(steps.steps.map((step) => [step.label, step.detail])).toEqual([["terminal", "saída"], ["web", undefined], ["terminal", "outra"]]);
    expect(steps.tools).toEqual(["terminal", "web"]);
    expect(stepsSummary(steps)).toBe("3 passos · terminal, web · 41 s");
  });

  it("mantém o texto antes dos passos da mesma resposta", () => {
    const items = conversationFromMessages([{ id: "1", role: "assistant", text: "Vou ver.", tools: ["web"] }]);
    expect(items.map((item) => item.kind)).toEqual(["message", "steps"]);
  });

  it("não inventa duração sem os horários do Hermes", () => {
    const items = conversationFromMessages([
      { id: "1", role: "assistant", text: "", tools: ["web"] },
      { id: "2", role: "tool", text: "ok", toolName: "web" },
    ]);
    const steps = items[0] as Extract<ConversationItem, { kind: "steps" }>;
    expect(steps.durationMs).toBeUndefined();
    expect(stepsSummary(steps)).toBe("1 passo · web");
  });

  it("guarda resultado sem chamada correspondente como um passo próprio", () => {
    const items = conversationFromMessages([{ id: "1", role: "tool", text: "órfão", toolName: "web" }]);
    expect(items).toHaveLength(1);
    expect((items[0] as Extract<ConversationItem, { kind: "steps" }>).steps[0]).toMatchObject({ label: "web", detail: "órfão" });
  });
});

describe("formatDuration", () => {
  it("formata segundos e minutos", () => {
    expect(formatDuration(41_000)).toBe("41 s");
    expect(formatDuration(116_000)).toBe("1 min 56 s");
    expect(formatDuration(120_000)).toBe("2 min");
  });
});

describe("aprovações", () => {
  const approval: ConversationItem = { kind: "approval", id: "a", title: "t", detail: "d", fields: [], expires: "e" };

  it("conta só o que falta decidir", () => {
    const decided = decideApproval([approval], "a", { kind: "refused", at: 1 });
    expect(pendingApprovals([approval])).toBe(1);
    expect(pendingApprovals(decided)).toBe(0);
  });

  it("não reescreve uma decisão já tomada", () => {
    const first = decideApproval([approval], "a", { kind: "refused", at: 1 });
    const second = decideApproval(first, "a", { kind: "approved", at: 2 });
    expect(second).toEqual(first);
  });
});

describe("conversas de exemplo", () => {
  it("todo bot de referência tem conversa com ids únicos", () => {
    for (const agent of AGENTS) {
      const items = demoThread(agent.id, 1_000_000_000);
      expect(items.length, agent.id).toBeGreaterThan(0);
      expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    }
  });

  it("consultas citam bots que existem", () => {
    const ids = new Set(AGENTS.map((agent) => agent.id));
    for (const agent of AGENTS) {
      for (const item of demoThread(agent.id, 0)) {
        if (item.kind === "consult") expect(ids.has(item.withBotId)).toBe(true);
      }
    }
  });

  it("a resposta deixa claro que nada aconteceu", () => {
    expect(demoReply("Pulse")).toContain("nada foi enviado nem executado");
  });
});
