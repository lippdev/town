import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, SendHorizontal, Wrench } from "lucide-react";
import type { SessionSnapshot } from "@/integrations/hq/types";
import type { ChatMessage } from "@/integrations/hermes/chatMessages";
import { MAX_CHAT_CHARS } from "@/integrations/hermes/sendMessage";
import { useSessionConversation } from "@/integrations/hermes/useSessionConversation";
import { useGatewayStatus } from "@/integrations/hermes/gatewayStatus";
import { sessionTitle, sourceLabel } from "@/components/hud/sessions";
import { relativeTime } from "@/components/hud/fleetView";

/** Distância do fim (px) em que a conversa ainda acompanha mensagens novas. */
const STICK_TO_BOTTOM_PX = 80;
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
  const { messages, loading, error, action, refresh, outgoing: visibleOutgoing, thinking, send, retry, discard } = useSessionConversation(botId, session.id);
  const status = useGatewayStatus();
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement | null>(null);
  const atBottom = useRef(true);
  const lastId = messages.length ? messages[messages.length - 1].id : null;

  useLayoutEffect(() => {
    const node = scroller.current;
    if (node && atBottom.current) node.scrollTop = node.scrollHeight;
  }, [lastId, messages.length, visibleOutgoing.length, thinking]);

  useEffect(() => {
    atBottom.current = true;
  }, [session.id]);

  const submit = () => {
    atBottom.current = true;
    if (send(draft)) setDraft("");
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
                  <button type="button" onClick={() => { atBottom.current = true; retry(entry); }}>
                    tentar de novo
                  </button>
                  <button type="button" onClick={() => discard(entry.id)}>
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
