# Technical Development Timeline — Tài liệu tra cứu kỹ thuật

> **Mục đích & cách dùng tài liệu này**
> Đây là bảng mốc thời gian kỹ thuật được **tái dựng sau khi sự việc đã xảy ra** (post‑hoc), tổng hợp từ lịch sử Git, thời gian sửa file (mtime) và nội dung `plan.md` / `AI_TESTING_REPORT_VI.md` có trong repo. Đây **không phải** Sổ nhật ký nghiên cứu và **không nên chép nguyên văn** vào Phụ lục 2.
> Hãy dùng bảng này để **nhớ lại đúng ngày, đúng số liệu**, rồi tự viết nhật ký bằng lời văn của chính mình — bao gồm cả những điều tài liệu này không thể biết: em đã nghĩ gì, vướng ở đâu, tra cứu tài liệu nào, cảm thấy thế nào khi sửa được lỗi.
> Những chỗ đánh dấu **`[HỌC SINH TỰ ĐIỀN]`** là nơi cần trí nhớ/ghi chép thật của em — tài liệu này cố tình để trống, không suy đoán thay.

## 0. Độ tin cậy của các mốc thời gian

| Nguồn | Độ tin cậy | Ghi chú |
|---|---|---|
| Timestamp commit Git (`git log`) | Cao — đây là log chính thống của quá trình phát triển | Có 2 định danh tác giả xuất hiện trong lịch sử: `luitonkoa <23110024@student.hcmus.edu.vn>` và `Fluoxetines <fluoxetines73@gmail.com>`. Nêu nguyên trạng, không suy đoán ai là ai. |
| Thời gian sửa file (mtime) trên máy hiện tại | Trung bình — chỉ phản ánh lần lưu **nội dung** file gần nhất | Có thể bị thay đổi khi copy/giải nén/checkout, **không dùng làm bằng chứng tuyệt đối**, chỉ dùng để ước lượng thứ tự trong cùng một ngày. |
| Thư mục `phobert_experiment_complete/` | Không nằm trong Git (bị `.gitignore` loại vì nặng ~500 MB) | Mốc thời gian của khâu huấn luyện PhoBERT chỉ có thể lấy từ mtime, không có commit tương ứng. |

---

## 1. Bảng tổng hợp lịch sử commit (9 commit, nguồn: `git log`)

| # | Ngày giờ (GMT+7) | Tác giả | Commit message | Quy mô thay đổi |
|---|---|---|---|---|
| 1 | 2026‑07‑24 16:05 | luitonkoa | "Mô tả thay đổi" | 7 file, +883 dòng |
| 2 | 2026‑08‑18 23:34 | Fluoxetines | change to client-server architecture, TODO for AI dev | 21 file, +730/‑480 |
| 3 | 2026‑08‑19 10:13 | Fluoxetines | compatitive with python 3.8.18 | 2 file, +4/‑4 |
| 4 | 2026‑09‑03 22:13 | luitonkoa | Refactor extension, cleanup privacy copy and add error handling | 6 file, +150/‑30 |
| 5 | 2026‑09‑03 23:03 | luitonkoa | refactor: complete TypeScript migration, backend persistence & structural reorg (Steps 2‑4) | 22 file, +1406/‑501 |
| 6 | 2026‑09‑07 23:41 | luitonkoa | feat(backend): fully integrate PhoBERT classifier into predictor.py with fallback handling | 5 file, +181/‑23 |
| 7 | 2026‑09‑08 00:36 | luitonkoa | Fix binary 2-class Sigmoid & clear NaN display bug | 4 file, +56/‑49 |
| 8 | 2026‑09‑08 01:00 | luitonkoa | Fix binary 2-class Sigmoid & clear NaN display bug (tiếp) | 2 file, +14/‑6 |
| 9 | 2026‑09‑13 10:05 | luitonkoa (**đồng tác giả: Claude Sonnet 5** — có trailer `Co-Authored-By` + link session trong commit) | refactor: switch to 2-class sigmoid model & update UI formatting | 15 file, +2697/‑5 |

