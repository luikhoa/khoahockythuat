"""blackbox_runner.py — Black-box test harness cho backend AI CyberShield.

Sinh và gửi 1.000 request HTTP tới POST /predict (và một số request "hỏng cố ý"
gửi thẳng qua socket HTTP cho các ca JSON lỗi / thiếu header), thu thập
status code, latency, và so khớp với nhãn kỳ vọng để tính Accuracy /
Precision / Recall / F1 trên 800 ca có nhãn (Positive + Negative), đồng thời
thống kê tỉ lệ "sống sót" (không 5xx / không crash) cho 200 ca Edge + Stress.

Chạy:
    python3 tests/blackbox_runner.py --base-url http://127.0.0.1:8000

Yêu cầu: `pip install requests`, backend đã chạy (uvicorn server:app).

Output:
    tests/results/blackbox_raw.csv      — toàn bộ 1000 dòng kết quả thô
    tests/results/blackbox_summary.json — số liệu tổng hợp dùng cho báo cáo
"""
from __future__ import annotations

import argparse
import csv
import http.client
import json
import random
import statistics
import string
import time
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional
from urllib.parse import urlparse

import requests

random.seed(42)

RESULTS_DIR = Path(__file__).resolve().parent / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)


# ============================================================ ngân hàng dữ liệu
# Từ ngữ độc hại/xúc phạm mức trung bình, tương tự tập ViHSD (UIT-VNUHCM) mà
# chính dự án này dùng để huấn luyện — chỉ phục vụ kiểm thử bộ lọc, không
# nhắm vào cá nhân cụ thể nào.
TOXIC_PHRASES = [
    "đồ ngu như bò", "thằng khốn nạn", "con điên này", "óc chó thật sự",
    "đồ rác rưởi vô dụng", "mất dạy vừa thôi", "đồ vô học", "thằng chó đẻ",
    "con đĩ rẻ tiền", "đồ súc vật", "câm mồm lại đi", "đồ khốn kiếp",
    "thằng ngu dốt", "con ranh mất dạy", "đồ phản bội bẩn thỉu",
    "địt mẹ mày", "đm thằng này", "vãi cả lồn", "clgt vậy trời",
    "cút mẹ mày đi", "đồ chó cái", "thằng óc lợn", "con quỷ cái",
    "ngu như chó ấy", "đồ bần nông mất dạy", "thằng khốn này chết đi",
    "đồ đàn bà lăng loàn", "biến mẹ mày đi", "thằng đần độn",
    "đéo ai thèm chơi với mày", "mày ngu vãi lồn", "thằng súc sinh",
    "đồ mặt dày vô liêm sỉ", "con mụ điên khùng", "thằng cave rẻ tiền",
    "đồ đĩ đực", "vklol thằng ml", "địt con mẹ mày luôn",
    "thằng dcm vô học", "đồ rác rưởi của xã hội",
]

# Câu lành mạnh, đa chủ đề — đời sống, học tập, công việc, cảm xúc tích cực/tiêu cực bình thường.
BENIGN_SENTENCES = [
    "Hôm nay trời đẹp quá, mình đi dạo công viên nhé.",
    "Bài tập toán này khó thật nhưng mình sẽ cố gắng làm.",
    "Cảm ơn bạn đã giúp mình hoàn thành báo cáo hôm qua.",
    "Chúng ta nên ăn nhiều rau xanh để tốt cho sức khoẻ.",
    "Đội tuyển Việt Nam đã thi đấu rất xuất sắc tối qua.",
    "Mình rất buồn vì kỳ thi vừa rồi không đạt kết quả tốt.",
    "Bạn có thể chỉ mình cách nấu phở bò được không?",
    "Công ty vừa thông báo tăng lương cho nhân viên xuất sắc.",
    "Cuốn sách này viết về lịch sử Việt Nam thời Lý Trần.",
    "Mình đang học lập trình Python và thấy rất thú vị.",
    "Chiều nay có mưa to, nhớ mang theo áo mưa nhé.",
    "Cô giáo hôm nay giảng bài rất dễ hiểu và sinh động.",
    "Chúc mừng sinh nhật, chúc bạn luôn vui vẻ hạnh phúc.",
    "Dự án này cần thêm thời gian để hoàn thiện tài liệu.",
    "Mẹ mình nấu ăn ngon nhất trên đời, mình rất yêu mẹ.",
    "Hôm nay mình đi khám sức khoẻ định kỳ ở bệnh viện.",
    "Trận đấu bóng đá tối qua diễn ra rất kịch tính.",
    "Chúng tôi đang lên kế hoạch du lịch Đà Lạt cuối tuần.",
    "Bức tranh phong cảnh này được vẽ rất tinh tế.",
    "Xin chào, rất vui được làm quen với mọi người.",
]

