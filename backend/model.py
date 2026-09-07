from dataclasses import dataclass

import torch
import torch.nn as nn
from transformers import AutoModel, AutoTokenizer, PreTrainedTokenizer

from config import HIDDEN_DIM, MAX_LENGTH, MODEL_NAME, NUM_LABELS, DROPOUT


@dataclass
class ModelConfig:
    pretrained_name: str = MODEL_NAME
    num_labels: int = NUM_LABELS
    max_length: int = MAX_LENGTH
    hidden_dim: int = HIDDEN_DIM
    dropout: float = DROPOUT


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
    def __init__(self, cfg: ModelConfig = ModelConfig()):
        super().__init__()
        self.cfg = cfg
        self.backbone = AutoModel.from_pretrained(cfg.pretrained_name)
        for p in self.backbone.parameters():
            p.requires_grad = False
        self.head = AdapterMLPHead(
            self.backbone.config.hidden_size, cfg.hidden_dim, cfg.num_labels, cfg.dropout
        )

    def forward(self, input_ids=None, attention_mask=None, labels=None, **kwargs):
        with torch.no_grad():
            outputs = self.backbone(input_ids=input_ids, attention_mask=attention_mask)
        pooled = outputs.last_hidden_state[:, 0]
        logits = self.head(pooled)

        result = {"logits": logits}
        if labels is not None:
            result["loss"] = nn.functional.cross_entropy(logits, labels)
        return result


def build_model(cfg: ModelConfig = ModelConfig()) -> FrozenBackboneClassifier:
    return FrozenBackboneClassifier(cfg)