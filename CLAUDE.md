# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A local project-management MVP: a Kanban board with an AI assistant. Next.js static frontend served by a FastAPI backend, SQLite persistence, OpenRouter for AI. Runs locally via Docker Compose. Docs live in `docs/` (`PLAN.md`, `TECHNICAL_DESIGN.md` — the latter is the authoritative design); root `AGENTS.md` holds business requirements and the color palette.

MVP constraints: frontend-only login (`user` / `password`), one board per user, backend always operates on the default user identity `user`.

## Commands

### Run the app (Docker)
```bash
./scripts/start.sh    # docker compose up --build, serves on http://localhost:8000
./scripts/stop.sh
```

### Backend (from `backend/`, using root `.venv`)
```bash
source ../.venv/bin/activate
PYTHONPATH=. pytest tests/test_app.py -q                      # all backend tests
PYTHONPATH=. pytest tests/test_app.py -k test_health_endpoint -q   # single test
uvicorn app.main:app --host 0.0.0.0 --port 8000               # run backend directly
```
Note: the import path is `app.main` (tests use `from app.main import app`); the pyproject wheel packages `app/`. The README's `backend.app.main` path is wrong — use `app.main` from `backend/`.

### Frontend (from `frontend/`)
```bash
npm test          # vitest unit/component tests
npm run test:e2e  # playwright (tests/kanban.spec.ts)
npm run test:all  # unit + e2e
npm run lint
npm run build     # static export to frontend/out
```
Note: the Docker image builds the frontend itself (`npm run build` runs inside the container), so a local build is only needed when running the backend directly outside Docker — FastAPI serves `frontend/out`.

### Smoke checks
```bash
curl http://localhost:8000/api/health
curl -X POST http://localhost:8000/api/ai/test -H 'Content-Type: application/json' -d '{"question":"2+2"}'
```

## Architecture

Single FastAPI app (`backend/app/main.py`) contains everything backend: routes, SQLite persistence, OpenRouter integration, and static-file serving of `frontend/out`.

- **Board persistence**: one SQLite table `board_data (user_id PRIMARY KEY, board_json TEXT)` at `backend/app.db`, storing the whole board as one JSON blob (upsert on save). Created automatically on first access; `GET /api/board` seeds the default board if no row exists.
- **API routes**: `GET/PUT /api/board` (load/save board JSON), `POST /api/ai/test` (OpenRouter connectivity check), `POST /api/ai/board` (question + current board + chat history → text response plus optional `board_update`). `OPENROUTER_API_KEY` comes from the root `.env`, loaded via `load_environment()`; it must stay backend-only.
- **Frontend**: `src/app/page.tsx` owns the login gate; `KanbanBoard.tsx` owns board state, all API calls, drag-and-drop (@dnd-kit), and the AI chat sidebar (built into `KanbanBoard.tsx`, not a separate component). Board types and card-movement logic live in `src/lib/kanban.ts`. Board state and AI conversation state are deliberately kept separate; the AI panel scrolls independently so it never resizes the board.
- **AI updates apply automatically** — no approval step. The frontend merges `board_update` into current state (update existing columns, append new ones, merge cards, remove moved card IDs from old columns) and then saves via `PUT /api/board`. The backend tolerates model output wrapped in Markdown code fences and falls back to plain text when the model doesn't return JSON.

## Conventions

- Keep it simple — no over-engineering, no extra features, no unnecessary defensive programming.
- No emojis in any output or docs.
- Color palette (see root `AGENTS.md`): yellow `#ecad0a` accents, blue `#209dd7` primary, purple `#753991` actions, dark navy `#032147` headings, gray `#888888` supporting text.
- When debugging, identify the root cause with evidence before fixing — don't guess.
