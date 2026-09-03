# CyberShield for Teens

Tiện ích trình duyệt (Chrome/Edge) làm mờ bình luận độc hại và cảnh báo liên kết đáng ngờ.

## 1. Tổng quan
CyberShield phân loại bình luận văn hóa mạng thành ba lớp: **an toàn**, **xúc phạm** và **đe doạ**. Extension bao gồm 2 thành phần chính: bên client (`extension/src/`, viết bằng TypeScript, build ra `extension/dist/`) tải `model.json` và gọi FastAPI bên server để nhận dự đoán, bên server (`backend/server.py`) chạy `Predictor.predict()`.

## 2. Cấu trúc thư mục
```
extension/
│   manifest.json       Trỏ vào dist/ (xem mục 5.2) — Load unpacked chọn thư mục extension/
│   content.css          Lớp phủ/hiển thị badge — viết tay, KHÔNG qua build (xem mục 5)
│   model.json           Trọng số mô hình đã huấn luyện — chỉ dùng để hiện meta (phiên bản, macro-F1) trong popup
│   package.json / tsconfig.json / build.js    Cấu hình TypeScript + esbuild
│   src/
│   │   lib/
│   │   │   types.ts     Prediction, StatsSnapshot, v.v. — hợp đồng kiểu dùng chung
│   │   │   api.ts       Gọi backend: load meta, predict()
│   │   │   linkcheck.ts Kiểm tra liên kết heuristic (không dùng AI)
│   │   content/
│   │   │   content.ts   Quét DOM, gọi api.ts, làm mờ + badge, gửi /events
│   │   popup/
│   │       popup.ts     Đọc GET /stats, rơi về chrome.storage.local khi backend lỗi
│   │       popup.html
│   │       styles.css
│   dist/                Build output (gitignored) — content.js, popup.js/.html/.css — đây là những gì manifest.json thực sự nạp
backend/
│   server.py           HTTP mỏng FastAPI (POST /predict, POST /events, GET /stats, GET /health)
│   predictor.py        Hàm predict(text) + Prediction model (Dev AI sửa)
│   storage.py          Bộ đếm thống kê theo ngày, lưu SQLite (backend/cybershield_stats.db, không track git)
│   __init__.py         Package marker
demo/
|   demo.html           Bảng tin giả lập, tự load extension/dist/content.js để thử không cần cài extension (xem mục 5.3)
|   feed_demo.html      Bảng tin giả lập -> dùng để test khi ĐÃ cài extension thật, chi tiết ở phần lưu ý
```

## 3. Luồng dữ liệu — Extension quét HTML để lấy context
**content.ts** (build ra `dist/content.js`) đi qua 4 bước:

1. **Tìm "lá văn bản"** — `document.createTreeWalker` duyệt DOM, loại bỏ `SCRIPT/STYLE/INPUT/CODE/SVG` và các phần tử con lớn hơn độ dài 1200 ký tự. Điều kiện này bảo đảm mỗi câu bình luận được quét **chỉ một lần**.
2. **Gửi POST /predict** — Mỗi khối hợp lệ gọi `fetch('http://127.0.0.1:8000/predict', {method: 'POST', body: JSON.stringify({content: text})})`.
3. **Quyết định can thiệp** — Khi `kết.label !== 0 && kết.confidence >= 0.60` thì mới gọi `bọcNộiDung(el, kết)`.
4. **MutationObserver** — Theo dõi node mới thêm vào (Facebook/TikTok tải thêm comment). Chờ 250ms (debounce) rồi quét lại **chỉ phần mới**.

## 4. Hợp đồng API (Client cần gì ở AI predict)
Extension (`src/lib/api.ts`) gửi request POST, nhận JSON `Prediction` hợp đồng sau (kiểu tương ứng khai báo ở `src/lib/types.ts`):

| Field     | Kiểu      | Giá trị            | Ý nghĩa                      |
| --------- | --------- | ------------------- | ---------------------------- |
| `label`   | int       | `0 \| 1 \| 2`       | 0 = an toàn, 1 = xúc phạm, 2 = đe doạ |
| `name`    | string    | `LABELS[label]`     | Tên lớp tiếng Việt           |
| `confidence` | float  | `0.0–1.0`, `= max(proba)` | Độ tin cậy                |
| `proba`   | list[float] | Dãy 3 phần tử `[p0,p1,p2]`, tổng ≈ 1 | Xác suất từng lớp        |

