"""Đo F1 của một checkpoint (.pkl) trên CẢ hai tập: ViHSD held-out (chất
lượng tổng quát) và bộ blackbox né lọc 1.000 câu (chống obfuscation, chính
là con số "F1 ≈ 0.65" đang được theo dõi trong AI_TESTING_REPORT_VI.md).

Chạy sau khi tải checkpoint mới (.pkl) từ Kaggle về, TRƯỚC khi export ONNX —
nếu F1 không cải thiện đáng kể so với `phobert-offensive-1`, quay lại pipeline
train thay vì export.

Usage:
    python -m backend.eval_checkpoint
    python -m backend.eval_checkpoint --artifact path/to/new_offensive_classifier.pkl
    python -m backend.eval_checkpoint --vihsd-limit 500   # test.csv lớn, chạy CPU chậm -> lấy mẫu
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path
from typing import Sequence


def _load_blackbox_cases(repo_root: Path):
    runner_path = repo_root / "tests" / "blackbox_runner.py"
    spec = importlib.util.spec_from_file_location("cybershield_blackbox_cases", runner_path)
    module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    sys.modules[spec.name] = module  # type: ignore[union-attr]
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return [
        (case.content, case.expected_label)
        for case in module.build_all_cases("http://unused")
        if case.expected_label is not None
    ]


def _prf1(expected: list[int], predicted: list[int]) -> tuple[float, float, float]:
    tp = sum(e == 1 and p == 1 for e, p in zip(expected, predicted))
    fp = sum(e == 0 and p == 1 for e, p in zip(expected, predicted))
    fn = sum(e == 1 and p == 0 for e, p in zip(expected, predicted))
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return precision, recall, f1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact", type=Path, default=Path("backend/offensive_classifier.pkl"))
    parser.add_argument(
        "--vihsd-test",
        type=Path,
        default=Path("phobert_experiment_complete/data/processed/test.csv"),
    )
    parser.add_argument("--vihsd-limit", type=int, default=None, help="Lấy mẫu N dòng đầu để chạy nhanh hơn")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    repo_root = Path(__file__).resolve().parent.parent

    backend_dir = str(repo_root / "backend")
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    import predictor  # noqa: E402 -- phải import sau khi chỉnh sys.path

    predictor.MODEL_PATH = args.artifact
    predictor._load()  # noqa: SLF001 -- reload đúng artifact được chỉ định
    if predictor._model is None:  # noqa: SLF001
        print(f"KHÔNG load được model tại {args.artifact} — xem log ở trên.")
        return 1

    # --- ViHSD held-out ---
    if args.vihsd_test.is_file():
        import pandas as pd

        df = pd.read_csv(args.vihsd_test)
        if args.vihsd_limit:
            df = df.head(args.vihsd_limit)
        expected = df["label"].astype(int).tolist()
        predicted = [predictor.predict(t).label for t in df["text"].astype(str)]
        p, r, f1 = _prf1(expected, predicted)
        print(f"[ViHSD held-out]  n={len(df):5d}  precision={p:.3f}  recall={r:.3f}  F1={f1:.3f}")
    else:
        print(f"Bỏ qua ViHSD held-out — không thấy {args.vihsd_test}")

    # --- Blackbox né lọc (1.000 câu, 800 có nhãn) ---
    cases = _load_blackbox_cases(repo_root)
    expected = [label for _text, label in cases]
    predicted = [predictor.predict(text if isinstance(text, str) else str(text)).label for text, _label in cases]
    p, r, f1 = _prf1(expected, predicted)
    print(f"[Blackbox né lọc] n={len(cases):5d}  precision={p:.3f}  recall={r:.3f}  F1={f1:.3f}")
    print()
    print("So sánh với phobert-offensive-1 (checkpoint cũ, head-only, không augment):")
    print("  ViHSD held-out (test_f1_macro, 2 lớp)   : 0.7312")
    print("  Blackbox né lọc (F1 nhị phân, ngưỡng cũ) : 0.6526 (đo lúc export, ngưỡng 0.4)")
    print("Nhắc lại: chạy backend/calibrate_threshold.py trên checkpoint mới TRƯỚC khi so sánh")
    print("trực tiếp, vì phân phối p1 đổi khi backbone được fine-tune — ngưỡng 0.25 chỉ đúng")
    print("cho phobert-offensive-1.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
