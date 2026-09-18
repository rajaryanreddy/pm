import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import Home from "@/app/page";
import { KanbanBoard } from "@/components/KanbanBoard";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("Home login experience", () => {
  it("requires login before showing the board", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: /log in/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /kanban studio/i })
    ).not.toBeInTheDocument();
  });

  it("shows the board after a valid login", async () => {
    render(<Home />);

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(screen.getByText(/kanban studio/i)).toBeInTheDocument();
  });
});

describe("KanbanBoard", () => {
  it("loads the board from the API and saves updates", async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (input === "/api/board" && (!init || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            columns: [{ id: "col-one", title: "Loaded", cardIds: ["card-one"] }],
            cards: {
              "card-one": { id: "card-one", title: "Loaded card", details: "Synced" },
            },
          }),
        } as Response);
      }

      if (input === "/api/board" && init?.method === "PUT") {
        return Promise.resolve({ ok: true } as Response);
      }

      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    await act(async () => {
      render(<KanbanBoard />);
    });

    expect(await screen.findByText("Loaded card")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board",
      expect.objectContaining({ method: "GET" })
    );

    const input = screen.getByLabelText("Column title");
    await act(async () => {
      await userEvent.clear(input);
      await userEvent.type(input, "Updated status");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board",
      expect.objectContaining({ method: "PUT" })
    );

    vi.unstubAllGlobals();
  });

  it("renders five columns", async () => {
    await act(async () => {
      render(<KanbanBoard />);
    });

    await waitFor(() => {
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    });
  });

  it("renames a column", async () => {
    await act(async () => {
      render(<KanbanBoard />);
    });

    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");

    await waitFor(() => expect(input).toHaveValue("Backlog"));

    await act(async () => {
      await userEvent.clear(input);
      await userEvent.type(input, "New Name");
    });

    await waitFor(() => expect(input).toHaveValue("New Name"));
  });

  it("adds and removes a card", async () => {
    await act(async () => {
      render(<KanbanBoard />);
    });

    const column = getFirstColumn();
    await waitFor(() => expect(within(column).getByText("Align roadmap themes")).toBeInTheDocument());

    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("edits a card and moves it with arrow controls", async () => {
    await act(async () => {
      render(<KanbanBoard />);
    });

    const firstColumn = getFirstColumn();
    const card = within(firstColumn).getByTestId("card-card-1");
    await waitFor(() => expect(within(card).getByText("Align roadmap themes")).toBeInTheDocument());

    await userEvent.click(within(card).getByRole("button", { name: /edit align roadmap themes/i }));
    const titleInput = within(card).getByRole("textbox", { name: /title for align roadmap themes/i });
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated roadmap themes");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));
    expect(within(card).getByText("Updated roadmap themes")).toBeInTheDocument();

    await userEvent.click(
      within(card).getByRole("button", { name: /move updated roadmap themes right/i })
    );
    expect(within(getFirstColumn()).queryByText("Updated roadmap themes")).not.toBeInTheDocument();
    expect(within(screen.getAllByTestId(/column-/i)[1]).getByText("Updated roadmap themes")).toBeInTheDocument();
  });

  it("keeps the AI panel independently scrollable from the board", async () => {
    await act(async () => {
      render(<KanbanBoard />);
    });

    expect(screen.getByTestId("board-grid")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /board helper/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ask the ai/i)).toBeInTheDocument();
  });

  it("applies an AI card move to the board", async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (input === "/api/board" && (!init || init.method === "GET")) {
        return Promise.resolve({ ok: true, json: async () => ({
          columns: [
            { id: "col-one", title: "Todo", cardIds: ["card-one"] },
            { id: "col-two", title: "Done", cardIds: [] },
          ],
          cards: { "card-one": { id: "card-one", title: "Move me", details: "Details" } },
        }) } as Response);
      }

      if (input === "/api/ai/board") {
        return Promise.resolve({ ok: true, json: async () => ({
          response: "Moved the card to Done.",
          board_update: {
            columns: [
              { id: "col-one", title: "Todo", cardIds: [] },
              { id: "col-two", title: "Done", cardIds: ["card-one"] },
            ],
            cards: { "card-one": { id: "card-one", title: "Move me", details: "Details" } },
          },
        }) } as Response);
      }

      return Promise.resolve({ ok: true } as Response);
    });

    vi.stubGlobal("fetch", fetchMock as typeof fetch);
    await act(async () => {
      render(<KanbanBoard />);
    });

    await userEvent.type(screen.getByPlaceholderText(/ask the ai/i), "Move Move me to Done");
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => {
      expect(within(screen.getByTestId("column-col-two")).getByText("Move me")).toBeInTheDocument();
    });
    expect(within(screen.getByTestId("column-col-one")).queryByText("Move me")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("adds an AI-created stage to the board", async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (input === "/api/board" && (!init || init.method === "GET")) {
        return Promise.resolve({ ok: true, json: async () => ({
          columns: [{ id: "col-one", title: "Todo", cardIds: [] }],
          cards: {},
        }) } as Response);
      }

      if (input === "/api/ai/board") {
        return Promise.resolve({ ok: true, json: async () => ({
          response: "Added a Testing stage.",
          board_update: {
            columns: [
              { id: "col-one", title: "Todo", cardIds: [] },
              { id: "col-testing", title: "Testing", cardIds: [] },
            ],
            cards: {},
          },
        }) } as Response);
      }

      return Promise.resolve({ ok: true } as Response);
    });

    vi.stubGlobal("fetch", fetchMock as typeof fetch);
    await act(async () => {
      render(<KanbanBoard />);
    });

    await userEvent.type(screen.getByPlaceholderText(/ask the ai/i), "Add a Testing stage");
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("column-col-testing")).toBeInTheDocument();
    });
    expect(within(screen.getByTestId("column-col-testing")).getByDisplayValue("Testing")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
