"""Focused integration tests for HTTP validation and the public API contract."""
import sys
import types
import unittest
from unittest.mock import patch

import httpx
from pydantic import BaseModel


class Prediction(BaseModel):
    label: int
    name: str
    confidence: float
    proba: list[float]


def fake_predict(content: str) -> Prediction:
    return Prediction(label=0, name="an toàn", confidence=0.9, proba=[0.9, 0.1])


predictor_stub = types.ModuleType("predictor")
predictor_stub.Prediction = Prediction
predictor_stub.predict = fake_predict
sys.modules.setdefault("predictor", predictor_stub)

import server  # noqa: E402  (stub predictor before importing the app)


class ServerIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        transport = httpx.ASGITransport(app=server.app)
        self.client = httpx.AsyncClient(transport=transport, base_url="http://testserver")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()

    async def test_health_and_predict(self) -> None:
        self.assertEqual((await self.client.get("/health")).json(), {"status": "ok"})
        response = await self.client.post("/predict", json={"content": "nội dung hợp lệ"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["proba"], [0.9, 0.1])

    async def test_predict_rejects_empty_and_oversized_content(self) -> None:
        self.assertEqual((await self.client.post("/predict", json={"content": ""})).status_code, 422)
        self.assertEqual((await self.client.post("/predict", json={"content": "x" * 1201})).status_code, 422)

    async def test_event_count_is_bounded(self) -> None:
        with patch.object(server.storage, "increment_event") as increment:
            accepted = await self.client.post("/events", json={"type": "scanned", "count": 10_000})
            rejected = await self.client.post("/events", json={"type": "scanned", "count": 10_001})
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(rejected.status_code, 422)
        increment.assert_called_once_with("scanned", 10_000, None)

    async def test_cors_allows_demo_but_not_arbitrary_sites(self) -> None:
        allowed = await self.client.options(
            "/predict",
            headers={"Origin": "http://localhost:8080", "Access-Control-Request-Method": "POST"},
        )
        blocked = await self.client.options(
            "/predict",
            headers={"Origin": "https://example.com", "Access-Control-Request-Method": "POST"},
        )
        self.assertEqual(allowed.headers.get("access-control-allow-origin"), "http://localhost:8080")
        self.assertNotIn("access-control-allow-origin", blocked.headers)


if __name__ == "__main__":
    unittest.main()
