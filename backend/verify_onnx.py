"""Verify prediction parity between the Python and browser ONNX runtimes."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Iterable, Sequence

import numpy as np

try:
    from .model_contract import validate_artifact
except ImportError:
    from model_contract import validate_artifact


LABEL_THRESHOLD = 0.4
BLUR_THRESHOLD = 0.6


@dataclass(frozen=True)
class ParityCase:
    id: str
    text: str
    expected_label: int | None


@dataclass(frozen=True)
class ThresholdCrossing:
    id: str
    pythonP1: float
    onnxP1: float
    labelCrossed: bool
    blurCrossed: bool


@dataclass(frozen=True)
class ParitySummary:
    count: int
    label_agreement: float
    blur_agreement: float
    p1_error_mean: float
    p1_error_p95: float
    p1_error_max: float
    f1_python: float | None
    f1_onnx: float | None
    threshold_crossings: tuple[ThresholdCrossing, ...]

    def as_dict(self) -> dict:
        return {
            "count": self.count,
            "labelAgreement": self.label_agreement,
            "blurAgreement": self.blur_agreement,
            "p1ErrorMean": self.p1_error_mean,
            "p1ErrorP95": self.p1_error_p95,
            "p1ErrorMax": self.p1_error_max,
            "f1Python": self.f1_python,
            "f1Onnx": self.f1_onnx,
            "thresholdCrossings": [asdict(crossing) for crossing in self.threshold_crossings],
        }


def _label(p1: float) -> int:
    return 1 if p1 >= LABEL_THRESHOLD else 0


def _blurred(p1: float) -> bool:
    return p1 >= BLUR_THRESHOLD


def _f1(expected: list[int], predicted: list[int]) -> float | None:
    if not expected:
        return None
    tp = sum(want == 1 and got == 1 for want, got in zip(expected, predicted))
    fp = sum(want == 0 and got == 1 for want, got in zip(expected, predicted))
    fn = sum(want == 1 and got == 0 for want, got in zip(expected, predicted))
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return 2 * precision * recall / (precision + recall) if precision + recall else 0.0


def compare_predictions(
    rows: Iterable[ParityCase],
    python_predict: Callable[[str], float],
    onnx_predict: Callable[[str], float],
) -> ParitySummary:
    cases = list(rows)
    errors: list[float] = []
    label_matches = 0
    blur_matches = 0
    crossings: list[ThresholdCrossing] = []
    expected: list[int] = []
    python_labels: list[int] = []
    onnx_labels: list[int] = []

    for case in cases:
        python_p1 = float(python_predict(case.text))
        onnx_p1 = float(onnx_predict(case.text))
        if not math.isfinite(python_p1) or not math.isfinite(onnx_p1):
            raise ValueError(f"non-finite probability for {case.id}")
        python_label, onnx_label = _label(python_p1), _label(onnx_p1)
        python_blur, onnx_blur = _blurred(python_p1), _blurred(onnx_p1)
        label_matches += python_label == onnx_label
        blur_matches += python_blur == onnx_blur
        errors.append(abs(python_p1 - onnx_p1))
        if python_label != onnx_label or python_blur != onnx_blur:
            crossings.append(
                ThresholdCrossing(
                    id=case.id,
                    pythonP1=python_p1,
                    onnxP1=onnx_p1,
                    labelCrossed=python_label != onnx_label,
                    blurCrossed=python_blur != onnx_blur,
                )
            )
        if case.expected_label is not None:
            expected.append(case.expected_label)
            python_labels.append(python_label)
            onnx_labels.append(onnx_label)

    count = len(cases)
    sorted_errors = sorted(errors)
    p95_index = max(0, math.ceil(0.95 * count) - 1) if count else 0
    return ParitySummary(
        count=count,
        label_agreement=label_matches / count if count else 1.0,
        blur_agreement=blur_matches / count if count else 1.0,
        p1_error_mean=sum(errors) / count if count else 0.0,
        p1_error_p95=sorted_errors[p95_index] if count else 0.0,
        p1_error_max=max(errors, default=0.0),
        f1_python=_f1(expected, python_labels),
        f1_onnx=_f1(expected, onnx_labels),
        threshold_crossings=tuple(crossings),
    )


class OnnxPredictor:
    def __init__(self, model_dir: Path):
        import onnxruntime as ort
        from transformers import AutoTokenizer

        validate_artifact(model_dir)
        self.tokenizer = AutoTokenizer.from_pretrained(
            str(model_dir), use_fast=False, local_files_only=True
        )
        self.session = ort.InferenceSession(
            str(model_dir / "model.onnx"), providers=["CPUExecutionProvider"]
        )

    def __call__(self, text: str) -> float:
        encoded = self.tokenizer(text, truncation=True, max_length=128, return_tensors="np")
        feeds = {
            "input_ids": np.asarray(encoded["input_ids"], dtype=np.int64),
            "attention_mask": np.asarray(encoded["attention_mask"], dtype=np.int64),
        }
        logit = float(np.asarray(self.session.run(["toxic_logit"], feeds)[0]).reshape(-1)[0])
        return 1.0 / (1.0 + math.exp(-logit))


def _load_cases(repo_root: Path) -> list[ParityCase]:
    runner_path = repo_root / "tests" / "blackbox_runner.py"
    spec = importlib.util.spec_from_file_location("cybershield_blackbox_cases", runner_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load fixture generator: {runner_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    result: list[ParityCase] = []
    for case in module.build_all_cases("http://unused"):
        text = case.content if isinstance(case.content, str) else json.dumps(case.content, ensure_ascii=False)
        result.append(ParityCase(case.id, text, case.expected_label))
    return result


def _python_predictor(repo_root: Path) -> Callable[[str], float]:
    backend_dir = str(repo_root / "backend")
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    import predictor

    return lambda text: float(predictor.predict(text).proba[1])


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, default=Path("extension/model"))
    parser.add_argument("--output", type=Path, default=Path("tests/results/onnx_parity_summary.json"))
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    repo_root = Path(__file__).resolve().parent.parent
    cases = _load_cases(repo_root)
    python_predict = _python_predictor(repo_root)
    python_scores: dict[str, float] = {}
    for case in cases:
        if case.text not in python_scores:
            python_scores[case.text] = python_predict(case.text)
    onnx_predict = OnnxPredictor(args.model)
    summary = compare_predictions(
        cases,
        lambda text: python_scores[text],
        onnx_predict,
    )
    payload = summary.as_dict()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(json.dumps({key: value for key, value in payload.items() if key != "thresholdCrossings"}, indent=2))
    print(f"thresholdCrossings: {len(summary.threshold_crossings)}")
    f1_loss = 0.0
    if summary.f1_python is not None and summary.f1_onnx is not None:
        f1_loss = summary.f1_python - summary.f1_onnx
    return 0 if summary.label_agreement >= 0.99 and f1_loss <= 0.01 else 1


if __name__ == "__main__":
    raise SystemExit(main())
