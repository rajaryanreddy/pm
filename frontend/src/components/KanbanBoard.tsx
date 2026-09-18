"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { createId, initialData, moveCard, type BoardData } from "@/lib/kanban";

const columnColors = [
  "bg-[#209dd7]",
  "bg-[#ecad0a]",
  "bg-[#2a9d8f]",
  "bg-[#e76f51]",
  "bg-[#753991]",
];

const applyBoardUpdate = (current: BoardData, update: BoardData): BoardData => {
  const columns = current.columns.map((column) => {
    const updatedColumn = update.columns.find((nextColumn) => nextColumn.id === column.id);
    return updatedColumn
      ? { ...updatedColumn, cardIds: [...updatedColumn.cardIds] }
      : { ...column, cardIds: [...column.cardIds] };
  });

  for (const newColumn of update.columns) {
    if (!current.columns.some((column) => column.id === newColumn.id)) {
      columns.push({ ...newColumn, cardIds: [...newColumn.cardIds] });
    }
  }

  for (const updatedColumn of update.columns) {
    for (const cardId of updatedColumn.cardIds) {
      for (const column of columns) {
        if (column.id !== updatedColumn.id) {
          column.cardIds = column.cardIds.filter((id) => id !== cardId);
        }
      }
    }
  }

  return {
    columns,
    cards: { ...current.cards, ...update.cards },
  };
};

const AIChatSidebar = ({
  board,
  onUpdateBoard,
}: {
  board: BoardData;
  onUpdateBoard: (nextBoard: BoardData) => void;
}) => {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Ask me to create or move cards on the board." },
  ]);
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuestion = draft.trim();
    if (!nextQuestion || isSending) {
      return;
    }

    const history = messages.map((message) => ({
      role: message.role,
      content: message.text,
    }));

    setMessages((prev) => [...prev, { role: "user", text: nextQuestion }]);
    setDraft("");
    setIsSending(true);

    try {
      const response = await fetch("/api/ai/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: nextQuestion,
          board,
          history,
        }),
      });

      if (!response.ok) {
        throw new Error("AI request failed");
      }

      const result = await response.json();
      const nextBoard = result?.board_update as BoardData | undefined;
      if (nextBoard && Array.isArray(nextBoard.columns) && nextBoard.cards) {
        onUpdateBoard(nextBoard);
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: result?.response || "I updated the board." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "I could not reach the AI assistant right now." },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="sticky top-6 flex h-[680px] max-h-[calc(100vh-3rem)] min-h-0 flex-col rounded-[28px] border border-[var(--stroke)] bg-white p-4 shadow-[var(--shadow)]">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
          AI assistant
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--navy-dark)]">
          Board helper
        </h2>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl bg-[var(--surface)] p-3">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-6 ${
              message.role === "assistant"
                ? "bg-white text-[var(--navy-dark)]"
                : "ml-auto bg-[var(--secondary-purple)] text-white"
            }`}
          >
            {message.text}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          placeholder="Ask the AI to create or move cards"
          className="w-full resize-none rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={isSending || !draft.trim()}
          className="w-full rounded-full bg-[var(--primary-blue)] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSending ? "Thinking..." : "Send"}
        </button>
      </form>
    </aside>
  );
};

export const KanbanBoard = () => {
  const [board, setBoard] = useState<BoardData>(() => initialData);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadBoard = async () => {
      if (typeof fetch !== "function") {
        setIsLoaded(true);
        return;
      }

      try {
        const response = await fetch("/api/board", { method: "GET" });
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        if (payload && Array.isArray(payload.columns) && payload.cards) {
          setBoard(payload as BoardData);
        }
      } catch {
        // fall back to the default in-memory board
      } finally {
        setIsLoaded(true);
      }
    };

    loadBoard();
  }, []);

  useEffect(() => {
    if (!isLoaded || typeof fetch !== "function") {
      return;
    }

    const saveBoard = async () => {
      try {
        await fetch("/api/board", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(board),
        });
      } catch {
        // Ignore save failures in this MVP demo flow.
      }
    };

    saveBoard();
  }, [board, isLoaded]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board.cards, [board.cards]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    setBoard((prev) => ({
      ...prev,
      columns: moveCard(prev.columns, active.id as string, over.id as string),
    }));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    setBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    setBoard((prev) => {
      return {
        ...prev,
        cards: Object.fromEntries(
          Object.entries(prev.cards).filter(([id]) => id !== cardId)
        ),
        columns: prev.columns.map((column) =>
          column.id === columnId
            ? {
                ...column,
                cardIds: column.cardIds.filter((id) => id !== cardId),
              }
            : column
        ),
      };
    });
  };

  const handleUpdateCard = (cardId: string, title: string, details: string) => {
    setBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: { ...prev.cards[cardId], title, details },
      },
    }));
  };

  const handleMoveCard = (cardId: string, direction: "left" | "right") => {
    setBoard((prev) => {
      const currentIndex = prev.columns.findIndex((column) => column.cardIds.includes(cardId));
      const nextIndex = currentIndex + (direction === "left" ? -1 : 1);
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= prev.columns.length) {
        return prev;
      }
      return {
        ...prev,
        columns: moveCard(prev.columns, cardId, prev.columns[nextIndex].id),
      };
    });
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  const handleApplyBoardUpdate = (nextBoard: BoardData) => {
    setBoard((prev) => applyBoardUpdate(prev, nextBoard));
  };

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto max-w-[1500px] px-6 pb-16 pt-12">
        <header className="mb-8 flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                One board. Five columns. Zero clutter.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section className="grid gap-6 lg:grid-cols-5" data-testid="board-grid">
              {board.columns.map((column, index) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                  onUpdateCard={handleUpdateCard}
                  onMoveCard={handleMoveCard}
                  colorClass={columnColors[index % columnColors.length]}
                />
              ))}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <AIChatSidebar board={board} onUpdateBoard={handleApplyBoardUpdate} />
        </div>
      </main>
    </div>
  );
};
