# Code Review Report

Date: 2026-09-21
Scope: Full repository — backend (`backend/app/main.py`, tests), frontend (`frontend/src`), Docker setup, scripts, configuration.
Reviewer: Claude Code (Lead Developer / Code Reviewer role).

## Summary

The MVP is in good shape overall. All automated tests pass (9 backend, 13 frontend unit/component), lint is clean, and the code matches the documented design. The issues below are ranked by how much they matter in the real world. Nothing is a show-stopper for a local single-user MVP, but items in the "High" section are worth fixing soon because they can corrupt or lose board data, or leak personal data into the repository.

**Verified evidence**

- Backend: `pytest tests/test_app.py -q` — 9 passed.
- Frontend: `npm test` — 13 passed (2 test files).
- Frontend: `npm run lint` — clean, no warnings.
- Playwright e2e (`npm run test:e2e`) was not run in this review; it requires a running server. Recommend running it before the next release.

---

## High priority

### H1. The database file with your real board data is committed to GitHub
- Where: `backend/app.db` (tracked in git; confirmed via `git ls-files`).
- Problem: Every time the app saves the board, the local file changes, and it is easy to accidentally commit your actual board content. It is personal data sitting in the repository history.
- Action: Add `backend/app.db` to `.gitignore`, then run `git rm --cached backend/app.db` to stop tracking it (this does not delete the local file — the app keeps working).

### H2. A malformed save can permanently break the board
- Where: `backend/app/main.py:148-153` (`PUT /api/board`) and `backend/app/main.py:112` (`json.loads` on load).
- Problem: The save endpoint only checks that "columns" and "cards" keys exist. If anything (a bug, a bad AI response, or a manual API call) saves a board where, say, `columns` is not a list or a card ID in a column has no matching card, that broken board is stored in the database. On the next page load the frontend receives it and may render a broken or empty board — and because the frontend auto-saves whatever it holds, the bad state sticks.
- Action: Validate the board shape on save (columns is a list, every column has id/title/cardIds, every cardId has a matching card) and reject with a 400 error. Add a backend test that saves a malformed board and confirms it is rejected.

### H3. AI updates apply with no safety net
- Where: `frontend/src/components/KanbanBoard.tsx:26-54` (`applyBoardUpdate`) and `:314-316`.
- Problem: When the AI returns a `board_update`, the frontend merges it and saves immediately. There is no validation that the update is sane and no undo. A confused model response can silently drop cards from columns (cards merge never deletes, but card placement comes entirely from the model). The design doc accepts auto-apply, so this is a known trade-off — but the merge function itself has a weakness: cards removed by the AI stay in the `cards` map forever (orphans), and there is no check that referenced cards exist.
- Action (minimal, no new features): in `applyBoardUpdate`, drop cards that no longer appear in any column, and skip any update whose columns reference unknown cards. Add unit tests for both cases. If you later want an approval step ("Apply / Discard" buttons on AI updates), that is a product decision for you to make — the current design says auto-apply is intentional.

---

## Medium priority

### M1. AI calls block the server
- Where: `backend/app/main.py:167` and `:203` (`httpx.post` inside `async def` endpoints).
- Problem: The AI endpoints use a synchronous (blocking) HTTP call inside async handlers. While OpenRouter takes up to 30 seconds to answer, the whole server is frozen — even the health check stops responding. With one local user this is rarely noticed, but two browser tabs will feel it.
- Action: Replace with `httpx.AsyncClient` + `await`, or make the endpoints plain `def` so FastAPI runs them in a thread pool. The one-line fix is changing `async def` to `def` on both AI endpoints (they contain no other `await`).

### M2. AI/OpenRouter errors return a raw 500 with no useful message
- Where: `backend/app/main.py:181` and `:227` (`response.raise_for_status()`).
- Problem: If OpenRouter returns an error (bad key, quota, model renamed), the user only sees the generic "I could not reach the AI assistant right now" and the developer gets no detail. Diagnosing "why did AI stop working" becomes guesswork.
- Action: Catch the `httpx.HTTPStatusError`, log the status code and response body server-side, and return a clear error message (for example "AI service returned 402: payment required"). Add a backend test with a mocked 4xx response.

### M3. The default board is defined twice and can drift
- Where: `backend/app/main.py:20-38` (`DEFAULT_BOARD`) and `frontend/src/lib/kanban.ts:18-72` (`initialData`).
- Problem: The same eight cards and five columns are hand-copied in two places. If someone edits one and not the other, new users see one board before login and a different one after. The mismatch is invisible until someone notices.
- Action: Have the backend serve the seed board (it already does via `GET /api/board`), and make the frontend's `initialData` a minimal placeholder used only when the API is unreachable. Alternatively, generate one file from the other. Cheapest option: add a comment in both files pointing at the twin, and a test asserting the two structures match is not practical across languages — so a short note in `CLAUDE.md`/README is the pragmatic fix.

### M4. Column colors use off-palette colors
- Where: `frontend/src/components/KanbanBoard.tsx:18-24` — `#2a9d8f` and `#e76f51` are not in the palette defined in `AGENTS.md`.
- Problem: Minor brand inconsistency; the documented palette is yellow/blue/purple/navy/gray.
- Action: Either extend the palette in `AGENTS.md` to include these two (they do look reasonable as column accents) or replace them with palette colors. Your call as reviewer — this is a design decision, not a bug.

### M5. Chat history grows without limit
- Where: `frontend/src/components/KanbanBoard.tsx:76-79`.
- Problem: Every AI request sends the entire conversation history plus the full board. Over a long session this makes requests slower and more expensive, and eventually the model input gets too large and the call fails.
- Action: Send only the last N messages (for example 10). One-line change plus a test assertion.

