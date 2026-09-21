from dataclasses import dataclass

import torch
import torch.nn as nn
from transformers import AutoModel, AutoTokenizer, PreTrainedTokenizer

try:
    from .config import DROPOUT, HIDDEN_DIM, MAX_LENGTH, MODEL_NAME, NUM_LABELS
except ImportError:  # Giữ tương thích khi chạy trực tiếp từ backend/.
    from config import DROPOUT, HIDDEN_DIM, MAX_LENGTH, MODEL_NAME, NUM_LABELS


@dataclass
class ModelConfig:
    pretrained_name: str = MODEL_NAME
    num_labels: int = NUM_LABELS
    max_length: int = MAX_LENGTH
    hidden_dim: int = HIDDEN_DIM
    dropout: float = DROPOUT
    # PHẢI khớp phobert_experiment_complete/model.py::ModelConfig — artifact
    # pickle từ Kaggle chứa một instance của lớp này với field này, unpickle
    # sẽ lỗi/mất field nếu hai bên lệch schema. Giá trị thật lúc load lấy từ
    # artifact.cfg (đã pickle kèm checkpoint), không phải default ở đây.
    #
    # Default PHẢI là 0 (không phải config.UNFREEZE_LAST_N_LAYERS=6) — pickle
    # của dataclass chỉ lưu __dict__ instance, không gọi lại __init__; một
    # checkpoint .pkl CŨ (trước khi field này tồn tại) khi unpickle sẽ không
    # có key này trong __dict__ và rơi về default Ở CLASS NÀY tại thời điểm
    # LOAD (không phải lúc train) — nếu default là 6, checkpoint cũ (thật
    # ra đóng băng hoàn toàn) sẽ bị hiểu nhầm là cần backbone_state_dict và
    # predictor._load() sẽ raise (đã tái hiện lỗi này khi test ngược artifact
    # phobert-offensive-1 hiện có). 6 chỉ nên là default cho --unfreeze-last-
    # n-layers ở train.py (áp dụng tường minh lúc CONSTRUCT ModelConfig mới,
    # được ghi thật vào __dict__ nên pickle/unpickle đúng).
    unfreeze_last_n_layers: int = 0


def build_tokenizer(cfg: ModelConfig = ModelConfig()) -> PreTrainedTokenizer:
    return AutoTokenizer.from_pretrained(cfg.pretrained_name, use_fast=False)


class AdapterMLPHead(nn.Module):
    def __init__(self, in_dim: int, hidden_dim: int, num_labels: int, dropout: float):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, num_labels),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class FrozenBackboneClassifier(nn.Module):
    """Tên lớp giữ nguyên vì lý do lịch sử (predictor.py/export_onnx.py
    import trực tiếp tên này) — kể từ khi `unfreeze_last_n_layers > 0`,
    backbone KHÔNG còn đóng băng hoàn toàn nữa. Bản sao đồng bộ tay với
    phobert_experiment_complete/model.py (dùng lúc train trên Kaggle) —
    PHẢI sửa cả hai nếu đổi kiến trúc."""

    def __init__(self, cfg: ModelConfig = ModelConfig()):
        super().__init__()
        self.cfg = cfg
        self.backbone = AutoModel.from_pretrained(cfg.pretrained_name)
        self._apply_freeze_policy(cfg.unfreeze_last_n_layers)
        self.head = AdapterMLPHead(
            self.backbone.config.hidden_size, cfg.hidden_dim, cfg.num_labels, cfg.dropout
        )
        self.register_buffer("class_weights", torch.ones(cfg.num_labels), persistent=False)

    def _apply_freeze_policy(self, unfreeze_last_n_layers: int) -> None:
        for p in self.backbone.parameters():
            p.requires_grad = False
        if unfreeze_last_n_layers <= 0:
            return
        layers = self.backbone.encoder.layer
        if unfreeze_last_n_layers > len(layers):
            raise ValueError(
                f"unfreeze_last_n_layers={unfreeze_last_n_layers} vượt quá số lớp encoder "
                f"({len(layers)}) của {self.cfg.pretrained_name}"
            )
        for layer in layers[-unfreeze_last_n_layers:]:
            for p in layer.parameters():
                p.requires_grad = True

    def set_class_weights(self, weights: torch.Tensor) -> None:
        self.class_weights = weights.to(dtype=self.class_weights.dtype)

    def backbone_is_frozen(self) -> bool:
        return self.cfg.unfreeze_last_n_layers <= 0

    def forward(self, input_ids=None, attention_mask=None, labels=None, **kwargs):
        if self.backbone_is_frozen():
            with torch.no_grad():
                outputs = self.backbone(input_ids=input_ids, attention_mask=attention_mask)
        else:
            outputs = self.backbone(input_ids=input_ids, attention_mask=attention_mask)
        pooled = outputs.last_hidden_state[:, 0]
        logits = self.head(pooled)

        result = {"logits": logits}
        if labels is not None:
            result["loss"] = nn.functional.cross_entropy(logits, labels, weight=self.class_weights)
        return result


def build_model(cfg: ModelConfig = ModelConfig()) -> FrozenBackboneClassifier:
    return FrozenBackboneClassifier(cfg)
