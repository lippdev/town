import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowUp, Bot, CheckCircle2, Clock3, Eye, ListPlus, MessagesSquare, RefreshCw, User, XCircle } from "lucide-react";
import { browserStorage } from "@/avatar/human/persistence";
import { relativeTime, stateLabel } from "@/components/hud/fleetView";
import { sessionTitle, sourceLabel } from "@/components/hud/sessions";
import { useGatewayStatus } from "@/integrations/hermes/gatewayStatus";
import { MAX_CHAT_CHARS } from "@/integrations/hermes/sendMessage";
import { useSessionConversation } from "@/integrations/hermes/useSessionConversation";
import type { SessionSnapshot } from "@/integrations/hq/types";
import { useHQStore } from "@/state/useHQStore";
import type { OfficeBot } from "@/world/office/officeRoster";
import { conversationFromMessages, stepsSummary, type ConversationItem } from "./conversationModel";
import { HoldToApprove } from "./HoldToApprove";
import { addCard, loadCards, saveCards } from "./kanbanModel";
import type { DemoConversations } from "./useDemoConversations";

/** Distância do fim (px) em que a conversa ainda acompanha mensagens novas. */
const STICK_TO_BOTTOM_PX = 80;

type ApprovalItem = Extract<ConversationItem, { kind: "approval" }>;

const clock = (at: number) => new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function BotAvatar({ bot, portrait, small = false }: { bot?: OfficeBot; portrait?: string; small?: boolean }) {
  return (
    <span className={small ? "conv-avatar small" : "conv-avatar"} style={{ "--agent-color": bot?.color } as CSSProperties} aria-hidden>
      {portrait ? <img src={portrait} alt="" /> : <Bot size={small ? 14 : 20} />}
    </span>
  );
}

function Author({ name, at }: { name: string; at?: number }) {
  return (
    <span className="conv-author">
      <strong>{name}</strong>
      {at !== undefined && <time dateTime={new Date(at).toISOString()}>{clock(at)}</time>}
    </span>
  );
}

function ApprovalCard({ item, bot, portrait, onDecide }: {
  item: ApprovalItem;
  bot: OfficeBot;
  portrait?: string;
  onDecide: (kind: "approved" | "refused") => void;
}) {
  return (
    <article className="conv-approval" style={{ "--agent-color": bot.color } as CSSProperties} data-approval={item.id}>
      <div className="conv-approval-top">
        <BotAvatar bot={bot} portrait={portrait} small />
        {item.decision ? (
          <span className={item.decision.kind === "approved" ? "conv-receipt approved" : "conv-receipt refused"} data-approval-receipt={item.decision.kind}>
            {item.decision.kind === "approved" ? <CheckCircle2 size={14} aria-hidden /> : <XCircle size={14} aria-hidden />}
            {item.decision.kind === "approved" ? "Aprovado" : "Recusado"} por você às {clock(item.decision.at)}
          </span>
        ) : (
          <span className="conv-waiting"><Clock3 size={13} aria-hidden /> Esperando você · {item.expires}</span>
        )}
      </div>
      <h3>{item.title}</h3>
      <p>{item.detail}</p>
      <dl>
        {item.fields.map((field) => (
          <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>
        ))}
      </dl>
      {item.decision ? (
        <p className="conv-note">Exemplo: nada foi executado.</p>
      ) : (
        <div className="conv-approval-actions">
          <HoldToApprove onApprove={() => onDecide("approved")} />
          <button type="button" className="conv-refuse" data-approve-refuse onClick={() => onDecide("refused")}>Recusar</button>
        </div>
      )}
    </article>
  );
}

