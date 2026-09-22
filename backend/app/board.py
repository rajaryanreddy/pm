"""Board shape: the seed board and validation rules for saved boards."""

from __future__ import annotations

import json

from fastapi import HTTPException

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


def get_default_board() -> dict:
    return json.loads(json.dumps(DEFAULT_BOARD))


def validate_board(board: object) -> dict:
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
