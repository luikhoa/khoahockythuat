# Thiết kế chuyển CyberShield sang AI chạy hoàn toàn trong extension

## 1. Mục tiêu

CyberShield không còn yêu cầu người dùng cài Python, chạy FastAPI hoặc duy trì một AI server. Extension Chrome/Edge tự phân loại văn bản, lưu thống kê và hoạt động khi máy đã ngắt mạng.

Các quyết định đã chốt:

- Giữ mô hình PhoBERT và custom MLP head hiện tại thay vì quay lại TF-IDF.
- Đóng gói model và tokenizer cùng extension; không tải model ở lần chạy đầu.
- Ưu tiên WebGPU, tự rơi về WebAssembly/CPU khi WebGPU không khả dụng hoặc không chạy được model.
- Giữ hợp đồng kết quả nhị phân hiện tại: `label`, `name`, `confidence`, `proba`.
- Python chỉ còn phục vụ huấn luyện, export và kiểm chứng artifact; không tham gia runtime của sản phẩm.

“Giữ độ chính xác” trong đợt chuyển đổi nghĩa là giữ parity với predictor Python hiện tại. Việc cải thiện chất lượng nhận diện là một đợt huấn luyện và đánh giá riêng. Báo cáo black-box hiện có cho thấy model còn bỏ sót nhiều nội dung độc hại, nên metadata chất lượng phải phản ánh đúng model được đóng gói, không dùng số liệu từ artifact TF-IDF cũ.

## 2. Kiến trúc runtime

Luồng phân loại:

```text
content script
  -> chrome.runtime message: predict(text, requestId)
  -> MV3 service worker
  -> offscreen document
  -> dedicated AI Web Worker
  -> tokenizer cục bộ + ONNX Runtime Web + model ONNX cục bộ
  -> Prediction trả ngược về content script
```

### Thành phần và trách nhiệm

**Content script** tiếp tục thu thập khối văn bản, cache theo fingerprint, làm mờ nội dung và đánh dấu liên kết. Nó không biết ONNX hoặc vòng đời model; nó chỉ gọi một `InferenceClient` bất đồng bộ và xử lý lỗi có thể thử lại.

**Service worker** là cổng message duy nhất của extension. Với request AI, nó bảo đảm offscreen document tồn tại rồi chuyển request sang đó. Với event thống kê, nó cập nhật bộ đếm cục bộ theo ngày. Service worker không giữ model trong biến toàn cục vì Chrome có thể dừng nó khi nhàn rỗi.

**Offscreen document** là host lâu sống cho AI worker. Nó được tạo bằng quyền `offscreen`, reason `WORKERS`, và chỉ dùng `chrome.runtime` để nhận/chuyển message. Mỗi profile chỉ có một offscreen document, qua đó mọi tab dùng chung một phiên model.

**AI Web Worker** sở hữu tokenizer, ONNX session, cache prediction và hàng đợi suy luận. Nó chỉ xử lý một batch tại một thời điểm để giới hạn RAM. Lần khởi tạo đầu thử execution provider WebGPU; nếu tạo session hoặc warm-up thất bại thì hủy session đó và tạo lại bằng WASM. Sau khi đã chọn provider, không đổi provider giữa các request trừ khi worker được khởi tạo lại.

**Popup** đọc trạng thái model và thống kê từ service worker. Nó hiển thị trạng thái `loading`, `ready-webgpu`, `ready-wasm` hoặc `error`, thay cho trạng thái health của backend.

### Vòng đời và tải đồng thời

- Service worker dùng một promise tạo offscreen document để chống tạo trùng khi nhiều tab gửi request cùng lúc.
- Offscreen document tạo đúng một AI worker và giữ map `requestId -> responder`.
- AI worker hợp nhất các request có cùng fingerprint và dùng cache LRU tối đa 4.000 prediction như hiện tại.
- Hàng đợi có giới hạn; khi vượt giới hạn, request mới trả lỗi `busy` để content script thử lại với backoff, tránh tăng RAM không giới hạn.
- Model được warm-up bằng một input ngắn trước khi báo `ready`.
- Nếu worker crash, offscreen document đánh dấu `error`, tạo lại worker một lần khi có request tiếp theo và trả lỗi có cấu trúc nếu lần khởi tạo lại thất bại.

## 3. Artifact model và khả năng thay model sau này

