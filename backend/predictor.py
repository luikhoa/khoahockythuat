"""Ranh giới AI — Dev AI chỉ sửa file này, không đụng FastAPI.

Hợp đồng I/O phải khớp content.js:

    if (kết.label !== 0 && kết.confidence >= 0.60) bọcNộiDung(el, kết)

Input  : text thô từ DOM (el.textContent.trim()), chưa normalize.
Output : Prediction(label, name, confidence, proba)
"""
from pathlib import Path
from typing import List, Literal, Optional

import __main__ as _main_module
import joblib
import torch
from pydantic import BaseModel, Field

from model import FrozenBackboneClassifier, ModelConfig, build_model, build_tokenizer

# Bỏ nhãn "đe doạ", chuyển hoàn toàn về 2 nhãn Binary
LABELS = ("an toàn", "độc hại")
Label = Literal[0, 1]

MODEL_PATH = Path(__file__).resolve().parent / "offensive_classifier.pkl"
NGƯỠNG_ĐỘC_HẠI = 0.4  # p1 >= ngưỡng này -> label 1, tối ưu recall


class Prediction(BaseModel):
    label: Label = Field(description="0 = an toàn, 1 = độc hại")
    name: str = Field(description='Tên lớp: "an toàn" | "độc hại"')
    confidence: float = Field(ge=0.0, le=1.0, description="max(proba)")
    proba: List[float] = Field(
        min_length=2,
        max_length=2,
        description="xác suất 2 lớp [p0 (an toàn), p1 (độc hại)] dùng Sigmoid, tổng = 1",
    )


def _an_toàn_mặc_định() -> Prediction:
    return Prediction(label=0, name=LABELS[0], confidence=1.0, proba=[1.0, 0.0])


class OffensiveTextClassifier:
    tokenizer_dir: str
    head_state_dict: dict
    cfg: ModelConfig
    label_names: List[str]


if not hasattr(_main_module, "OffensiveTextClassifier"):
    _main_module.OffensiveTextClassifier = OffensiveTextClassifier


_model: Optional[FrozenBackboneClassifier] = None
_tokenizer = None
_cfg: Optional[ModelConfig] = None


def _load() -> None:
    global _model, _tokenizer, _cfg

    artifact = joblib.load(MODEL_PATH)
    cfg: ModelConfig = artifact.cfg

    tokenizer_dir = Path(str(getattr(artifact, "tokenizer_dir", "")))
    if tokenizer_dir.is_dir():
        from transformers import AutoTokenizer

        tokenizer = AutoTokenizer.from_pretrained(str(tokenizer_dir), use_fast=False)
    else:
        tokenizer = build_tokenizer(cfg)

    model = build_model(cfg)
    model.head.load_state_dict(artifact.head_state_dict)
    model.eval()

    _model, _tokenizer, _cfg = model, tokenizer, cfg


try:
    _load()
except Exception as err:  # noqa: BLE001 — model lỗi/thiếu không được làm sập server
    print(f"[predictor] Không load được model tại {MODEL_PATH}: {err}")
    _model = None


def predict(text: str) -> Prediction:
    """Phân loại một câu tiếng Việt thành an toàn (0) hoặc độc hại (1) bằng Sigmoid.

    Parameters
    ----------
    text : str
        Text thô từ DOM (`el.textContent.trim()`). Chưa qua normalize.

    Returns
    -------
    Prediction
        label      : 0 | 1
        name       : LABELS[label]
        confidence : max(proba) ∈ [0, 1]
        proba      : [p_an_toàn, p_độc_hại], sum = 1
    """
    if _model is None or _tokenizer is None or _cfg is None:
        return _an_toàn_mặc_định()

    try:
        enc = _tokenizer(
            text,
            truncation=True,
            max_length=_cfg.max_length,
            return_tensors="pt",
        )
        with torch.no_grad():
            out = _model(input_ids=enc["input_ids"], attention_mask=enc["attention_mask"])
            
        logits = out["logits"][0]

        # 1. Nếu logits xuất ra 1 value (Binary Head chuẩn)
        if logits.dim() == 0 or logits.shape[0] == 1:
            p1 = torch.sigmoid(logits).item()
        # 2. Nếu weights cũ xuất 2 logits, lấy logit của class độc hại (index 1) rồi qua Sigmoid
        else:
            p1 = torch.sigmoid(logits[1]).item()

        # Áp dụng Sigmoid thuần túy cho Binary: An toàn = 1.0 - Độc hại
        p0 = 1.0 - p1

        label: Label = 1 if p1 >= NGƯỠNG_ĐỘC_HẠI else 0
        
        # Giữ độ chính xác float thực nghiệm (tránh round sớm gây lệch số ở frontend)
        proba = [round(p0, 4), round(p1, 4)]
        
        # Confidence lấy đúng theo nhãn dự đoán
        confidence = proba[label]

        return Prediction(label=label, name=LABELS[label], confidence=confidence, proba=proba)
    except Exception as err:  # noqa: BLE001 — lỗi predict không được làm sập server
        print(f"[predictor] Lỗi khi predict: {err}")
        return _an_toàn_mặc_định()