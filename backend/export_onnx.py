"""Export the trained PhoBERT classifier as a browser-ready ONNX artifact."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

import torch
from torch import nn

try:
    from .model_contract import REQUIRED_FILES, validate_artifact
    from .threshold import TOXIC_THRESHOLD
except ImportError:  # Support running from backend/ as a flat module.
    from model_contract import REQUIRED_FILES, validate_artifact
    from threshold import TOXIC_THRESHOLD


class ExportableClassifier(nn.Module):
    """Compose the frozen backbone and trained head into one export graph."""

    def __init__(self, backbone: nn.Module, head: nn.Module):
        super().__init__()
        self.backbone = backbone
        self.head = head

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        hidden = self.backbone(
            input_ids=input_ids,
            attention_mask=attention_mask,
        ).last_hidden_state[:, 0]
        return self.head(hidden)[:, 1]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_metadata(output_dir: Path, model_version: str) -> Path:
    files = {name: _sha256(output_dir / name) for name in REQUIRED_FILES}
    metadata = {
        "schemaVersion": 1,
        "modelVersion": model_version,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "labels": ["an toàn", "độc hại"],
        "maxLength": 128,
        "toxicThreshold": TOXIC_THRESHOLD,
        "textNormalizeVersion": 1,
        "files": files,
    }
    destination = output_dir / "metadata.json"
    destination.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return destination


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact", type=Path, default=Path("backend/offensive_classifier.pkl"))
    parser.add_argument("--output", type=Path, default=Path("extension/model"))
    parser.add_argument("--offline", action="store_true", help="Use only locally cached Hugging Face files")
    parser.add_argument("--model-version", required=True)
    return parser


def convert_to_fp16(source: Path, destination: Path) -> None:
    """Store weights in FP16 while keeping public model I/O types stable."""
    import onnx
    from onnxruntime.transformers.float16 import convert_float_to_float16

    model = onnx.load(source)
    converted = convert_float_to_float16(
        model,
        keep_io_types=True,
        disable_shape_infer=False,
    )
    onnx.save(converted, destination)


def _load_artifact(path: Path):
    import __main__
    import joblib

    try:
        from . import model as model_module
    except ImportError:
        import model as model_module

    # The historical pickle names these classes from flat `model` and `__main__` modules.
    sys.modules.setdefault("model", model_module)

    class OffensiveTextClassifier:
        pass

    if not hasattr(__main__, "OffensiveTextClassifier"):
        __main__.OffensiveTextClassifier = OffensiveTextClassifier
    return joblib.load(path)


def export_model(artifact_path: Path, output_dir: Path, model_version: str, offline: bool) -> None:
    from transformers import AutoModel, AutoTokenizer
    from transformers.utils.hub import cached_file

    try:
        from .model import AdapterMLPHead
    except ImportError:
        from model import AdapterMLPHead

    artifact = _load_artifact(artifact_path)
    cfg = artifact.cfg
    tokenizer = AutoTokenizer.from_pretrained(
        cfg.pretrained_name,
        use_fast=False,
        local_files_only=offline,
    )
    backbone = AutoModel.from_pretrained(cfg.pretrained_name, local_files_only=offline)
    # Nếu checkpoint được train với backbone unfreeze một phần, phải nạp lại
    # trọng số backbone ĐÃ FINE-TUNE trước khi export — nếu không, ONNX
    # xuất ra sẽ chứa backbone gốc chưa fine-tune, âm thầm vứt bỏ toàn bộ
    # phần train backbone dù head vẫn đúng (xem backend/predictor.py::_load()
    # có cùng logic, và phobert_experiment_complete/train.py::OffensiveTextClassifier).
    backbone_state_dict = getattr(artifact, "backbone_state_dict", None)
    if backbone_state_dict is not None:
        backbone.load_state_dict(backbone_state_dict)
    elif getattr(cfg, "unfreeze_last_n_layers", 0) > 0:
        raise RuntimeError(
            "cfg.unfreeze_last_n_layers > 0 nhưng artifact không có backbone_state_dict "
            "— checkpoint hỏng hoặc được lưu bởi phiên bản train.py cũ."
        )
    head = AdapterMLPHead(
        backbone.config.hidden_size,
        cfg.hidden_dim,
        cfg.num_labels,
        cfg.dropout,
    )
    head.load_state_dict(artifact.head_state_dict)
    model = ExportableClassifier(backbone, head).eval()

    output_dir.mkdir(parents=True, exist_ok=True)
    tokenizer.save_pretrained(output_dir)
    tokenizer_json = cached_file(
        cfg.pretrained_name,
        "tokenizer.json",
        local_files_only=offline,
    )
    if tokenizer_json is None:
        raise RuntimeError("tokenizer.json is unavailable for the selected checkpoint")
    shutil.copyfile(tokenizer_json, output_dir / "tokenizer.json")
    backbone.config.to_json_file(output_dir / "config.json")

    encoded = tokenizer("kiểm tra", return_tensors="pt", truncation=True, max_length=cfg.max_length)
    fp32_path = output_dir / "model.fp32.onnx"
    optimized_path = output_dir / "model.optimized.onnx"
    with torch.no_grad():
        torch.onnx.export(
            model,
            (encoded["input_ids"], encoded["attention_mask"]),
            fp32_path,
            input_names=["input_ids", "attention_mask"],
            output_names=["toxic_logit"],
            dynamic_axes={
                "input_ids": {0: "batch", 1: "sequence"},
                "attention_mask": {0: "batch", 1: "sequence"},
                "toxic_logit": {0: "batch"},
            },
            opset_version=17,
            dynamo=False,
        )

    from onnxruntime.transformers.optimizer import optimize_model

    optimized = optimize_model(
        str(fp32_path),
        model_type="bert",
        num_heads=12,
        hidden_size=backbone.config.hidden_size,
    )
    optimized.save_model_to_file(str(optimized_path), use_external_data_format=False)
    convert_to_fp16(optimized_path, output_dir / "model.onnx")
    write_metadata(output_dir, model_version)
    validate_artifact(output_dir)
    fp32_path.unlink()
    optimized_path.unlink()


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    export_model(args.artifact, args.output, args.model_version, args.offline)
    print(f"Exported and validated browser model at {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