Một script export có thể tái lập sẽ:

1. Nạp `vinai/phobert-base-v2`, custom head trong `offensive_classifier.pkl` và tokenizer đúng phiên bản.
2. Ghép backbone với head thành một graph inference, với input `input_ids` và `attention_mask`, sequence length tối đa 128.
3. Export ONNX FP32 làm artifact trung gian, tối ưu graph transformer rồi chuyển weight sang FP16. Thử nghiệm INT8 bị loại vì không đạt parity tối thiểu 99%.
4. Xuất tokenizer/config/metadata vào cùng thư mục model deploy.
5. Chạy parity Python–ONNX trước khi chấp nhận artifact.

Thư mục deploy có manifest riêng, ví dụ:

```text
extension/model/
  model.onnx
  tokenizer.json
  tokenizer_config.json
  config.json
  metadata.json
```

`metadata.json` chứa ít nhất: schema version, model version, SHA-256 của ONNX và tokenizer, label names, max length, toxic threshold, ngày export và metrics của đúng checkpoint. Build thất bại nếu thiếu file, checksum sai hoặc metadata còn mô tả TF-IDF/ba nhãn.

Model train lại có thể “bưng sang” mà không đổi code extension khi vẫn tuân thủ deployment contract: cùng hai input, output logit độc hại, tokenizer assets tương thích, hai nhãn và max length được khai báo trong metadata. Quy trình cập nhật là thay checkpoint đầu vào, chạy script export/parity, rồi build và phát hành phiên bản extension mới. Nếu kiến trúc hoặc schema model thay đổi, tăng `schemaVersion` và cập nhật adapter runtime có kiểm thử migration; extension không âm thầm nhận artifact không tương thích.

## 4. Hợp đồng nội bộ và dữ liệu

Các HTTP DTO hiện tại được thay bằng message nội bộ có discriminated union:

- `predict`: `{ requestId, content }` -> `Prediction`.
- `model-status`: không payload -> `{ state, provider?, error? }`.
- `event`: `{ event: { type, count, ts? } }` -> `{ ok: true }`.
- `stats`: `{ range: "day" | "week" }` -> `StatsSnapshot`.
- `clear-stats`: `{ range: "day" | "all" }` -> `{ ok: true }`.

Lỗi inference dùng các kind `model-loading`, `model-load`, `inference`, `busy` và `invalid-response`; mỗi lỗi khai báo rõ có thể thử lại hay không. Không còn `network`, `http` hoặc `timeout` gắn với backend.

Thống kê được ghi theo delta tại service worker, bucket theo ngày `Asia/Ho_Chi_Minh`. Mọi tab gửi event, không tự ghi snapshot đầy đủ, nhờ đó tránh lỗi tab ghi đè lẫn nhau. `stats(day|week)` cộng các bucket tương ứng. `clear-stats(day)` xóa đúng bucket hôm nay; `clear-stats(all)` chỉ dành cho luồng UI được thêm sau này.

Prediction giữ ngữ nghĩa hiện tại để tránh đổi hành vi ngoài phạm vi chuyển runtime:

- `p1 = sigmoid(toxic_logit)` và `p0 = 1 - p1`.
- `label = 1` khi `p1 >= 0.4`, ngược lại `0`.
- `confidence = proba[label]`.
- Content script chỉ làm mờ khi `label === 1 && confidence >= 0.6`.
- Input rỗng hoặc dài hơn 1.200 ký tự bị từ chối trước inference; tokenizer tiếp tục truncate ở 128 token.

## 5. Build, manifest và phân phối

- Bundle JavaScript/TypeScript, ONNX Runtime, WASM và worker entrypoint vào `extension/dist/`; không dùng script, WASM hoặc model từ CDN.
- Sao chép thư mục model đã kiểm chứng vào output phát hành.
- Manifest bỏ host permission localhost, thêm quyền `offscreen`, khai báo CSP extension pages có `'wasm-unsafe-eval'`, và đặt `minimum_chrome_version` là 109.
- Không thêm `unlimitedStorage`: model nằm trong package, còn thống kê nhỏ hơn quota `chrome.storage.local` hiện tại.
- Build tạo báo cáo kích thước và thất bại nếu thiếu artifact. Package model FP16 mục tiêu dưới 300 MB; mức này ưu tiên parity theo quyết định sản phẩm thay vì dùng INT8 nhỏ hơn nhưng đổi kết quả.
- Bản demo chạy không cần extension dùng cùng inference worker và assets cục bộ qua HTTP server tĩnh. Nó không gọi localhost:8000.

