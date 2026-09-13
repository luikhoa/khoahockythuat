# Báo cáo Kiểm thử AI/NLP — Dự án CyberShield

**Vai trò:** Senior QA / Test Engineer (AI/NLP)
**Ngày kiểm thử:** 2026-09-09
**Phạm vi:** `backend/predictor.py`, `backend/model.py`, `backend/server.py`,
`backend/storage.py`, `backend/config.py`, `extension/src/content/content.ts`,
`extension/src/lib/api.ts`
**Phương pháp:** White-box (đọc mã nguồn + kiến trúc) và Black-box (1.000 request HTTP
thực tế tới `POST /predict` trên backend đang chạy)
**Artifact đi kèm:**
- `tests/blackbox_runner.py` — script sinh & gửi 1.000 kịch bản, đã chạy thật
- `tests/results/blackbox_raw.csv`, `tests/results/blackbox_summary.json` — dữ liệu thô/tổng hợp
- `tests/unit/test_predictor.py`, `tests/unit/test_server_api.py`, `tests/unit/conftest.py` — 31 unit test `pytest` (27 passed, 3 xfailed, 1 xpassed)

---

## Phần 1: Tổng quan & Scope kiểm thử

### 1.1 Kiến trúc hệ thống được kiểm thử

```
extension/content.ts  --fetch POST /predict-->  backend/server.py (FastAPI, không auth)
                                                        │
                                                        ▼
                                            backend/predictor.py (predict())
                                                        │
                                    tokenizer PhoBERT (use_fast=False, raw text)
                                                        │
                                                        ▼
                                model.py: FrozenBackboneClassifier (PhoBERT
                                backbone đóng băng + MLP head 2 lớp, Sigmoid)
```

- Model: `vinai/phobert-base-v2` (backbone đóng băng) + adapter MLP head huấn luyện lại,
  nạp từ `backend/offensive_classifier.pkl` (~773 KB) qua `joblib`.
- Bài toán: phân loại nhị phân **an toàn (0) / độc hại (1)**, ngưỡng quyết định
  `NGƯỠNG_ĐỘC_HẠI = 0.4` trên xác suất Sigmoid của lớp độc hại (`backend/predictor.py:25`).
- Không có bước tiền xử lý văn bản nào giữa lúc lấy `el.textContent.trim()` ở content
  script và lúc đưa thẳng vào tokenizer ở backend — đây là phát hiện trọng tâm của
  phần White-box (xem 2.2).
- Server chạy 1 tiến trình `uvicorn`, không auth, `CORS allow_origins=["*"]`
  (`backend/server.py:12-17`).

### 1.2 Scope kiểm thử

| Hạng mục | Trong scope | Ngoài scope |
|---|---|---|
| White-box | predictor.py, model.py, server.py, storage.py, config.py, content.ts, api.ts | Quy trình huấn luyện model gốc (không có script train trong repo tại thời điểm kiểm thử) |
| Black-box | `POST /predict` qua HTTP thật (1.000 ca) | `/events`, `/stats` (chỉ test nhẹ trong unit test), giao diện popup |
| Môi trường | macOS, Python 3.14, torch 2.10, transformers 5.16, FastAPI 0.141, chạy CPU, 1 worker | Môi trường production thật (chưa rõ có deploy multi-worker/GPU hay không) |

### 1.3 Lưu ý về tính đại diện của dữ liệu test

Bộ 1.000 ca Black-box là dữ liệu **tổng hợp (synthetic)** do QA biên soạn dựa trên các
kỹ thuật né lọc phổ biến và câu tiếng Việt lành mạnh/học thuật, **không phải mẫu từ tập
huấn luyện ViHSD** cũng không phải log truy vấn thật từ người dùng. Số liệu Precision/
Recall/F1 trong báo cáo này phản ánh khả năng chống né lọc và tránh báo động giả trên
**bộ test này cụ thể**, có giá trị chỉ báo (indicative) chứ không thay thế cho việc đánh
giá trên tập test giữ lại (held-out) từ pipeline huấn luyện gốc.

---

## Phần 2: Kết quả White-box Testing

### 2.1 Bảng tổng hợp lỗi/điểm yếu theo mức độ

