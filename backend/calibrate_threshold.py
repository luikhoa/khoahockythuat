"""Quét PR-curve trên tests/results/blackbox_raw.csv để chọn lại TOXIC_THRESHOLD.

Dùng file kết quả có sẵn của `tests/blackbox_runner.py` (cột `predicted_label`
+ `confidence`) để suy ngược chính xác p1 = P(độc hại) cho từng câu có nhãn
kỳ vọng, không phụ thuộc ngưỡng đã dùng lúc sinh file đó — vì:
    confidence = proba[predicted_label]
    => p1 = confidence nếu predicted_label == 1, ngược lại p1 = 1 - confidence

Chạy sau MỖI lần retrain (sau khi chạy lại `tests/blackbox_runner.py` với
checkpoint mới) để hiệu chỉnh lại `backend/threshold.py::TOXIC_THRESHOLD`.

Usage:
    .venv/bin/python -m backend.calibrate_threshold
    .venv/bin/python -m backend.calibrate_threshold --input tests/results/blackbox_raw.csv
"""
from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


@dataclass(frozen=True)
class LabeledScore:
    expected: int
    p1: float


def load_scores(csv_path: Path) -> list[LabeledScore]:
    scores: list[LabeledScore] = []
    with csv_path.open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row["category"] not in ("positive", "negative"):
                continue
            if not row["expected_label"] or not row["predicted_label"] or not row["confidence"]:
                continue
            expected = int(row["expected_label"])
            predicted_label = int(row["predicted_label"])
            confidence = float(row["confidence"])
            p1 = confidence if predicted_label == 1 else 1.0 - confidence
            scores.append(LabeledScore(expected, p1))
    return scores


def prf1_at(scores: Sequence[LabeledScore], threshold: float) -> tuple[float, float, float]:
    tp = fp = fn = 0
    for s in scores:
        predicted = 1 if s.p1 >= threshold else 0
        if predicted == 1 and s.expected == 1:
            tp += 1
        elif predicted == 1 and s.expected == 0:
            fp += 1
        elif predicted == 0 and s.expected == 1:
            fn += 1
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return precision, recall, f1


def sweep(scores: Sequence[LabeledScore], step: float = 0.01) -> list[tuple[float, float, float, float]]:
    results = []
    steps = int(round(1.0 / step))
    for i in range(1, steps):
        threshold = round(i * step, 4)
        precision, recall, f1 = prf1_at(scores, threshold)
        results.append((threshold, precision, recall, f1))
    return results


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("tests/results/blackbox_raw.csv"))
    parser.add_argument("--step", type=float, default=0.01)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    scores = load_scores(args.input)
    if not scores:
        print(f"Không có câu nào có nhãn trong {args.input}")
        return 1

    results = sweep(scores, args.step)
    best = max(results, key=lambda r: r[3])

    print(f"{'ngưỡng':>7} {'precision':>10} {'recall':>8} {'f1':>8}")
    for threshold, precision, recall, f1 in results:
        marker = "  <- tối ưu F1" if threshold == best[0] else ""
        if round(threshold * 100) % 5 == 0 or threshold == best[0]:
            print(f"{threshold:7.2f} {precision:10.3f} {recall:8.3f} {f1:8.3f}{marker}")

    print()
    print(f"Số câu có nhãn dùng để hiệu chỉnh: {len(scores)}")
    print(f"Ngưỡng tối ưu F1: {best[0]:.2f} (precision={best[1]:.3f}, recall={best[2]:.3f}, f1={best[3]:.3f})")
    print("Cập nhật giá trị này vào backend/threshold.py::TOXIC_THRESHOLD nếu đổi checkpoint.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
