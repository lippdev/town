import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { browserStorage } from "@/avatar/human/persistence";
import { useOfficeStore } from "@/world/office/officeStore";
import { KANBAN_COLUMNS, OWNER_FILIPE, TITLE_MAX, addCard, loadCards, moveCard, removeCard, saveCards, type KanbanCard, type KanbanColumnId } from "./kanbanModel";

const ALL = "todos";
const FILIPE = { id: OWNER_FILIPE, name: "Filipe", color: "#f2f5fa" };

/** Quadro de tarefas da demonstração, por cima da cena. Arrastar ou escolher a coluna move o cartão. */
export function OfficeKanban({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const bots = useOfficeStore((state) => state.bots);
  const [cards, setCards] = useState<KanbanCard[]>(() => loadCards(browserStorage()));
  const [filter, setFilter] = useState(ALL);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState(OWNER_FILIPE);
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<KanbanColumnId | null>(null);
  const owners = [FILIPE, ...bots.map((bot) => ({ id: bot.id, name: bot.name, color: bot.color }))];
  const ownerOf = (id: string) => owners.find((candidate) => candidate.id === id) ?? { id, name: id, color: "#7f8ea6" };

  useEffect(() => saveCards(browserStorage(), cards), [cards]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visible = cards.filter((card) => filter === ALL || card.owner === filter);
  return (
    <div className={embedded ? "kanban embedded" : "kanban"} role={embedded ? "region" : "dialog"} aria-modal={embedded ? undefined : true} aria-label="Quadro de tarefas" data-kanban>
      <header className="kanban-head">
        <div>
          <h2>Kanban</h2>
          <p>Exemplo salvo só neste navegador. Ainda não envia nada aos bots.</p>
        </div>
        <button type="button" className="panel-close" onClick={onClose} aria-label="Fechar (Esc)" title="Fechar (Esc)">
          <X size={18} aria-hidden />
        </button>
      </header>
      <form
        className="kanban-new"
        onSubmit={(event) => {
          event.preventDefault();
          setCards((current) => addCard(current, title, owner, crypto.randomUUID()));
          setTitle("");
        }}
      >
        <input value={title} maxLength={TITLE_MAX} placeholder="Escreva uma nova tarefa…" aria-label="Nova tarefa" onChange={(event) => setTitle(event.target.value)} />
        <select value={owner} aria-label="Responsável" onChange={(event) => setOwner(event.target.value)}>
          {owners.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
          ))}
        </select>
        <button type="submit" className="office-button primary" disabled={!title.trim()}>Adicionar</button>
      </form>
      <div className="kanban-filter" role="group" aria-label="Filtrar por responsável">
        {[{ id: ALL, name: "Todos", color: "" }, ...owners].map((candidate) => (
          <button key={candidate.id} type="button" className={filter === candidate.id ? "active" : undefined} aria-pressed={filter === candidate.id} onClick={() => setFilter(candidate.id)}>
            {candidate.color && <span className="agent-dot" style={{ background: candidate.color }} aria-hidden />}
            {candidate.name}
          </button>
        ))}
      </div>
      <div className="kanban-board">
        {KANBAN_COLUMNS.map((column) => {
          const inColumn = visible.filter((card) => card.column === column.id);
          return (
            <section
              key={column.id}
              className={over === column.id ? "kanban-column over" : "kanban-column"}
              aria-label={column.label}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(column.id);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={() => {
                if (dragged) setCards((current) => moveCard(current, dragged, column.id));
                setDragged(null);
                setOver(null);
              }}
            >
              <h3>{column.label} <span>{inColumn.length}</span></h3>
              {inColumn.map((card) => {
                const person = ownerOf(card.owner);
                return (
                  <article key={card.id} className="kanban-card" draggable onDragStart={() => setDragged(card.id)} onDragEnd={() => setDragged(null)} data-kanban-card={card.id}>
                    <p>{card.title}</p>
                    <footer>
                      <span className="kanban-owner"><span className="agent-dot" style={{ background: person.color }} aria-hidden />{person.name}</span>
                      <select value={card.column} aria-label={`Mover "${card.title}"`} onChange={(event) => setCards((current) => moveCard(current, card.id, event.target.value as KanbanColumnId))}>
                        {KANBAN_COLUMNS.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </select>
                      <button type="button" aria-label={`Apagar "${card.title}"`} onClick={() => setCards((current) => removeCard(current, card.id))}>
                        <X size={13} aria-hidden />
                      </button>
                    </footer>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
