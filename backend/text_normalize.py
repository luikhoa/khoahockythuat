"""Chuẩn hoá văn bản dùng chung trước khi tokenize.

Áp dụng giống hệt ở ba nơi suy luận:
  - backend/predictor.py       (suy luận Python / FastAPI dev)
  - backend/verify_onnx.py     (oracle Python dùng để so sánh với ONNX)
  - extension/src/lib/textNormalize.ts (suy luận trong trình duyệt — bản JS
    port thủ công của file này, xem docstring ở đó)

Mục tiêu: vô hiệu hoá các kỹ thuật né lọc "chèn ký tự phá vỡ ranh giới token"
đo được trong AI_TESTING_REPORT_VI.md §3.2 (zero-width space né 100%,
star_separated né 100%, dot_separated né 90%, underscore_separated né 32,5%)
MÀ KHÔNG phá nội dung hợp lệ.

Cố tình KHÔNG xử lý no_diacritics/leetspeak ở bước này: tước dấu hoặc dịch
ngược ký tự hàng loạt trên MỌI input sẽ phá chính tả tiếng Việt hợp lệ (rủi
ro tạo ra input lạ mà model chưa từng thấy còn cao hơn cả obfuscation gốc).
Riêng lowercase THÌ áp dụng — không phải suy đoán mới mà khớp với chính
`phobert_experiment_complete/preprocess.py::clean_text()` (`text.lower()`)
đã dùng lúc train checkpoint hiện tại: model chưa từng thấy chữ hoa trong
lúc train, nên không lowercase ở suy luận mới là lệch phân phối train/serve
(và tiện thể vô hiệu hoá kỹ thuật né lọc "mixed_case_punct", né 87,5%).
Các kỹ thuật "biến đổi bề mặt" còn lại (no_diacritics, leetspeak) nên được
xử lý bằng cách augment dữ liệu train để model tự học nhận diện dạng đã
biến đổi
(xem phobert_experiment_complete/augment_obfuscation.py), không phải bằng
cách "đoán ngược" ở tầng normalize suy luận.

**Đồng bộ**: nếu sửa logic ở đây, PHẢI sửa y hệt ở
extension/src/lib/textNormalize.ts — không có cơ chế build/test nào tự phát
hiện hai bản lệch nhau, phải rà tay khi đổi (xem test chung
tests/unit/test_text_normalize.py mô tả các case tối thiểu phải khớp).
"""
from __future__ import annotations

import re
import unicodedata

# Zero-width / ký tự định dạng vô hình hay bị lợi dụng để chèn giữa từng
# chữ cái (category Unicode "Cf" = Format) — liệt kê tường minh để dễ đọc
# thay vì lọc theo category lúc runtime.
_ZERO_WIDTH_CHARS = (
    "​"  # ZERO WIDTH SPACE — kỹ thuật "zero_width_space", né 100%
    "‌"  # ZERO WIDTH NON-JOINER
    "‍"  # ZERO WIDTH JOINER
    "⁠"  # WORD JOINER
    "﻿"  # BOM / ZERO WIDTH NO-BREAK SPACE
    "­"  # SOFT HYPHEN
)
_ZERO_WIDTH_RE = re.compile("[" + _ZERO_WIDTH_CHARS + "]")

# Ký tự điều khiển C0/C1, trừ các khoảng trắng thường dùng (space/tab/newline
# được xử lý riêng ở bước collapse whitespace).
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")

# Chèn 1 ký tự phân tách (. hoặc *) giữa TỪNG ký tự của toàn bộ chuỗi, kể cả
# khoảng trắng — đúng cách tests/blackbox_runner.py::dot_separate/
# star_separate sinh ra obfuscation ("đ.ồ. . .n.g.u", "đ*ồ* *n*g*u"). Bắt
# chuỗi "1 ký tự + separator" lặp lại >=3 lần liên tiếp rồi xoá separator
# trong đoạn khớp — ngưỡng 3 để không đụng "3.14", "e.g.", "example.com"
# (chỉ 1 separator). Không gộp "_" ở đây vì underscore_separated obfuscate
# theo TỪ chứ không theo từng ký tự (xử lý riêng ở normalize_text).
_INTERLEAVED_SEP_RE = re.compile(r"(?:[^.*][.*]){3,}[^.*]?", re.UNICODE)
_SEP_CHARS_RE = re.compile(r"[.*]")

# Cyrillic look-alike hay dùng để né lọc (kỹ thuật "homoglyph", né 42,5%).
# Chỉ 4 cặp ký tự này gần như không bao giờ xuất hiện hợp lệ trong văn bản
# tiếng Việt/Latin thông thường nên fold một chiều là an toàn.
_HOMOGLYPH_TABLE = str.maketrans(
    {
        "а": "a", "о": "o", "е": "e", "с": "c",
        "А": "A", "О": "O", "Е": "E", "С": "C",
    }
)

# Teencode phổ biến — chỉ áp dụng khi khớp NGUYÊN TỪ (tách theo khoảng
# trắng) để giảm rủi ro sai trên từ đơn lẻ đa nghĩa (vd "r" cũng là đơn vị).
# Danh sách khớp với teencode_abbrev() trong tests/blackbox_runner.py.
_TEENCODE_MAP = {
    "ko": "không", "k": "không", "hok": "không", "khum": "không",
    "dc": "được", "đc": "được",
    "bit": "biết", "bik": "biết",
    "vl": "vãi",
    "j": "gì",
    "z": "vậy",
    "r": "rồi",
}


def _collapse_letter_separators(text: str) -> str:
    def _strip_seps(match: "re.Match[str]") -> str:
        return _SEP_CHARS_RE.sub("", match.group(0))

    return _INTERLEAVED_SEP_RE.sub(_strip_seps, text)


def _expand_teencode(text: str) -> str:
    words = text.split(" ")
    return " ".join(_TEENCODE_MAP.get(w, w) for w in words)


def normalize_text(text: str) -> str:
    """Chuẩn hoá text thô (từ DOM hoặc HTTP request) trước khi tokenize.

    Idempotent: `normalize_text(normalize_text(x)) == normalize_text(x)`.
    Chuỗi rỗng "" trả về nguyên vẹn (no-op an toàn). Cố tình KHÔNG tự bọc
    None thành "" — text: str là hợp đồng của hàm này, truyền None phải
    raise TypeError để lộ ra ngoài, nơi predictor.predict() (hoặc caller
    khác) đã có sẵn try/except fail-safe riêng; nuốt lỗi ở đây sẽ khiến
    None-input lọt qua tokenizer như một chuỗi rỗng hợp lệ thay vì rơi vào
    nhánh an toàn mặc định.
    """
    if text == "":
        return text
    normalized = unicodedata.normalize("NFC", text)
    normalized = _ZERO_WIDTH_RE.sub("", normalized)
    normalized = _CONTROL_RE.sub("", normalized)
    normalized = normalized.translate(_HOMOGLYPH_TABLE)
    # underscore_separated obfuscate theo TỪ ("đồ_ngu_như_bò"), không theo
    # từng ký tự — "_" gần như không xuất hiện hợp lệ trong bình luận mạng
    # xã hội tiếng Việt nên coi nó tương đương khoảng trắng là an toàn.
    normalized = normalized.replace("_", " ")
    normalized = _collapse_letter_separators(normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    normalized = normalized.lower()
    normalized = _expand_teencode(normalized)
    return normalized
