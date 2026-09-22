from __future__ import annotations

import json
import logging
import os
import sqlite3
from pathlib import Path

import httpx
from dotenv import dotenv_values
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
AI_MODEL = "openai/gpt-oss-20b"


def _validate_board(board: object) -> dict:
    if not isinstance(board, dict):
        raise HTTPException(status_code=400, detail="Board payload must be a JSON object.")

    columns = board.get("columns")
    cards = board.get("cards")
    if not isinstance(columns, list) or not columns:
        raise HTTPException(status_code=400, detail="Board payload must include a non-empty columns list.")
    if not isinstance(cards, dict):
        raise HTTPException(status_code=400, detail="Board payload must include a cards object.")

    for column in columns:
        if not isinstance(column, dict) or not isinstance(column.get("id"), str) or not column["id"]:
            raise HTTPException(status_code=400, detail="Every column must have a non-empty string id.")
        if not isinstance(column.get("title"), str):
            raise HTTPException(status_code=400, detail="Every column must have a string title.")
        card_ids = column.get("cardIds")
        if not isinstance(card_ids, list) or not all(isinstance(card_id, str) for card_id in card_ids):
            raise HTTPException(status_code=400, detail="Every column must have a cardIds list of strings.")

    column_ids = [column["id"] for column in columns]
    if len(column_ids) != len(set(column_ids)):
        raise HTTPException(status_code=400, detail="Column ids must be unique.")

    for card_id in (card_id for column in columns for card_id in column["cardIds"]):
        if card_id not in cards:
            raise HTTPException(status_code=400, detail=f"Card id '{card_id}' has no matching card.")

    for card_id, card in cards.items():
        if not isinstance(card, dict) or not isinstance(card.get("title"), str):
            raise HTTPException(status_code=400, detail=f"Card '{card_id}' must have a string title.")

    return board


def _call_openrouter(api_key: str, messages: list[dict]) -> str:
    try:
        response = httpx.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"model": AI_MODEL, "messages": messages},
            timeout=30,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        status = error.response.status_code
        logger.error("OpenRouter returned %s: %s", status, error.response.text)
        raise HTTPException(
            status_code=502,
            detail=f"AI service returned {status}. Check the OpenRouter API key and quota.",
        ) from error
    except httpx.HTTPError as error:
        logger.error("Could not reach OpenRouter: %s", error)
        raise HTTPException(status_code=502, detail="Could not reach the AI service.") from error

    return response.json()["choices"][0]["message"]["content"]

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent
FRONTEND_BUILD_DIR = PROJECT_ROOT / "frontend" / "out"
FALLBACK_HTML = BASE_DIR / "app" / "static" / "hello.html"
DB_PATH = BASE_DIR / "app.db"


def _db_path() -> Path:
    # PM_DB_PATH lets the test suite use a throwaway database.
    return Path(os.environ.get("PM_DB_PATH", str(DB_PATH)))
PROJECT_ROOT = BASE_DIR.parent
DEFAULT_BOARD = {
    "columns": [
        {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"]},
        {"id": "col-discovery", "title": "Discovery", "cardIds": ["card-3"]},
        {"id": "col-progress", "title": "In Progress", "cardIds": ["card-4", "card-5"]},
        {"id": "col-review", "title": "Review", "cardIds": ["card-6"]},
        {"id": "col-done", "title": "Done", "cardIds": ["card-7", "card-8"]},
    ],
    "cards": {
        "card-1": {"id": "card-1", "title": "Align roadmap themes", "details": "Draft quarterly themes with impact statements and metrics."},
        "card-2": {"id": "card-2", "title": "Gather customer signals", "details": "Review support tags, sales notes, and churn feedback."},
        "card-3": {"id": "card-3", "title": "Prototype analytics view", "details": "Sketch initial dashboard layout and key drill-downs."},
        "card-4": {"id": "card-4", "title": "Refine status language", "details": "Standardize column labels and tone across the board."},
        "card-5": {"id": "card-5", "title": "Design card layout", "details": "Add hierarchy and spacing for scanning dense lists."},
        "card-6": {"id": "card-6", "title": "QA micro-interactions", "details": "Verify hover, focus, and loading states."},
        "card-7": {"id": "card-7", "title": "Ship marketing page", "details": "Final copy approved and asset pack delivered."},
        "card-8": {"id": "card-8", "title": "Close onboarding sprint", "details": "Document release notes and share internally."},
    },
}


def _parse_model_json(content: object) -> dict | None:
    if not isinstance(content, str):
        return content if isinstance(content, dict) else None

    cleaned = content.strip()
    if cleaned.startswith("```") and cleaned.endswith("```"):
        cleaned = cleaned[3:-3].strip()
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def load_environment(start_dir: Path | str | None = None) -> None:
    search_roots: list[Path] = []
    base = Path(start_dir) if start_dir is not None else PROJECT_ROOT
    candidate = base.resolve()

    while True:
        search_roots.append(candidate)
        if candidate == candidate.parent:
            break
        candidate = candidate.parent

    for root in search_roots:
        env_path = root / ".env"
        if env_path.exists():
            values = dotenv_values(env_path)
            for key, value in values.items():
                if key and value is not None and not os.getenv(key):
                    os.environ[key] = value
            break


load_environment(PROJECT_ROOT)


def _get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(_db_path())
    connection.row_factory = sqlite3.Row
    return connection


def _ensure_database() -> None:
    with _get_connection() as connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS board_data (user_id TEXT PRIMARY KEY, board_json TEXT NOT NULL)"
        )


