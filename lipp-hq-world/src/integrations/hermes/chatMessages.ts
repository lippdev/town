/**
 * Mensagens de uma sessão do Hermes no formato que o chat da gaveta desenha.
 *
 * O dashboard devolve as linhas do store com a projeção de exibição do
 * Desktop: `display_content` substitui o conteúdo físico quando existe e
 * `display_kind: "hidden"` marca andaime que ninguém deve ver. O resto é
 * texto, partes multimodais e chamadas de ferramenta.
 */

export type ChatRole = "user" | "assistant" | "tool";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** Epoch em ms; ausente quando o Hermes não gravou horário. */
  at?: number;
  /** Ferramentas chamadas nesta resposta do assistente. */
  tools?: string[];
  /** Nome da ferramenta, em linhas role=tool (resultado). */
  toolName?: string;
  /** Mensagem enviada daqui e ainda sem confirmação do Hermes. */
  pending?: boolean;
}

export interface HermesMessageInput {
  id?: number | string;
  role?: string;
  content?: unknown;
  display_content?: unknown;
  display_kind?: string;
  timestamp?: number | string;
  tool_name?: string;
  tool_calls?: Array<{ name?: string }>;
}

/** Resultado de ferramenta mostrado no chat: o começo basta para saber o que voltou. */
export const TOOL_PREVIEW_CHARS = 280;

/** Conteúdo do Hermes (texto ou partes multimodais) como texto legível. */
export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const typed = part as { type?: string; text?: string };
      if (typeof typed.text === "string") return typed.text;
      if (typed.type && /image/.test(typed.type)) return "[imagem]";
      if (typed.type && /file|audio|document/.test(typed.type)) return "[anexo]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/** `timestamp` do Hermes: segundos (float) ou ISO. Converte para ms. */
export function messageTime(timestamp: number | string | undefined): number | undefined {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    return timestamp < 1e12 ? Math.round(timestamp * 1000) : timestamp;
  }
  if (typeof timestamp === "string" && timestamp) {
    const parsed = Date.parse(timestamp);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

export function chatMessagesFromHermes(rows: HermesMessageInput[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  rows.forEach((row, index) => {
    if (row.display_kind === "hidden") return;
    const role = row.role;
    if (role !== "user" && role !== "assistant" && role !== "tool") return;

    const raw = row.display_content ?? row.content;
    const text = contentText(raw).trim();
    const id = row.id !== undefined ? String(row.id) : `row-${index}`;
    const at = messageTime(row.timestamp);

    if (role === "tool") {
      messages.push({
        id,
        role,
        text: text.length > TOOL_PREVIEW_CHARS ? `${text.slice(0, TOOL_PREVIEW_CHARS)}…` : text,
        at,
        toolName: row.tool_name || "ferramenta",
      });
      return;
    }

    const tools = (row.tool_calls ?? []).map((call) => call.name).filter((name): name is string => Boolean(name));
    if (!text && tools.length === 0) return;
    messages.push({ id, role, text, at, ...(tools.length ? { tools } : {}) });
  });
  return messages;
}
