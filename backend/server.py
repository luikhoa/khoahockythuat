"""HTTP mỏng: CORS + validate + gọi predictor.predict(). Không có logic ML."""
from typing import Literal, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import storage
from predictor import Prediction, predict

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class TextRequest(BaseModel):
    content: str = Field(min_length=1, max_length=1200)


class EventRequest(BaseModel):
    """Một lần tăng bộ đếm thống kê — không có text/nội dung, không có PII."""
    type: Literal["scanned", "toxic", "threat", "link", "revealed"]
    count: int = Field(default=1, ge=1, le=10_000)
    ts: Optional[str] = None


class StatsResponse(BaseModel):
    scanned: int
    toxic: int
    threat: int
    links: int
    revealed: int


@app.post("/predict", response_model=Prediction)
async def analyze_text(request: TextRequest) -> Prediction:
    return predict(request.content)


@app.post("/events")
async def record_event(event: EventRequest) -> dict:
    storage.increment_event(event.type, event.count, event.ts)
    return {"ok": True}


@app.get("/stats", response_model=StatsResponse)
async def get_stats(range: Literal["day", "week"] = "day") -> StatsResponse:
    return StatsResponse(**storage.get_stats(range))


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