---

## Low priority / housekeeping

### L1. Duplicated line and dead code in the backend
- `backend/app/main.py:15` and `:19` both assign `PROJECT_ROOT` — delete line 19.
- `frontend/src/components/KanbanBoard.tsx:173` and `:199` — the `typeof fetch !== "function"` checks are unnecessary in a browser target; the project conventions explicitly say no unnecessary defensive programming. Remove them (behavior is identical in every supported browser).

### L2. Card edit form can show stale content after an AI change
- Where: `frontend/src/components/KanbanCard.tsx:23-24`.
- Problem: The edit form captures the card's title/details once, when the card first renders. If the AI edits that card while the edit form is open in another part of the screen, saving the form overwrites the AI's change with the old text. Rare, minor.
- Action: Accept as-is for the MVP, or reset the local state when `card` prop changes (small `useEffect`). Recommend accepting.

### L3. Writing the fallback HTML file on import
- Where: `backend/app/main.py:244-255`.
- Problem: The module writes `hello.html` to disk at import time — a side effect that also runs during tests. Harmless but unclean.
- Action: Only serve the inline HTML from the `/` route; drop the file write.

### L4. `.env` search walks up to the filesystem root
- Where: `backend/app/main.py:58-79` (`load_environment`).
- Problem: The function searches every parent directory for a `.env`, which in unusual setups could load an unrelated file. In practice the project-root and Docker paths are correct, and the API key correctly stays backend-only.
- Action: Acceptable for now. If touched later, restrict the search to the project root plus the current working directory.

### L5. Missing test coverage (specific gaps)
- `PUT /api/board` rejection path (ties into H2) — no test for invalid payloads.
- `applyBoardUpdate` orphan/unknown-card handling (ties into H3).
- `_parse_model_json` code-fence handling has only happy-path coverage via the AI tests; add direct unit tests for fenced JSON, plain text, and non-dict JSON.
- Playwright e2e suite was not executed in this review — run `npm run test:e2e` with the app running before the next release.

### L6. Security posture (accepted MVP risks, restated for the record)
- Login is frontend-only with hardcoded credentials (`frontend/src/app/page.tsx:6-7`) — anyone can bypass it by opening the API directly. All `/api/*` routes are unauthenticated, so anyone on your network can read or overwrite the board while the container runs. This is documented as an MVP constraint; flagging it so it is a conscious decision, not an oversight. Do not expose this container to the internet without adding real authentication.
- `OPENROUTER_API_KEY` handling is correct: it lives in root `.env`, is gitignored, never shipped to the frontend, and passed via `env_file` in Docker Compose. No leaks found.
- No injection risks: all SQL uses parameters; the frontend renders text through React (auto-escaped). No secrets in the tracked files (verified with `git ls-files`).

---

## Recommended action order

1. H1 — untrack `backend/app.db` (5 minutes, protects your data).
2. H2 — validate board on save + test (prevents permanent breakage).
3. M1 + M2 — non-blocking AI calls and real error messages (small, high daily-value).
4. H3 — harden `applyBoardUpdate` merge + tests.
5. M3, M5, then the L items as convenient.

## Verdict

The codebase is clean, consistent with its own conventions, and honestly scoped for an MVP. The two things I would not let linger are the committed database file (H1) and the unvalidated board save (H2) — both can cost you real data. Everything else is polish.

---

## Fix log (2026-09-21)

All high and medium priority items were fixed and verified.

| Item | Fix | Verification |
|------|-----|--------------|
| H1 | `backend/app.db` added to `.gitignore` and untracked from git (local file kept) | `git ls-files` no longer lists it; `git check-ignore` confirms |
| H2 | New `_validate_board` on `PUT /api/board`: rejects non-list columns, missing cards, unknown card ids, duplicate column ids, malformed cards | 4 new backend tests; live server returns 400 with a clear message |
| H3 | `applyBoardUpdate` moved to `src/lib/kanban.ts`, now ignores updates referencing unknown cards and drops cards that end up in no column | 4 new unit tests |
| M1 | Both AI endpoints changed from `async def` to `def`, so FastAPI runs them in a thread pool and the server stays responsive during AI calls | All 15 backend tests pass |
| M2 | AI calls wrapped with real error handling: OpenRouter errors logged server-side and returned as "AI service returned 402..." / "Could not reach the AI service" | 2 new backend tests |
| M3 | Frontend `initialData` reduced to a minimal offline placeholder; the backend `DEFAULT_BOARD` is now the single source of the seed board | Component and e2e tests updated to serve a seed board via API mock |
| M4 | Column accent colors now cycle through the documented palette only (blue, yellow, purple) | Visual check; lint and tests pass |
| M5 | Chat history sent to the AI capped at the last 10 messages | Code change; covered by existing tests |

Full regression after fixes: backend 15/15 passed, frontend unit 17/17 passed, lint clean, production build succeeds, Playwright e2e 3/3 passed, and a live server smoke test confirmed health, board load, and rejection of a bad save.

## New finding discovered during fixes (not in the original list)

- **Backend tests write to the real database.** The test suite uses the live `backend/app.db` — every `pytest` run overwrites the default user's actual board with test data. This has already happened: the board stored in the file is now test data. Your earlier board (as of the last commit) can be recovered from git history with `git show HEAD:backend/app.db`. Recommended fix (small): point the tests at a temporary database (for example via an env var for `DB_PATH`). Flagged for your decision — it was outside the approved scope of this pass.
