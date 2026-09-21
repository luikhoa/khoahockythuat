/**
 * Chuẩn hoá văn bản dùng chung trước khi tokenize — bản JS PORT THỦ CÔNG của
 * `backend/text_normalize.py`. Phải áp dụng giống hệt predict()/verify_onnx.py
 * phía Python, nếu không model sẽ thấy input khác nhau giữa lúc kiểm chứng
 * parity (Python) và lúc chạy thật trong extension (ONNX Runtime Web).
 *
 * KHÔNG có cơ chế build/test nào tự phát hiện hai bản lệch nhau — khi sửa
 * logic, PHẢI sửa cả hai file và bump `TEXT_NORMALIZE_VERSION` +
 * `backend/model_contract.py::CURRENT_TEXT_NORMALIZE_VERSION` cùng lúc.
 *
 * Cố tình KHÔNG xử lý no_diacritics/leetspeak (xem lý do đầy đủ trong
 * text_normalize.py) — những kỹ thuật đó nên được xử lý bằng augment dữ
 * liệu train, không phải "đoán ngược" ở tầng normalize suy luận.
 */

export const TEXT_NORMALIZE_VERSION = 1;

const ZERO_WIDTH_RE = /[​‌‍⁠﻿­]/gu;
const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/gu;

// Cyrillic look-alike hay dùng để né lọc (kỹ thuật "homoglyph", né 42,5%
// trong AI_TESTING_REPORT_VI.md §3.2). Chỉ 4 cặp ký tự này gần như không
// bao giờ xuất hiện hợp lệ trong văn bản tiếng Việt/Latin thông thường.
const HOMOGLYPH_MAP: Record<string, string> = {
  а: "a", о: "o", е: "e", с: "c",
  А: "A", О: "O", Е: "E", С: "C",
};
const HOMOGLYPH_RE = /[аоесАОЕС]/gu;

// Chèn 1 ký tự phân tách (. hoặc *) giữa TỪNG ký tự của toàn bộ chuỗi, kể cả
// khoảng trắng — đúng cách kỹ thuật dot_separated/star_separated obfuscate.
// Yêu cầu >=3 separator liên tiếp trước khi gộp, để không đụng "3.14",
// "example.com" (chỉ 1 separator). Không gộp "_" ở đây vì underscore_separated
// obfuscate theo TỪ chứ không theo từng ký tự (xử lý riêng bên dưới).
const INTERLEAVED_SEP_RE = /(?:[^.*][.*]){3,}[^.*]?/gu;
const SEP_CHARS_RE = /[.*]/gu;

// Teencode phổ biến — chỉ áp dụng khi khớp NGUYÊN TỪ để giảm rủi ro sai
// trên từ đơn lẻ đa nghĩa. Danh sách khớp tests/blackbox_runner.py::teencode_abbrev.
const TEENCODE_MAP: Record<string, string> = {
  ko: "không", k: "không", hok: "không", khum: "không",
  dc: "được", đc: "được",
  bit: "biết", bik: "biết",
  vl: "vãi",
  j: "gì",
  z: "vậy",
  r: "rồi",
};

function collapseLetterSeparators(text: string): string {
  return text.replace(INTERLEAVED_SEP_RE, (match) => match.replace(SEP_CHARS_RE, ""));
}

function expandTeencode(text: string): string {
  return text
    .split(" ")
    .map((word) => TEENCODE_MAP[word] ?? word)
    .join(" ");
}

/**
 * Chuẩn hoá text thô (từ DOM) trước khi tokenize. Idempotent, an toàn với
 * chuỗi rỗng.
 */
export function normalizeText(text: string): string {
  if (!text) return text ?? "";
  let normalized = text.normalize("NFC");
  normalized = normalized.replace(ZERO_WIDTH_RE, "");
  normalized = normalized.replace(CONTROL_RE, "");
  normalized = normalized.replace(HOMOGLYPH_RE, (ch) => HOMOGLYPH_MAP[ch] ?? ch);
  // underscore_separated obfuscate theo TỪ ("đồ_ngu_như_bò"); "_" gần như
  // không xuất hiện hợp lệ trong bình luận mạng xã hội tiếng Việt nên coi
  // nó tương đương khoảng trắng là an toàn.
  normalized = normalized.replace(/_/gu, " ");
  normalized = collapseLetterSeparators(normalized);
  normalized = normalized.replace(/\s+/gu, " ").trim();
  normalized = normalized.toLowerCase();
  normalized = expandTeencode(normalized);
  return normalized;
}
