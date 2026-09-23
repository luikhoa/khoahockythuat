# CyberShield for Teens

Tiện ích Chrome/Edge hỗ trợ làm mờ nội dung tiếng Việt có khả năng gây tổn thương và cảnh báo liên kết đáng ngờ. Người dùng bấm trực tiếp vùng mờ để xem nội dung.

> **Trạng thái ngày 22/09/2026:** AI phân loại (PhoBERT) chạy **hoàn toàn cục bộ trong extension** qua ONNX Runtime Web — không còn FastAPI, không cần Internet lúc dùng. Đây là bản di trú runtime; **chất lượng phân loại của model không đổi** so với trước (F1 ≈ 0.65 trên bộ black-box 1.000 câu, xem `AI_TESTING_REPORT_VI.md`), cải thiện model là việc riêng. Frontend đang ở giai đoạn hoàn thiện MVP và QA; xem [docs/QA_REPORT.md](docs/QA_REPORT.md) để biết phần nào đã kiểm chứng và phần nào còn mở.

## Tính năng và giao diện hiện có

| Thành phần | Đã có | Phần cần hoàn thiện |
| --- | --- | --- |
| Quét nội dung trên trang | Quét ban đầu, nội dung được thêm/sửa, cache theo văn bản, hàng đợi và thử lại khi model chưa sẵn sàng | Văn bản xen thẻ con, nội dung chuyển từ ẩn sang hiện, thay đổi chỉ xóa node |
| Làm mờ và mở lại | Blur trực tiếp phần tử khi `p_toxic >= 0.60`; click/Enter/Space để xem; popup có nút che lại nội dung đã mở trên tab hiện tại | Chưa có tuỳ chọn ngưỡng hoặc ngoại lệ theo website |
| Cảnh báo liên kết | Gạch chân, biểu tượng cảnh báo, tooltip giải thích và hộp xác nhận khi bấm; kiểm tra lại khi đổi `href` | Chưa có bộ kiểm thử riêng đánh giá các quy tắc URL |
| Popup | Thống kê hôm nay, thanh tỷ lệ, bốn bộ đếm, trạng thái model (loading/WebGPU/WASM/lỗi + nút thử lại), nút **Xoá thống kê** | Còn giao diện ba nhãn; chưa có lựa chọn xem tuần |
| AI cục bộ | PhoBERT + đầu phân loại tuỳ biến, export ONNX FP16, chạy trong offscreen document + Web Worker, ưu tiên WebGPU rồi tự rơi về WASM | Chất lượng phân loại (F1 ≈ 0.65) chưa được cải thiện trong đợt này |
| Thống kê | Ghi theo delta tại service worker, bucket theo ngày `Asia/Ho_Chi_Minh`, nhiều tab cộng dồn đúng, sống sót qua việc service worker bị Chrome thu hồi | Chưa đồng bộ giữa các thiết bị; chưa có tài khoản người dùng |

Frontend hiện gồm popup của extension, các lớp can thiệp trên trang và hai trang demo. Chưa có trang cài đặt, công tắc bật/tắt theo website, màn hình lịch sử hoặc bộ chọn thống kê tuần.

Chi tiết tiến độ, lỗi còn mở và bằng chứng kiểm thử: [Báo cáo QA](docs/QA_REPORT.md). Quy trình export/kiểm chứng model và cách thay checkpoint: [docs/LOCAL_MODEL_WORKFLOW.md](docs/LOCAL_MODEL_WORKFLOW.md).

## Kiến trúc

```text
Trang web
  └─ Content script: chọn văn bản, theo dõi DOM, kiểm tra URL
       └─ chrome.runtime message: predict(text, requestId)
            └─ MV3 service worker (đảm bảo offscreen document tồn tại, chuyển tiếp request)
                 └─ Offscreen document (duy nhất/profile, sống lâu hơn service worker)
                      └─ AI Web Worker: tokenizer PhoBERT cục bộ + ONNX Runtime Web
                                        (thử WebGPU trước, tự rơi về WASM)
                                        + model.onnx đóng gói sẵn trong extension

Popup → chrome.runtime message → service worker → chrome.storage.local (thống kê theo ngày)
Popup → chrome.tabs message → content script của tab hiện tại (che lại nội dung đã mở)

Demo độc lập (không có chrome.runtime) → tự tạo Worker suy luận riêng, dùng cùng
  model/WASM tĩnh qua HTTP server, không gọi bất kỳ backend nào
```

