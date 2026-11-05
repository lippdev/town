import { useCallback, useEffect, useRef, useState } from "react";
import { decideApproval, pendingApprovals, type ApprovalDecision, type ConversationItem } from "./conversationModel";
import { demoReply, demoThread } from "./demoConversations";

/** Pausa antes da resposta de exemplo: o suficiente para ler o próprio envio. */
const DEMO_REPLY_MS = 900;

export interface DemoConversations {
  threadOf: (botId: string) => ConversationItem[];
  typing: (botId: string) => boolean;
  pendingOf: (botId: string) => number;
  send: (botId: string, botName: string, text: string) => void;
  decide: (botId: string, approvalId: string, kind: ApprovalDecision["kind"]) => void;
}

/** Estado das conversas de exemplo. Vive só na memória: recarregar volta ao roteiro. */
export function useDemoConversations(botIds: readonly string[]): DemoConversations {
  const [now] = useState(() => Date.now());
  const [threads, setThreads] = useState<Record<string, ConversationItem[]>>({});
  const [typingIds, setTypingIds] = useState<readonly string[]>([]);
  const timers = useRef(new Set<number>());
  const nextId = useRef(0);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const threadOf = useCallback((botId: string) => threads[botId] ?? demoThread(botId, now), [threads, now]);

  const append = useCallback((botId: string, item: ConversationItem) => {
    setThreads((current) => ({ ...current, [botId]: [...(current[botId] ?? demoThread(botId, now)), item] }));
  }, [now]);

  const send = useCallback((botId: string, botName: string, text: string) => {
    const id = nextId.current++;
    append(botId, { kind: "message", id: `demo-out-${id}`, author: "user", text, at: Date.now() });
    setTypingIds((current) => [...current, botId]);
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      append(botId, { kind: "message", id: `demo-reply-${id}`, author: "bot", text: demoReply(botName), at: Date.now() });
      setTypingIds((current) => {
        const index = current.indexOf(botId);
        return current.filter((_, position) => position !== index);
      });
    }, DEMO_REPLY_MS);
    timers.current.add(timer);
  }, [append]);

  const decide = useCallback((botId: string, approvalId: string, kind: ApprovalDecision["kind"]) => {
    setThreads((current) => ({
      ...current,
      [botId]: decideApproval(current[botId] ?? demoThread(botId, now), approvalId, { kind, at: Date.now() }),
    }));
  }, [now]);

  return {
    threadOf,
    typing: (botId) => typingIds.includes(botId),
    pendingOf: (botId) => (botIds.includes(botId) ? pendingApprovals(threadOf(botId)) : 0),
    send,
    decide,
  };
}