FastAPI, SQLite và backend tests được giữ tạm thời làm oracle so sánh trong giai đoạn chuyển đổi. Khi parity và E2E local inference đạt, tài liệu sản phẩm ngừng hướng dẫn chạy backend; mã Python phục vụ inference server có thể được chuyển sang vùng tooling hoặc gỡ trong thay đổi dọn dẹp riêng. Không xóa checkpoint/training/export tooling cần cho lần train sau.

## 6. Xử lý lỗi và trải nghiệm người dùng

- Quét link và giao diện cơ bản vẫn hoạt động khi AI đang nạp hoặc lỗi.
- Trong lúc model `loading`, content script giữ hàng đợi có giới hạn và tiếp tục khi nhận trạng thái `ready`.
- Khi lỗi vĩnh viễn, content script ngừng retry dày, ghi cảnh báo một lần và popup hiển thị nguyên nhân ngắn gọn cùng nút thử lại.
- Popup cho biết provider đang dùng để dễ chẩn đoán máy chạy WebGPU hay WASM.
- Không tuyên bố chất lượng hoặc macro-F1 từ model cũ. Metadata chỉ hiển thị metric có nguồn từ checkpoint hiện tại; nếu chưa có metric đã xác minh thì hiển thị phiên bản model thay vì số chất lượng.
- Không có nội dung trang web rời khỏi thiết bị trong luồng inference hoặc thống kê.

## 7. Kiểm thử và tiêu chí nghiệm thu

### Model/export

- Export từ checkpoint hiện tại tạo đủ ONNX, tokenizer và metadata với checksum ổn định.
- So sánh trên 1.000 ca trong bộ black-box hiện có: label agreement Python–ONNX tối thiểu 99%; báo cáo riêng các ca đổi phía nào của ngưỡng 0.4 hoặc 0.6.
- Chênh lệch xác suất tuyệt đối p1 được thống kê max/mean/p95; artifact chỉ được chấp nhận khi không làm giảm F1 quá 1 điểm phần trăm trên các ca có ground truth.
- Các ca Unicode, emoji, chuỗi dài, input rỗng và tokenizer tiếng Việt cho kết quả hợp lệ, không NaN.

### Runtime extension

- Unit test message routing, chỉ tạo một offscreen document, khởi tạo model một lần, request trùng được hợp nhất và lỗi có đúng retryability.
- Unit test thống kê nhiều tab, rollover qua nửa đêm theo múi giờ Việt Nam, tổng day/week và xóa thống kê.
- Test WebGPU thành công, WebGPU khởi tạo lỗi rồi fallback WASM, worker crash/restart và artifact checksum/schema sai.
- E2E nạp extension thật, tắt toàn bộ request mạng, xác nhận nội dung mẫu vẫn được phân loại/làm mờ và không có request tới localhost/Hugging Face/CDN.
- E2E xác nhận popup hiển thị trạng thái provider và số liệu vẫn đúng sau khi đóng/mở popup hoặc service worker restart.
- Demo độc lập chạy qua HTTP server tĩnh mà không có FastAPI.

### Hiệu năng

- Đo cold start, warm inference p50/p95, peak RAM và kích thước package trên WebGPU lẫn WASM.
- Không đặt con số latency cứng trước khi có bản ONNX thực tế. Kết quả benchmark được ghi vào tài liệu phát hành; nếu WASM làm treo trang hoặc hàng đợi tăng liên tục trên máy kiểm thử thấp nhất, bản phát hành phải giảm nhịp quét/batch trước khi nghiệm thu.

## 8. Phạm vi không thực hiện trong đợt chuyển đổi

- Không huấn luyện lại hoặc tuyên bố cải thiện chất lượng mô hình.
- Không thay đổi ngưỡng phân loại/làm mờ đã có.
- Không đồng bộ thống kê giữa thiết bị và không thêm tài khoản người dùng.
- Không tải hoặc cập nhật model từ xa sau khi extension đã cài.
- Không xử lý các finding DOM/layout không liên quan trực tiếp đến việc bỏ backend.