def _get_default_board() -> dict:
    return json.loads(json.dumps(DEFAULT_BOARD))


def _load_board(user_id: str = "user") -> dict:
    _ensure_database()
    with _get_connection() as connection:
        row = connection.execute(
            "SELECT board_json FROM board_data WHERE user_id = ?",
            (user_id,),
        ).fetchone()

    if row is None:
        board = _get_default_board()
        _save_board(board, user_id)
        return board

    return json.loads(row["board_json"])


def _save_board(board: dict, user_id: str = "user") -> dict:
    _ensure_database()
    payload = json.dumps(board)
    with _get_connection() as connection:
        connection.execute(
            "INSERT INTO board_data (user_id, board_json) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET board_json = excluded.board_json",
            (user_id, payload),
        )
    return board


app = FastAPI(title="Project Management MVP API")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "message": "Hello world from FastAPI"}


@app.get("/api/demo")
async def demo() -> dict[str, str]:
    return {
        "message": "hello world",
        "board": "kanban",
        "status": "ready",
    }


@app.get("/api/board")
async def get_board() -> dict:
    return _load_board()


@app.put("/api/board")
async def update_board(board: dict) -> dict:
    return _save_board(_validate_board(board))


@app.post("/api/ai/test")
def ai_test(payload: dict) -> dict:
    question = payload.get("question", "")
    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")

    load_environment(PROJECT_ROOT)
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is not configured.")

    content = _call_openrouter(api_key, [{"role": "user", "content": question}])
    parsed = _parse_model_json(content)
    return {"answer": parsed.get("message", content) if parsed else str(content)}


@app.post("/api/ai/board")
def ai_board(payload: dict) -> dict:
    question = payload.get("question", "")
    board = payload.get("board", {})
    history = payload.get("history", [])

    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")

    load_environment(PROJECT_ROOT)
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is not configured.")

    content = _call_openrouter(
        api_key,
        [
            {
                "role": "system",
                "content": (
                    "You are a project-management assistant. Return only valid JSON with keys "
                    "message and board_update. If no board update is needed, set board_update to null. "
                    "When changing the board, board_update must include the complete columns and cards "
                    "objects, preserve every existing card and column, and change cardIds to reflect moves. "
                    "Never claim a card was moved unless its cardId appears in the destination column."
                ),
            },
            {"role": "user", "content": json.dumps({"question": question, "board": board, "history": history})},
        ],
    )
    parsed = _parse_model_json(content) or {"message": str(content), "board_update": None}

    return {
        "response": parsed.get("message", ""),
        "board_update": parsed.get("board_update"),
    }


@app.get("/hello")
async def hello_world() -> HTMLResponse:
    return HTMLResponse("<html><body><h1>Hello world</h1></body></html>")


if FRONTEND_BUILD_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_BUILD_DIR), html=True), name="frontend")
else:
    FALLBACK_HTML.parent.mkdir(parents=True, exist_ok=True)
    FALLBACK_HTML.write_text(
        "<html><body><h1>Hello world</h1><p>FastAPI is serving the scaffold.</p></body></html>",
        encoding="utf-8",
    )

    @app.get("/")
    async def root() -> HTMLResponse:
        return HTMLResponse(FALLBACK_HTML.read_text(encoding="utf-8"))
