# Quy trình model cục bộ: train → export → parity → build → E2E offline

**Cập nhật:** 20/09/2026. Tài liệu này mô tả cách CyberShield đóng gói mô hình PhoBERT thành một artifact ONNX chạy trong extension (không cần FastAPI/Internet lúc dùng), và cách thay một checkpoint train lại mà không phải sửa code extension.

## 1. Tổng quan pipeline

```text
checkpoint PyTorch (backend/offensive_classifier.pkl + vinai/phobert-base-v2)
  -> backend/export_onnx.py     (export + validate_artifact)
  -> extension/model/           (model.onnx, tokenizer*, config.json, metadata.json)
  -> backend/verify_onnx.py     (parity gate Python vs ONNX)
  -> tests/results/onnx_parity_summary.json
  -> npm run build              (validate checksum lại, copy vào extension/dist/model)
  -> npm run test:e2e           (nạp extension thật, không chạy FastAPI, xác nhận offline)
```

Python **không** tham gia runtime sản phẩm. Nó chỉ phục vụ huấn luyện, export và kiểm chứng artifact. `extension/model/` bị `.gitignore` vì đây là artifact nhị phân sinh ra (~260 MB), không phải source.

## 2. Export artifact từ checkpoint hiện tại

Từ repository root, với `.venv` đã cài `backend/requirements.txt`:

```bash
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 \
  .venv/bin/python -m backend.export_onnx \
  --artifact backend/offensive_classifier.pkl \
  --output extension/model \
  --offline \
  --model-version phobert-offensive-1
```

- `--artifact`: checkpoint đầu vào (mặc định `backend/offensive_classifier.pkl`), chứa head `Linear(768,256) -> GELU -> Linear(256,2)` đã train trên backbone `vinai/phobert-base-v2`.
- `--offline`: bắt buộc dùng snapshot đã cache trong `~/.cache/huggingface`, không gọi Hugging Face Hub. Bỏ cờ này nếu máy cần tải backbone lần đầu (khi đó bỏ luôn hai biến môi trường `HF_HUB_OFFLINE`/`TRANSFORMERS_OFFLINE`).
- `--model-version`: chuỗi tuỳ ý, ghi vào `metadata.json` và hiển thị trong popup (`PhoBERT · <model-version>`). Đổi giá trị này mỗi khi thay checkpoint để phân biệt bản build.
- `--output`: mặc định `extension/model`; script tự xoá/ghi đè thư mục này.

Script export FP32 trung gian, tối ưu graph transformer, chuyển sang FP16, sinh `metadata.json` (schema version, checksum SHA-256 từng file, hai nhãn, `maxLength: 128`, `toxicThreshold: 0.4`) rồi tự gọi `validate_artifact()` trước khi thoát. Artifact FP32 trung gian bị xoá sau khi FP16 hợp lệ.

Kiểm tra kích thước sau khi export:

```bash
du -sh extension/model
```

Ngân sách là **dưới 300 MB** cho riêng phần model FP16 (không tính WASM runtime của ONNX Runtime Web hay nguồn TypeScript). Bản build ngày 20/09/2026 cho `phobert-offensive-1`: **262 MB**. Bản `phobert-offensive-1.1` (21/09/2026, cùng trọng số PhoBERT, chỉ đổi `toxicThreshold`/`textNormalizeVersion` trong metadata — xem mục 3): **262 MB** (269.427.260 byte), không đổi vì kiến trúc/trọng số model không đổi.

## 3. Parity gate — bắt buộc trước khi build phát hành

```bash
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 \
  .venv/bin/python -m backend.verify_onnx \
  --model extension/model \
  --output tests/results/onnx_parity_summary.json
```

**Ghi chú môi trường (macOS):** torch và onnxruntime trong cùng một tiến
trình đều bundle riêng một bản OpenMP runtime — tiến trình có thể `SIGABRT`
lúc dọn dẹp interpreter (`libc++abi: ... recursive_mutex lock failed`,
không ổn định, tái hiện dù đã set `KMP_DUPLICATE_LIB_OK=TRUE`) NGAY SAU KHI
kết quả đã in/ghi file xong. `verify_onnx.py` đã tự gọi `os._exit()` ngay
sau `main()` để thoát tiến trình trước khi native teardown chạy — không cần
làm gì thêm, exit code phản ánh đúng kết quả gate (đã xác nhận 3/3 lần chạy
liên tiếp cho exit code đúng).

So sánh 1.000 câu trong `tests/results/blackbox_raw.csv` giữa `predictor.predict` (Python/PyTorch, oracle) và ONNX Runtime CPU chạy trên đúng artifact vừa export. CLI thoát khác 0 nếu label agreement dưới 99% hoặc F1 giảm quá 0.01 so với Python — đừng hạ ngưỡng phân loại để "qua" gate này; nếu gate fail, chỉnh lại pipeline export.

Kết quả đo được cho `phobert-offensive-1` (20/09/2026, ngưỡng cũ 0.4, chưa có text normalize):

```json
{
  "count": 1000,
  "labelAgreement": 1.0,
  "blurAgreement": 1.0,
  "p1ErrorMean": 0.0002069,
  "p1ErrorP95": 0.0006155,
  "p1ErrorMax": 0.0021734,
  "f1Python": 0.6526,
  "f1Onnx": 0.6526,
  "thresholdCrossings": []
}
```