# Câu học thuật / khoa học / tin tức chứa từ dễ gây "báo động giả" (False Positive):
# từ nhạy cảm xuất hiện trong ngữ cảnh chuyên môn hoàn toàn lành mạnh.
ACADEMIC_TRIGGER_SENTENCES = [
    "Con chó là loài vật nuôi trung thành và thông minh nhất với con người.",
    "Bác sĩ khám cho bệnh nhân bị đau khớp gối do viêm mãn tính.",
    "Loài chim yến làm tổ trên vách đá cao để tránh thú săn mồi.",
    "Giáo trình sinh học mô tả quá trình giao phối ở loài lưỡng cư.",
    "Bài báo khoa học phân tích tác động của bạo lực gia đình đến trẻ em.",
    "Cảnh sát điều tra vụ án giết người xảy ra tại quận trung tâm.",
    "Phim tài liệu nói về nạn buôn người và cách phòng chống.",
    "Luận văn nghiên cứu về hành vi tự tử ở thanh thiếu niên.",
    "Bài giảng lịch sử nhắc đến các cuộc chiến tranh đẫm máu.",
    "Tạp chí y khoa công bố nghiên cứu mới về ung thư máu.",
    "Đồ chơi trẻ em bằng gỗ được sản xuất thủ công an toàn.",
    "Đồ án tốt nghiệp của sinh viên đạt giải nhất cuộc thi.",
    "Cô ấy là chuyên gia phân tích tâm lý tội phạm giết người.",
    "Con đĩa là loài động vật không xương sống sống ở ao hồ.",
    "Địa chất học nghiên cứu cấu trúc các lớp đất đá cổ đại.",
    "Bài viết học thuật bàn về nạn xâm hại và bóc lột lao động.",
    "Chương trình thời sự đưa tin về vụ cướp giật tài sản.",
    "Đề tài nghiên cứu về chất độc trong thực phẩm bẩn.",
    "Cuốn tiểu thuyết mô tả nhân vật phản diện tàn ác và độc ác.",
    "Bài phân tích văn học về hình tượng con quỷ trong dân gian.",
]

EMOJI_POOL = list(
    "😀😁😂🤣😊😍🥰😘😜🤔😐😴😭😡🤬💀👍👎🙏🔥❤️💯🎉✨🚀🐶🐱🌸🍕⚽️🇻🇳🏳️‍🌈👨‍👩‍👧‍👦"
)
ZALGO_COMBINING = list(
    "̣̰́̂̃̈͜͡҉̀̄"
)

HTML_JS_PAYLOADS = [
    "<script>alert('xss')</script>",
    "<img src=x onerror=alert(1)>",
    "'; DROP TABLE users; --",
    "<svg/onload=alert(document.cookie)>",
    "javascript:alert(1)",
    "<iframe src='javascript:alert(1)'></iframe>",
    "{{7*7}}",
    "${7*7}",
    "<a href=\"javascript:alert(1)\">click</a>",
    "\" OR 1=1 --",
    "<div onmouseover=alert(1)>hover</div>",
    "<style>@import 'javascript:alert(1)';</style>",
    "%3Cscript%3Ealert(1)%3C%2Fscript%3E",
    "<script src=//evil.example/x.js></script>",
    "<body onload=alert('xss')>",
    "<input onfocus=alert(1) autofocus>",
    "<marquee onstart=alert(1)>x</marquee>",
    "'; exec xp_cmdshell('dir'); --",
    "<object data='javascript:alert(1)'>",
    "<xss id=x onclick=alert(1)>click</xss>",
]


# ============================================================ hàm biến đổi né lọc (obfuscation)
def leetspeak(text: str) -> str:
    table = str.maketrans(
        {"a": "4", "e": "3", "o": "0", "i": "1", "s": "5", "t": "7", "A": "4", "O": "0"}
    )
    return text.translate(table)


