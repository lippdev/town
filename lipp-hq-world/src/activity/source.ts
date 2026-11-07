import { applyEvent, initialState, type ActivityEvent, type ActivityState } from "./events";
import type { ActivitySnapshot, BotTaskKind, Instant, Subject } from "./types";

/**
 * A fronteira entre os dados e a tela. A simulação implementa isto hoje; os conectores de Notion,
 * GitHub, Slack e Microsoft 365 vão implementar a mesma coisa:
 *
 * - `initial` é a sincronização inicial: o retrato completo, lido das APIs uma vez.
 * - `pull` entrega os eventos novos até `until`, já normalizados. No conector, vêm dos webhooks
 *   (GitHub, Slack, Notion, Graph) ou de leitura periódica, guardados numa fila até a tela pedir.
 * - `perform` executa uma ação pedida pela tela. No conector, vira chamada de API (mensagem do app
 *   no Slack, atualização de página no Notion, pedido de revisão no GitHub, tarefa para um bot);
 *   o que a ação causa depois chega por `pull`, como qualquer outro evento.
 *
 * A cena, o painel e os seletores só conhecem `ActivityState`. Nada deles muda na troca.
 */
export interface ActivitySource {
  readonly kind: "simulacao" | "conectores";
  initial(): ActivitySnapshot;
  pull(until: Instant, current: ActivityState): ActivityEvent[];
  perform(action: AppAction, current: ActivityState): ActionResult;
}

/** O que a tela pode pedir. Cada uma tem efeito no estado, nunca é enfeite. */
export type AppAction =
  /** Manda mensagem do app a quem precisa agir na HU; a resposta muda a HU depois. */
  | { kind: "cobrar"; storyId: string }
  | { kind: "reatribuir"; storyId: string; to: string }
  | { kind: "pedir_bot"; task: Extract<BotTaskKind, "resumir_pr" | "completar_criterios" | "cobrar_revisao">; target: Subject }
  /** Cadastro: liga (ou desliga, com login vazio) o GitHub pessoal ao e-mail corporativo. */
  | { kind: "vincular_github"; email: string; login: string };

export type ActionResult = { ok: true; events: ActivityEvent[]; note: string } | { ok: false; problem: string };

/**
 * Segura o estado e o relógio fora de qualquer tela: avança até um instante, aplica os eventos e
 * executa ações. A loja da tela só embrulha isto.
 */
export class ActivityRuntime {
  state: ActivityState;

  constructor(private readonly source: ActivitySource, start?: Instant) {
    const snapshot = source.initial();
    this.state = initialState(snapshot);
    this.advanceTo(start ?? snapshot.at);
  }

  get kind() {
    return this.source.kind;
  }

  /** Avança o relógio. Devolve os eventos aplicados; o instante do estado anda mesmo sem nenhum. */
  advanceTo(until: Instant): ActivityEvent[] {
    if (until < this.state.at) return [];
    const events = this.source.pull(until, this.state);
    let state = this.state;
    for (const event of events) state = applyEvent(state, event);
    this.state = state.at === until ? state : { ...state, at: until };
    return events;
  }

  perform(action: AppAction): ActionResult {
    const result = this.source.perform(action, this.state);
    if (!result.ok) return result;
    let state = this.state;
    for (const event of result.events) state = applyEvent(state, event);
    this.state = { ...state, at: Math.max(state.at, this.state.at) };
    return result;
  }
}
