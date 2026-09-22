"""SQLite persistence for the board."""

from __future__ import annotations

import json
import sqlite3

from app.board import get_default_board
from app.config import db_path

DEFAULT_USER_ID = "user"


def _get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(db_path())
    connection.row_factory = sqlite3.Row
    return connection


def _ensure_database() -> None:
    with _get_connection() as connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS board_data (user_id TEXT PRIMARY KEY, board_json TEXT NOT NULL)"
        )


def load_board(user_id: str = DEFAULT_USER_ID) -> dict:
    _ensure_database()
    with _get_connection() as connection:
        row = connection.execute(
            "SELECT board_json FROM board_data WHERE user_id = ?",
            (user_id,),
        ).fetchone()

    if row is None:
        board = get_default_board()
        save_board(board, user_id)
        return board

    return json.loads(row["board_json"])


def save_board(board: dict, user_id: str = DEFAULT_USER_ID) -> dict:
    _ensure_database()
    payload = json.dumps(board)
    with _get_connection() as connection:
        connection.execute(
            "INSERT INTO board_data (user_id, board_json) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET board_json = excluded.board_json",
            (user_id, payload),
        )
    return board
