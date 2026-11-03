import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, SendHorizontal, Wrench } from "lucide-react";
import type { SessionSnapshot } from "@/integrations/hq/types";
import type { ChatMessage } from "@/integrations/hermes/chatMessages";
import { useSessionMessages } from "@/integrations/hermes/useSessionMessages";
import { MAX_CHAT_CHARS, sendSessionMessage } from "@/integrations/hermes/sendMessage";
import { useGatewayStatus } from "@/integrations/hermes/gatewayStatus";
import { sessionTitle, sourceLabel } from "@/components/hud/sessions";
import { relativeTime } from "@/components/hud/fleetView";

/** Distância do fim (px) em que a conversa ainda acompanha mensagens novas. */
const STICK_TO_BOTTOM_PX = 80;
/** Folga de relógio entre esta máquina e o Hermes ao casar a mensagem enviada. */
const ECHO_SLACK_MS = 15_000;
/** Quanto a cópia local de uma mensagem entregue espera pela releitura. */
const SENT_LINGER_MS = 10_000;

/** Mensagem enviada daqui que o Hermes ainda não devolveu na releitura. */
interface Outgoing {
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

function clock(at: number | undefined): string {
  if (!at) return "";
  return new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function Bubble({ message, botName }: { message: ChatMessage; botName: string }) {
  if (message.role === "tool") {
    return (
      <details className="chat-tool">
        <summary>
          <Wrench size={11} aria-hidden /> resultado de <strong>{message.toolName}</strong>
        </summary>
        {message.text && <pre>{message.text}</pre>}
      </details>
    );
  }
  const mine = message.role === "user";
  return (
    <div className={mine ? "chat-msg chat-user" : "chat-msg chat-bot"}>
      <span className="chat-author">
        {mine ? "Você" : botName}
        {message.at && <time dateTime={new Date(message.at).toISOString()}>{clock(message.at)}</time>}
      </span>
      {message.text && <p className="chat-text">{message.text}</p>}
      {message.tools && (
        <span className="chat-tools">
          {message.tools.map((tool, index) => (
            <span key={`${tool}-${index}`} className="chat-tool-pill">
              <Wrench size={10} aria-hidden /> {tool}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/**
 * Conversa de uma sessão do bot, lida do Hermes e relida enquanto aberta.
 *
 * Acompanha o fim só se o usuário já estava lá: quem rolou para cima para ler
 * o começo não é puxado de volta a cada releitura.
 */
export function SessionChat({
  botId,
  botName,
  session,
  onBack,
}: {
  botId: string;
  botName: string;
  session: SessionSnapshot;
  onBack: () => void;
}) {
  const { messages, loading, error, action, refresh } = useSessionMessages(botId, session.id);
  const status = useGatewayStatus();
  const [draft, setDraft] = useState("");
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const scroller = useRef<HTMLDivElement | null>(null);
  const atBottom = useRef(true);
  const lastId = messages.length ? messages[messages.length - 1].id : null;
  const visibleOutgoing = outgoing.filter((entry) => entry.state === "failed" || !echoed(entry, messages));
  const thinking = outgoing.some((entry) => entry.state === "sending");

  useLayoutEffect(() => {
    const node = scroller.current;
    if (node && atBottom.current) node.scrollTop = node.scrollHeight;
  }, [lastId, messages.length, visibleOutgoing.length, thinking]);

  useEffect(() => {
    atBottom.current = true;
    setOutgoing([]);
  }, [session.id]);

  // depois que a releitura trouxe a mensagem e o turno acabou, a cópia local sai
  useEffect(() => {
    setOutgoing((list) => {
      const kept = list.filter((entry) => entry.state !== "sent" || !echoed(entry, messages));
      return kept.length === list.length ? list : kept;
    });
  }, [messages]);

  const deliver = async (entry: Outgoing) => {
    atBottom.current = true;
    setOutgoing((list) => [...list.filter((item) => item.id !== entry.id), { ...entry, state: "sending" }]);
    const result = await sendSessionMessage(botId, session.id, entry.text);
    setOutgoing((list) =>
      list.map((item) =>
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
      window.setTimeout(() => setOutgoing((list) => list.filter((item) => item.id !== entry.id)), SENT_LINGER_MS);
    }
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || text.length > MAX_CHAT_CHARS) return;
    setDraft("");
    void deliver({ id: `out-${Date.now()}`, text, at: Date.now(), state: "sending" });
  };

  return (
    <section className="chat" aria-label={`Conversa: ${sessionTitle(session)}`}>
      <header className="chat-head">
        <button type="button" className="chat-back" onClick={onBack} aria-label="Voltar para as sessões">
          <ArrowLeft size={15} aria-hidden />
        </button>
        <div className="chat-head-text">
          <strong title={sessionTitle(session)}>{sessionTitle(session)}</strong>
          <span>
            {sourceLabel(session.source)} · {relativeTime(session.lastActiveAt)}
            {session.active ? " · ativa" : ""}
          </span>
        </div>
        <button type="button" className="chat-back" onClick={refresh} aria-label="Ler de novo" title="Ler de novo">
          <RefreshCw size={14} aria-hidden />
        </button>
      </header>

      <div
        className="chat-log"
        ref={scroller}
        role="log"
        aria-live="polite"
        onScroll={(event) => {
          const node = event.currentTarget;
          atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < STICK_TO_BOTTOM_PX;
        }}
      >
        {loading && messages.length === 0 && <p className="chat-empty">Lendo a conversa no Hermes…</p>}
        {!loading && !error && messages.length === 0 && <p className="chat-empty">Sessão sem mensagens visíveis.</p>}
        {messages.map((message) => (
          <Bubble key={message.id} message={message} botName={botName} />
        ))}
        {visibleOutgoing.map((entry) => (
          <div key={entry.id} className={`chat-msg chat-user ${entry.state === "failed" ? "failed" : "pending"}`}>
            <span className="chat-author">
              Você <time dateTime={new Date(entry.at).toISOString()}>{clock(entry.at)}</time>
            </span>
            <p className="chat-text">{entry.text}</p>
            {entry.state === "failed" ? (
              <span className="chat-failed">
                Não enviada: {entry.error}
                {entry.action && <em> {entry.action}</em>}
                <span className="chat-failed-actions">
                  <button type="button" onClick={() => void deliver(entry)}>
                    tentar de novo
                  </button>
                  <button type="button" onClick={() => setOutgoing((list) => list.filter((item) => item.id !== entry.id))}>
                    descartar
                  </button>
                </span>
              </span>
            ) : (
              <span className="chat-status">{entry.state === "sending" ? "enviando…" : "entregue"}</span>
            )}
          </div>
        ))}
        {thinking && (
          <div className="chat-msg chat-bot chat-thinking" aria-label={`${botName} está respondendo`}>
            <span className="chat-author">{botName}</span>
            <p className="chat-text">
              <span className="chat-dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="panel-warn chat-error">
          {error}
          {action && <em> {action}</em>}
        </p>
      )}

      {status?.canSend ? (
        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <textarea
            className="chat-input"
            rows={2}
            placeholder={`Mensagem para ${botName}…`}
            value={draft}
            maxLength={MAX_CHAT_CHARS}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            aria-label={`Mensagem para ${botName}`}
          />
          <button type="submit" className="chat-send" disabled={!draft.trim()} aria-label="Enviar (Enter)" title="Enviar (Enter)">
            <SendHorizontal size={16} aria-hidden />
          </button>
        </form>
      ) : (
        <p className="chat-readonly">
          Só leitura. Para conversar com {botName}, habilite o envio em <strong>Integrações → API do Hermes</strong>.
        </p>
      )}
    </section>
  );
}
