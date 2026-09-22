export type Card = {
  id: string;
  title: string;
  details: string;
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

// Minimal offline placeholder only. The real starting board is seeded by the
// backend (DEFAULT_BOARD in backend/app/main.py) and arrives via GET /api/board.
export const initialData: BoardData = {
  columns: [{ id: "col-backlog", title: "Backlog", cardIds: [] }],
  cards: {},
};

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
  });
};

export const createId = (prefix: string) => {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36);
  return `${prefix}-${randomPart}${timePart}`;
};

export const applyBoardUpdate = (current: BoardData, update: BoardData): BoardData => {
  const mergedCards = { ...current.cards, ...update.cards };

  // Ignore updates that reference cards we know nothing about.
  for (const updatedColumn of update.columns) {
    for (const cardId of updatedColumn.cardIds) {
      if (!mergedCards[cardId]) {
        return current;
      }
    }
  }

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

  // Remove a card from any column other than its updated home column.
  for (const updatedColumn of update.columns) {
    for (const cardId of updatedColumn.cardIds) {
      for (const column of columns) {
        if (column.id !== updatedColumn.id) {
          column.cardIds = column.cardIds.filter((id) => id !== cardId);
        }
      }
    }
  }

  // Drop cards that no longer appear in any column.
  const usedCardIds = new Set(columns.flatMap((column) => column.cardIds));
  const cards = Object.fromEntries(
    Object.entries(mergedCards).filter(([id]) => usedCardIds.has(id))
  );

  return { columns, cards };
};
