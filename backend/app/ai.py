"""OpenRouter integration: calls, response parsing, and error handling."""

from __future__ import annotations

import json
import logging

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
AI_MODEL = "openai/gpt-oss-20b"

BOARD_SYSTEM_PROMPT = (
    "You are a project-management assistant. Return only valid JSON with keys "
    "message and board_update. If no board update is needed, set board_update to null. "
    "When changing the board, board_update must include the complete columns and cards "
    "objects, preserve every existing card and column, and change cardIds to reflect moves. "
    "Never claim a card was moved unless its cardId appears in the destination column."
)


def parse_model_json(content: object) -> dict | None:
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


def call_openrouter(api_key: str, messages: list[dict]) -> str:
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