Không còn HTTP call nào ở runtime: không FastAPI, không localhost, không Hugging Face Hub, không CDN. Model, tokenizer, ONNX Runtime Web (WASM) và JavaScript đều nằm trong package extension. `backend/` (Python/FastAPI/PyTorch) chỉ còn là **tooling**: huấn luyện, export ONNX và kiểm chứng parity Python↔ONNX trước khi đóng gói — không chạy lúc người dùng dùng extension.

Content script chuẩn hoá khoảng trắng và chọn các phần tử dạng lá có văn bản dài **2–1.200 ký tự**. Nó bỏ qua một số thẻ kỹ thuật, input/textarea, vùng soạn thảo, vùng ẩn và UI có marker `data-cs-ui`. Đây là cách chọn theo cấu trúc DOM, chưa phải cơ chế hiểu đầy đủ nội dung bình luận trên mọi website.

Mỗi tab xử lý hàng đợi tuần tự và cache dự đoán theo văn bản chuẩn hoá, tối đa 4.000 mục mỗi tab (cache không chia sẻ giữa các tab; suy luận thực tế chạy lại ở tab mới). Observer theo dõi `childList`, `characterData` và `href`, quét vùng thay đổi thay vì quét lại toàn bộ trang mỗi lần.

Model tính `p_toxic = sigmoid(toxic_logit)` và gán `label = 1` từ ngưỡng phân loại 0.30. Chính sách giao diện độc lập chỉ làm mờ khi `p_toxic >= 0.60`; `label` và `confidence` không tham gia quyết định hoặc hiển thị blur. Kiểm tra liên kết chạy cục bộ bằng các quy tắc URL, không dùng AI.

## Cấu trúc dự án

```text
backend/                 Tooling huấn luyện/export — KHÔNG chạy lúc dùng extension
  export_onnx.py         CLI export checkpoint PyTorch -> extension/model (ONNX FP16 + metadata)
  verify_onnx.py         Parity gate: so predictor Python với ONNX trên bộ black-box
  model_contract.py      Validate schema/checksum của artifact model
  predictor.py, model.py Oracle Python dùng để export/parity, không phải server sản phẩm
  server.py, storage.py  API FastAPI cũ, giữ tạm làm tài liệu tham chiếu; không khởi động trong flow người dùng
  offensive_classifier.pkl  Checkpoint đầu head hiện tại (PhoBERT backbone tải từ Hugging Face cache)
extension/
  manifest.json          Manifest V3 (permissions: storage, offscreen); dùng để Load unpacked
  content.css            CSS can thiệp, nạp trực tiếp
  build.js               esbuild + validate/copy model ONNX + copy WASM runtime + copy popup/offscreen assets
  model/                 Artifact ONNX đã export (gitignored, sinh bởi export_onnx.py)
  src/
    background.ts        Service worker: định tuyến message, đảm bảo offscreen document, thống kê
    offscreen/            Host lâu sống cho AI Web Worker (offscreen.html/offscreen.ts)
    inference/            protocol.ts, model-runtime.ts, worker.ts — tokenizer + ONNX Runtime Web
    content/              Quét DOM, can thiệp và test
    lib/                  API adapter nội bộ (message-based), kiểu dùng chung, kiểm tra URL, thống kê
    popup/                HTML, CSS và logic hiển thị trạng thái model + thống kê
  tests/e2e/              Smoke test Chromium offline với extension thật (không FastAPI)
  dist/                   Bundle + model + WASM sinh khi build, được gitignore
demo/
  demo.html               Demo độc lập, tự tạo AI worker riêng khi không có chrome.runtime
  feed_demo.html          Bảng tin để thử extension đã cài
docs/
  QA_REPORT.md              Trạng thái QA và công việc còn lại
  TESTCASE_PLAN.md          Danh sách scenario dự kiến, không phải kết quả chạy
  LOCAL_MODEL_WORKFLOW.md   Quy trình train → export → parity → build → E2E offline
tests/
  unit/                     pytest cho export/parity/predictor/server (Python)
  blackbox_runner.py, results/  Bộ 1.000 câu black-box và kết quả đo (latency, F1, parity)
```