### Request (POST /predict)
```http
POST /predict
Content-Type: application/json

{ "content": "mai ra cổng trường tao đánh cho một trận" }
```

### Response
```json
{
  "label": 2,
  "name": "đe doạ",
  "confidence": 0.79,
  "proba": [0.0, 0.4, 0.7]
}
```

**Ví dụ test bằng curl:**
```bash
curl -X POST http://127.0.0.1:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"content": "mai ra cổng trường tao đánh cho một trận"}'
```

**Dev AI chú ý:** Chỉ sửa `backend/predictor.py` — hàm `predict(text)` trả về object hợp đồng trên. **Không cần đụng `backend/server.py`** hay `backend/__init__.py`.

## 4b. API thống kê (dashboard)

Ba route này phục vụ popup, tách biệt hoàn toàn khỏi `/predict` — không có text/nội dung, chỉ số đếm.

**`POST /events`** — tăng một bộ đếm. Gọi theo cùng nhịp debounce mà `content.ts` đã dùng cho `chrome.storage.local` (không gọi mạng theo từng câu quét).
```json
{ "type": "scanned", "count": 5, "ts": "2026-09-03T10:00:00" }
```
`type` ∈ `scanned | toxic | threat | link | revealed`. `count` mặc định `1`. `ts` (ISO 8601, tuỳ chọn) quyết định bộ đếm được cộng vào ngày nào — bỏ qua thì dùng ngày hiện tại của server.

**`GET /stats?range=day|week`** — tổng hợp phía server, trả đúng hình dạng dashboard cần:
```json
{ "scanned": 19, "toxic": 5, "threat": 1, "links": 3, "revealed": 1 }
```
`day` = hôm nay; `week` = 7 ngày gần nhất (tính cả hôm nay).

**`GET /health`** → `{"status": "ok"}` — extension dùng để phát hiện backend chưa chạy và rơi về `chrome.storage.local`.

Lưu trữ: một file SQLite (`backend/cybershield_stats.db`, tự tạo khi chạy lần đầu, không track trong git).

## 5. Cách chạy

### 5.1 Chạy backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt   # hoặc pip install fastapi uvicorn pydantic
uvicorn server:app --reload --port 8000
```

Kiểm tra nhanh:
```bash
curl -X POST http://127.0.0.1:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"content": "mai ra cổng trường tao đánh cho một trận"}'
```

### 5.2 Build extension (TypeScript -> dist/)
`manifest.json` nạp trực tiếp từ `extension/dist/` — phải build trước khi Load unpacked, và build lại mỗi khi sửa file trong `extension/src/`.
```bash
cd extension
npm install
npm run typecheck   # tsc --noEmit — kiểm tra kiểu, strict: true
npm run build       # esbuild -> dist/content.js, dist/popup.js/.html/.css
```
Không có bước build nào cho `content.css` — file này viết tay, nạp thẳng từ `extension/content.css` (xem `plan.md` mục CSS approach).

### 5.3 Nạp extension vào Chrome / Edge
1. Mở `chrome://extensions`.
2. Bật **Developer mode** (góc trên bên phải).
3. Bấm **Load unpacked** → chọn thư mục `extension/` (không phải `extension/dist/` — `manifest.json` nằm ở `extension/`).
4. Extension sẽ kích hoạt trên mọi trang web, kể cả `demo/feed_demo.html` khi mở bằng trình duyệt đã cài extension.

### 5.4 Thử nhanh không cần cài extension
`demo/demo.html` tự nạp `../extension/dist/content.js` bằng thẻ `<script>` (không qua cơ chế content-script của Chrome) — chỉ cần đã `npm run build` (mục 5.2) và backend đang chạy (mục 5.1). Dùng cổng khác 8000 vì backend đã chiếm cổng đó:
```bash
python3 -m http.server 8080   # chạy từ thư mục gốc repo
# mở http://localhost:8080/demo/demo.html
```
(Phải chạy qua http; mở thẳng file bằng `file://` sẽ bị trình duyệt chặn `fetch`.)

## 6. Lưu ý cho Dev AI
- hiện tại api predict đang hardcode nếu context là `helloworld` thì blur, không thì không blur, xem file HCMUT.html kia, nếu thấy blur tức là server đã chạy ổn r, không thì có thể extension chưa request đc tới backend server.