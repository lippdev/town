import type { ChatMessage } from "@/integrations/hermes/chatMessages";

/** Um passo do trabalho do agente, recolhido para a conversa continuar legível. */
export interface ConversationStep {
  id: string;
  label: string;
  /** Resultado devolvido pela ferramenta, quando o Hermes o gravou. */
  detail?: string;
}

/** Decisão registrada num pedido de aprovação: o recibo fica na própria conversa. */
export interface ApprovalDecision {
  kind: "approved" | "refused";
  at: number;
}

export type ConversationItem =
  | { kind: "message"; id: string; author: "user" | "bot"; text: string; at?: number }
  | { kind: "steps"; id: string; steps: ConversationStep[]; tools: string[]; durationMs?: number }
  /** Só existem na demonstração: o Hermes ainda não expõe conversa entre bots nem aprovações. */
  | { kind: "consult"; id: string; withBotId: string; question: string; answer: string }
  | {
      kind: "approval";
      id: string;
      title: string;
      detail: string;
      fields: Array<{ label: string; value: string }>;
      expires: string;
      decision?: ApprovalDecision;
    };

/**
 * Mensagens do Hermes como blocos de conversa: as chamadas de ferramenta entre
 * dois textos viram um único bloco de passos. A duração só existe quando o
 * Hermes gravou os dois horários; sem isso, nada é estimado.
 */
export function conversationFromMessages(messages: readonly ChatMessage[]): ConversationItem[] {
  const items: ConversationItem[] = [];
  let block: { id: string; steps: ConversationStep[]; first?: number; last?: number } | null = null;

  const flush = () => {
    if (!block) return;
    const { id, steps, first, last } = block;
    const durationMs = first !== undefined && last !== undefined && last > first ? last - first : undefined;
    const tools = [...new Set(steps.map((step) => step.label))];
    items.push({ kind: "steps", id, steps, tools, ...(durationMs !== undefined ? { durationMs } : {}) });
    block = null;
  };
  const open = (id: string, at: number | undefined) => {
    block ??= { id: `steps-${id}`, steps: [] };
    if (at !== undefined) {
      block.first ??= at;
      block.last = at;
    }
    return block;
  };

  for (const message of messages) {
    if (message.role === "tool") {
      const current = open(message.id, message.at);
      const label = message.toolName ?? "ferramenta";
      const waiting = current.steps.find((step) => step.label === label && step.detail === undefined);
      if (waiting) waiting.detail = message.text;
      else current.steps.push({ id: message.id, label, detail: message.text });
      continue;
    }
    if (message.text) {
      flush();
      items.push({ kind: "message", id: message.id, author: message.role === "user" ? "user" : "bot", text: message.text, at: message.at });
    }
    if (message.tools?.length) {
      const current = open(message.id, message.at);
      message.tools.forEach((tool, index) => current.steps.push({ id: `${message.id}-${index}`, label: tool }));
    }
  }
  flush();
  return items;
}

export function formatDuration(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60) return `${seconds} s`;
  const rest = seconds % 60;
  return rest ? `${Math.floor(seconds / 60)} min ${rest} s` : `${Math.floor(seconds / 60)} min`;
}

/** "3 passos · terminal, web · 41 s": o suficiente para saber o que aconteceu sem abrir. */
export function stepsSummary(item: Extract<ConversationItem, { kind: "steps" }>): string {
  const count = `${item.steps.length} ${item.steps.length === 1 ? "passo" : "passos"}`;
  return [count, item.tools.join(", "), item.durationMs !== undefined ? formatDuration(item.durationMs) : ""].filter(Boolean).join(" · ");
}

export const pendingApprovals = (items: readonly ConversationItem[]): number =>
  items.filter((item) => item.kind === "approval" && !item.decision).length;

/** Uma decisão é definitiva: decidir de novo não reescreve o recibo. */
export function decideApproval(items: readonly ConversationItem[], id: string, decision: ApprovalDecision): ConversationItem[] {
  return items.map((item) => (item.kind === "approval" && item.id === id && !item.decision ? { ...item, decision } : item));
}
