import json as json_module
import os

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch) -> None:
    """Point every test at a throwaway database so real board data is never touched."""
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "test_app.db"))


def test_load_environment_reads_project_dotenv(tmp_path, monkeypatch) -> None:
    dotenv_path = tmp_path / ".env"
    dotenv_path.write_text("OPENROUTER_API_KEY=from-dotenv\n", encoding="utf-8")

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    from app.config import load_environment

    load_environment(dotenv_path.parent)

    assert os.environ["OPENROUTER_API_KEY"] == "from-dotenv"


def test_health_endpoint() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_demo_endpoint() -> None:
    response = client.get("/api/demo")
    assert response.status_code == 200
    assert response.json()["message"] == "hello world"


def test_board_endpoint_returns_default_board() -> None:
    response = client.get("/api/board")
    assert response.status_code == 200
    payload = response.json()
    assert payload["columns"]
    assert payload["cards"]


def test_board_endpoint_persists_updates() -> None:
    board = {
        "columns": [{"id": "col-one", "title": "Todo", "cardIds": ["card-one"]}],
        "cards": {
            "card-one": {"id": "card-one", "title": "Persisted task", "details": "Saved"},
        },
    }

    put_response = client.put("/api/board", json=board)
    assert put_response.status_code == 200

    get_response = client.get("/api/board")
    assert get_response.status_code == 200
    assert get_response.json()["cards"]["card-one"]["title"] == "Persisted task"


def test_board_endpoint_rejects_missing_cards() -> None:
    response = client.put("/api/board", json={"columns": [{"id": "col-one", "title": "Todo", "cardIds": []}]})
    assert response.status_code == 400
    assert "cards" in response.json()["detail"]


def test_board_endpoint_rejects_columns_that_are_not_a_list() -> None:
    response = client.put("/api/board", json={"columns": "nope", "cards": {}})
    assert response.status_code == 400


def test_board_endpoint_rejects_card_without_matching_card() -> None:
    board = {
        "columns": [{"id": "col-one", "title": "Todo", "cardIds": ["ghost-card"]}],
        "cards": {},
    }
    response = client.put("/api/board", json=board)
    assert response.status_code == 400
    assert "ghost-card" in response.json()["detail"]


def test_board_endpoint_rejects_duplicate_column_ids() -> None:
    board = {
        "columns": [
            {"id": "col-one", "title": "Todo", "cardIds": []},
            {"id": "col-one", "title": "Again", "cardIds": []},
        ],
        "cards": {},
    }
    response = client.put("/api/board", json=board)
    assert response.status_code == 400
    assert "unique" in response.json()["detail"]


def test_ai_test_endpoint_reports_openrouter_errors(monkeypatch) -> None:
    def fake_post(url, headers=None, json=None, timeout=None):
        request = httpx.Request("POST", url)
        response = httpx.Response(402, request=request, text="payment required")
        response.raise_for_status()

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr("app.ai.httpx.post", fake_post)

    response = client.post("/api/ai/test", json={"question": "2+2"})
    assert response.status_code == 502
    assert "402" in response.json()["detail"]


def test_ai_test_endpoint_reports_connection_failures(monkeypatch) -> None:
    def fake_post(url, headers=None, json=None, timeout=None):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr("app.ai.httpx.post", fake_post)

    response = client.post("/api/ai/test", json={"question": "2+2"})
    assert response.status_code == 502
    assert "Could not reach" in response.json()["detail"]


def test_ai_test_endpoint_calls_openrouter(monkeypatch) -> None:
    class FakeResponse:
        def __init__(self, payload, status_code=200):
            self._payload = payload
            self.status_code = status_code
            self.text = json_module.dumps(payload)

        def raise_for_status(self):
            if self.status_code >= 400:
                raise RuntimeError("Bad request")

        def json(self):
            return self._payload

    def fake_post(url, headers=None, json=None, timeout=None):
        assert url == "https://openrouter.ai/api/v1/chat/completions"
        assert headers["Authorization"].startswith("Bearer ")
        assert json["messages"]
        return FakeResponse({
            "choices": [{"message": {"content": json_module.dumps({"message": "The answer is 4."})}}]
        })

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr("app.ai.httpx.post", fake_post)

    response = client.post("/api/ai/test", json={"question": "2+2"})
    assert response.status_code == 200
    assert response.json()["answer"] == "The answer is 4."


def test_ai_test_endpoint_handles_plain_text_response(monkeypatch) -> None:
    class FakeResponse:
        def __init__(self, payload, status_code=200):
            self._payload = payload
            self.status_code = status_code
            self.text = json_module.dumps(payload)

        def raise_for_status(self):
            if self.status_code >= 400:
                raise RuntimeError("Bad request")

        def json(self):
            return self._payload

    def fake_post(url, headers=None, json=None, timeout=None):
        return FakeResponse({
            "choices": [{"message": {"content": "The answer is 4."}}]
        })

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr("app.ai.httpx.post", fake_post)

    response = client.post("/api/ai/test", json={"question": "2+2"})
    assert response.status_code == 200
    assert response.json()["answer"] == "The answer is 4."


def test_ai_board_endpoint_returns_structured_board_update(monkeypatch) -> None:
    class FakeResponse:
        def __init__(self, payload, status_code=200):
            self._payload = payload
            self.status_code = status_code
            self.text = json_module.dumps(payload)

        def raise_for_status(self):
            if self.status_code >= 400:
                raise RuntimeError("Bad request")

        def json(self):
            return self._payload

    def fake_post(url, headers=None, json=None, timeout=None):
        assert json["messages"]
        return FakeResponse({
            "choices": [{"message": {"content": json_module.dumps({
                "message": "I added a card for the launch plan.",
                "board_update": {
                    "columns": [{"id": "col-backlog", "title": "Backlog", "cardIds": ["card-9"]}],
                    "cards": {"card-9": {"id": "card-9", "title": "Launch plan", "details": "Prepare release"}},
                },
            })}}]
        })

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr("app.ai.httpx.post", fake_post)

    response = client.post(
        "/api/ai/board",
        json={
            "question": "Add a launch plan card",
            "board": {"columns": [], "cards": {}},
            "history": [],
        },
    )

    assert response.status_code == 200
    assert response.json()["response"] == "I added a card for the launch plan."
    assert response.json()["board_update"]["cards"]["card-9"]["title"] == "Launch plan"


def test_hello_page() -> None:
    response = client.get("/hello")
    assert response.status_code == 200
    assert "Hello world" in response.text
