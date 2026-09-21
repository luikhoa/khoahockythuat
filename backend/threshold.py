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

## Vì sao 0.25, không phải 0.45/0.5

Giá trị rút ra từ phân tích PR-curve trên 800 câu có nhãn của
`tests/results/blackbox_raw.csv` (p1 suy ngược chính xác từ predicted_label
+ confidence đã ghi, không phụ thuộc ngưỡng 0.4 dùng lúc sinh file đó):

    ngưỡng   precision   recall     F1
     0.20       0.742     0.927    0.824
     0.24       0.841     0.823    0.832   <- tối ưu F1
     0.25       0.859     0.790    0.823   <- chọn (số tròn, gần tối ưu)
     0.30       0.910     0.610    0.731
     0.40       1.000     0.350    0.519   (giá trị cũ)
     0.50       1.000     0.225    0.367

**Nâng ngưỡng lên 0.45/0.5 làm F1 TỆ HƠN (0.44/0.37), không phải tốt hơn.**
Lý do: phần lớn true positive của checkpoint hiện tại (`phobert-offensive-1`)
có p1 nằm trong khoảng 0.40–0.62 (xem bảng "15 kịch bản Fail nặng nhất" ở
AI_TESTING_REPORT_VI.md §3.7) — model vốn đã rất "thận trọng" (precision cao,
recall thấp); hạ ngưỡng bắt được nhiều positive hơn hẳn mà gần như không tốn
precision, vì lớp an toàn tách khá rõ (âm tính thật có p1 thấp, xem cột
precision=1.000 giữ nguyên tới tận ngưỡng 0.70 ở bảng trên).

Script tái tạo phân tích này: xem `backend/calibrate_threshold.py`.

**Bắt buộc hiệu chỉnh lại giá trị này sau mỗi lần retrain** — phân phối p1
sẽ đổi hẳn khi unfreeze backbone (Giai đoạn 2), số 0.25 chỉ đúng cho
checkpoint `phobert-offensive-1` hiện tại. Chạy lại
`backend/calibrate_threshold.py` trên `tests/results/blackbox_raw.csv` mới
(sinh từ checkpoint mới) hoặc trên tập validation giữ lại trước khi export.
"""

TOXIC_THRESHOLD = 0.25
