import { useCallback, useEffect, useRef, useState } from "react";
import { chatMessagesFromHermes, type ChatMessage, type HermesMessageInput } from "@/integrations/hermes/chatMessages";

/** Intervalo de releitura com o chat aberto: perto do tempo de uma resposta. */
export const CHAT_POLL_MS = 4000;

export interface SessionMessagesState {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  /** O que fazer para resolver, quando o proxy reconhece a causa. */
  action: string | null;
  refresh: () => void;
}

/**
 * Mensagens de uma sessão do bot, relidas enquanto o chat está aberto.
 *
 * O id do bot é o nome do perfil no Hermes — o dashboard só acha a sessão no
 * store daquele perfil. Uma falha de releitura mantém as mensagens já lidas
 * e mostra o erro, em vez de esvaziar a conversa.
 */
export function useSessionMessages(botId: string, sessionId: string): SessionMessagesState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    setMessages([]);
    setLoading(true);
    setError(null);
    setAction(null);
  }, [botId, sessionId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      try {
        const response = await fetch(
          `/api/hq/hermes/sessions/${encodeURIComponent(sessionId)}/messages?profile=${encodeURIComponent(botId)}`,
          { signal: current.signal, headers: { accept: "application/json" } },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          messages?: HermesMessageInput[];
          error?: string;
          action?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setError(payload.error ?? `HTTP ${response.status}`);
          setAction(payload.action ?? null);
        } else {
          setMessages(chatMessagesFromHermes(payload.messages ?? []));
          setError(null);
          setAction(null);
        }
      } catch (failure) {
        if (cancelled || (failure instanceof DOMException && failure.name === "AbortError")) return;
        setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, CHAT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      controller.current?.abort();
    };
  }, [botId, sessionId, tick]);

  return { messages, loading, error, action, refresh };
}