| # | Mức độ | Hạng mục | File:dòng | Mô tả ngắn |
|---|---|---|---|---|
| W1 | **High** | Tiền xử lý văn bản | `backend/predictor.py:107-112` | Không có bước chuẩn hoá (unicode NFC, gỡ zero-width, gộp ký tự chèn, chuẩn hoá teencode) trước khi tokenize → dễ bị né lọc (xác nhận bằng Black-box, xem 3.2) |
| W2 | **High** | Fail-open khi model lỗi | `backend/predictor.py:80-84, 39-40, 103-104` | Nếu `_load()` ném lỗi (thiếu file, hỏng pickle, mất mạng khi tải tokenizer online) → `_model = None` → **mọi** request sau đó trả về "an toàn" mặc định, im lặng, không có cảnh báo vận hành nào |
| W3 | **High** | `/health` không phản ánh trạng thái model | `backend/server.py:55-57` | Endpoint trả `{"status":"ok"}` tĩnh, không kiểm tra `predictor._model is not None` → không thể dùng health check để phát hiện tình huống W2 |
| W4 | **High** | Không giới hạn độ dài input | `backend/server.py:20-21` | `TextRequest.content: str` không có `max_length`; tokenizer `use_fast=False` (chậm) xử lý toàn bộ chuỗi trước khi truncate → xác nhận thực nghiệm: payload 1 MB tăng latency **~27 lần** (14 ms → 378,7 ms), xem 3.4 |
| W5 | **High** | CORS mở toàn bộ + không xác thực | `backend/server.py:12-17` | `allow_origins=["*"]` và không có API key/token nào → **bất kỳ trang web nào** người dùng mở trong trình duyệt đều có thể gọi trực tiếp `/predict`, `/events` từ JavaScript phía client (CSRF-like, xem `tests/unit/test_server_api.py::TestCORSConfig`) |
| W6 | **Medium** | Ngưỡng quyết định trùng lặp, lệch giá trị | `backend/predictor.py:25` (`0.4`) vs `extension/src/content/content.ts:13` (`0.6`) | Backend gắn nhãn độc hại khi `p1 >= 0.4`, nhưng extension chỉ can thiệp UI khi `confidence >= 0.6` → mọi kết quả có `p1` trong khoảng `[0.4, 0.6)` được API báo là "độc hại" nhưng **người dùng không bao giờ thấy cảnh báo**. Recall thực tế với người dùng cuối vì vậy còn thấp hơn con số 0,35 đo được ở tầng API (xem 3.1) |
| W7 | **Medium** | Blocking call trong async endpoint | `backend/server.py:39-41`, `backend/predictor.py:87-139` | `predict()` là hàm đồng bộ, chạy forward-pass PyTorch ngay trong `async def analyze_text`, không qua `run_in_threadpool`/executor → **chặn event loop** của toàn bộ tiến trình uvicorn; một request nặng (input dài) sẽ làm chậm/đứng mọi request khác kể cả `/health` |
| W8 | **Medium** | `except Exception` + `print()` nuốt lỗi | `backend/predictor.py:82, 137-138` | Bắt mọi ngoại lệ (kể cả lỗi hết bộ nhớ, lỗi tensor shape) và chỉ `print()` ra stdout — không có logging có cấu trúc, không log level, không correlation ID, khó truy vết trong production |
| W9 | **Medium** | Metadata model không đồng bộ | `extension/model.json` (mô tả TF-IDF char n-gram, 3 nhãn, macro-F1 0,797) vs `backend/predictor.py:21` (PhoBERT, 2 nhãn nhị phân) | Popup hiển thị thông tin mô hình **cũ/sai** (đã đổi kiến trúc từ TF-IDF sang PhoBERT, từ 3 nhãn sang 2 nhãn nhưng quên cập nhật `model.json`) — gây hiểu lầm cho người dùng/QA khác |
| W10 | **Medium** | `storage.py` cũng blocking trong async | `backend/storage.py:26-33`, gọi từ `backend/server.py:44-52` | `sqlite3` đồng bộ, mở connection mới mỗi lần gọi trong endpoint `async def`, không executor — cùng lớp vấn đề với W7, mức độ nhẹ hơn vì I/O ngắn |
| W11 | **Low** | Không cache phía backend | `backend/predictor.py:87` | Content script đã cache theo text ở client (`content.ts:30`, tối đa 4000 mục) nhưng backend không cache gì — text trùng lặp giữa nhiều tab/nhiều người dùng vẫn tốn suy luận đầy đủ mỗi lần |
| W12 | **Low** | Monkeypatch `__main__` để unpickle | `backend/predictor.py:43-51` | Gán class rỗng vào `__main__.OffensiveTextClassifier` để `joblib.load` không lỗi — kỹ thuật hợp lệ nhưng khá "hacky", dễ vỡ nếu file pickle được tạo lại với schema khác mà không đồng bộ |
| W13 | **Low** | Không kiểm tra toàn vẹn artifact model | `backend/predictor.py:62` | `joblib.load(MODEL_PATH)` (dựa trên `pickle`) không có bước xác minh checksum/chữ ký — nếu file `.pkl` bị thay thế (vô tình hoặc cố ý) có thể dẫn đến thực thi mã tuỳ ý khi load |
| W14 | **Low** | Không quản lý device tường minh | `backend/model.py:41,50` | Không có `.to(device)`/kiểm tra CUDA — luôn chạy CPU dù máy có GPU, giới hạn khả năng mở rộng khi tải tăng |

