# Project Management MVP Plan

**Status:** MVP implementation complete and locally validated
**Last reviewed:** 2026-09-18

This document records the implementation plan, decisions, and current status. The detailed architecture and API reference are in [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md).

## Product Scope

The MVP is a local project-management application with a Kanban board and an AI assistant. A user signs in with a demo account, manages one persistent board, and can ask AI to create, edit, move, or organize cards and stages.

MVP constraints:

- Login is frontend-only with `user` / `password`.
- There is one board for the MVP user.
- The app runs locally, preferably through Docker Compose.
- SQLite stores each board as JSON.
- OpenRouter provides AI responses through the backend.
- AI board changes are applied automatically without manual approval.

## Implementation Status

### Part 1: Planning and repository guidance

- [x] Review product requirements and confirm MVP constraints.
- [x] Record repository conventions in `AGENTS.md`.
- [x] Add frontend-specific guidance in `frontend/AGENTS.md`.
- [x] Document the completed technical design in `docs/TECHNICAL_DESIGN.md`.

**Success criteria:** Requirements, constraints, architecture, and operating assumptions are documented.

### Part 2: Scaffolding and container setup

- [x] Create FastAPI backend structure.
- [x] Add Dockerfile for the combined frontend/backend image.
- [x] Add Docker Compose configuration on port `8000`.
- [x] Add `scripts/start.sh` and `scripts/stop.sh`.
- [x] Add initial health, demo, and hello-world routes.

**Success criteria:** The project can be built and started locally, and FastAPI can serve the application port.

### Part 3: Static Next.js frontend

- [x] Build the frontend with Next.js.
- [x] Generate static output in `frontend/out`.
- [x] Configure FastAPI to serve the static frontend at `/`.
- [x] Create the Kanban board UI and shared board types.
- [x] Add drag-and-drop using `@dnd-kit`.

**Success criteria:** The built frontend loads from the FastAPI server and displays the board.

### Part 4: Frontend-only login

- [x] Require login before rendering the board.
- [x] Use the fixed demo credentials `user` / `password`.
- [x] Show an invalid-credentials message.
- [x] Add logout behavior.

**Decision:** Authentication is intentionally a frontend-only MVP gate. It is not a security boundary and must be replaced before production use.

**Success criteria:** Users cannot reach the board UI without the demo login flow, and logout returns to the login screen.

### Part 5: Board data model and persistence design

- [x] Define normalized JSON board data with `columns` and `cards`.
- [x] Store ordered card membership through each column's `cardIds` array.
- [x] Define SQLite table `board_data(user_id PRIMARY KEY, board_json TEXT NOT NULL)`.
- [x] Create the SQLite database and table automatically when needed.
- [x] Document the schema and persistence approach.

**Decision:** Keep the board as one JSON document for the MVP. This supports simple reads/writes and leaves a user key for future multi-user support. Normalize into separate tables only when querying, collaboration, or reporting requires it.

**Success criteria:** A new database receives the default board, and a saved board can be loaded after restart.

### Part 6: FastAPI board backend

- [x] Add `GET /api/board`.
- [x] Add `PUT /api/board`.
- [x] Validate that board payloads contain `columns` and `cards`.
- [x] Use parameterized SQLite values and upsert persistence.
- [x] Add health and demo endpoints.
- [x] Add backend tests for initialization and persistence.

**Success criteria:** Board changes survive API round trips and database recreation behavior is covered by tests.

### Part 7: Frontend/backend integration

- [x] Load board state from the backend on mount.
- [x] Save board changes through the backend.
- [x] Fall back to the in-memory initial board when loading fails.
- [x] Keep board state separate from AI conversation state.
- [x] Test board loading, saving, renaming, and card operations.

**Decision:** Save failures are ignored in this MVP UI. Production work should add save status, retry, and conflict handling.

**Success criteria:** Browser board interactions update the backend and reload with persisted state.

### Part 8: OpenRouter connectivity

