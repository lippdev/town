import { useCallback, useEffect, useState } from "react";
import type { ChatMessage } from "@/integrations/hermes/chatMessages";
import { MAX_CHAT_CHARS, sendSessionMessage } from "@/integrations/hermes/sendMessage";
import { useSessionMessages, type SessionMessagesState } from "@/integrations/hermes/useSessionMessages";

/** Folga de relógio entre esta máquina e o Hermes ao casar a mensagem enviada. */
const ECHO_SLACK_MS = 15_000;
/** Quanto a cópia local de uma mensagem entregue espera pela releitura. */
const SENT_LINGER_MS = 10_000;

/** Mensagem enviada daqui que o Hermes ainda não devolveu na releitura. */
export interface Outgoing {
  id: string;
  text: string;
  at: number;
  state: "sending" | "sent" | "failed";
  error?: string;
  action?: string;
}

/**
 * Some da lista local quando a releitura já traz a mesma mensagem do usuário
 * — o Hermes grava no começo do turno, então isso acontece antes da resposta.
 */
export function echoed(outgoing: Pick<Outgoing, "text" | "at">, messages: ChatMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === "user" &&
      message.text.trim() === outgoing.text.trim() &&
      (message.at === undefined || message.at >= outgoing.at - ECHO_SLACK_MS),
  );
}

export interface SessionConversation extends SessionMessagesState {
  outgoing: Outgoing[];
  /** Há um turno em andamento, enviado daqui. */
  thinking: boolean;
  send: (text: string) => boolean;
  retry: (entry: Outgoing) => void;
  discard: (id: string) => void;
}

/** Leitura e envio de uma sessão do Hermes, sem nenhuma decisão de layout. */
export function useSessionConversation(botId: string, sessionId: string): SessionConversation {
  const state = useSessionMessages(botId, sessionId);
  const { messages, refresh } = state;
  const [list, setList] = useState<Outgoing[]>([]);

  useEffect(() => setList([]), [sessionId]);

  // depois que a releitura trouxe a mensagem e o turno acabou, a cópia local sai
  useEffect(() => {
    setList((current) => {
      const kept = current.filter((entry) => entry.state !== "sent" || !echoed(entry, messages));
      return kept.length === current.length ? current : kept;
    });
  }, [messages]);

  const deliver = useCallback(async (entry: Outgoing) => {
    setList((current) => [...current.filter((item) => item.id !== entry.id), { ...entry, state: "sending" }]);
    const result = await sendSessionMessage(botId, sessionId, entry.text);
    setList((current) =>
      current.map((item) =>
        item.id !== entry.id
          ? item
          : result.ok
            ? { ...item, state: "sent" }
            : { ...item, state: "failed", error: result.error, action: result.action },
      ),
    );
    refresh();
    // se o Hermes gravar a mensagem com outro texto, a cópia local não fica para sempre
    if (result.ok) {
      window.setTimeout(() => setList((current) => current.filter((item) => item.id !== entry.id)), SENT_LINGER_MS);
    }
  }, [botId, sessionId, refresh]);

  const send = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text || text.length > MAX_CHAT_CHARS) return false;
    void deliver({ id: `out-${Date.now()}`, text, at: Date.now(), state: "sending" });
    return true;
  }, [deliver]);

  return {
    ...state,
    outgoing: list.filter((entry) => entry.state === "failed" || !echoed(entry, messages)),
    thinking: list.some((entry) => entry.state === "sending"),
    send,
    retry: (entry) => void deliver(entry),
    discard: (id) => setList((current) => current.filter((item) => item.id !== id)),
  };
}
