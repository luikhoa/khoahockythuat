# CyberShield for Teens

Tiện ích trình duyệt (Chrome/Edge) làm mờ bình luận độc hại và cảnh báo liên kết đáng ngờ.

## 1. Tổng quan
CyberShield phân loại bình luận văn hóa mạng thành ba lớp: **an toàn**, **xúc phạm** và **đe doạ**. Extension bao gồm 2 thành phần chính: bên client (content.js/classifier.js) tải model.json và gọi FastAPI bên server để nhận dự đoán, bên server (backend/server.py) chạy `Predictor.predict()`.

## 2. Cấu trúc thư mục
```
extension/
│   manifest.json       Màn hình cài đặt Chrome
│   content.js          Quét DOM, gọi API, làm mờ + badge
│   classifier.js       Bản JS của pipeline TF-IDF + Logistic Regression
│   model.json          Trọng số mô hình đã huấn luyện (bỏ)
│   popup.html/.js      Bảng điều khiển lẻc
│   content.css         Lớp phủ/hiển thị badge
│   linkcheck.js        Kiểm tra liên kết heuristic (không dùng AI)
backend/
│   server.py           HTTP mỏng FastAPI (POST /predict)
│   predictor.py        Hàm predict(text) + Prediction model (Dev AI sửa)
│   __init__.py         Package marker
demo/
|   demo.html           Bảng tin giả lập để thử nghiệm
|   feed_demo.html      Bảng tin giả lập để thử nghiệm -> dùng cái này để test server, chi tiết ở phần lưu ý
```

## 3. Luồng dữ liệu — Extension quét HTML để lấy context
**content.js** đi qua 4 bước:

1. **Tìm "lá văn bản"** — `document.createTreeWalker` duyệt DOM, loại bỏ `SCRIPT/STYLE/INPUT/CODE/SVG` và các phần tử con lớn hơn độ dài 1200 ký tự. Điều kiện này bảo đảm mỗi câu bình luận được quét **chỉ một lần**.
2. **Gửi POST /predict** — Mỗi khối hợp lệ gọi `fetch('http://127.0.0.1:8000/predict', {method: 'POST', body: JSON.stringify({content: text})})`.
3. **Quyết định can thiệp** — Khi `kết.label !== 0 && kết.confidence >= 0.60` thì mới gọi `bọcNộiDung(el, kết)`.
4. **MutationObserver** — Theo dõi node mới thêm vào (Facebook/TikTok tải thêm comment). Chờ 250ms (debounce) rồi quét lại **chỉ phần mới**.

## 4. Hợp đồng API (Client cần gì ở AI predict)
Extension (`classifier.js`) gửi request POST, nhận JSON `Prediction` hợp đồng sau:

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

### 5.2 Nạp extension vào Chrome / Edge
1. Mở `chrome://extensions`.
2. Bật **Developer mode** (góc trên bên phải).
3. Bấm **Load unpacked** → chọn thư mục `extension/`.
4. Extension sẽ kích hoạt trên mọi trang web. Mở `demo.html` (có server đang chạy) để thử.

## 6. Lưu ý cho Dev AI
- hiện tại api predict đang hardcode nếu context là `helloworld` thì blur, không thì không blur, xem file HCMUT.html kia, nếu thấy blur tức là server đã chạy ổn r, không thì có thể extension chưa request đc tới backend server.