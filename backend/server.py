"""HTTP mỏng: CORS + validate + gọi predictor.predict(). Không có logic ML."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .predictor import Prediction, predict

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)


class TextRequest(BaseModel):
    content: str


@app.post("/predict", response_model=Prediction)
async def analyze_text(request: TextRequest) -> Prediction:
    return predict(request.content)
