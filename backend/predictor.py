"""Ranh giới AI — Dev AI chỉ sửa file này, không đụng FastAPI.

Hợp đồng I/O phải khớp content.js:

    if (kết.label !== 0 && kết.confidence >= 0.60) bọcNộiDung(el, kết)

Input  : text thô từ DOM (el.textContent.trim()), chưa normalize.
Output : Prediction(label, name, confidence, proba)
"""
from typing import Literal

from pydantic import BaseModel, Field

LABELS = ("an toàn", "xúc phạm", "đe doạ")
Label = Literal[0, 1, 2]


class Prediction(BaseModel):
    label: Label = Field(description="0 = an toàn, 1 = xúc phạm, 2 = đe doạ")
    name: str = Field(description='Tên lớp: "an toàn" | "xúc phạm" | "đe doạ"')
    confidence: float = Field(ge=0.0, le=1.0, description="max(proba)")
    proba: list[float] = Field(
        min_length=3,
        max_length=3,
        description="softmax 3 lớp [p0, p1, p2], tổng ≈ 1",
    )


def predict(text: str) -> Prediction:
    """Phân loại một câu tiếng Việt thành an toàn / xúc phạm / đe doạ.

    Parameters
    ----------
    text : str
        Text thô từ DOM (`el.textContent.trim()`). Chưa qua normalize.
        Hàm này phải tự gọi pipeline tiền xử lý (NFC, leetspeak, n-gram, …).

    Returns
    -------
    Prediction
        label      : 0 | 1 | 2
        name       : LABELS[label]
        confidence : max(proba) ∈ [0, 1]
        proba      : [p_an_toàn, p_xúc_phạm, p_đe_doạ], sum ≈ 1

    Ghi chú cho content.js
    ----------------------
    Extension blur khi ``label != 0 and confidence >= 0.60``.
    Badge "đe doạ" khi ``label == 2``, ngược lại "gây tổn thương".
    """
    # TODO(dev-AI): load model, normalize(text), infer, trả Prediction thật.
    # Ràng buộc: confidence == max(proba), name == LABELS[label], sum(proba) ≈ 1.
    
    # place holder

    blur = Prediction(
        label=2,
        name=LABELS[2],
        confidence=0.79,
        proba=[0, 0.4, 0.7],
    )
    no_blur = Prediction(
        label=0,
        name=LABELS[0],
        confidence=1.0,
        proba=[1.0, 0.0, 0.0],
    )
    if text == "helloworld":
        return blur
    else:
        return no_blur
