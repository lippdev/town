/** Limite do proxy para uma mensagem (`MAX_CHAT_CHARS` em server/hermesProxy.ts). */
export const MAX_CHAT_CHARS = 8000;

export interface SendResult {
  ok: boolean;
  /** Resposta do bot, quando o turno terminou dentro do prazo. */
  reply?: string | null;
  error?: string;
  action?: string;
}

/**
 * Manda uma mensagem ao bot numa sessão dele, pelo proxy deste app. A chamada
 * só volta quando o turno do agente termina — pode levar minutos.
 */
export async function sendSessionMessage(botId: string, sessionId: string, message: string): Promise<SendResult> {
  try {
    const response = await fetch(
      `/api/hq/hermes/sessions/${encodeURIComponent(sessionId)}/chat?profile=${encodeURIComponent(botId)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ message }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      reply?: string | null;
      error?: string;
      action?: string;
    };
    if (!response.ok || !payload.ok) {
      return { ok: false, error: payload.error ?? `HTTP ${response.status}`, action: payload.action };
    }
    return { ok: true, reply: payload.reply };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
