/**
 * Quadro de tarefas de exemplo, salvo só neste navegador. Não fala com o Hermes: nenhum bot
 * recebe ou executa nada daqui. Serve para avaliar como o quadro ficaria.
 */
export const KANBAN_COLUMNS = [
  { id: "afazer", label: "A fazer" },
  { id: "fazendo", label: "Fazendo" },
  { id: "revisao", label: "Em revisão" },
  { id: "feito", label: "Feito" },
] as const;

export type KanbanColumnId = (typeof KANBAN_COLUMNS)[number]["id"];

/** Quem cuida: "filipe" ou o id de um bot. */
export const OWNER_FILIPE = "filipe";

export interface KanbanCard {
  id: string;
  title: string;
  owner: string;
  column: KanbanColumnId;
}

export const KANBAN_STORAGE_KEY = "hq.kanban.v1";
export const TITLE_MAX = 80;

export const SAMPLE_CARDS: readonly KanbanCard[] = [
  { id: "ex-1", title: "Aprovar a proposta do cliente", owner: OWNER_FILIPE, column: "afazer" },
  { id: "ex-2", title: "Revisar os relatórios da semana", owner: "scout", column: "afazer" },
  { id: "ex-3", title: "Corrigir o deploy de homologação", owner: "pulse", column: "fazendo" },
  { id: "ex-4", title: "Rascunho do post de lançamento", owner: "ink", column: "fazendo" },
  { id: "ex-5", title: "Priorizar o backlog do próximo ciclo", owner: "atlas", column: "revisao" },
  { id: "ex-6", title: "Responder a comunidade sobre a nova versão", owner: "echo", column: "feito" },
];

const isColumn = (value: unknown): value is KanbanColumnId => KANBAN_COLUMNS.some((column) => column.id === value);

function validCard(value: unknown): value is KanbanCard {
  const card = value as Partial<KanbanCard> | null;
  return Boolean(card) && typeof card!.id === "string" && typeof card!.title === "string" && typeof card!.owner === "string" && isColumn(card!.column);
}

export function loadCards(storage: Pick<Storage, "getItem"> | null): KanbanCard[] {
  try {
    const raw = storage?.getItem(KANBAN_STORAGE_KEY);
    if (!raw) return [...SAMPLE_CARDS];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validCard) : [...SAMPLE_CARDS];
  } catch {
    return [...SAMPLE_CARDS];
  }
}

export function saveCards(storage: Pick<Storage, "setItem"> | null, cards: readonly KanbanCard[]) {
  try {
    storage?.setItem(KANBAN_STORAGE_KEY, JSON.stringify(cards));
  } catch {
    // Sem armazenamento, o quadro só não sobrevive a recarregar.
  }
}

export function addCard(cards: readonly KanbanCard[], title: string, owner: string, id: string): KanbanCard[] {
  const clean = title.trim().slice(0, TITLE_MAX);
  if (!clean) return [...cards];
  return [...cards, { id, title: clean, owner, column: "afazer" }];
}

export const moveCard = (cards: readonly KanbanCard[], id: string, column: KanbanColumnId): KanbanCard[] =>
  cards.map((card) => (card.id === id ? { ...card, column } : card));

export const removeCard = (cards: readonly KanbanCard[], id: string): KanbanCard[] => cards.filter((card) => card.id !== id);
