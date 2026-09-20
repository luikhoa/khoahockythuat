> **Phiên bản đã điều chỉnh để tuân thủ Phụ lục 1.** Theo bảng quy định thật trong `docx/6756phuluc1-hd-su-dung-ai_127202612.docx`: *"Dùng AI viết bản thảo đầu tiên của... poster"* và *"Dùng AI đưa ra kết luận hoặc các bước phát triển tương lai"* đều là **"Không bao giờ được chấp nhận — đây phải là công việc độc lập của học sinh."**
>
> File này vì vậy **không còn chứa văn bản diễn giải, nhận xét, kết luận hay hướng phát triển do AI viết**. Chỉ giữ lại hai loại nội dung không thuộc diện cấm:
> 1. Khung cấu trúc 4 khối theo đúng `phuluc3-poster-online` (tiêu đề khối, không đổi).
> 2. Ở Khối 3: **bảng số liệu thô thực nghiệm** trích nguyên văn từ log/JSON/CSV — đây là dữ kiện (data), không phải văn bản do AI soạn diễn giải.
>
> Ở Khối 1, 2, 4, các đoạn văn đã bị lọc bỏ và thay bằng nhãn `[HỌC SINH TỰ VIẾT BẰNG LỜI VĂN CÁ NHÂN]`. Ở Khối 2, có kèm một danh sách **dữ kiện kỹ thuật trần trụi** (tên mô hình, tên dataset, sơ đồ kiến trúc mã nguồn thật) — đây là thông tin khách quan có thể tra trong repo, không phải câu văn phân tích, để học sinh không phải tự dò lại nhưng vẫn là người viết câu văn cuối cùng.

---

## KHỐI TIÊU ĐỀ

**TÊN DỰ ÁN:** CyberShield for Teens — Tiện ích trình duyệt phát hiện & làm mờ bình luận độc hại tiếng Việt bằng AI

**MÃ SỐ DỰ ÁN:** `[CẦN ĐIỀN]`

**Thành viên thực hiện / Trường / Phường (Xã):** `[CẦN ĐIỀN]`

---

## KHỐI 1 — CÂU HỎI NGHIÊN CỨU – MỤC ĐÍCH NGHIÊN CỨU

`[HỌC SINH TỰ VIẾT BẰNG LỜI VĂN CÁ NHÂN]`

---

## KHỐI 2 — PHƯƠNG PHÁP NGHIÊN CỨU

`[HỌC SINH TỰ VIẾT BẰNG LỜI VĂN CÁ NHÂN]`

**Dữ kiện kỹ thuật tham khảo** *(tên gọi/sơ đồ khách quan lấy từ mã nguồn thật trong repo — không phải câu văn phân tích, học sinh tự diễn đạt thành bài viết của mình)*:

- Mô hình: PhoBERT‑base‑v2 (VinAI), backbone đóng băng + Adapter MLP head (`Linear → GELU → Dropout → Linear`)
- Dataset huấn luyện: ViHSD (UIT‑ĐHQG‑HCM, arXiv:2103.11528)
- Bộ dữ liệu đánh giá tự tạo: `predict_semantic.csv`
- Công cụ kiểm thử: `pytest` (unit test), `tests/blackbox_runner.py` (kiểm thử qua HTTP thật)

```
Chrome/Edge Extension (TypeScript)              FastAPI Backend
──────────────────────────────────              ─────────────────────────────
content.ts quét DOM (TreeWalker)                 POST /predict → predictor.py
  → gom "lá văn bản" (≤1200 ký tự)                    → tokenizer PhoBERT
  → POST /predict mỗi khối mới                        → FrozenBackboneClassifier
  → confidence ≥ 0.60 → làm mờ + badge                → trả {label, confidence, proba}
MutationObserver (debounce 250ms)                SQLite lưu thống kê (/events, /stats)
  → chỉ quét phần nội dung mới tải thêm
```

---

## KHỐI 3 — DỮ LIỆU VÀ PHÂN TÍCH DỮ LIỆU

**3.1 Kết quả huấn luyện mô hình (tập test giữ lại, 6.680 mẫu)**

| Chỉ số | Giá trị |
|---|---|
| Accuracy | **87,19%** |
| F1‑macro | **0,7312** |
| Best validation F1‑macro | 0,7414 |
| Eval loss | 0,6298 |
| Train loss | 0,6588 |
| Precision / Recall / F1 — lớp An toàn | 0,89 / 0,96 / 0,93 |
| Precision / Recall / F1 — lớp Độc hại | 0,69 / 0,44 / 0,54 |

**Confusion matrix (test):** TN 5.328 · FP 220 · FN 636 · TP 496

**3.2 Kiểm thử hệ thống thật — Black‑box (1.000 request, 800 ca có nhãn)**

| Chỉ số | Giá trị |
|---|---|
| Accuracy | 67,5% |
| Precision (lớp độc hại) | 1,000 |
| Recall (lớp độc hại) | 0,350 |
| F1‑score | 0,5185 |
| Latency trung bình / P95 | 14,99 ms / 17,89 ms |
| Lỗi 5xx / 1.000 request | 0 |

**Tỉ lệ né lọc (bypass) theo kỹ thuật — cao nhất:**

| Kỹ thuật | % né lọc |
|---|---|
| Chèn `*` giữa từng chữ | 100,0% |
| Zero‑width space | 100,0% |
| Chèn `.` giữa từng chữ | 90,0% |
| Không obfuscate (raw, đối chứng) | 30,0% |

**3.3 Kiểm thử đơn vị (White‑box):** 31 test — **27 passed, 3 xfailed, 1 xpassed**

**3.4 Bộ dữ liệu đánh giá tự tạo** (`predict_semantic.csv`, 100 câu): safe 25 · insult 25 · threat 20 · context 15 · evasion 15 — mức độ L0 25 · L1 15 · L2 35 · L3 25

---

## KHỐI 4 — GIẢI THÍCH – KẾT LUẬN – TÍNH MỚI CỦA ĐỀ TÀI

`[HỌC SINH TỰ VIẾT BẰNG LỜI VĂN CÁ NHÂN]`

*(Không có gợi ý/dữ kiện AI soạn sẵn ở khối này — theo đúng Phụ lục 1, kết luận và hướng phát triển tương lai bắt buộc phải do học sinh tự đưa ra hoàn toàn. Có thể dùng số liệu ở Khối 3 làm căn cứ khi viết.)*