> **Bằng chứng AI hỗ trợ lập trình xác thực được trong repo:** duy nhất commit **#9** có trailer chính thức `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` kèm `Claude-Session:` link. Đây là bằng chứng khách quan, kiểm chứng được cho Phụ lục 1 ở commit này. **Các commit #1–#8 không có trailer AI co-author nào trong Git** — nếu thực tế em có dùng AI hỗ trợ ở các commit đó, hãy tự bổ sung từ trí nhớ/log prompt thật của em, tài liệu này không suy đoán thay.

---

## 2. Chi tiết theo từng giai đoạn phát triển

### Giai đoạn A — Bản dựng thử đầu tiên (24/07/2026)

| Mục | Nội dung |
|---|---|
| Mục tiêu kỹ thuật | Dựng bản prototype đầu tiên: extension JS thuần (chưa TypeScript) chạy phân loại cục bộ |
| Công cụ & tài nguyên | JavaScript thuần, `classifier.js` (112 dòng), `content.js` (161 dòng), `linkcheck.js` (104 dòng), `train.py` (159 dòng) ở gốc repo |
| Nội dung kỹ thuật | Tạo `demo.html`, README mô tả kiến trúc ban đầu, đóng gói thử `cybershield.zip` |
| Prompt/lệnh AI đã dùng | `[HỌC SINH TỰ ĐIỀN]` — không có bằng chứng trong Git |
| Lỗi/giới hạn phát sinh | Không có dữ liệu kiểm thử ghi lại ở giai đoạn này |

### Giai đoạn B — Chuyển sang kiến trúc client‑server (18–19/08/2026)

| Mục | Nội dung |
|---|---|
| Mục tiêu kỹ thuật | Tách kiến trúc: extension (client) gọi qua HTTP tới backend riêng, thay vì phân loại cục bộ trong trình duyệt |
| Công cụ & tài nguyên | FastAPI (`backend/server.py`, `backend/predictor.py` mới), tổ chức lại thư mục `extension/` |
| Nội dung kỹ thuật | Xoá `classifier.js`/`train.py` ở gốc, dựng `backend/` 2 file (server + predictor placeholder), thêm `extension/model.json`, `demo/feed_demo.html`; commit #3 vá lỗi tương thích Python 3.8.18 |
| Chỉ số thực nghiệm | Chưa có (giai đoạn dựng khung, chưa có model thật) |
| Lỗi/giới hạn phát sinh | `predictor.py` ở giai đoạn này chỉ là placeholder trả kết quả cứng (theo mô tả trong `plan.md` mục 1) |

### Giai đoạn C — Refactor kiến trúc & TypeScript hoá (03/09/2026, 2 commit trong cùng buổi tối)

| Mục | Nội dung |
|---|---|
| Mục tiêu kỹ thuật | Viết `plan.md` (135 dòng) đánh giá kiến trúc hiện tại và lập kế hoạch refactor 5 bước; sau đó thực hiện Bước 2–4: thêm backend persistence (SQLite), migrate toàn bộ extension sang TypeScript |
| Công cụ & tài nguyên | TypeScript, `esbuild` (`build.js`, `tsconfig.json`), SQLite (`backend/storage.py`, 94 dòng) |
| Nội dung kỹ thuật | Tạo cấu trúc `extension/src/{content,lib,popup}/`; thêm `POST /events`, `GET /stats` vào backend; sửa copy quyền riêng tư lỗi thời trong `popup.html`/`classifier.js` |
| Prompt/lệnh AI đã dùng | `[HỌC SINH TỰ ĐIỀN]` — không có trailer AI co-author trong 2 commit này |
| Chỉ số thực nghiệm | Chưa có |
| Lỗi/giới hạn phát sinh | `plan.md` tự liệt kê 7 vấn đề kiến trúc trước refactor (copy quyền riêng tư sai thực tế, không có persistence backend, không có try/catch quanh network call, URL backend hardcode, không có test nào trong repo, v.v. — xem nguyên văn `plan.md` mục 1 "Problems found") |