### 2.2 Nhận xét chi tiết: Tiền xử lý văn bản (Text Preprocessing)

Đây là phát hiện quan trọng nhất của đợt kiểm thử. `predictor.predict()` gọi thẳng:

```python
enc = _tokenizer(text, truncation=True, max_length=_cfg.max_length, return_tensors="pt")
```

trên **văn bản thô** lấy từ `el.textContent.trim()` phía content script — không có bước
nào: chuẩn hoá Unicode (NFC/NFKC), loại ký tự zero-width, gộp ký tự chèn giữa các chữ
cái (`.`, `_`, `*`, khoảng trắng kép), chuyển về không dấu để so khớp, hay chuẩn hoá
teencode phổ biến. Vì PhoBERT là tokenizer subword (BPE) huấn luyện trên văn bản tiếng
Việt "sạch", việc chèn ký tự lạ giữa các âm tiết phá vỡ hoàn toàn ranh giới token mà
model đã học, khiến embedding đầu ra gần như vô nghĩa và ngả về lớp mặc định "an toàn".
Số liệu Black-box (Phần 3.2) xác nhận trực tiếp hệ quả này: kỹ thuật chèn `*`/zero-width
space né được **100%** câu độc hại thử nghiệm.

Đáng chú ý: ngay cả câu độc hại **không obfuscate** (`raw`) cũng bị bỏ lọt 30% — cho
thấy vấn đề không chỉ nằm ở tiền xử lý mà còn ở khả năng phân biệt (calibration) của
bản thân model/ngưỡng, xem thêm 2.3.

### 2.3 Nhận xét: Ngưỡng quyết định & độ tin cậy

Comment trong code ghi rõ ý định: `NGƯỠNG_ĐỘC_HẠI = 0.4  # p1 >= ngưỡng này -> label 1,
tối ưu recall` (`predictor.py:25`). Tuy nhiên số liệu thực nghiệm trên 400 câu độc hại
(bao gồm cả câu chưa obfuscate) cho **recall = 0,35**, tức là chọn ngưỡng thấp hơn 0,5
vẫn không đạt được recall cao trong thực tế trên bộ test này. Điều này gợi ý: (a) ngưỡng
0,4 có thể đã được tinh chỉnh trên phân bố dữ liệu khác (ViHSD gốc) không đại diện cho
văn phong lóng/né lọc hiện tại, hoặc (b) bản thân adapter head cần huấn luyện lại với
dữ liệu augmentation né lọc. Ngược lại, **precision = 1,0** (0 báo động giả trên 200 câu
học thuật/tin tức chứa từ nhạy cảm) cho thấy model rất "thận trọng" — thiên về bỏ sót
hơn là bắt nhầm.

### 2.4 Exception Handling, Memory, Concurrency, Bottleneck

