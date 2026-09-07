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

LABELS = ("an toàn", "xúc phạm", "đe doạ")
Label = Literal[0, 1, 2]

MODEL_PATH = Path(__file__).resolve().parent / "offensive_classifier.pkl"
NGƯỠNG_ĐỘC_HẠI = 0.4  # p1 >= ngưỡng này -> label 1, tối ưu recall


class Prediction(BaseModel):
    label: Label = Field(description="0 = an toàn, 1 = xúc phạm, 2 = đe doạ")
    name: str = Field(description='Tên lớp: "an toàn" | "xúc phạm" | "đe doạ"')
    confidence: float = Field(ge=0.0, le=1.0, description="max(proba)")
    proba: List[float] = Field(
        min_length=3,
        max_length=3,
        description="softmax 3 lớp [p0, p1, p2], tổng ≈ 1",
    )


def _an_toàn_mặc_định() -> Prediction:
    return Prediction(label=0, name=LABELS[0], confidence=1.0, proba=[1.0, 0.0, 0.0])


# offensive_classifier.pkl được pickle từ notebook Kaggle bằng class
# `OffensiveTextClassifier`, chỉ tồn tại trong __main__ lúc train — không có
# trong repo. Đây chỉ là vỏ chứa dữ liệu (tokenizer_dir, head_state_dict, cfg,
# label_names), không phải kiến trúc thật (kiến trúc thật là
# FrozenBackboneClassifier ở model.py). Đăng ký placeholder vào __main__ để
# joblib unpickle không báo AttributeError, rồi tự dựng lại model thật bên
# dưới từ các trường dữ liệu thô đó.
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

    # tokenizer_dir là path Kaggle lúc train, thường không tồn tại ở máy chạy
    # backend -> rơi về tải lại đúng tokenizer gốc (cfg.pretrained_name).
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
    """Phân loại một câu tiếng Việt thành an toàn / xúc phạm / đe doạ.

    Parameters
    ----------
    text : str
        Text thô từ DOM (`el.textContent.trim()`). Chưa qua normalize.

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

    Model hiện tại (offensive_classifier.pkl -> FrozenBackboneClassifier,
    xem model.py) là PhoBERT backbone đóng băng + head 2 lớp huấn luyện
    (0 = not_offensive, 1 = offensive). Lớp "đe doạ" (2) chưa có model riêng
    nên p2 luôn = 0.0 — sẽ bổ sung khi có model 3 lớp thật.
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
        p0, p1 = torch.softmax(out["logits"][0], dim=-1).tolist()

        label: Label = 1 if p1 >= NGƯỠNG_ĐỘC_HẠI else 0
        proba = [round(p0, 4), round(p1, 4), 0.0]
        confidence = max(proba)
        return Prediction(label=label, name=LABELS[label], confidence=confidence, proba=proba)
    except Exception as err:  # noqa: BLE001 — lỗi predict không được làm sập server
        print(f"[predictor] Lỗi khi predict: {err}")
        return _an_toàn_mặc_định()