def dot_separate(text: str) -> str:
    return ".".join(list(text.replace(" ", "  ")))


def star_separate(text: str) -> str:
    return "*".join(list(text))


def underscore_separate(text: str) -> str:
    return "_".join(text.split(" "))


def strip_diacritics(text: str) -> str:
    nfd = unicodedata.normalize("NFD", text)
    no_marks = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    return no_marks.replace("đ", "d").replace("Đ", "D")


def zero_width_insert(text: str) -> str:
    zw = "​"
    return zw.join(list(text))


def homoglyph_swap(text: str) -> str:
    table = str.maketrans({"a": "а", "o": "о", "e": "е", "c": "с"})  # Cyrillic look-alikes
    return text.translate(table)


def teencode_abbrev(text: str) -> str:
    repl = {
        "không": "k", "được": "dc", "biết": "bit", "vãi": "vl",
        "gì": "j", "rồi": "r", "vậy": "z", "mày": "m", "tao": "t",
    }
    words = text.split(" ")
    return " ".join(repl.get(w, w) for w in words)


def mixed_case_punct(text: str) -> str:
    out = []
    for i, ch in enumerate(text):
        out.append(ch.upper() if i % 2 == 0 else ch)
    return "!!" + "".join(out) + "!!"


def spaced_out(text: str) -> str:
    return "  ".join(text.split(" "))


OBFUSCATIONS: list[tuple[str, Callable[[str], str]]] = [
    ("raw", lambda t: t),
    ("leetspeak", leetspeak),
    ("dot_separated", dot_separate),
    ("star_separated", star_separate),
    ("underscore_separated", underscore_separate),
    ("no_diacritics", strip_diacritics),
    ("zero_width_space", zero_width_insert),
    ("homoglyph", homoglyph_swap),
    ("teencode", teencode_abbrev),
    ("mixed_case_punct", mixed_case_punct),
]


@dataclass
class Case:
    id: str
    category: str  # positive | negative | edge | stress
    subtype: str
    content: Any
    expected_label: Optional[int] = None  # 0/1 chỉ có ở positive/negative
    # tuỳ biến request thô (raw_body/headers) dùng cho stress cases:
    raw_body: Optional[bytes] = None
    headers: Optional[dict] = None
    note: str = ""


# ============================================================ sinh 1000 ca
def build_positive_cases() -> list[Case]:
    cases = []
    idx = 0
    for phrase in TOXIC_PHRASES:
        for tag, fn in OBFUSCATIONS:
            idx += 1
            try:
                content = fn(phrase)
            except Exception:
                content = phrase
            cases.append(
                Case(id=f"POS-{idx:04d}", category="positive", subtype=tag,
                     content=content, expected_label=1,
                     note=f"gốc: {phrase!r}")
            )
    return cases[:400]


def build_negative_cases() -> list[Case]:
    cases = []
    idx = 0
    pools = (
        ("benign_plain", BENIGN_SENTENCES),
        ("academic_trigger_word", ACADEMIC_TRIGGER_SENTENCES),
    )
    # nhân bản có biến thể nhẹ (thêm câu ghép / emoji tích cực) để đạt 400 ca
    suffixes = ["", " Cảm ơn mọi người đã đọc.", " 😊", " Rất mong nhận được góp ý.",
                " Đây là thông tin tham khảo.", " Xin chân thành cảm ơn.",
                " Hẹn gặp lại vào tuần sau.", " Chi tiết xem thêm bên dưới.",
                " Mong mọi người ủng hộ.", " Chúc mọi người một ngày tốt lành."]
    for subtype, pool in pools:
        for base in pool:
            for suf in suffixes:
                idx += 1
                cases.append(
                    Case(id=f"NEG-{idx:04d}", category="negative", subtype=subtype,
                         content=base + suf, expected_label=0)
                )
    random.shuffle(cases)
    for i, c in enumerate(cases, start=1):
        c.id = f"NEG-{i:04d}"
    return cases[:400]