- **Exception handling:** cả `_load()` và `predict()` dùng `except Exception` bắt tất
  (W8) — an toàn cho việc không sập server (đúng mục tiêu ghi trong docstring), nhưng
  làm mất khả năng phân biệt "lỗi tạm thời" và "lỗi cấu hình nghiêm trọng", và không có
  observability (metric/log có cấu trúc) để phát hiện W2/W3 trong production.
- **Memory:** không phát hiện rò rỉ bộ nhớ rõ ràng ở backend (không có cache/list phình
  to không giới hạn). Cache phía `content.ts:30,82-84` có giới hạn cứng 4000 mục và tự
  evict — thiết kế hợp lý. Rủi ro bộ nhớ thực sự nằm ở **W4**: input dài tuỳ ý được
  tokenize toàn bộ trước khi truncate, tạo áp lực RAM/CPU tạm thời tỉ lệ thuận độ dài
  input mà không có giới hạn trên.
- **Concurrency:** `uvicorn` mặc định chạy 1 worker, model dùng biến toàn cục
  `_model/_tokenizer/_cfg` không khoá (không cần thiết ở single-process hiện tại, nhưng
  sẽ là vấn đề nếu sau này thêm hot-reload model). Vấn đề nghiêm trọng hơn là **W7**:
  cuộc gọi PyTorch đồng bộ trong route `async def` chặn toàn bộ event loop — với 1
  worker, N request đồng thời sẽ bị **serialize hoàn toàn**, không có xử lý song song
  thật sự dù FastAPI async cho phép.
- **Bottleneck:** benchmark trực tiếp `predictor.predict()` (ngoài HTTP) cho ~14 ms/lần
  gọi trên câu ngắn — chấp nhận được. Qua HTTP, latency trung bình đo được là **14,99 ms**
  (P95 = 17,89 ms) cho câu thường, nhưng **tăng tuyến tính mạnh theo độ dài input** (xem
  3.4) — đúng như dự đoán từ W4, vì tokenizer chạy ở chế độ chậm (`use_fast=False`).

### 2.5 Đề xuất Refactor code

1. **Thêm module tiền xử lý riêng** `backend/preprocess.py` với pipeline: NFC normalize
   → loại ký tự zero-width/control → gộp chuỗi bị chèn ký tự phân tách giữa các chữ cái
   đơn lẻ (regex kiểu `(?:\w[.\-_*\s]){3,}\w`) → tuỳ chọn tạo thêm biến thể không dấu để
   ensemble. Gọi hàm này ở đầu `predict()` trước khi tokenize.
2. **Offload inference khỏi event loop**: bọc lời gọi model bằng
   `await run_in_threadpool(predict, text)` trong `server.py`, hoặc chuyển hẳn sang
   một tiến trình worker riêng (process pool / ONNX Runtime server) nếu tải tăng.
3. **Giới hạn input**: thêm `content: str = Field(max_length=2000)` vào `TextRequest`
   (khớp với giới hạn 1200 ký tự đã có sẵn phía content script,
   `content.ts:157`) — chặn ngay ở tầng validation Pydantic, trả 422 sớm thay vì tốn
   CPU tokenize.
4. **`/health` mở rộng**: trả thêm `{"model_loaded": bool}` dựa trên
   `predictor._model is not None`, để hệ thống giám sát phân biệt được "server sống"
   và "model chết".
5. **Thay `print()` bằng `logging`**: cấu hình logger theo module, log mức `WARNING`
   khi model load lỗi, `ERROR` kèm traceback khi predict lỗi (dùng `logger.exception`).
6. **Đồng bộ ngưỡng W6**: chỉ giữ một nguồn sự thật — hoặc bỏ ngưỡng `NGƯỠNG` phía
   `content.ts` và tin hoàn toàn theo `label` trả về từ API, hoặc đưa ngưỡng UI vào
   `model.json`/response API để hai phía luôn khớp.
7. **Đồng bộ `model.json`** với kiến trúc thực tế (PhoBERT, 2 nhãn) — sinh file này tự
   động từ `ModelConfig`/`LABELS` khi build thay vì chỉnh tay.

