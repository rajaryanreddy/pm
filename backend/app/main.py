"""FastAPI app: routes and static-file serving. Logic lives in the sibling modules."""

from __future__ import annotations

import json
import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.ai import BOARD_SYSTEM_PROMPT, call_openrouter, parse_model_json
from app.board import validate_board
from app.config import FALLBACK_HTML, FRONTEND_BUILD_DIR, PROJECT_ROOT, load_environment
from app.database import load_board, save_board

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
    return load_board()


@app.put("/api/board")
async def update_board(board: dict) -> dict:
    return save_board(validate_board(board))


def _require_api_key() -> str:
    load_environment(PROJECT_ROOT)
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is not configured.")
    return api_key


@app.post("/api/ai/test")
def ai_test(payload: dict) -> dict:
    question = payload.get("question", "")
    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")

    content = call_openrouter(_require_api_key(), [{"role": "user", "content": question}])
    parsed = parse_model_json(content)
    return {"answer": parsed.get("message", content) if parsed else str(content)}


@app.post("/api/ai/board")
def ai_board(payload: dict) -> dict:
    question = payload.get("question", "")
    board = payload.get("board", {})
    history = payload.get("history", [])

    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")

    content = call_openrouter(
        _require_api_key(),
        [
            {"role": "system", "content": BOARD_SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps({"question": question, "board": board, "history": history})},
        ],
    )
    parsed = parse_model_json(content) or {"message": str(content), "board_update": None}

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
