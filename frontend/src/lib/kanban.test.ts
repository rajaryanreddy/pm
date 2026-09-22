import { applyBoardUpdate, moveCard, type BoardData, type Column } from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

describe("applyBoardUpdate", () => {
  const baseBoard: BoardData = {
    columns: [
      { id: "col-a", title: "A", cardIds: ["card-1"] },
      { id: "col-b", title: "B", cardIds: ["card-2"] },
    ],
    cards: {
      "card-1": { id: "card-1", title: "One", details: "First" },
      "card-2": { id: "card-2", title: "Two", details: "Second" },
    },
  };

  it("moves a card and removes it from the old column", () => {
    const update: BoardData = {
      columns: [
        { id: "col-a", title: "A", cardIds: [] },
        { id: "col-b", title: "B", cardIds: ["card-2", "card-1"] },
      ],
      cards: baseBoard.cards,
    };

    const result = applyBoardUpdate(baseBoard, update);
    expect(result.columns[0].cardIds).toEqual([]);
    expect(result.columns[1].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("appends new columns and cards from the update", () => {
    const update: BoardData = {
      columns: [
        ...baseBoard.columns,
        { id: "col-c", title: "C", cardIds: ["card-3"] },
      ],
      cards: {
        ...baseBoard.cards,
        "card-3": { id: "card-3", title: "Three", details: "New" },
      },
    };

    const result = applyBoardUpdate(baseBoard, update);
    expect(result.columns).toHaveLength(3);
    expect(result.cards["card-3"].title).toBe("Three");
  });

  it("drops cards that no longer appear in any column", () => {
    const update: BoardData = {
      columns: [
        { id: "col-a", title: "A", cardIds: ["card-1"] },
        { id: "col-b", title: "B", cardIds: [] },
      ],
      cards: baseBoard.cards,
    };

    const result = applyBoardUpdate(baseBoard, update);
    expect(result.columns[1].cardIds).toEqual([]);
    expect(result.cards["card-2"]).toBeUndefined();
    expect(result.cards["card-1"]).toBeDefined();
  });

  it("ignores updates that reference unknown cards", () => {
    const update: BoardData = {
      columns: [{ id: "col-a", title: "A", cardIds: ["ghost-card"] }],
      cards: {},
    };

    const result = applyBoardUpdate(baseBoard, update);
    expect(result).toBe(baseBoard);
  });
});