### 2.6 Unit test đã viết (`tests/unit/`)

Đã tạo 31 test case `pytest`, chạy thực tế **27 passed, 3 xfailed (ghi nhận lỗ hổng có
chủ đích), 1 xpassed**:

- `test_predictor.py`: hợp đồng output (proba tổng = 1, label∈{0,1}, không crash với
  input rỗng/None/siêu dài), hành vi fail-safe khi model lỗi, và một lớp
  `TestObfuscationResistance` đánh dấu `xfail` mô tả đúng W1 — sẽ tự chuyển "XPASS"
  (cảnh báo dev gỡ marker) ngay khi pipeline tiền xử lý được thêm vào.
- `test_server_api.py`: validation 422 cho input sai kiểu/thiếu field, xác nhận W3
  (`/health` không phản ánh model chết), W4 (chấp nhận payload 500 KB), W5 (CORS mở
  cho origin bất kỳ), và JSON injection payload không bị echo lại trong response.

```
pytest tests/unit/ -v
# 27 passed, 3 xfailed, 1 xpassed, 2 warnings in 6.17s
```

---

## Phần 3: Kết quả Black-box Testing

Đã chạy `tests/blackbox_runner.py` gửi thật 1.000 request `POST /predict` tới backend
đang chạy tại `http://127.0.0.1:8000` (mô hình PhoBERT đã nạp thành công). Tổng thời
gian chạy: **15,0 giây** cho 1.000 request tuần tự. Không ghi nhận lỗi kết nối hoặc mã
lỗi 5xx nào trong toàn bộ 1.000 ca.

### 3.1 Chỉ số phân loại tổng hợp (800 ca có nhãn kỳ vọng: 400 Positive + 400 Negative)

| Chỉ số | Giá trị |
|---|---|
| Accuracy | **67,5%** |
| Precision (lớp độc hại) | **1,000** |
| Recall (lớp độc hại) | **0,350** |
| F1-score | **0,519** |
| True Positive / False Negative | 140 / 260 |
| True Negative / False Positive | 400 / 0 |

**Diễn giải:** Model cực kỳ "thận trọng" — không báo động giả trên một câu học thuật/tin
tức nào trong 200 ca thử nghiệm (Precision = 1,0), nhưng bỏ lọt **65%** câu độc hại tổng
thể vì đề bài Positive được thiết kế đặc biệt để bao gồm nhiều kỹ thuật né lọc. Đây là
điểm cần cân nhắc: một content-moderation tool ưu tiên tránh báo động giả quá mức có thể
đánh đổi bằng việc bỏ sót phần lớn nội dung độc hại thực tế bị né lọc nhẹ.

### 3.2 Tỉ lệ né lọc thành công (bypass) theo từng kỹ thuật obfuscation — 40 ca/kỹ thuật

| Kỹ thuật | Ví dụ | Bị né lọc (bỏ sót) |
|---|---|---|
| `star_separated` (chèn `*` giữa từng ký tự) | `đ*ồ* *n*g*u` | **100,0%** |
| `zero_width_space` (chèn ký tự rộng-0 U+200B) | `đ​ồ​ ​n​g​u` | **100,0%** |
| `dot_separated` (chèn `.` giữa từng ký tự) | `đ.ồ. .n.g.u` | **90,0%** |
| `mixed_case_punct` (đảo hoa/thường + bọc `!!`) | `!!ĐéO Ai tHèM ChƠi!!` | **87,5%** |
| `no_diacritics` (bỏ dấu tiếng Việt) | `do ngu nhu bo` | **75,0%** |
| `leetspeak` (thay chữ bằng số) | `đ4 ng4` | **62,5%** |
| `homoglyph` (ký tự Cyrillic giống Latin) | `đéо аi thèm` | **42,5%** |
| `underscore_separated` (chèn `_` giữa từ) | `đồ_phản_bội` | **32,5%** |
| `raw` (không obfuscate) | `đồ vô học` | **30,0%** |
| `teencode` (viết tắt phổ biến) | `clgt z trời` | **30,0%** |