- [x] Load `OPENROUTER_API_KEY` from the root `.env` or process environment.
- [x] Add `POST /api/ai/test`.
- [x] Use the supported model slug `openai/gpt-oss-20b`.
- [x] Verify a live `2+2` request.
- [x] Add mocked provider tests.

**Decision:** The API key is backend-only. It must never be exposed in the browser bundle or committed to source control.

**Success criteria:** The connectivity route returns a model answer when configured and a clear configuration error when the key is absent.

### Part 9: AI board operations

- [x] Send the current question, complete board JSON, and conversation history to OpenRouter.
- [x] Request a response object with `message` and optional `board_update`.
- [x] Parse normal JSON, fenced JSON, and plain-text model responses safely.
- [x] Preserve existing columns/cards when merging an AI update.
- [x] Append new AI-created columns instead of discarding them.
- [x] Ensure moved card IDs appear in their destination column.
- [x] Add tests for structured responses, plain text, card moves, and stage creation.

**Decisions:**

- AI updates are applied automatically; there is no approval step.
- The backend prompt asks for complete `columns` and `cards` objects for board-changing requests.
- The frontend merge appends new columns and merges cards rather than replacing unrelated local state.
- The frontend removes an updated card ID from other columns to avoid duplicate stage membership.

**Success criteria:** Asking AI to create a stage or move a card produces a visible board change and persists after reload.

### Part 10: AI sidebar experience

- [x] Add a dedicated AI chat sidebar.
- [x] Maintain conversation messages in the sidebar.
- [x] Submit prompts without blocking direct board controls.
- [x] Apply returned board updates automatically.
- [x] Keep the sidebar independently scrollable.
- [x] Prevent chat growth from expanding board columns.
- [x] Add a regression test for board/chat separation.

**Decision:** Board state and chat state are separate React state domains. The AI panel has a constrained height and its own scroll container.

**Success criteria:** Chat history can grow without changing the board layout, and AI updates refresh the board immediately.

## Board Interaction Decisions

- Columns are inline-editable.
- Cards are editable for both title and details.
- Cards support drag-and-drop, move-left, and move-right controls.
- Card action controls are icon-only for delete and directional movement, with tooltips/accessible labels.
- Card actions are rendered inside a bottom action bar within each card.
- Stage colors are distinct and assigned by visible column position.
- The existing MVP card and column model remains unchanged by the UI actions.

## Validation Baseline

Run frontend checks from `frontend/`:

```bash
npm test -- --run
npm run lint
npm run build
```

Run backend checks from `backend/`:

```bash
source ../.venv/bin/activate
PYTHONPATH=. pytest tests/test_app.py -q
```

Current validated results:

- Frontend tests: 13 passing.
- Backend tests: 9 passing.
- Frontend lint: passing.
- Next.js production build: passing.
- Live FastAPI health endpoint: passing on `http://localhost:8000`.
- Live OpenRouter connectivity was previously verified through `/api/ai/test`.

## Known MVP Gaps

- Login is not secure authentication.
- Board payload validation is shallow.
- AI output is parsed defensively but is not validated with a full schema.
- Provider errors are not yet translated into detailed user-facing messages.
- Save failures do not show status or retry controls.
- SQLite is local and not suitable for multi-instance deployment.
- No audit history, undo, or approval workflow exists for AI changes.

## Future Work, Not Current MVP Commitments

1. Replace frontend-only login with backend authentication and authorization.
2. Add typed request/response models and strict board validation.
3. Add AI operation plans, audit history, and undo support.
4. Add save status, retry, and optimistic concurrency handling.
5. Normalize persistence when scale or querying requires it.
6. Add Dockerized end-to-end browser tests.
7. Add provider abstraction and streaming responses if AI usage grows.

## Readiness

The plan is up to date with the implemented MVP and the current technical decisions. The next implementation work should be treated as new scope or future evolution unless this document is revised and approved again.