import { describe, expect, it } from "vitest";
import { KANBAN_STORAGE_KEY, SAMPLE_CARDS, TITLE_MAX, addCard, loadCards, moveCard, removeCard, saveCards } from "@/components/office/kanbanModel";

const memory = (start: Record<string, string> = {}) => {
  const data = { ...start };
  return { data, getItem: (key: string) => data[key] ?? null, setItem: (key: string, value: string) => void (data[key] = value) };
};

describe("quadro de tarefas", () => {
  it("começa com os exemplos e sobrevive a dado corrompido", () => {
    expect(loadCards(memory())).toEqual(SAMPLE_CARDS);
    expect(loadCards(memory({ [KANBAN_STORAGE_KEY]: "{quebrado" }))).toEqual(SAMPLE_CARDS);
    expect(loadCards(null)).toEqual(SAMPLE_CARDS);
  });

  it("descarta cartão inválido e mantém os bons", () => {
    const good = { id: "a", title: "Ok", owner: "filipe", column: "feito" };
    const stored = JSON.stringify([good, { id: "b", title: "Sem coluna", owner: "filipe", column: "lixo" }]);
    expect(loadCards(memory({ [KANBAN_STORAGE_KEY]: stored }))).toEqual([good]);
  });

  it("salva e lê de volta, inclusive o quadro vazio", () => {
    const storage = memory();
    saveCards(storage, []);
    expect(loadCards(storage)).toEqual([]);
  });

  it("tarefa nova entra em A fazer, limpa e com tamanho limitado", () => {
    const [card] = addCard([], `  ${"x".repeat(TITLE_MAX + 5)} `, "pulse", "n1");
    expect(card).toMatchObject({ column: "afazer", owner: "pulse", id: "n1" });
    expect(card!.title).toHaveLength(TITLE_MAX);
    expect(addCard([], "   ", "pulse", "n2")).toEqual([]);
  });

  it("move e apaga só o cartão pedido", () => {
    const moved = moveCard(SAMPLE_CARDS, "ex-1", "feito");
    expect(moved.find((card) => card.id === "ex-1")!.column).toBe("feito");
    expect(moved.find((card) => card.id === "ex-2")!.column).toBe("afazer");
    expect(removeCard(SAMPLE_CARDS, "ex-1")).toHaveLength(SAMPLE_CARDS.length - 1);
  });
});
