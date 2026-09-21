import math

from verify_onnx import ParityCase, compare_predictions


def test_compare_predictions_reports_drift_and_threshold_crossings():
    # LABEL_THRESHOLD và BLUR_THRESHOLD giờ CÙNG một giá trị (backend/threshold.py,
    # xem QA-006/W6: extension không còn ngưỡng blur riêng nữa) nên một cú
    # crossing luôn kéo theo cả labelCrossed và blurCrossed cùng lúc — khác
    # với hành vi cũ (2 ngưỡng độc lập 0.4/0.6) mà test này từng minh hoạ.
    rows = [
        ParityCase("same-toxic", "a", 1),
        ParityCase("same-safe", "b", 0),
        ParityCase("crossing", "c", 1),
    ]
    python_scores = {"a": 0.70, "b": 0.10, "c": 0.24}
    onnx_scores = {"a": 0.69, "b": 0.12, "c": 0.26}

    summary = compare_predictions(
        rows,
        lambda text: python_scores[text],
        lambda text: onnx_scores[text],
    ).as_dict()

    assert summary["count"] == 3
    assert math.isclose(summary["labelAgreement"], 2 / 3)
    assert math.isclose(summary["blurAgreement"], 2 / 3)
    assert math.isclose(summary["p1ErrorMean"], (0.01 + 0.02 + 0.02) / 3)
    assert math.isclose(summary["p1ErrorP95"], 0.02)
    assert math.isclose(summary["p1ErrorMax"], 0.02)
    assert math.isclose(summary["f1Python"], 2 / 3)
    assert math.isclose(summary["f1Onnx"], 1.0)
    assert summary["thresholdCrossings"] == [
        {
            "id": "crossing",
            "pythonP1": 0.24,
            "onnxP1": 0.26,
            "labelCrossed": True,
            "blurCrossed": True,
        },
    ]


def test_compare_predictions_ignores_unlabeled_rows_for_f1():
    rows = [ParityCase("edge", "emoji", None)]

    summary = compare_predictions(rows, lambda _text: 0.1, lambda _text: 0.1).as_dict()

    assert summary["count"] == 1
    assert summary["f1Python"] is None
    assert summary["f1Onnx"] is None
    assert summary["thresholdCrossings"] == []