function ItemView({ item, bot, botsById, portraits, onDecide, onCreateTask, taskDone }: {
  item: ConversationItem;
  bot: OfficeBot;
  botsById: Map<string, OfficeBot>;
  portraits: Record<string, string>;
  onDecide?: (id: string, kind: "approved" | "refused") => void;
  onCreateTask?: (id: string, text: string) => void;
  taskDone?: boolean;
}) {
  switch (item.kind) {
    case "message": {
      const mine = item.author === "user";
      return (
        <div className="conv-message" data-author={item.author}>
          {mine ? <span className="conv-avatar user" aria-hidden><User size={18} /></span> : <BotAvatar bot={bot} portrait={portraits[bot.id]} />}
          <div className="conv-body">
            <Author name={mine ? "Você" : bot.name} at={item.at} />
            <p>{item.text}</p>
            {!mine && onCreateTask && (
              taskDone
                ? <span className="conv-task done" data-task-created><CheckCircle2 size={13} aria-hidden /> Tarefa no Kanban</span>
                : <button type="button" className="conv-task" data-create-task onClick={() => onCreateTask(item.id, item.text)}><ListPlus size={13} aria-hidden /> Criar tarefa</button>
            )}
          </div>
        </div>
      );
    }
    case "steps":
      return (
        <details className="conv-steps">
          <summary><CheckCircle2 size={14} aria-hidden /> {stepsSummary(item)}</summary>
          <ol>
            {item.steps.map((step) => (
              <li key={step.id}>
                <span>{step.label}</span>
                {step.detail && <pre>{step.detail}</pre>}
              </li>
            ))}
          </ol>
        </details>
      );
    case "consult": {
      const other = botsById.get(item.withBotId);
      return (
        <aside className="conv-consult" data-consult>
          <BotAvatar bot={other} portrait={portraits[item.withBotId]} small />
          <div>
            <span className="conv-consult-head"><MessagesSquare size={12} aria-hidden /> {bot.name} perguntou a {other?.name ?? item.withBotId} · em particular</span>
            <p>{item.question}</p>
            <p className="dim">{other?.name ?? item.withBotId}: {item.answer}</p>
          </div>
        </aside>
      );
    }
    case "approval":
      return (
        <div className="conv-message">
          <BotAvatar bot={bot} portrait={portraits[bot.id]} />
          <div className="conv-body">
            <Author name={bot.name} />
            <ApprovalCard item={item} bot={bot} portrait={portraits[bot.id]} onDecide={(kind) => onDecide?.(item.id, kind)} />
          </div>
        </div>
      );
  }
}

/** Acompanha o fim só se o usuário já estava lá; quem subiu para ler não é puxado de volta. */
function ConversationLog({ followKey, pinKey, label, children }: { followKey: string; pinKey: number; label: string; children: ReactNode }) {
  const node = useRef<HTMLDivElement | null>(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    atBottom.current = true;
    if (node.current) node.current.scrollTop = node.current.scrollHeight;
  }, [pinKey]);
  useLayoutEffect(() => {
    if (node.current && atBottom.current) node.current.scrollTop = node.current.scrollHeight;
  }, [followKey]);
  return (
    <div
      className="conv-log"
      ref={node}
      role="log"
      aria-live="polite"
      aria-label={label}
      tabIndex={0}
      onScroll={(event) => {
        const element = event.currentTarget;
        atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_TO_BOTTOM_PX;
      }}
    >
      <div className="conv-column">{children}</div>
    </div>
  );
}

function Thinking({ bot, portrait }: { bot: OfficeBot; portrait?: string }) {
  return (
    <div className="conv-message" data-thinking aria-label={`${bot.name} está respondendo`}>
      <BotAvatar bot={bot} portrait={portrait} />
      <div className="conv-body">
        <Author name={bot.name} />
        <span className="chat-dots" aria-hidden><i /><i /><i /></span>
      </div>
    </div>
  );
}