**Đọc kết quả này thế nào:** `labelAgreement`/`blurAgreement` = 1.0 và `f1Python == f1Onnx` chứng minh việc *đổi runtime* (Python → ONNX chạy trong trình duyệt) không làm thay đổi hành vi phân loại — đây là **parity của quá trình di trú**, không phải điểm chất lượng mô hình. `f1 ≈ 0.65` là điểm của chính checkpoint `phobert-offensive-1` trên bộ black-box 1.000 câu, phản ánh mô hình hiện tại còn bỏ sót nhiều nội dung độc hại (xem `tests/results/blackbox_summary.json` và `AI_TESTING_REPORT_VI.md`).

Kết quả đo được cho `phobert-offensive-1.1` (21/09/2026, **cùng trọng số PhoBERT y hệt** `phobert-offensive-1` — không retrain — chỉ thêm `text_normalize.py` trước tokenize và đổi ngưỡng 0.4 → 0.25, xem `backend/text_normalize.py` và `backend/threshold.py`):

```json
{
  "count": 1000,
  "labelAgreement": 1.0,
  "blurAgreement": 1.0,
  "p1ErrorMean": 0.0002343,
  "p1ErrorP95": 0.0006905,
  "p1ErrorMax": 0.0021734,
  "f1Python": 0.8775,
  "f1Onnx": 0.8775,
  "thresholdCrossings": []
}
```

`f1` tăng từ 0.6526 lên **0.8775** chỉ nhờ tiền xử lý + hiệu chỉnh ngưỡng — không đổi một trọng số nào của model. Đây vẫn là *parity của quá trình di trú* (Python và ONNX cho cùng kết quả), phần cải thiện chất lượng thực chất đến từ mục 0 (0.65 → 0.6526 trước đó phản ánh model gốc; retrain thật với backbone unfreeze — xem `phobert_experiment_complete/`, chưa chạy — mới là bước tiếp theo để cải thiện thêm, đặc biệt trên phân phối dữ liệu tự nhiên hơn ngoài bộ blackbox 1.000 câu này).

## 4. Build extension với artifact đã kiểm chứng

```bash
cd extension
npm run build
```

`build.js` chạy lại `validate_artifact`-tương đương bằng JavaScript (kiểm tra đủ 4 file bắt buộc và checksum SHA-256 khớp `metadata.json`) trước khi copy `extension/model/` vào `extension/dist/model/`; build dừng với lỗi rõ ràng nếu thiếu file hoặc checksum sai. Nó cũng copy toàn bộ biến thể WASM của `onnxruntime-web` (`ort-wasm-simd-threaded*`) vào `dist/wasm/` — runtime tự chọn biến thể phù hợp (threaded/asyncify/jspi/jsep) lúc chạy tuỳ trình duyệt, nên phải copy đủ bộ, không chỉ một file.

Build phát triển không cần model thật: `CS_SKIP_MODEL=1 npm run build` bỏ qua bước validate/copy model (dùng khi chỉ cần kiểm tra typecheck/bundle, không nạp thử extension).

## 5. Xác minh offline end-to-end

```bash
npx playwright install chromium   # một lần
npm run test:e2e
```

`extension/tests/e2e/extension.smoke.test.ts` nạp extension thật vào Chromium, chặn (abort) mọi request ngoài fixture tĩnh cục bộ và `chrome-extension://`, rồi xác nhận: model đạt `ready-webgpu`/`ready-wasm` hoàn toàn từ asset đóng gói, nội dung độc hại/an toàn được phân loại đúng, draft input không bị gửi, nhiều tab cộng dồn thống kê đúng, số liệu sống sót qua việc service worker bị buộc dừng (mô phỏng Chrome thu hồi service worker nhàn rỗi), và xoá thống kê ngày hoạt động đúng. Test fail nếu bất kỳ request nào rò rỉ tới `localhost:8000`, `huggingface.co` hoặc một CDN.

## 6. Thay một checkpoint train lại

Model có thể "bưng sang" mà **không cần sửa code extension** miễn tuân thủ hợp đồng deploy:

1. Đặt checkpoint mới ở vị trí `backend/offensive_classifier.pkl` (hoặc trỏ `--artifact` tới đường dẫn khác).
2. Chạy lại Bước 2 (export) với `--model-version` mới.
3. Chạy lại Bước 3 (parity gate); nếu fail, quay lại pipeline train — không nới ngưỡng.
4. Chạy lại Bước 4 (`npm run build`) rồi Bước 5 (`npm run test:e2e`).
5. Ghi lại parity mới, kích thước artifact và metric F1/khác đã đo trong ghi chú phát hành.

Hợp đồng bắt buộc giữa checkpoint và runtime extension: cùng hai input `input_ids`/`attention_mask` (int64), output một `toxic_logit` float32 duy nhất (sigmoid áp dụng phía JS, không sigmoid sẵn trong graph), tokenizer tương thích PhoBERT, hai nhãn `["an toàn", "độc hại"]`, `maxLength: 128`. Nếu kiến trúc hoặc schema đổi (ví dụ nhiều hơn một logit, tokenizer khác họ), tăng `schemaVersion` trong `backend/model_contract.py`/export script và thêm adapter runtime có kiểm thử migration tương ứng trong `extension/src/inference/`; extension không được âm thầm nhận artifact không tương thích — `validate_artifact`/`build.js` sẽ chặn nếu schema/checksum không khớp.

## 7. Những gì KHÔNG nằm trong quy trình này

- Không huấn luyện lại hoặc tự động cải thiện chất lượng mô hình — đó là một đợt việc riêng.
- Không đổi ngưỡng phân loại (`toxicThreshold: 0.4`) hoặc ngưỡng làm mờ (`confidence >= 0.6`, cấu hình cứng trong `extension/src/content/content.ts`) như một phần của quy trình export.
- Không tải hoặc cập nhật model từ xa sau khi extension đã cài — mọi bản cập nhật model đi qua một bản build/phát hành extension mới.
