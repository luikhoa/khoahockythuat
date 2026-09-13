# CyberShield for Teens

Tiện ích Chrome/Edge hỗ trợ làm mờ nội dung tiếng Việt có khả năng gây tổn thương và cảnh báo liên kết đáng ngờ. Người dùng có thể chọn **Vẫn xem** để mở lại nội dung.

> **Trạng thái ngày 13/09/2026:** đã có luồng chức năng chính và kiểm thử tích hợp bằng dữ liệu giả lập; đang ở giai đoạn hoàn thiện MVP và QA. Chưa hoàn tất thống kê, trạng thái giao diện và độ bao phủ DOM. Phần AI sẽ do Dev AI tích hợp sau; kết quả kiểm thử dưới đây không đánh giá chất lượng mô hình.

## Tính năng và giao diện hiện có

| Thành phần | Đã có | Phần cần hoàn thiện |
| --- | --- | --- |
| Quét nội dung trên trang | Quét ban đầu, nội dung được thêm/sửa, cache theo văn bản, hàng đợi và thử lại khi backend lỗi | Văn bản xen thẻ con, nội dung chuyển từ ẩn sang hiện, thay đổi chỉ xóa node |
| Làm mờ và mở lại | Blur, badge hiển thị độ tin cậy, nút **Vẫn xem** | Badge của các phần tử cùng cha có thể chồng lên nhau; chưa phục hồi style của trang |
| Cảnh báo liên kết | Gạch chân, biểu tượng cảnh báo, tooltip giải thích và hộp xác nhận khi bấm; kiểm tra lại khi đổi `href` | Chưa có bộ kiểm thử riêng đánh giá các quy tắc URL |
| Popup | Thống kê hôm nay, thanh tỷ lệ, bốn bộ đếm, thông tin mô hình, nút **Xoá thống kê** | Còn giao diện ba nhãn; nút xoá chỉ xoá bản cục bộ; chưa hiển thị trạng thái mất kết nối |
| Backend | `/predict`, `/events`, `/stats`, `/health`; validation và SQLite | Chưa có reset, xác thực, rate limit, readiness hoặc cơ chế tách xử lý nặng khỏi event loop |
| Kết nối frontend–backend | Service worker trung gian, timeout, retry và thống kê dự phòng | Chưa bảo đảm đồng bộ thống kê nhiều tab, qua nửa đêm hoặc khi đóng tab |

Frontend hiện gồm popup của extension, các lớp can thiệp trên trang và hai trang demo. Chưa có trang cài đặt, công tắc bật/tắt theo website, màn hình lịch sử hoặc bộ chọn thống kê tuần. Dòng “Tấm chắn đang bật” trong popup hiện là chữ cố định, không phản ánh tình trạng backend.

Chi tiết tiến độ, lỗi còn mở và bằng chứng kiểm thử: [Báo cáo QA](docs/QA_REPORT.md).

## Kiến trúc

```text
Trang web
  └─ Content script: chọn văn bản, theo dõi DOM, kiểm tra URL
       └─ API adapter → Chrome runtime message → Background service worker
                                                    └─ FastAPI tại 127.0.0.1:8000
                                                         ├─ /predict → predictor.predict(text)
                                                         ├─ /events  → SQLite
                                                         ├─ /stats   → SQLite
                                                         └─ /health

Popup → API adapter → Background service worker → /stats?range=day
      └─ chrome.storage.local khi lấy thống kê từ backend thất bại

Demo độc lập → API adapter dùng fetch trực tiếp → FastAPI
```

Content script chuẩn hoá khoảng trắng và chọn các phần tử dạng lá có văn bản dài **2–1.200 ký tự**. Nó bỏ qua một số thẻ kỹ thuật, input/textarea, vùng soạn thảo, vùng ẩn và UI có marker `data-cs-ui`. Đây là cách chọn theo cấu trúc DOM, chưa phải cơ chế hiểu đầy đủ nội dung bình luận trên mọi website.