def build_edge_cases() -> list[Case]:
    cases: list[Case] = []

    # 1) chuỗi 1 ký tự (20)
    pool_1char = list(string.ascii_letters) + list("0123456789") + list("!@#.,?") \
        + ["😀", "🔥", "đ", "ự", "€", "™", "…", "​"]
    random.shuffle(pool_1char)
    for i, ch in enumerate(pool_1char[:20], start=1):
        cases.append(Case(id=f"EDGE-1CHAR-{i:02d}", category="edge", subtype="one_char", content=ch))

    # 2) chuỗi siêu dài (20)
    long_bases = ["a", "đồ ngu ", "xin chào ", "😀", "test ", "vô hại "]
    lengths = [500, 2_000, 10_000, 50_000, 100_000]
    i = 0
    for base in long_bases:
        for length in lengths:
            i += 1
            if i > 20:
                break
            reps = max(1, length // max(1, len(base)))
            cases.append(Case(id=f"EDGE-LONG-{i:02d}", category="edge", subtype="super_long",
                               content=base * reps, note=f"~{length} ký tự"))
        if i > 20:
            break

    # 3) unicode / emoji phức tạp (20)
    for i in range(1, 21):
        kind = i % 4
        if kind == 0:
            content = "".join(random.choice(EMOJI_POOL) for _ in range(10))
        elif kind == 1:
            base = random.choice(["a", "chào", "test"])
            content = "".join(c + random.choice(ZALGO_COMBINING) for c in base) * 2
        elif kind == 2:
            content = "مرحبا שלום 你好 こんにちは Привет " + random.choice(EMOJI_POOL)
        else:
            content = "👨‍👩‍👧‍👦🏳️‍🌈" + random.choice(EMOJI_POOL) * 3
        cases.append(Case(id=f"EDGE-UNI-{i:02d}", category="edge", subtype="unicode_emoji", content=content))

    # 4) payload rỗng (20)
    empty_variants = ["", " ", "  ", "\n", "\t", "\r\n", "​", " ",
                       "\0", "   \n\t  ", "　", "​", "﻿", "\x0b", "\x0c"]
    while len(empty_variants) < 20:
        empty_variants.append(" " * random.randint(1, 5))
    for i, v in enumerate(empty_variants[:20], start=1):
        cases.append(Case(id=f"EDGE-EMPTY-{i:02d}", category="edge", subtype="empty_payload", content=v))

    # 5) HTML/JS injection (20)
    for i, payload in enumerate(HTML_JS_PAYLOADS, start=1):
        cases.append(Case(id=f"EDGE-INJ-{i:02d}", category="edge", subtype="html_js_injection", content=payload))

    return cases[:100]


def build_stress_cases(base_url: str) -> list[Case]:
    cases: list[Case] = []

    # 1) JSON lỗi cú pháp (25)
    broken_jsons = [
        '{"content": "thiếu ngoặc đóng"', '{content: "thiếu dấu ngoặc kép key"}',
        '{"content": "trailing comma",}', '{"content": }', "not even json",
        '{"content": "unterminated string}', '["array thay vì object"]',
        '{"content": "a"} extra garbage', "", "{}", "null", "12345",
        '{"content": "a", "content": "b" "missing_comma": 1}',
        '{"content": "unicode lỗi \\uZZZZ"}', "{'content': 'single quotes'}",
    ]
    while len(broken_jsons) < 25:
        broken_jsons.append('{"content": "lặp lỗi ' + str(len(broken_jsons)) + '"' * 3)
    for i, body in enumerate(broken_jsons[:25], start=1):
        cases.append(Case(id=f"STRESS-JSON-{i:02d}", category="stress", subtype="malformed_json",
                           content=body, raw_body=body.encode("utf-8"),
                           headers={"Content-Type": "application/json"}))

    # 2) Sai Content-Type (25)
    ct_variants = [
        "text/plain", "application/xml", "multipart/form-data", "text/html",
        "application/x-www-form-urlencoded", "application/octet-stream",
        "image/png", "", "application/json; charset=UTF-16", "APPLICATION/JSON",
        "application/json ; boundary=x", "text/plain; charset=utf-8",
    ]
    while len(ct_variants) < 25:
        ct_variants.append(random.choice(ct_variants))
    valid_json_body = json.dumps({"content": "nội dung hợp lệ nhưng sai content-type"})
    for i, ct in enumerate(ct_variants[:25], start=1):
        headers = {} if ct == "" else {"Content-Type": ct}
        cases.append(Case(id=f"STRESS-CT-{i:02d}", category="stress", subtype="wrong_content_type",
                           content=valid_json_body, raw_body=valid_json_body.encode("utf-8"),
                           headers=headers, note=f"Content-Type={ct!r}"))

    # 3) payload quá tải / field sai kiểu (25)
    oversized_cases = []
    for size in [200_000, 1_000_000]:
        oversized_cases.append(json.dumps({"content": "x" * size}))
    weird_field_bodies = [
        json.dumps({"content": 12345}),
        json.dumps({"content": None}),
        json.dumps({"content": ["a", "b"]}),
        json.dumps({"content": {"nested": "obj"}}),
        json.dumps({"content": True}),
        json.dumps({"wrong_field_name": "abc"}),
        json.dumps({}),
        json.dumps({"content": "ok", "extra_unexpected_field": "x" * 5000}),
        json.dumps([{"content": "array of objects"}]),
        json.dumps({"content": "a" * 50}) * 3,  # lặp JSON dính liền
    ]
    all_overload = oversized_cases + weird_field_bodies
    while len(all_overload) < 25:
        all_overload.append(json.dumps({"content": "pad" * random.randint(1000, 20000)}))
    for i, body in enumerate(all_overload[:25], start=1):
        cases.append(Case(id=f"STRESS-SIZE-{i:02d}", category="stress", subtype="oversized_or_bad_type",
                           content=body, raw_body=body.encode("utf-8"),
                           headers={"Content-Type": "application/json"}))

    # 4) thiếu Header / Auth (25)
    valid_body = json.dumps({"content": "kiểm tra thiếu header"})
    header_variants = [
        {},  # không header nào cả
        {"Content-Type": "application/json", "Authorization": "Bearer faketoken123"},
        {"Content-Type": "application/json", "X-API-Key": "invalid-key"},
        {"Content-Type": "application/json", "Origin": "https://evil.example.com"},
        {"Content-Type": "application/json", "Host": "malicious.example.com"},
        {"Accept": "application/json"},  # thiếu Content-Type
        {"Content-Type": "application/json", "Cookie": "session=abc123"},
        {"Content-Type": "application/json", "Referer": "https://evil.example.com"},
    ]
    while len(header_variants) < 25:
        header_variants.append({"Content-Type": "application/json", "X-Test": f"case-{len(header_variants)}"})
    for i, headers in enumerate(header_variants[:25], start=1):
        cases.append(Case(id=f"STRESS-HDR-{i:02d}", category="stress", subtype="missing_header_or_auth",
                           content=valid_body, raw_body=valid_body.encode("utf-8"),
                           headers=headers, note=str(headers)))

    return cases[:100]


def build_all_cases(base_url: str) -> list[Case]:
    cases = []
    cases += build_positive_cases()
    cases += build_negative_cases()
    cases += build_edge_cases()
    cases += build_stress_cases(base_url)
    return cases


# ============================================================ thực thi HTTP
@dataclass
class Result:
    case: Case
    status_code: Optional[int]
    latency_ms: float
    predicted_label: Optional[int]
    confidence: Optional[float]
    error: str = ""
    body_snippet: str = ""


def send_normal(session: requests.Session, url: str, text: Any, timeout: float) -> tuple[Optional[int], float, dict | None, str]:
    t0 = time.perf_counter()
    try:
        resp = session.post(url, json={"content": text}, timeout=timeout)
        latency = (time.perf_counter() - t0) * 1000
        try:
            data = resp.json()
        except Exception:
            data = None
        return resp.status_code, latency, data, ""
    except requests.exceptions.RequestException as err:
        latency = (time.perf_counter() - t0) * 1000
        return None, latency, None, str(err)


def send_raw(url: str, raw_body: bytes, headers: dict, timeout: float) -> tuple[Optional[int], float, dict | None, str]:
    parsed = urlparse(url)
    conn = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=timeout)
    t0 = time.perf_counter()
    try:
        conn.request("POST", parsed.path, body=raw_body, headers=headers)
        resp = conn.getresponse()
        raw = resp.read()
        latency = (time.perf_counter() - t0) * 1000
        try:
            data = json.loads(raw.decode("utf-8", errors="replace"))
        except Exception:
            data = None
        return resp.status, latency, data, ""
    except Exception as err:
        latency = (time.perf_counter() - t0) * 1000
        return None, latency, None, str(err)
    finally:
        conn.close()