## Cài đặt và chạy cục bộ

Cần Python và Node.js/npm tương thích với các dependency của dự án, cùng Chrome hoặc Edge để thử extension. **Không cần chạy backend nào để dùng extension** — Python chỉ cần khi bạn muốn tự export lại model (xem [docs/LOCAL_MODEL_WORKFLOW.md](docs/LOCAL_MODEL_WORKFLOW.md)).

### 1. Model ONNX

Nếu `extension/model/` chưa tồn tại (thư mục này bị gitignore), export nó từ checkpoint hiện có:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 \
  python -m backend.export_onnx --offline --model-version phobert-offensive-1 --output extension/model
```

Bỏ `--offline`/hai biến môi trường ở lần chạy đầu nếu máy chưa có sẵn `vinai/phobert-base-v2` trong cache Hugging Face — script khi đó sẽ tự tải backbone. Artifact FP16 sinh ra khoảng **260 MB**, nằm dưới ngân sách 300 MB. Chi tiết đầy đủ, gồm parity gate bắt buộc trước khi build phát hành: [docs/LOCAL_MODEL_WORKFLOW.md](docs/LOCAL_MODEL_WORKFLOW.md).

### 2. Build và nạp extension

```bash
cd extension
npm ci
npm run verify
```

`verify` chạy kiểm tra kiểu TypeScript, Vitest và build; build sẽ báo lỗi rõ ràng và dừng nếu `extension/model/` thiếu file hoặc checksum không khớp `metadata.json`. Muốn build chỉ để kiểm tra bundle mà chưa có model thật, dùng `CS_SKIP_MODEL=1 npm run build`.

Kết quả build gồm `dist/content.js`, `dist/background.js`, `dist/offscreen.js`, `dist/inference-worker.js`, `dist/popup.js`, `dist/popup.html`, `dist/offscreen.html`, `dist/styles.css`, `dist/model/` (đã validate) và `dist/wasm/` (toàn bộ biến thể WASM của ONNX Runtime Web).

1. Mở `chrome://extensions` hoặc `edge://extensions`.
2. Bật **Developer mode**.
3. Chọn **Load unpacked** → thư mục **extension/**, không chọn `extension/dist/`.
4. Sau mỗi lần sửa source: build lại, **Reload** extension rồi tải lại các tab thử nghiệm.

`extension/content.css` được manifest nạp trực tiếp. Lần đầu mở popup sau khi cài, model cần vài giây đến vài chục giây để nạp (tuỳ máy/CPU) trước khi trạng thái chuyển sang **AI cục bộ sẵn sàng · WebGPU** hoặc **· WASM**.

### 3. Chạy demo

Từ repository root, sau khi đã build:

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

| Địa chỉ | Cách dùng |
| --- | --- |
| `http://127.0.0.1:8080/demo/feed_demo.html` | Cài extension rồi mở trang để thử content script và service worker |
| `http://127.0.0.1:8080/demo/demo.html` | Thử trong trình duyệt/profile không nạp extension; trang tự tạo AI worker riêng dùng cùng `extension/dist/model` và `extension/dist/wasm` qua HTTP tĩnh |

Tránh chạy demo độc lập cùng extension đang bật trên trang đó vì bundle có thể chạy hai lần. Dùng HTTP thay cho `file://` vì Web Worker/`fetch` model cần một origin hợp lệ.

## Hợp đồng nội bộ (không còn HTTP)

Không có `BACKEND_URL`, không có `/predict`/`/events`/`/stats`/`/health` qua HTTP. Content script, popup và demo độc lập gọi một tập message nội bộ có discriminated union (`extension/src/lib/types.ts`):

| Message | Payload → Kết quả | Ai gọi |
| --- | --- | --- |
| `predict` | `{ content }` → `Prediction` | Content script |
| `model-status` | *(không payload)* → `{ state, provider?, error? }` | Popup, content script khi phục hồi lỗi |
| `retry-model` | *(không payload)* → `ModelStatus` | Popup (nút "Thử nạp lại mô hình") |
| `event` | `{ event: { type, count, ts? } }` → `{ ok: true }` | Content script (delta thống kê) |
| `stats` | `{ range: "day" \| "week" }` → `StatsSnapshot` | Popup |
| `clear-stats` | `{ range: "day" \| "all" }` → `{ ok: true }` | Popup (nút "Xoá thống kê") |

`ModelStatus.state` nhận `loading | ready-webgpu | ready-wasm | error`. Lỗi inference dùng các kind `model-loading | model-load | inference | busy | invalid-response`, mỗi lỗi khai báo `retryable` rõ ràng.

### Dự đoán

Schema phân loại **nhị phân**, không có `label: 2`:

```ts
interface Prediction {
  label: 0 | 1;                 // 0: an toàn, 1: độc hại
  name: string;
  confidence: number;           // 0..1
  proba: [number, number];      // [p_an_toan, p_doc_hai]
}
```

`p1 = sigmoid(toxic_logit)`, `label = 1` khi `p1 >= 0.30`, `confidence = proba[label]`. Content script đọc trực tiếp `p1 = proba[1]` và chỉ làm mờ khi `p1 >= 0.60`; `confidence` được giữ trong contract tương thích nhưng không dùng cho UI. Input rỗng hoặc dài hơn 1.200 ký tự bị từ chối trước khi tới model; tokenizer truncate ở 128 token. Scanner kiểm tra label, miền giá trị confidence và hai xác suất trước khi sử dụng.

### Sự kiện và thống kê

`type` nhận `scanned | toxic | threat | link | revealed`. `count` mặc định là 1, giới hạn 1–10.000. Ví dụ response `stats`:

```json
{ "scanned": 19, "toxic": 5, "threat": 0, "links": 3, "revealed": 1 }
```

- `scanned`: số lần xử lý thành công một phiên bản văn bản của phần tử, không phải số request AI duy nhất.
- `toxic`: số lần áp dụng blur đạt ngưỡng; nội dung độc hại dưới ngưỡng không làm tăng bộ đếm này.
- `links`: số lần phát hiện URL đáng ngờ/nguy hiểm; `revealed`: số lần người dùng chọn mở lại.
- `threat`: field còn từ schema cũ; scanner nhị phân hiện không tăng bộ đếm này.
- `day` là hôm nay theo giờ Việt Nam (`Asia/Ho_Chi_Minh`); `week` là hôm nay và sáu ngày trước đó.

Service worker sở hữu duy nhất việc ghi `chrome.storage.local` theo khoá `cs_stats_YYYY-MM-DD`; mỗi tab chỉ gửi **delta** (không ghi đè snapshot đầy đủ), nên nhiều tab cộng dồn đúng và không tab nào ghi đè tab khác. Việc gửi event dùng debounce 1,5 giây phía content script. Nút **Che lại nội dung trên trang này** gửi message thẳng tới content script của tab active, dùng prediction được giữ cùng phần tử đã mở (không phụ thuộc cache văn bản có thể bị loại) và không thay đổi thống kê. Nút **Xoá thống kê** gọi `clear-stats("day")`, xoá đúng bucket hôm nay trong `chrome.storage.local` (không còn khái niệm SQLite).

## Kiểm thử

Từ `extension/`:

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Hoặc dùng `npm run verify` thay cho ba lệnh đầu. `test:e2e` nạp extension thật vào Chromium, **không khởi động FastAPI hay bất kỳ backend nào**, chặn mọi request ra ngoài trừ `chrome-extension://` và một fixture tĩnh cục bộ, rồi xác nhận: model đạt trạng thái sẵn sàng hoàn toàn từ asset đóng gói, nội dung độc hại/an toàn được phân loại đúng, draft input không bị gửi đi phân loại, click trực tiếp mở vùng blur, popup chỉ che lại nội dung trên tab active, nhiều tab cộng dồn thống kê đúng, số liệu sống sót qua việc service worker bị Chrome thu hồi và tái khởi động, và xoá thống kê ngày hoạt động đúng. Test dùng bundle trong `dist/`, vì vậy cần build trước — kể cả model thật, không dùng `CS_SKIP_MODEL=1` cho lần chạy E2E.

Test Python (export/parity/predictor/server API), không bắt buộc cho việc dùng extension nhưng cần trước khi phát hành model mới:

```bash
# Từ repository root, với môi trường Python đã kích hoạt
python -m pip install -r backend/requirements.txt
python -m pytest tests/unit -q
```

Ba test trong `tests/unit/test_server_api.py` (`TestPredictEndpoint::test_predict_empty_string_is_accepted`, `test_predict_no_length_limit_enforced`, `TestCORSConfig::test_cors_allows_any_origin`) hiện **fail theo thiết kế**: đây là các test ghi nhận lỗ hổng bảo mật cũ của `backend/server.py` (không giới hạn độ dài, CORS wildcard); các lỗ hổng đó đã được vá nên assertion cũ (mong đợi hành vi không an toàn) không còn đúng. `backend/server.py` không chạy trong flow người dùng nên các test này không chặn phát hành extension; chúng cần được viết lại để phản ánh hành vi đã vá, thuộc việc dọn dẹp `backend/` riêng.

Kết quả kiểm tra ngày **22/09/2026** (checkpoint `phobert-offensive-1`): `npm run verify` đạt (typecheck, 61/61 test Vitest, build); parity gate Python↔ONNX **100% label agreement** trên 1.000 câu, F1 không đổi (≈0.6526); **1/1** smoke test Chromium offline đạt, gồm cả chặn hành động website ở click mở đầu tiên và che lại riêng tab hiện tại. Xem [tests/results/onnx_parity_summary.json](tests/results/onnx_parity_summary.json) và [docs/LOCAL_MODEL_WORKFLOW.md](docs/LOCAL_MODEL_WORKFLOW.md) cho chi tiết đo đạc. Chưa nghiệm thu WebGPU trên GPU thật (smoke test headless cố định dùng WASM để tránh khởi tạo GPU không ổn định), popup trên Chrome/Edge thực tế ngoài Chromium test, hoặc cải thiện chất lượng phân loại.

## Giới hạn và công việc tiếp theo

Model hiện tại có F1 ≈ 0.65 trên bộ black-box 1.000 câu — bỏ sót một phần đáng kể nội dung độc hại; đây là giới hạn của **model**, không phải của việc chuyển sang chạy cục bộ (parity 100% với bản Python trước đó). Cải thiện độ chính xác là một đợt huấn luyện/đánh giá riêng, xem `AI_TESTING_REPORT_VI.md`.

Ưu tiên tiếp theo phía frontend: sửa các khoảng trống quét DOM (văn bản xen thẻ con, nội dung ẩn→hiện, mutation chỉ xoá node — xem `docs/QA_REPORT.md`) và thêm lựa chọn xem thống kê tuần vào popup.

`extension/dist/` sau build hiện khoảng 350 MB tổng cộng (model FP16 ~260 MB + toàn bộ biến thể WASM của ONNX Runtime Web + source map); một bản đóng gói phát hành nên loại source map và chỉ giữ biến thể WASM thực sự cần cho tập trình duyệt mục tiêu — chưa thực hiện trong đợt di trú này.

Các tiện ích debug `window.CyberShield.quét/stats/cache/dừng` không phải công tắc điều khiển dành cho người dùng; việc không thấy TODO/FIXME chính thức không đồng nghĩa với việc dự án đã hoàn tất.

Nội dung văn bản được chọn được phân loại hoàn toàn trên máy người dùng, không rời khỏi thiết bị. Module thống kê chỉ lưu bộ đếm cục bộ (`chrome.storage.local`), không đồng bộ giữa các thiết bị và không có tài khoản người dùng. Chưa có hỗ trợ duyệt Shadow DOM, quét tất cả iframe hoặc tuỳ chọn loại trừ website. Extension chỉ chạy trên những trang mà trình duyệt cho phép content script hoạt động.

Deterministic pre-model safety policy, offline lexicon editing, and benchmark instructions: [Lookup safety layer](docs/LOOKUP_SAFETY.md).
