import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest
import torch
import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper, numpy_helper
from torch import nn

from export_onnx import ExportableClassifier, convert_to_fp16, write_metadata
from model_contract import (
    CURRENT_TEXT_NORMALIZE_VERSION,
    ArtifactValidationError,
    validate_artifact,
)
from threshold import TOXIC_THRESHOLD


REQUIRED_FILES = (
    "model.onnx",
    "tokenizer.json",
    "tokenizer_config.json",
    "config.json",
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_artifact(root: Path, *, labels=None) -> Path:
    root.mkdir()
    for name in REQUIRED_FILES:
        (root / name).write_bytes((name + "\n").encode())
    metadata = {
        "schemaVersion": 1,
        "modelVersion": "test-model",
        "labels": labels or ["an toàn", "độc hại"],
        "maxLength": 128,
        "toxicThreshold": TOXIC_THRESHOLD,
        "textNormalizeVersion": CURRENT_TEXT_NORMALIZE_VERSION,
        "files": {name: _sha256(root / name) for name in REQUIRED_FILES},
    }
    (root / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
    return root


def test_validate_artifact_returns_typed_metadata(tmp_path: Path):
    artifact = _write_artifact(tmp_path / "model")

    metadata = validate_artifact(artifact)

    assert metadata.schema_version == 1
    assert metadata.model_version == "test-model"
    assert metadata.labels == ("an toàn", "độc hại")
    assert metadata.max_length == 128
    assert metadata.toxic_threshold == TOXIC_THRESHOLD
    assert metadata.text_normalize_version == CURRENT_TEXT_NORMALIZE_VERSION


@pytest.mark.parametrize("missing", [*REQUIRED_FILES, "metadata.json"])
def test_validate_artifact_rejects_each_missing_file(tmp_path: Path, missing: str):
    artifact = _write_artifact(tmp_path / "model")
    (artifact / missing).unlink()

    with pytest.raises(ArtifactValidationError, match=missing):
        validate_artifact(artifact)


def test_validate_artifact_rejects_checksum_mismatch(tmp_path: Path):
    artifact = _write_artifact(tmp_path / "model")
    (artifact / "model.onnx").write_bytes(b"changed")

    with pytest.raises(ArtifactValidationError, match="model.onnx.*checksum"):
        validate_artifact(artifact)


def test_validate_artifact_rejects_three_labels(tmp_path: Path):
    artifact = _write_artifact(tmp_path / "model", labels=["an toàn", "xúc phạm", "đe doạ"])

    with pytest.raises(ArtifactValidationError, match="labels"):
        validate_artifact(artifact)


class _Backbone(nn.Module):
    def forward(self, input_ids, attention_mask):
        del input_ids, attention_mask
        hidden = torch.tensor([[[1.0, 2.0], [50.0, 60.0]]])
        return type("Output", (), {"last_hidden_state": hidden})()


def test_exportable_classifier_returns_toxic_logit_from_cls_token():
    head = nn.Linear(2, 2, bias=False)
    head.weight.data.copy_(torch.tensor([[1.0, 0.0], [0.0, 1.0]]))
    model = ExportableClassifier(_Backbone(), head)

    result = model(torch.tensor([[0, 1]]), torch.tensor([[1, 1]]))

    assert result.tolist() == [2.0]


def test_write_metadata_hashes_every_runtime_asset(tmp_path: Path):
    artifact = tmp_path / "model"
    artifact.mkdir()
    for name in REQUIRED_FILES:
        (artifact / name).write_bytes(name.encode())

    write_metadata(artifact, "phobert-test")

    metadata = validate_artifact(artifact)
    assert metadata.model_version == "phobert-test"
    assert set(metadata.files) == set(REQUIRED_FILES)


def test_model_module_supports_package_import():
    repo_root = Path(__file__).resolve().parents[2]

    result = subprocess.run(
        [sys.executable, "-c", "import backend.model"],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_convert_to_fp16_produces_runnable_half_size_model(tmp_path: Path):
    source = tmp_path / "source.onnx"
    destination = tmp_path / "model.onnx"
    graph = helper.make_graph(
        [helper.make_node("MatMul", ["input", "weight"], ["output"])],
        "tiny-matmul",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [None, 64])],
        [helper.make_tensor_value_info("output", TensorProto.FLOAT, [None, 64])],
        [numpy_helper.from_array(np.eye(64, dtype=np.float32), "weight")],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 10
    onnx.save(model, source)

    convert_to_fp16(source, destination)

    session = ort.InferenceSession(str(destination), providers=["CPUExecutionProvider"])
    sample = np.arange(64, dtype=np.float32).reshape(1, 64)
    result = session.run(None, {"input": sample})[0]
    np.testing.assert_allclose(result, sample, atol=0.05)
    converted = onnx.load(destination)
    assert any(item.data_type == TensorProto.FLOAT16 for item in converted.graph.initializer)
    assert destination.stat().st_size < source.stat().st_size