def run(cases: list[Case], base_url: str, timeout: float = 20.0) -> list[Result]:
    url = base_url.rstrip("/") + "/predict"
    session = requests.Session()
    results: list[Result] = []
    total = len(cases)
    for n, case in enumerate(cases, start=1):
        if case.raw_body is not None:
            status, latency, data, err = send_raw(url, case.raw_body, case.headers or {}, timeout)
        else:
            status, latency, data, err = send_normal(session, url, case.content, timeout)

        pred_label = data.get("label") if isinstance(data, dict) else None
        conf = data.get("confidence") if isinstance(data, dict) else None
        snippet = json.dumps(data, ensure_ascii=False)[:200] if data else ""
        results.append(Result(case=case, status_code=status, latency_ms=latency,
                               predicted_label=pred_label, confidence=conf,
                               error=err, body_snippet=snippet))
        if n % 100 == 0 or n == total:
            print(f"  [{n}/{total}] {case.id} status={status} latency={latency:.1f}ms")
    return results


# ============================================================ tổng hợp số liệu
def summarize(results: list[Result]) -> dict:
    by_cat: dict[str, list[Result]] = {}
    for r in results:
        by_cat.setdefault(r.case.category, []).append(r)

    def latency_stats(rs: list[Result]) -> dict:
        lat = [r.latency_ms for r in rs if r.latency_ms is not None]
        if not lat:
            return {}
        lat_sorted = sorted(lat)
        p95_idx = min(len(lat_sorted) - 1, int(len(lat_sorted) * 0.95))
        return {
            "count": len(lat),
            "avg_ms": round(statistics.mean(lat), 2),
            "median_ms": round(statistics.median(lat), 2),
            "p95_ms": round(lat_sorted[p95_idx], 2),
            "max_ms": round(max(lat), 2),
            "min_ms": round(min(lat), 2),
        }

    # --- Accuracy / P / R / F1 trên positive + negative (nhãn kỳ vọng có sẵn)
    labeled = [r for r in results if r.case.expected_label is not None]
    tp = sum(1 for r in labeled if r.case.expected_label == 1 and r.predicted_label == 1)
    fn = sum(1 for r in labeled if r.case.expected_label == 1 and r.predicted_label == 0)
    fp = sum(1 for r in labeled if r.case.expected_label == 0 and r.predicted_label == 1)
    tn = sum(1 for r in labeled if r.case.expected_label == 0 and r.predicted_label == 0)
    unparsed = sum(1 for r in labeled if r.predicted_label not in (0, 1))

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    accuracy = (tp + tn) / (tp + tn + fp + fn) if (tp + tn + fp + fn) else 0.0

    # --- tỉ lệ "lách được bộ lọc" theo từng kỹ thuật obfuscation (chỉ trên positive)
    pos_by_subtype: dict[str, dict] = {}
    for r in by_cat.get("positive", []):
        d = pos_by_subtype.setdefault(r.case.subtype, {"total": 0, "bypassed": 0})
        d["total"] += 1
        if r.predicted_label == 0:
            d["bypassed"] += 1
    for st, d in pos_by_subtype.items():
        d["bypass_rate_pct"] = round(100 * d["bypassed"] / d["total"], 1) if d["total"] else 0.0

    # --- tỉ lệ false positive theo từng nhóm negative
    neg_by_subtype: dict[str, dict] = {}
    for r in by_cat.get("negative", []):
        d = neg_by_subtype.setdefault(r.case.subtype, {"total": 0, "false_positive": 0})
        d["total"] += 1
        if r.predicted_label == 1:
            d["false_positive"] += 1
    for st, d in neg_by_subtype.items():
        d["fp_rate_pct"] = round(100 * d["false_positive"] / d["total"], 1) if d["total"] else 0.0

    # --- edge / stress: tỉ lệ server "sống sót" hợp lý
    def robustness(rs: list[Result]) -> dict:
        by_subtype: dict[str, dict] = {}
        for r in rs:
            d = by_subtype.setdefault(r.case.subtype, {"total": 0, "http_200": 0, "5xx": 0,
                                                         "conn_error": 0, "4xx": 0})
            d["total"] += 1
            if r.status_code is None:
                d["conn_error"] += 1
            elif r.status_code >= 500:
                d["5xx"] += 1
            elif r.status_code >= 400:
                d["4xx"] += 1
            elif r.status_code == 200:
                d["http_200"] += 1
        return by_subtype

    worst_positive = sorted(
        (r for r in by_cat.get("positive", []) if r.predicted_label == 0),
        key=lambda r: (r.confidence if r.confidence is not None else 1.0),
    )[:15]
    worst_negative = sorted(
        (r for r in by_cat.get("negative", []) if r.predicted_label == 1),
        key=lambda r: -(r.confidence if r.confidence is not None else 0.0),
    )[:15]
    server_errors = [r for r in results if r.status_code is not None and r.status_code >= 500]
    conn_errors = [r for r in results if r.status_code is None]

    summary = {
        "total_cases": len(results),
        "counts_by_category": {k: len(v) for k, v in by_cat.items()},
        "latency": {cat: latency_stats(rs) for cat, rs in by_cat.items()},
        "latency_overall": latency_stats(results),
        "classification_metrics": {
            "labeled_cases": len(labeled),
            "tp": tp, "fp": fp, "tn": tn, "fn": fn, "unparsed_or_error": unparsed,
            "accuracy": round(accuracy, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4),
        },
        "positive_bypass_by_obfuscation": pos_by_subtype,
        "negative_false_positive_by_subtype": neg_by_subtype,
        "edge_robustness": robustness(by_cat.get("edge", [])),
        "stress_robustness": robustness(by_cat.get("stress", [])),
        "worst_failures": {
            "false_negatives_top15": [
                {"id": r.case.id, "subtype": r.case.subtype, "text": str(r.case.content)[:80],
                 "predicted_label": r.predicted_label, "confidence": r.confidence}
                for r in worst_positive
            ],
            "false_positives_top15": [
                {"id": r.case.id, "subtype": r.case.subtype, "text": str(r.case.content)[:80],
                 "predicted_label": r.predicted_label, "confidence": r.confidence}
                for r in worst_negative
            ],
            "server_5xx_errors": [
                {"id": r.case.id, "subtype": r.case.subtype, "status": r.status_code, "error": r.error}
                for r in server_errors[:20]
            ],
            "connection_errors": [
                {"id": r.case.id, "subtype": r.case.subtype, "error": r.error}
                for r in conn_errors[:20]
            ],
        },
    }
    return summary


