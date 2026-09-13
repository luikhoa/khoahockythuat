"""Unit test cho backend/predictor.py — lớp suy luận AI.

Bao phủ:
- Hợp đồng output (Prediction) luôn hợp lệ với mọi input, kể cả input dị thường.
- Hành vi fallback khi model lỗi/không load được (fail-safe, không fail-closed).
- Các ca input dị thường không được làm crash predict().
- Ghi lại (regression-guard) các lỗ hổng né lọc phát hiện qua black-box testing,
  để khi sửa preprocessing thì test sẽ tự chuyển xanh và cảnh báo nếu ai đó
  vô tình làm hồi quy lại.

Chạy: pytest tests/unit/test_predictor.py -v
"""
import math

import pytest

import predictor


@pytest.fixture(scope="module")
def model_available() -> bool:
    return predictor._model is not None


# ------------------------------------------------------------ hợp đồng output
class TestOutputContract:
    def test_proba_sums_to_one(self):
        r = predictor.predict("xin chào bạn")
        assert math.isclose(sum(r.proba), 1.0, abs_tol=1e-3)

    def test_confidence_matches_predicted_class_proba(self):
        r = predictor.predict("hôm nay trời đẹp")
        assert math.isclose(r.confidence, r.proba[r.label], abs_tol=1e-6)

    def test_label_matches_name(self):
        r = predictor.predict("test")
        assert r.name == predictor.LABELS[r.label]

    def test_label_is_binary(self):
        r = predictor.predict("một câu bất kỳ")
        assert r.label in (0, 1)

    @pytest.mark.parametrize("text", ["", " ", "\n", "\t"])
    def test_empty_or_whitespace_does_not_crash(self, text):
        r = predictor.predict(text)
        assert r.label in (0, 1)

    def test_very_long_input_does_not_crash(self):
        r = predictor.predict("test " * 5000)
        assert r.label in (0, 1)

    def test_none_like_and_non_string_gracefully_handled(self):
        # predict() khai báo nhận str; nếu lỡ nhận None phải rơi vào except
        # và trả về mặc định an toàn, không được raise ra ngoài.
        r = predictor.predict(None)  # type: ignore[arg-type]
        assert r.label == 0


# ------------------------------------------------------------ fail-safe khi model lỗi
class TestFailSafeBehavior:
    def test_default_prediction_is_safe(self):
        r = predictor._an_toàn_mặc_định()
        assert r.label == 0
        assert r.confidence == 1.0
        assert r.proba == [1.0, 0.0]

    def test_predict_falls_back_when_model_missing(self, monkeypatch):
        monkeypatch.setattr(predictor, "_model", None)
        r = predictor.predict("đồ ngu")
        assert r.label == 0  # fail-open: không có model -> luôn báo an toàn
        assert r.confidence == 1.0

    def test_predict_catches_internal_exception(self, monkeypatch):
        def boom(*a, **kw):
            raise RuntimeError("mô phỏng lỗi runtime trong forward()")

        monkeypatch.setattr(predictor, "_model", boom)
        r = predictor.predict("bất kỳ nội dung nào")
        assert r.label == 0


# ------------------------------------------------------------ né lọc (obfuscation) — cần preprocessing
class TestObfuscationResistance:
    """GHI NHẬN LỖ HỔNG (xem Phần 2 báo cáo): predictor.py không có bước tiền
    xử lý (chuẩn hoá dấu, gỡ ký tự chèn, teencode) nên các câu độc hại bị né
    lọc dễ dàng — số liệu thực nghiệm ở tests/blackbox_runner.py cho thấy
    dot_separated bị né 90%, zero_width_space/star_separated bị né 100%.

    Đánh dấu xfail (không làm CI đỏ) để test vẫn chạy và tự chuyển XPASS —
    báo hiệu cho dev biết ngay khi nào nên xoá marker này — sau khi thêm
    bước chuẩn hoá text trước khi tokenize.
    """

    @pytest.mark.xfail(reason="Chưa có text preprocessing/normalization trong predictor.py", strict=False)
    @pytest.mark.parametrize("text", [
        "đ.ồ ng.u nh.ư b.ò",
        "đ_ồ_n_g_u_n_h_ư_b_ò",
        "do ngu nhu bo",
        "đ​ồ​ ​ng​u",
    ])
    def test_obfuscated_toxic_text_should_still_be_flagged(self, text):
        r = predictor.predict(text)
        assert r.label == 1, f"Bị né lọc: {text!r} vẫn được coi là an toàn"


# ------------------------------------------------------------ ngưỡng quyết định
class TestThreshold:
    def test_threshold_constant_is_reasonable(self):
        assert 0.0 < predictor.NGƯỠNG_ĐỘC_HẠI < 1.0

    def test_label_consistent_with_threshold(self):
        r = predictor.predict("đồ ngu như bò")
        p1 = r.proba[1]
        expected_label = 1 if p1 >= predictor.NGƯỠNG_ĐỘC_HẠI else 0
        assert r.label == expected_label
