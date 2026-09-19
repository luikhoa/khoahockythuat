import math

from verify_onnx import ParityCase, compare_predictions


def test_compare_predictions_reports_drift_and_threshold_crossings():
    rows = [
        ParityCase("same-toxic", "a", 1),
        ParityCase("same-safe", "b", 0),
        ParityCase("label-cross", "c", 1),
        ParityCase("blur-cross", "d", 1),
    ]
    python_scores = {"a": 0.70, "b": 0.20, "c": 0.39, "d": 0.59}
    onnx_scores = {"a": 0.69, "b": 0.25, "c": 0.41, "d": 0.61}

    summary = compare_predictions(
        rows,
        lambda text: python_scores[text],
        lambda text: onnx_scores[text],
    ).as_dict()

    assert summary["count"] == 4
    assert summary["labelAgreement"] == 0.75
    assert summary["blurAgreement"] == 0.75
    assert math.isclose(summary["p1ErrorMean"], 0.025)
    assert math.isclose(summary["p1ErrorP95"], 0.05)
    assert math.isclose(summary["p1ErrorMax"], 0.05)
    assert math.isclose(summary["f1Python"], 0.8)
    assert math.isclose(summary["f1Onnx"], 1.0)
    assert summary["thresholdCrossings"] == [
        {
            "id": "label-cross",
            "pythonP1": 0.39,
            "onnxP1": 0.41,
            "labelCrossed": True,
            "blurCrossed": False,
        },
        {
            "id": "blur-cross",
            "pythonP1": 0.59,
            "onnxP1": 0.61,
            "labelCrossed": False,
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