function Composer({ botName, onSend }: { botName: string; onSend: (text: string) => boolean }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    if (onSend(draft)) setDraft("");
  };
  return (
    <form className="conv-composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <div className="conv-composer-box">
        <textarea
          rows={1}
          value={draft}
          maxLength={MAX_CHAT_CHARS}
          placeholder={`Mensagem para ${botName}…`}
          aria-label={`Mensagem para ${botName}`}
          data-conv-input
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button type="submit" disabled={!draft.trim()} aria-label="Enviar (Enter)" title="Enviar (Enter)"><ArrowUp size={16} aria-hidden /></button>
      </div>
    </form>
  );
}

function Header({ bot, portrait, children }: { bot: OfficeBot; portrait?: string; children?: ReactNode }) {
  return (
    <header className="conv-head">
      <BotAvatar bot={bot} portrait={portrait} />
      <div className="conv-head-text"><strong>{bot.name}</strong><span>{bot.role}</span></div>
      <div className="conv-head-side">{children}</div>
    </header>
  );
}

function DemoConversation({ bot, botsById, portraits, demo }: { bot: OfficeBot; botsById: Map<string, OfficeBot>; portraits: Record<string, string>; demo: DemoConversations }) {
  const items = demo.threadOf(bot.id);
  const typing = demo.typing(bot.id);
  const [pin, setPin] = useState(0);
  const [tasks, setTasks] = useState<ReadonlySet<string>>(new Set());
  const createTask = (id: string, text: string) => {
    const storage = browserStorage();
    saveCards(storage, addCard(loadCards(storage), text, bot.id, crypto.randomUUID()));
    setTasks((current) => new Set(current).add(id));
  };
  return (
    <>
      <Header bot={bot} portrait={portraits[bot.id]}><span className="conv-tag">Exemplo · nada aqui é real</span></Header>
      <ConversationLog followKey={`${items.length}:${typing}`} pinKey={pin} label={`Conversa com ${bot.name}`}>
        {items.length === 0 && <p className="conv-empty">Ainda não há nada nesta conversa de exemplo.</p>}
        {items.map((item) => (
          <ItemView
            key={item.id}
            item={item}
            bot={bot}
            botsById={botsById}
            portraits={portraits}
            onDecide={(id, kind) => demo.decide(bot.id, id, kind)}
            onCreateTask={createTask}
            taskDone={tasks.has(item.id)}
          />
        ))}
        {typing && <Thinking bot={bot} portrait={portraits[bot.id]} />}
      </ConversationLog>
      <Composer
        botName={bot.name}
        onSend={(raw) => {
          const text = raw.trim();
          if (!text || text.length > MAX_CHAT_CHARS) return false;
          demo.send(bot.id, bot.name, text);
          setPin((value) => value + 1);
          return true;
        }}
      />
    </>
  );
}