→ Xác nhận trực tiếp phát hiện White-box **W1**: mọi kỹ thuật chèn ký tự phá vỡ ranh
giới token (dấu chấm, dấu gạch dưới, dấu sao, zero-width space) đạt tỉ lệ né lọc từ
32,5% đến 100%. Đáng lo ngại nhất là `star_separated` và `zero_width_space` — né lọc
**tuyệt đối 100%**, tức về mặt thực chất bộ lọc **hoàn toàn vô hiệu** trước hai kỹ thuật
đơn giản này mà không cần công cụ gì đặc biệt (chỉ cần gõ thêm dấu `*` xen kẽ).

### 3.3 Tỉ lệ báo động giả (False Positive) theo nhóm Negative — 200 ca/nhóm

| Nhóm | Mô tả | Tỉ lệ báo động giả |
|---|---|---|
| `benign_plain` | Câu đời sống/học tập/công việc thông thường | **0,0%** |
| `academic_trigger_word` | Câu học thuật/tin tức chứa từ dễ gây nhận diện nhầm (vd: *"con chó"*, *"đau khớp"*, *"tội phạm giết người"*, *"chất độc thực phẩm"*) | **0,0%** |

Model không báo động giả trên bất kỳ ca nào trong 400 câu Negative — kể cả các câu học
thuật/tin tức cố tình chứa từ nhạy cảm. Đây là điểm mạnh thực sự của model hiện tại,
nhưng cần đọc cùng 3.1: cái giá của Precision hoàn hảo ở đây là Recall rất thấp.

### 3.4 Hiệu năng (Latency) theo từng nhóm

| Nhóm | Số ca | Trung bình | Median | P95 | Max |
|---|---|---|---|---|---|
| Positive | 400 | 15,03 ms | 14,60 ms | 17,42 ms | 54,41 ms |
| Negative | 400 | 13,88 ms | 13,81 ms | 14,75 ms | 36,97 ms |
| Edge | 100 | 19,74 ms | 14,79 ms | 49,85 ms | 79,53 ms |
| Stress | 100 | 14,50 ms | 0,63 ms* | 47,32 ms | **378,70 ms** |
| **Tổng thể** | **1.000** | **14,99 ms** | **14,07 ms** | **17,89 ms** | **378,70 ms** |

\* Median nhóm Stress thấp bất thường vì 25/25 ca `malformed_json` bị Pydantic từ chối
gần như tức thời (dưới 1 ms), kéo trung vị xuống — không phản ánh chi phí suy luận thật.

**Điểm nóng hiệu năng xác nhận W4:** payload 1 MB (`STRESS-SIZE-02`) mất **378,7 ms**,
gấp **~27 lần** latency trung bình của câu ngắn (14 ms). Payload 200 KB
(`STRESS-SIZE-01`) mất 98,2 ms (~7 lần). Các ca `EDGE-LONG-*` (chuỗi lặp 50.000–100.000
ký tự) cũng vượt 48–80 ms. Toàn bộ các payload này vẫn được backend **chấp nhận và trả
200** — không có giới hạn kích thước nào chặn ở tầng validation, đúng như W4 dự đoán.

### 3.5 Độ ổn định (Robustness) — Edge Cases (100 ca)

| Nhóm con | Số ca | HTTP 200 | 4xx | 5xx | Lỗi kết nối |
|---|---|---|---|---|---|
| Chuỗi 1 ký tự | 20 | 20 | 0 | 0 | 0 |
| Chuỗi siêu dài (500–100.000 ký tự) | 20 | 20 | 0 | 0 | 0 |
| Unicode/Emoji phức tạp (Zalgo, ZWJ, đa ngôn ngữ) | 20 | 20 | 0 | 0 | 0 |
| Payload rỗng/whitespace/NUL byte | 20 | 20 | 0 | 0 | 0 |
| HTML/JS injection (`<script>`, SQLi, `${}`) | 20 | 20 | 0 | 0 | 0 |

