"""Ngưỡng quyết định "độc hại" — MỘT nguồn sự thật duy nhất.

Trước đây có HAI ngưỡng sống độc lập (QA-006 / W6 trong AI_TESTING_REPORT_VI.md):
  - backend/predictor.py     : NGƯỠNG_ĐỘC_HẠI = 0.4  (quyết định label)
  - extension/content.ts     : NGƯỠNG = 0.6           (quyết định có blur hay không)
Hệ quả: mọi p1 trong [0.4, 0.6) được API báo "độc hại" nhưng người dùng
KHÔNG BAO GIỜ thấy cảnh báo — recall thực tế thấp hơn số đo được ở API.

Sửa: extension/src/content/content.ts không còn tự áp ngưỡng riêng nữa, chỉ
tin theo `label` mà model (qua extension/src/inference/model-runtime.ts) đã
trả về — model-runtime.ts dùng CHÍNH giá trị TOXIC_THRESHOLD bên dưới (khớp
tay, xem ghi chú đồng bộ ở model-runtime.ts vì TypeScript không import được
file Python này).

## Vì sao 0.30, không phải 0.25 (Giai đoạn 1) hay 0.45/0.5

Giai đoạn 1 chọn 0.25 dựa trên PR-curve dựng lại từ `tests/results/blackbox_raw.csv`
(p1 suy ngược từ predicted_label + confidence đã ghi lúc export CŨ, tức
**trước khi có `text_normalize.py`**) — bảng đó không phản ánh đúng phân phối
p1 của pipeline hiện tại (normalize rồi mới tokenize). Ở đây đo lại trực tiếp
bằng `predictor.predict()` thật (đã có normalize) trên CẢ HAI tập cùng lúc —
ViHSD held-out (`phobert_experiment_complete/data/processed/test.csv`, phân
phối tự nhiên) và blackbox né lọc (800 câu có nhãn, `tests/blackbox_runner.py`):

    ngưỡng   ViHSD P   ViHSD R   ViHSD F1   Blackbox P   Blackbox R   Blackbox F1
     0.20      0.353     0.869     0.503       0.757        0.988       0.857
     0.25      0.425     0.790     0.553       0.823        0.940       0.877   (Giai đoạn 1)
     0.30      0.491     0.701     0.577       0.892        0.885       0.888   <- chọn
     0.35      0.548     0.613     0.579       0.938        0.835       0.884
     0.40      0.610     0.540     0.573       0.976        0.715       0.825
     0.45      0.659     0.460     0.542       0.996        0.652       0.789
     0.50      0.721     0.394     0.509       1.000        0.565       0.722
     0.60      0.796     0.248     0.378       1.000        0.465       0.635

**0.30 áp đảo 0.25 trên CẢ HAI tập cùng lúc** (F1 ViHSD 0.577 > 0.553, F1
blackbox 0.888 > 0.877) — không phải một đánh đổi, mà 0.25 đơn giản là chưa
tối ưu cho pipeline có normalize. Từ 0.35 trở lên, F1 blackbox bắt đầu giảm
trở lại (né lọc lọt qua nhiều hơn) dù ViHSD F1 vẫn nhích thêm chút ít — 0.30
là điểm cân bằng tốt nhất đo được cho cả hai mục tiêu (chống né lọc + chất
lượng trên phân phối tự nhiên).

Lưu ý: precision lớp "độc hại" trên ViHSD ở 0.30 vẫn chỉ 0.491 — nghĩa là
trên văn bản tự nhiên (không cố tình né lọc), gần một nửa nội dung bị gắn
"độc hại" là false positive. Đây là giới hạn của chính checkpoint
`phobert-offensive-1` (head-only, chưa augment obfuscation), không phải điều
chỉnh ngưỡng có thể giải quyết triệt để — xem `phobert_experiment_complete/`
(Giai đoạn 2: unfreeze backbone + augment) để cải thiện gốc rễ thay vì tiếp
tục nâng ngưỡng (nâng thêm sẽ đánh đổi recall, xem 0.40+ ở bảng trên).

Script tái tạo bảng cũ (tiền-normalize): `backend/calibrate_threshold.py`.
Bảng trên đo trực tiếp qua `predictor.predict()`, không có script cố định
kèm theo — chạy lại thủ công khi cần hiệu chỉnh (sweep p1 thô của
`backend/eval_checkpoint.py` trên cả hai tập).

**Bắt buộc hiệu chỉnh lại giá trị này sau mỗi lần retrain** — phân phối p1
sẽ đổi hẳn khi unfreeze backbone (Giai đoạn 2), số 0.30 chỉ đúng cho
checkpoint `phobert-offensive-1` (weights không đổi từ Giai đoạn 1) với
text_normalize đã bật.
"""

TOXIC_THRESHOLD = 0.30