def write_csv(results: list[Result], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "category", "subtype", "expected_label", "predicted_label",
                    "confidence", "status_code", "latency_ms", "error", "content_preview"])
        for r in results:
            w.writerow([
                r.case.id, r.case.category, r.case.subtype, r.case.expected_label,
                r.predicted_label, r.confidence, r.status_code, round(r.latency_ms, 2),
                r.error, str(r.case.content)[:120].replace("\n", "\\n"),
            ])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://127.0.0.1:8000")
    ap.add_argument("--timeout", type=float, default=20.0)
    args = ap.parse_args()

    print("Đang kiểm tra /health ...")
    try:
        r = requests.get(args.base_url.rstrip("/") + "/health", timeout=5)
        print("  health:", r.status_code, r.text)
    except Exception as err:
        print(f"  KHÔNG kết nối được backend tại {args.base_url}: {err}")
        raise SystemExit(1)

    print("Đang sinh 1.000 kịch bản test...")
    cases = build_all_cases(args.base_url)
    print(f"  Tổng số ca: {len(cases)}")
    for cat in ("positive", "negative", "edge", "stress"):
        print(f"    {cat}: {sum(1 for c in cases if c.category == cat)}")

    print("Đang gửi request tới backend...")
    t0 = time.perf_counter()
    results = run(cases, args.base_url, timeout=args.timeout)
    total_time = time.perf_counter() - t0
    print(f"Hoàn tất trong {total_time:.1f}s")

    summary = summarize(results)
    summary["total_wall_time_sec"] = round(total_time, 2)

    csv_path = RESULTS_DIR / "blackbox_raw.csv"
    json_path = RESULTS_DIR / "blackbox_summary.json"
    write_csv(results, csv_path)
    json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nĐã ghi: {csv_path}")
    print(f"Đã ghi: {json_path}")
    print("\n=== TÓM TẮT ===")
    print(json.dumps(summary["classification_metrics"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
