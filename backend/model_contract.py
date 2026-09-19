"""Validation for browser-deployable CyberShield model artifacts."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


REQUIRED_FILES = (
    "model.onnx",
    "tokenizer.json",
    "tokenizer_config.json",
    "config.json",
)


class ArtifactValidationError(ValueError):
    """Raised when a deployable model artifact violates its contract."""


@dataclass(frozen=True)
class ModelMetadata:
    schema_version: int
    model_version: str
    labels: tuple[str, str]
    max_length: int
    toxic_threshold: float
    files: Mapping[str, str]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _require(value: object, expected: object, field: str) -> None:
    if value != expected:
        raise ArtifactValidationError(f"metadata.json: invalid {field}")


def validate_artifact(path: Path) -> ModelMetadata:
    root = Path(path)
    for name in (*REQUIRED_FILES, "metadata.json"):
        if not (root / name).is_file():
            raise ArtifactValidationError(f"missing required file: {name}")

    try:
        raw = json.loads((root / "metadata.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ArtifactValidationError(f"metadata.json: {error}") from error
    if not isinstance(raw, dict):
        raise ArtifactValidationError("metadata.json: expected an object")

    _require(raw.get("schemaVersion"), 1, "schemaVersion")
    _require(raw.get("labels"), ["an toàn", "độc hại"], "labels")
    _require(raw.get("maxLength"), 128, "maxLength")
    _require(raw.get("toxicThreshold"), 0.4, "toxicThreshold")
    model_version = raw.get("modelVersion")
    if not isinstance(model_version, str) or not model_version.strip():
        raise ArtifactValidationError("metadata.json: invalid modelVersion")
    files = raw.get("files")
    if not isinstance(files, dict):
        raise ArtifactValidationError("metadata.json: invalid files")

    for name in REQUIRED_FILES:
        expected = files.get(name)
        if not isinstance(expected, str) or len(expected) != 64:
            raise ArtifactValidationError(f"{name}: missing checksum")
        if _sha256(root / name) != expected.lower():
            raise ArtifactValidationError(f"{name}: checksum mismatch")

    return ModelMetadata(
        schema_version=1,
        model_version=model_version,
        labels=("an toàn", "độc hại"),
        max_length=128,
        toxic_threshold=0.4,
        files=dict(files),
    )
