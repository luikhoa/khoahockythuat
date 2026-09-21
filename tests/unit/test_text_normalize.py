"""Test cho backend/text_normalize.py — cũng là đặc tả tối thiểu mà
phobert_experiment_complete/text_normalize.py (bản train) và
extension/src/lib/textNormalize.ts (bản JS) PHẢI khớp hành vi. Không có cách
build/CI nào tự so ba bản này — khi sửa logic ở bất kỳ đâu, chạy lại các case
dưới đây thủ công trên cả ba bản trước khi merge.

Chạy: pytest tests/unit/test_text_normalize.py -v
"""
import pytest

from text_normalize import normalize_text

PHRASE = "đồ ngu như bò"


class TestObfuscationNeutralized:
    """6/10 kỹ thuật né lọc đo được trong AI_TESTING_REPORT_VI.md §3.2 phải
    được vô hiệu hoá hoàn toàn (khớp lại đúng câu gốc)."""

    @pytest.mark.parametrize("obfuscated", [
        "đ.ồ. . .n.g.u. . .n.h.ư. . .b.ò",  # dot_separated, né 90%
        "đ*ồ* *n*g*u* *n*h*ư* *b*ò",  # star_separated, né 100%
        "đồ_ngu_như_bò",  # underscore_separated, né 32,5%
        "đ​ồ​ ​n​g​u​ ​n​h​ư​ ​b​ò",  # zero_width_space, né 100%
    ])
    def test_recovers_original_phrase(self, obfuscated):
        assert normalize_text(obfuscated) == PHRASE

    def test_homoglyph_folded(self):
        # Cyrillic а/о/е/с thay cho Latin a/o/e/c (né 42,5%).
        swapped = PHRASE.replace("o", "о")  # "о" ở đây là Cyrillic U+043E
        assert normalize_text(swapped) == PHRASE

    def test_teencode_expanded(self):
        assert normalize_text("k bit j luôn") == "không biết gì luôn"

    def test_mixed_case_lowercased(self):
        assert normalize_text("ĐỒ NGU NHƯ BÒ") == PHRASE


class TestObfuscationDeferredToAugmentation:
    """no_diacritics/leetspeak KHÔNG được xử lý ở normalize (xem docstring
    module) — regression-guard để không ai vô tình "sửa" rồi phá chính tả
    hợp lệ; augmentation (phobert_experiment_complete/augment_obfuscation.py)
    mới là nơi xử lý các kỹ thuật này."""

    def test_no_diacritics_not_touched(self):
        assert normalize_text("do ngu nhu bo") == "do ngu nhu bo"

    def test_leetspeak_not_touched(self):
        assert normalize_text("d0 ngu nhu b0") == "d0 ngu nhu b0"


class TestNoFalsePositives:
    """Không được đổi câu tiếng Việt/số liệu hợp lệ (ngoài lowercase)."""

    @pytest.mark.parametrize("clean", [
        "Hôm nay trời đẹp quá, mình đi dạo công viên nhé.",
        "3.14 là số pi",
        "xem thêm tại example.com nhé",
        "giá 1.000.000 đồng",
        "Bài báo khoa học phân tích tác động của bạo lực gia đình đến trẻ em.",
    ])
    def test_only_lowercases(self, clean):
        assert normalize_text(clean) == clean.lower()


class TestContractSafety:
    def test_empty_string_is_noop(self):
        assert normalize_text("") == ""

    def test_none_raises_instead_of_silently_becoming_empty(self):
        # Hợp đồng: text: str. predictor.predict() có try/except riêng để
        # fail-safe khi lỡ nhận None — normalize_text KHÔNG được tự nuốt lỗi
        # này, nếu không None sẽ lọt qua tokenizer như chuỗi rỗng hợp lệ.
        with pytest.raises(TypeError):
            normalize_text(None)  # type: ignore[arg-type]

    def test_idempotent(self):
        once = normalize_text("đ.ồ. .n.g.u!!  MÀY  ")
        assert normalize_text(once) == once