Backend **không bao giờ sập** hay trả lỗi máy chủ trên toàn bộ 100 ca Edge — kể cả input
rỗng, ký tự NUL, hay các payload injection. Đối chiếu `tests/unit/test_server_api.py::
test_predict_html_injection_payload_is_not_reflected_unsafely` xác nhận response JSON
không echo lại nội dung gốc, nên rủi ro reflected-XSS qua API này thấp — rủi ro XSS thực
sự (nếu có) phải đến từ cách **frontend/extension** hiển thị text gốc trên trang, không
phải từ payload trả về của `/predict` (xem 2.1 — `content.ts` chỉ chèn số liệu
confidence/proba vào `innerHTML`, không chèn text gốc — đã kiểm tra an toàn).

### 3.6 Độ ổn định — Stress/Boundary Cases (100 ca)

| Nhóm con | Số ca | HTTP 200 | 4xx | 5xx |
|---|---|---|---|---|
| JSON lỗi cú pháp | 25 | 0 | **25** | 0 |
| Sai `Content-Type` | 25 | 9 | 16 | 0 |
| Payload quá tải / field sai kiểu | 25 | 16 | 9 | 0 |
| Thiếu Header/Auth | 25 | **23** | 2 | 0 |

- **JSON lỗi cú pháp:** FastAPI/Pydantic từ chối đúng 100% (25/25 → 4xx) — xử lý lỗi
  input tốt ở lớp này.
- **Sai Content-Type:** FastAPI **không kiểm tra** header `Content-Type` một cách
  nghiêm ngặt — server vẫn cố parse body như JSON bất kể header khai gì; 9/25 ca có body
  hợp lệ vẫn được xử lý thành công dù header sai (`text/plain`, thiếu hẳn header, v.v.).
  Không phải lỗi bảo mật nghiêm trọng nhưng là hành vi "ngầm định" nên được document.
- **Thiếu Header/Auth:** **23/25 (92%) vẫn trả 200 OK** — xác nhận trực tiếp **W5**:
  request không có `Authorization`, không có `Cookie`, thậm chí với `Origin` giả mạo
  (`https://evil.example.com`) hay `Host` giả mạo đều được xử lý bình thường, vì hệ
  thống **không hề có cơ chế xác thực**.

### 3.7 Danh sách 15 kịch bản Fail nặng nhất (False Negative — độc hại lọt lưới với confidence cao nhất)

| ID | Kỹ thuật | Nội dung (rút gọn) | Confidence (an toàn) |
|---|---|---|---|
| POS-0393 | dot_separated | `đ.ồ. .r.á.c. .r.ư.ở.i. .c.ủ.a. .x.ã. .h.ộ.i` | 0,6196 |
| POS-0225 | underscore_separated | `con_quỷ_cái` | 0,6175 |
| POS-0298 | homoglyph | `đéо аi thèm сhơi với mày` | 0,6154 |
| POS-0216 | no_diacritics | `thang oc lon` | 0,6138 |
| POS-0196 | no_diacritics | `cut me may di` | 0,6122 |
| POS-0300 | mixed_case_punct | `!!ĐéO Ai tHèM ChƠi vỚi mÀy!!` | 0,6108 |
| POS-0189 | teencode | `clgt z trời` | 0,6056 |
| POS-0046 | no_diacritics | `do rac ruoi vo dung` | 0,6041 |
| POS-0145 | underscore_separated | `đồ_phản_bội_bẩn_thỉu` | 0,6040 |
| POS-0143 | dot_separated | `đ.ồ. .p.h.ả.n. .b.ộ.i. .b.ẩ.n. .t.h.ỉ.u` | 0,6040 |
| POS-0373 | dot_separated | `đ.ị.t. .c.o.n. .m.ẹ. .m.à.y. .l.u.ô.n` | 0,6031 |
| POS-0306 | no_diacritics | `may ngu vai lon` | 0,6021 |
| POS-0061 / 0062 / 0069 | raw / leetspeak / teencode | `đồ vô học` | 0,6021 |

*(Bảng đầy đủ 15 ca + toàn bộ 1.000 dòng dữ liệu thô nằm trong
`tests/results/blackbox_raw.csv` và `tests/results/blackbox_summary.json`.)*

Không có ca False Positive nào lọt vào top-fail (danh sách rỗng) — nhất quán với Precision
= 1,0 ở mục 3.1/3.3.

---

## Phần 4: Khuyến nghị & Hướng cải tiến cho Module AI