Mỗi tab xử lý hàng đợi tuần tự. Kết quả được cache theo văn bản chuẩn hoá, tối đa 4.000 mục; cùng văn bản trong tab có thể dùng lại dự đoán. Observer theo dõi `childList`, `characterData` và `href`, quét vùng thay đổi thay vì quét lại toàn bộ trang mỗi lần. Chỉ kết quả hợp lệ cho nội dung vẫn còn khớp mới được ghi nhận hoàn tất.

Điều kiện làm mờ hiện tại là `label === 1 && confidence >= 0.60`. Kiểm tra liên kết chạy cục bộ bằng các quy tắc URL, không dùng AI và không cần backend để đưa ra cảnh báo.

## Cấu trúc dự án

```text
backend/
  server.py             HTTP routes và validation
  storage.py            Bộ đếm SQLite theo ngày
  predictor.py          Điểm tích hợp predict(text) và schema Prediction
  model.py, config.py   Thành phần thuộc phần AI
  requirements.txt      Dependency backend
  test_server.py        Test API với predictor giả lập
extension/
  manifest.json         Manifest V3; thư mục này dùng để Load unpacked
  content.css           CSS can thiệp, nạp trực tiếp
  model.json            Artifact cũ; hiện chỉ đọc metadata
  build.js              Bundle bằng esbuild và copy tài nguyên popup
  src/
    background.ts       Service worker gọi backend
    content/            Quét DOM, can thiệp và test
    lib/                API adapter, kiểu dùng chung, kiểm tra URL
    popup/              HTML, CSS và logic thống kê
  tests/e2e/            Smoke test Chromium với extension thật
  dist/                 Bundle sinh khi build, được gitignore
demo/
  demo.html             Demo độc lập và ô gọi thử API
  feed_demo.html        Bảng tin để thử extension đã cài
docs/
  QA_REPORT.md          Trạng thái QA và công việc còn lại
  TESTCASE_PLAN.md      Danh sách scenario dự kiến, không phải kết quả chạy
```

`backend/qa/` đang được phát triển riêng; không được rà soát hoặc tính vào kết quả kiểm thử trong tài liệu này.

## Cài đặt và chạy cục bộ

Cần Python và Node.js/npm tương thích với các dependency của dự án, cùng Chrome hoặc Edge để thử extension. Backend mặc định dùng cổng **8000**, demo dùng cổng **8080**.

### 1. Backend

Từ thư mục gốc repository:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
cd backend
uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

Lệnh kích hoạt môi trường trên dành cho shell POSIX. Trên Windows PowerShell dùng `.venv\Scripts\Activate.ps1`.

Hiện backend dùng import theo thư mục làm việc, nên chạy Uvicorn từ `backend/` như trên. Cách `uvicorn backend.server:app` từ repository root chưa được hỗ trợ đúng.

```bash
curl http://127.0.0.1:8000/health

curl -X POST http://127.0.0.1:8000/predict \
  -H 'Content-Type: application/json' \
  -d '{"content":"Một đoạn văn bản để kiểm tra kết nối"}'
```

`/health` trả `{"status":"ok"}` chỉ xác nhận route HTTP phản hồi, không xác nhận AI sẵn sàng. Các file AI hiện có không được nghiệm thu trong đợt rà soát này; việc cung cấp mô hình và kiểm chứng dự đoán thuộc bước tích hợp AI.

### 2. Build và nạp extension

Mở terminal khác, từ repository root:

```bash
cd extension
npm ci
npm run verify
```

`verify` chạy kiểm tra kiểu TypeScript, Vitest và build. Kết quả gồm `dist/content.js`, `dist/background.js`, `dist/popup.js`, `dist/popup.html`, `dist/styles.css` và source map.

