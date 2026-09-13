"""Unit test cho backend/server.py (lớp HTTP mỏng) bằng FastAPI TestClient —
không cần backend đang chạy thật (khác với tests/blackbox_runner.py chạy
qua HTTP thật để đo latency/robustness).

Chạy: pytest tests/unit/test_server_api.py -v
"""
import pytest
from fastapi.testclient import TestClient

import server


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(server.app)


class TestHealthEndpoint:
    def test_health_returns_ok(self, client: TestClient):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}

    def test_health_does_not_reflect_model_load_state(self, client: TestClient, monkeypatch):
        """LỖ HỔNG GHI NHẬN: /health trả 'ok' tĩnh, không kiểm tra predictor._model.
        Nếu model load thất bại lúc khởi động, health check vẫn xanh trong khi
        toàn bộ tính năng phân loại đã âm thầm rơi về fail-open (luôn 'an toàn').
        Test này xác nhận hành vi hiện tại để nhắc dev bổ sung kiểm tra model
        state vào /health.
        """
        import predictor
        monkeypatch.setattr(predictor, "_model", None)
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"  # không đổi dù model đã "chết"


class TestPredictEndpoint:
    def test_predict_valid_payload(self, client: TestClient):
        r = client.post("/predict", json={"content": "xin chào bạn"})
        assert r.status_code == 200
        body = r.json()
        assert set(body) >= {"label", "name", "confidence", "proba"}
        assert body["label"] in (0, 1)

    def test_predict_missing_field_returns_422(self, client: TestClient):
        r = client.post("/predict", json={})
        assert r.status_code == 422

    def test_predict_wrong_type_returns_422(self, client: TestClient):
        r = client.post("/predict", json={"content": 12345})
        assert r.status_code == 422

    def test_predict_empty_string_is_accepted(self, client: TestClient):
        r = client.post("/predict", json={"content": ""})
        assert r.status_code == 200

    def test_predict_no_length_limit_enforced(self, client: TestClient):
        """LỖ HỔNG GHI NHẬN: TextRequest.content không có max_length -> input
        gần như không giới hạn kích thước được BE chấp nhận (xem Phần 2, mục
        'Không giới hạn độ dài input'). Test xác nhận payload 500KB vẫn 200."""
        r = client.post("/predict", json={"content": "a" * 500_000})
        assert r.status_code == 200

    def test_predict_malformed_json_returns_4xx(self, client: TestClient):
        r = client.post(
            "/predict",
            content=b'{"content": "thieu ngoac dong"',
            headers={"Content-Type": "application/json"},
        )
        assert 400 <= r.status_code < 500

    def test_predict_html_injection_payload_is_not_reflected_unsafely(self, client: TestClient):
        payload = "<script>alert(1)</script>"
        r = client.post("/predict", json={"content": payload})
        assert r.status_code == 200
        # response chỉ chứa label/confidence/proba, không echo lại text gốc
        assert payload not in r.text


class TestCORSConfig:
    def test_cors_allows_any_origin(self, client: TestClient):
        """LỖ HỔNG GHI NHẬN (High, xem Phần 2): allow_origins=["*"] kết hợp
        không có xác thực (auth) nghĩa là BẤT KỲ trang web nào người dùng mở
        cũng có thể gọi thẳng backend cục bộ này từ JS phía trình duyệt."""
        r = client.options(
            "/predict",
            headers={
                "Origin": "https://trang-web-bat-ky.example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert r.headers.get("access-control-allow-origin") == "*"


class TestEventsEndpoint:
    def test_invalid_event_type_returns_422(self, client: TestClient):
        r = client.post("/events", json={"type": "khong_hop_le"})
        assert r.status_code == 422

    def test_valid_event_type_accepted(self, client: TestClient):
        r = client.post("/events", json={"type": "scanned", "count": 1})
        assert r.status_code == 200
        assert r.json() == {"ok": True}