function LiveSession({ bot, botsById, portraits, session }: { bot: OfficeBot; botsById: Map<string, OfficeBot>; portraits: Record<string, string>; session: SessionSnapshot }) {
  const conversation = useSessionConversation(bot.id, session.id);
  const status = useGatewayStatus();
  const [pin, setPin] = useState(0);
  const { messages, loading, error, action, outgoing, thinking } = conversation;
  const items = conversationFromMessages(messages);
  return (
    <>
      <ConversationLog followKey={`${messages.length}:${messages.at(-1)?.id}:${outgoing.length}:${thinking}`} pinKey={pin} label={`Conversa com ${bot.name}`}>
        {loading && messages.length === 0 && <p className="conv-empty">Lendo a conversa no Hermes…</p>}
        {!loading && !error && messages.length === 0 && outgoing.length === 0 && <p className="conv-empty">Esta sessão ainda não tem mensagens visíveis.</p>}
        {items.map((item) => <ItemView key={item.id} item={item} bot={bot} botsById={botsById} portraits={portraits} />)}
        {outgoing.map((entry) => (
          <div key={entry.id} className="conv-message" data-author="user" data-outgoing={entry.state}>
            <span className="conv-avatar user" aria-hidden><User size={18} /></span>
            <div className="conv-body">
              <Author name="Você" at={entry.at} />
              <p>{entry.text}</p>
              {entry.state === "failed" ? (
                <div className="conv-failed">
                  <span>Não enviada: {entry.error}</span>
                  {entry.action && <span>{entry.action}</span>}
                  <button type="button" onClick={() => { setPin((value) => value + 1); conversation.retry(entry); }}>Tentar de novo</button>
                  <button type="button" onClick={() => conversation.discard(entry.id)}>Descartar</button>
                </div>
              ) : <span className="conv-note">{entry.state === "sending" ? "Enviando…" : "Entregue"}</span>}
            </div>
          </div>
        ))}
        {thinking && <Thinking bot={bot} portrait={portraits[bot.id]} />}
      </ConversationLog>
      {error && <p className="conv-error" role="alert">{error}{action ? ` · ${action}` : ""}</p>}
      {status?.canSend ? (
        <Composer
          botName={bot.name}
          onSend={(text) => {
            const sent = conversation.send(text);
            if (sent) setPin((value) => value + 1);
            return sent;
          }}
        />
      ) : (
        <p className="conv-readonly"><Eye size={14} aria-hidden /> Só leitura. Para conversar com {bot.name}, habilite o envio em <a href="/">Integrações → API do Hermes</a>.</p>
      )}
    </>
  );
}

function LiveConversation({ bot, botsById, portraits }: { bot: OfficeBot; botsById: Map<string, OfficeBot>; portraits: Record<string, string> }) {
  const snapshot = useHQStore((state) => state.fleet?.bots.find((candidate) => candidate.id === bot.id));
  const sessions = [...(snapshot?.sessions ?? [])].sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0));
  const [chosen, setChosen] = useState<string | null>(null);
  const session = sessions.find((candidate) => candidate.id === chosen) ?? sessions[0];
  const stateText = bot.state ? stateLabel(bot.state) : null;
  return (
    <>
      <Header bot={bot} portrait={portraits[bot.id]}>
        {stateText && <span className="conv-tag">{stateText}</span>}
        {session && (
          <select className="conv-session" aria-label="Sessão" value={session.id} onChange={(event) => setChosen(event.target.value)}>
            {sessions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {sessionTitle(candidate)} · {sourceLabel(candidate.source)} · {relativeTime(candidate.lastActiveAt)}
              </option>
            ))}
          </select>
        )}
      </Header>
      {session ? (
        <LiveSession key={session.id} bot={bot} botsById={botsById} portraits={portraits} session={session} />
      ) : (
        <div className="conv-center" data-conv-no-sessions>
          <RefreshCw size={18} aria-hidden />
          <p>{bot.name} ainda não tem sessões no Hermes.</p>
          <span>Quando uma sessão começar pelo terminal ou por outro canal do bot, ela aparece aqui.</span>
        </div>
      )}
    </>
  );
}

/** A conversa ocupa a área principal. A mesma tela lê sessões reais ou um roteiro de exemplo, sempre identificado. */
export function OfficeConversations({ bot, bots, live, portraits, demo }: {
  bot: OfficeBot | undefined;
  bots: readonly OfficeBot[];
  live: boolean;
  portraits: Record<string, string>;
  demo: DemoConversations;
}) {
  const botsById = new Map(bots.map((candidate) => [candidate.id, candidate]));
  return (
    <section className="conv" aria-label="Conversas" data-conversations data-scene-keys-off>
      {!bot ? (
        <div className="conv-center"><p>{live ? "Nenhum bot disponível no Hermes agora." : "Nenhum agente nesta demonstração."}</p></div>
      ) : live ? (
        <LiveConversation key={bot.id} bot={bot} botsById={botsById} portraits={portraits} />
      ) : (
        <DemoConversation key={bot.id} bot={bot} botsById={botsById} portraits={portraits} demo={demo} />
      )}
    </section>
  );
}