1. Mở `chrome://extensions` hoặc `edge://extensions`.
2. Bật **Developer mode**.
3. Chọn **Load unpacked** → thư mục **extension/**, không chọn `extension/dist/`.
4. Sau mỗi lần sửa source: build lại, **Reload** extension rồi tải lại các tab thử nghiệm.

`extension/content.css` được manifest nạp trực tiếp. CSS popup được copy từ `extension/src/popup/styles.css` vào `dist/` khi build.

### 3. Chạy demo

Từ repository root, sau khi đã build và chạy backend:

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

| Địa chỉ | Cách dùng |
| --- | --- |
| `http://127.0.0.1:8080/demo/feed_demo.html` | Cài extension rồi mở trang để thử content script và service worker |
| `http://127.0.0.1:8080/demo/demo.html` | Thử trong trình duyệt/profile không nạp extension; trang tự nhúng bundle content script |

Demo độc lập còn có ô gọi `/predict` khi nhập ít nhất 8 ký tự và các thay đổi DOM theo thời gian. Ô này có logic gọi API riêng, chưa có timeout, debounce hay xử lý response đến sai thứ tự. Không dùng nó làm bằng chứng rằng toàn bộ transport của extension hoạt động.

Tránh chạy demo độc lập cùng extension đang bật trên trang đó vì bundle có thể chạy hai lần. Dùng HTTP thay cho `file://`. CORS backend hiện cho phép đúng hai origin `http://localhost:8080` và `http://127.0.0.1:8080`.

## Hợp đồng API hiện tại

Base URL trong frontend: `http://127.0.0.1:8000`, đang khai báo cố định trong API adapter và background service worker.

| Endpoint | Dữ liệu | Bên sử dụng |
| --- | --- | --- |
| `POST /predict` | `{"content":"..."}`, độ dài 1–1.200 ký tự | Content script; ô thử API trong demo |
| `POST /events` | Loại sự kiện, số lượng, timestamp tuỳ chọn | Content script thông qua service worker |
| `GET /stats?range=day\|week` | Năm bộ đếm tổng hợp | Popup hiện chỉ gọi `day`; `week` chưa có UI |
| `GET /health` | `{"status":"ok"}` | Content script kiểm tra phục hồi sau lỗi |

### Dự đoán

Schema frontend hiện là phân loại **nhị phân**, không có `label: 2`:

```ts
interface Prediction {
  label: 0 | 1;                 // 0: an toàn, 1: độc hại
  name: string;
  confidence: number;          // 0..1
  proba: [number, number];      // [p_an_toan, p_doc_hai]
}
```

Ví dụ minh hoạ schema, không phải kết quả đánh giá mô hình:

```json
{
  "label": 1,
  "name": "độc hại",
  "confidence": 0.8,
  "proba": [0.2, 0.8]
}
```

Scanner kiểm tra label, miền giá trị confidence và hai xác suất trước khi sử dụng. Nó chưa kiểm tra tổng xác suất hay quan hệ `confidence == max(proba)`; các invariant này cần được chốt và kiểm thử khi bàn giao AI.

Request dự đoán có timeout **15 giây/lần**, thử lại một lần sau **500 ms** đối với lỗi mạng, timeout hoặc HTTP 5xx. Các request health/stats/events có timeout **3 giây**. Khi phân loại thất bại, scanner giữ phần tử trong hàng đợi và dùng health để thử phục hồi với các mốc 1/5/15/30 giây. Metadata tải riêng và không chặn khởi động quét.

### Sự kiện và thống kê

```json
{ "type": "scanned", "count": 5, "ts": "2026-09-13T10:00:00+07:00" }
```

`type` nhận `scanned | toxic | threat | link | revealed`. `count` mặc định là 1, giới hạn 1–10.000. `ts` là chuỗi tuỳ chọn; backend lấy phần ngày của timestamp, hoặc ngày hiện tại của server nếu không có/không phân tích được. Frontend hiện không gửi `ts`.

Ví dụ response thống kê:

```json
{ "scanned": 19, "toxic": 5, "threat": 0, "links": 3, "revealed": 1 }
```

- `scanned`: số lần xử lý thành công một phiên bản văn bản của phần tử, không phải số request AI duy nhất.
- `toxic`: số lần áp dụng blur đạt ngưỡng; nội dung độc hại dưới ngưỡng không làm tăng bộ đếm này.
- `links`: số lần phát hiện URL đáng ngờ/nguy hiểm; `revealed`: số lần người dùng chọn mở lại.
- `threat`: field còn từ schema cũ; scanner nhị phân hiện không tăng bộ đếm này.
- `day` là hôm nay theo server; `week` là hôm nay và sáu ngày trước đó.

SQLite ở `backend/cybershield_stats.db` được khởi tạo khi import storage. Popup ưu tiên số liệu backend; fallback dùng `chrome.storage.local` theo ngày `Asia/Ho_Chi_Minh`. Các tab hiện có thể ghi đè dữ liệu cục bộ của nhau. Việc lưu/gửi dùng debounce 1,5 giây và chưa có hàng đợi lưu bền vững khi tab đóng.

Không có endpoint reset. Nút **Xoá thống kê** hiện chỉ xoá key cục bộ và vẽ lại popup, không xoá SQLite.

## Kiểm thử

Từ `extension/`:

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Hoặc dùng `npm run verify` thay cho ba lệnh đầu. Smoke test tự chạy backend giả lập và trang fixture ở cổng **8000/8080**; hai cổng phải trống. Test dùng bundle trong `dist/`, vì vậy cần build trước.

Test API hiện có, không cần chạy mô hình:

```bash
# Từ repository root, với môi trường Python đã kích hoạt
python -m pip install httpx
cd backend
python -B -m unittest test_server -v
```

`httpx` là dependency của test, chưa nằm trong `backend/requirements.txt`. Test thay predictor bằng stub và mock thao tác tăng bộ đếm; import storage vẫn có thể tạo schema SQLite. Khi cần cô lập hoàn toàn, chuyển kết nối SQLite sang DB tạm như cách đã dùng trong đợt rà soát QA.

Kết quả kiểm tra ngày **13/09/2026**: typecheck/build đạt, **9/9** test Vitest, **4/4** test API với DB tạm, **1/1** smoke test Chromium đạt. Chưa nghiệm thu kết nối toàn tuyến với AI thật, popup trên Chrome/Edge thực tế, tải nhiều tab hoặc độ chính xác phát hiện. Xem [QA_REPORT.md](docs/QA_REPORT.md) để biết phạm vi bằng chứng.

## Giới hạn và công việc tiếp theo

Ưu tiên đồng bộ thống kê nhiều tab/ngày, độ bền sự kiện, hành vi xoá; sửa các khoảng trống quét DOM; hoàn thiện badge và trạng thái kết nối của popup. Backend còn cần kiểm soát caller, tần suất request và xử lý công việc nặng trước khi sử dụng rộng rãi.

`extension/model.json` vẫn là artifact TF-IDF ba nhãn cũ. Popup đang đọc metadata của file này; tên mô hình và macro-F1 ở đó không phải bằng chứng chất lượng AI sẽ tích hợp. Cần đồng bộ metadata, tên nhãn và field `threat` khi chốt hợp đồng cuối.

Các endpoint đều có nơi gọi trong frontend, nhưng nhánh thống kê tuần chưa nối UI. Các tiện ích debug `window.CyberShield.quét/stats/cache/dừng` không phải công tắc điều khiển dành cho người dùng; việc không thấy TODO/FIXME chính thức không đồng nghĩa với việc dự án đã hoàn tất.

Nội dung văn bản được chọn sẽ gửi tới backend cục bộ. Module thống kê chỉ lưu bộ đếm; cơ chế loại vùng soạn thảo/ẩn chưa bao phủ mọi UI tương tác. Chưa có hỗ trợ duyệt Shadow DOM, quét tất cả iframe hoặc tuỳ chọn loại trừ website. Extension chỉ chạy trên những trang mà trình duyệt cho phép content script hoạt động.