Xếp theo độ ưu tiên (dựa trên mức độ nghiêm trọng ở Phần 2 và tác động đo được ở Phần 3):

1. **[Ưu tiên 1 — High] Thêm pipeline tiền xử lý trước tokenize** (khắc phục W1, kéo
   theo cải thiện trực tiếp 3.2): chuẩn hoá Unicode NFC, loại zero-width/control
   characters, gộp ký tự phân tách chèn giữa chữ cái, chuẩn hoá teencode phổ biến. Đây
   là thay đổi có ROI cao nhất — riêng việc gộp ký tự chèn có thể giảm ngay tỉ lệ né lọc
   của `dot_separated`/`star_separated`/`zero_width_space` từ 90-100% xuống gần mức
   `raw` (30%).
2. **[Ưu tiên 1 — High] Vá lỗ hổng fail-open im lặng** (W2+W3): thêm trường
   `model_loaded` vào `/health`, cấu hình alert khi model không load được, để đội vận
   hành không nhầm tưởng hệ thống đang hoạt động bình thường trong khi bộ lọc đã tắt.
3. **[Ưu tiên 2 — High] Giới hạn kích thước input + xác thực nhẹ CORS** (W4+W5): thêm
   `max_length` ở Pydantic, thêm shared-secret header giữa extension và backend (cả hai
   đều do cùng một bên phát triển, hoàn toàn khả thi để thêm), thu hẹp
   `allow_origins` nếu có thể xác định chính xác origin cần thiết.
4. **[Ưu tiên 2 — Medium] Đồng bộ ngưỡng quyết định** (W6): loại bỏ tình trạng hai
   ngưỡng (`0.4` backend, `0.6` frontend) sống độc lập ở hai codebase — hiện đang âm
   thầm làm giảm recall thực tế mà người dùng nhìn thấy so với recall đo được qua API.
5. **[Ưu tiên 2 — Medium] Offload inference khỏi event loop** (W7): dùng
   `run_in_threadpool` hoặc tách service suy luận riêng, tránh một request nặng làm
   nghẽn toàn bộ server (bao gồm cả `/health`, `/stats`).
6. **[Ưu tiên 3 — Medium] Đánh giá lại việc huấn luyện/augmentation dữ liệu**: dữ liệu
   huấn luyện nên được mở rộng với các biến thể né lọc (không dấu, chèn ký tự, teencode)
   tương tự bộ test này, thay vì chỉ dựa vào tiền xử lý để "dịch ngược" input về dạng
   sạch — tiền xử lý xử lý được nhiều trường hợp nhưng không phải tất cả (ví dụ
   `homoglyph` vẫn né lọc 42,5% dù có thể bị bắt bởi bảng ánh xạ homoglyph riêng).
7. **[Ưu tiên 3 — Low] Logging có cấu trúc** thay `print()` (W8), **đồng bộ
   `model.json`** với model thực tế (W9), và bổ sung **cache phía backend** cho các
   text trùng lặp giữa nhiều người dùng (W11) để giảm tải khi mở rộng quy mô.
8. **[Ưu tiên 3 — Low] Kiểm tra toàn vẹn artifact** trước `joblib.load` (W13) — thêm
   bước xác minh checksum SHA-256 của `offensive_classifier.pkl` được commit kèm trong
   repo, phát hiện sớm nếu file bị thay đổi ngoài ý muốn.

### Việc cần làm tiếp theo để duy trì chất lượng kiểm thử

- Chạy lại `pytest tests/unit/ -v` sau mỗi thay đổi ở `predictor.py`/`server.py`; đặc
  biệt theo dõi khi các test `xfail` trong `TestObfuscationResistance` chuyển thành
  `XPASS` — đó là tín hiệu để gỡ marker `xfail` và coi đây là bug thật sự nếu tái diễn.
- Chạy lại `python3 tests/blackbox_runner.py --base-url http://127.0.0.1:8000` sau khi
  vá W1/W6 để đo lại Recall thực tế — mục tiêu đề xuất: Recall ≥ 0,80 trên bộ 400 ca
  Positive hiện tại mà không làm giảm Precision dưới 0,95.