### Giai đoạn D — Tích hợp mô hình PhoBERT thật & sửa lỗi nhị phân (07–13/09/2026)

| Mục | Nội dung |
|---|---|
| Mục tiêu kỹ thuật | Thay predictor placeholder bằng mô hình PhoBERT đã huấn luyện thật; sau đó sửa lỗi hiển thị khi chuyển từ 3 lớp sang 2 lớp |
| Công cụ & tài nguyên | PhoBERT‑base‑v2 (`vinai/phobert-base-v2`), PyTorch, `joblib`, `backend/model.py`, `backend/config.py` |
| Nội dung kỹ thuật (commit #6, 07/09 23:41) | Tích hợp `offensive_classifier.pkl` (791.184 byte) vào `predictor.py`, thêm cơ chế fallback khi model lỗi |
| Nội dung kỹ thuật (commit #7–#8, 08/09 00:36 & 01:00) | Bỏ nhãn thứ 3 "đe doạ" (chuyển từ 3 lớp Softmax `[p0,p1,p2]` sang 2 lớp Sigmoid `[p0,p1]`) ở cả `backend/model.py`, `backend/predictor.py` và `extension/src/lib/types.ts`; vá lỗi lệch số làm tròn giữa `confidence` (1 chữ số thập phân) và từng phần tử `proba` (0 chữ số thập phân) trong `demo/demo.html` — nguyên nhân cụ thể của bug: hai giá trị hiển thị cùng một số nhưng làm tròn khác quy tắc, gây lệch kiểu "90,6% ở ngoài nhưng 91% ở trong" (nguyên văn ghi chú trong diff) |
| **Mốc huấn luyện lại mô hình (chỉ có bằng chứng qua mtime, KHÔNG có trong Git vì `phobert_experiment_complete/` bị `.gitignore`)** | `phobert_experiment_complete/`: script huấn luyện (`train.py`, `preprocess.py`, `config.py`, `model.py`) có mtime **12/09 06:51**; dữ liệu đã xử lý (`data/processed/*.csv`) mtime **12/09 06:54**; có một lượt chạy thử "mock_model" mtime 06:54–06:58 trước khi chạy huấn luyện thật; log huấn luyện đầy đủ (`full_training_console.log`) và các artifact model cuối cùng có mtime **12/09 07:35–07:36** |
| Ghi chú phân tích (suy luận từ dữ liệu, không phải sự thật tuyệt đối) | File `backend/offensive_classifier.pkl` do commit #6 (07/09) thêm vào nặng 791.184 byte; file cùng tên trong `phobert_experiment_complete/artifacts/models/` (sinh ra từ đợt huấn luyện 12/09) nặng 791.191 byte — kích thước khác nhau gợi ý đây là **hai lần huấn luyện khác nhau**: một bản đưa vào backend ngày 07/09, một bản huấn luyện lại ngày 12/09 mà sau đó **commit #9 (13/09) đã thay thế** file trong `backend/` bằng bản mới này (diff commit #9 cho thấy `offensive_classifier.pkl` đổi từ 791.184 → 791.191 byte, khớp đúng bản 12/09). Nếu đúng, đây là bằng chứng cho một vòng lặp thật: huấn luyện → tích hợp → phát hiện vấn đề → huấn luyện lại → tích hợp lại — **em nên tự xác nhận lại trình tự này bằng trí nhớ thật trước khi ghi vào nhật ký.** |
| Chỉ số thực nghiệm (đợt huấn luyện 12/09, nguồn `full_training_console.log`) | Test Accuracy **87,19%**; Test F1‑macro **0,7312**; Best validation F1‑macro **0,7414**; 12 epoch |
| Lỗi/giới hạn phát sinh | Bug "NaN/lệch số hiển thị" ở trên; ngưỡng quyết định `NGƯỠNG_ĐỘC_HẠI = 0.4` được ghi chú trong code là "tối ưu recall" — nhưng số liệu thực nghiệm sau này (Giai đoạn E) cho thấy recall thực tế qua API chỉ 0,35 |

### Giai đoạn E — Kiểm thử QA toàn diện & tổng hợp báo cáo (khoảng 09–13/09/2026)

| Mục | Nội dung |
|---|---|
| Mục tiêu kỹ thuật | Kiểm thử white‑box + black‑box hệ thống đang chạy, viết báo cáo kỹ thuật, thêm bộ test tự động |
| Công cụ & tài nguyên | `pytest`, script tự viết `tests/blackbox_runner.py` (660 dòng), bộ dữ liệu đánh giá tự tạo `predict_semantic.csv`/`.xlsx` |
| Mốc mtime | `tests/blackbox_runner.py`, `tests/unit/*.py`, `tests/results/*` có mtime **09/09 21:45–21:52**; `predict_semantic.csv/.xlsx` có mtime **10/09 09:29–09:31**; toàn bộ được **commit chung vào #9 ngày 13/09 10:05** (đồng tác giả Claude Sonnet 5) |
| Nội dung kỹ thuật | Viết 1.000 ca kiểm thử black‑box qua 4 nhóm (Positive/Negative/Edge/Stress), 31 unit test `pytest`; tổng hợp toàn bộ vào `AI_TESTING_REPORT_VI.md` (364 dòng) với 14 phát hiện kỹ thuật xếp mức độ (W1–W14) |
| Prompt/lệnh AI đã dùng | `[HỌC SINH TỰ ĐIỀN]` — commit #9 có bằng chứng Git xác thực là có AI đồng hành (xem Mục 1), nhưng nội dung prompt cụ thể không có trong repo; nếu còn lưu trong lịch sử chat/Claude Code, hãy lấy từ đó, không tự bịa |
| Chỉ số thực nghiệm | Xem đầy đủ ở Mục 3 bên dưới |

---

## 3. Bảng số liệu thực nghiệm gốc (trích nguyên văn, dùng để đối chiếu khi ghi nhật ký)

### 3.1 Huấn luyện mô hình (nguồn: `phobert_experiment_complete/full_training_console.log`)

| Chỉ số | Giá trị |
|---|---|
| Dataset (ViHSD) | ~33.400 dòng → chia train 24.045 / validation 2.672 / test 6.680 |
| Epoch | 12 |
| Best validation F1‑macro | 0,7414 |
| Test Accuracy | 87,19% |
| Test F1‑macro | 0,7312 |
| Confusion matrix (test) | TN 5.328 / FP 220 / FN 636 / TP 496 |
| Precision / Recall / F1 lớp 0 (an toàn) | 0,89 / 0,96 / 0,93 |
| Precision / Recall / F1 lớp 1 (độc hại) | 0,69 / 0,44 / 0,54 |

### 3.2 Kiểm thử Black‑box hệ thống thật (nguồn: `tests/results/blackbox_summary.json`, `AI_TESTING_REPORT_VI.md`)

| Chỉ số | Giá trị |
|---|---|
| Tổng số request | 1.000 (400 Positive / 400 Negative / 100 Edge / 100 Stress) |
| Accuracy (800 ca có nhãn) | 67,5% |
| Precision / Recall / F1 (lớp độc hại) | 1,000 / 0,350 / 0,5185 |
| Latency trung bình / P95 / Max | 14,99 ms / 17,89 ms / 378,70 ms |
| Lỗi 5xx trong 1.000 request | 0 |

**Tỉ lệ né lọc theo kỹ thuật obfuscation (40 ca/kỹ thuật):**

| Kỹ thuật | % bị né lọc |
|---|---|
| Chèn `*` giữa từng chữ | 100,0% |
| Ký tự rộng‑0 (zero‑width space) | 100,0% |
| Chèn `.` giữa từng chữ | 90,0% |
| Đảo hoa/thường + ký tự bọc | 87,5% |
| Bỏ dấu tiếng Việt | 75,0% |
| Leetspeak (số thay chữ) | 62,5% |
| Homoglyph (Cyrillic/Latin) | 42,5% |
| Chèn `_` giữa từ | 32,5% |
| Không obfuscate (raw) | 30,0% |
| Teencode | 30,0% |

### 3.3 Unit test (nguồn: `tests/unit/`)

31 test case — **27 passed, 3 xfailed, 1 xpassed**.

### 3.4 Bộ dữ liệu đánh giá tự tạo (nguồn: `predict_semantic.csv`, 100 dòng)

| Theo nhóm | safe | insult | threat | context | evasion |
|---|---|---|---|---|---|
| Số lượng | 25 | 25 | 20 | 15 | 15 |

| Theo mức độ | L0 | L1 | L2 | L3 |
|---|---|---|---|---|
| Số lượng | 25 | 15 | 35 | 25 |

---

## 4. Danh mục lỗi kỹ thuật & giới hạn đã phát hiện (nguồn: `AI_TESTING_REPORT_VI.md`, mục 2.1)

| Mã | Mức độ | Lỗi/giới hạn |
|---|---|---|
| W1 | High | Không chuẩn hoá văn bản trước khi đưa vào model → dễ bị né lọc |
| W2 | High | Fail‑open: model lỗi thì mọi request đều trả "an toàn" một cách im lặng |
| W3 | High | `/health` không phản ánh đúng trạng thái model |
| W4 | High | Không giới hạn độ dài input → payload 1 MB làm chậm ~27 lần |
| W5 | High | CORS mở toàn bộ, không xác thực |
| W6 | Medium | Ngưỡng quyết định lệch giữa backend (0,4) và frontend (0,6) |
| W7 | Medium | Gọi PyTorch đồng bộ trong route bất đồng bộ → chặn event loop |
| W8 | Medium | Bắt lỗi bằng `except Exception` + `print()`, không có logging có cấu trúc |
| W9 | Medium | `model.json` mô tả kiến trúc cũ (TF‑IDF, 3 nhãn), không khớp PhoBERT nhị phân thực tế |
| W10–W14 | Medium/Low | Blocking I/O ở `storage.py`, không cache backend, kỹ thuật monkeypatch để unpickle, không kiểm tra checksum artifact, không quản lý device tường minh — xem chi tiết nguyên văn trong `AI_TESTING_REPORT_VI.md` |

Ngoài ra, hai commit thực tế đã sửa lỗi cụ thể:
- **Commit #7–#8 (08/09):** lỗi hiển thị lệch số do làm tròn khác quy tắc giữa `confidence` và `proba` khi chuyển từ 3 lớp sang 2 lớp.

---

## 5. Cách dùng tài liệu này khi viết Sổ nhật ký (Phụ lục 2)

1. Chọn mốc ngày phù hợp từ Mục 1/2 làm khung "NGÀY / GIAI ĐOẠN".
2. Lấy đúng số liệu ở Mục 3 khi điền mục "KẾT QUẢ & SỐ LIỆU THÔ" — không đổi số.
3. Với mục "TIẾN TRÌNH THỰC HIỆN" và "PROMPT/LỆNH ĐÃ DÙNG": chỉ viết những gì em **thực sự nhớ đã làm/đã gõ** — nếu không nhớ chính xác câu lệnh, hãy mô tả bằng lời của em thay vì chép một câu lệnh không chắc chắn có thật.
4. Mục "RÚT KINH NGHIỆM & LỖI SAI": có thể dùng Mục 4 làm gợi ý, nhưng hãy viết cảm nhận/khó khăn thật của em khi gặp và sửa từng lỗi — đây là phần tài liệu này không thể thay em viết.
