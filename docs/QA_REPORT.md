# CyberShield — Báo cáo tiến độ và QA

**Cập nhật:** 13/09/2026. **Cơ sở:** source trong working tree hiện tại, không chỉ phiên bản đã commit.

## 1. Kết luận về tiến độ

Dự án đang ở giai đoạn **MVP đã có luồng chức năng chính, đang hoàn thiện tích hợp và QA**. Frontend và backend đã có kết nối thực hiện được các chức năng chính; chưa đủ bằng chứng để kết luận hoàn tất sản phẩm hoặc sẵn sàng phát hành.

| Mảng | Đã thực hiện | Còn thiếu để nghiệm thu |
| --- | --- | --- |
| Frontend quét nội dung | Quét ban đầu/DOM động, chuẩn hoá và cache văn bản, hàng đợi, kiểm tra response, blur/reveal | Bao phủ văn bản xen thẻ con, hiện lại vùng ẩn, thay đổi chỉ xóa node; loại hết vùng tương tác không phù hợp |
| Frontend giao diện | Popup, badge blur và nút mở lại, cảnh báo link, hai trang demo | Sửa badge chồng nhau; bỏ metadata/nhãn cũ; trạng thái online/offline; nút xoá đúng nguồn dữ liệu |
| Backend ngoài AI | Bốn endpoint; giới hạn content/count; CORS cho demo; SQLite ngày/tuần | Reset, auth/rate limit, ranh giới xử lý nặng, thống nhất ngày, kiểm thử storage và tải |
| Tích hợp | Runtime message → service worker → HTTP; retry, health recovery; gửi events và đọc stats | Độ bền sự kiện, multi-tab, qua nửa đêm, lỗi riêng của /events; kiểm thử popup và toàn tuyến với backend thật |
| Kiểm thử | Vitest, API unittest với stub, Playwright smoke đã có và chạy đạt | Chưa có CI trong repo, chưa thấy cấu hình ngưỡng coverage; nhiều scenario vẫn chưa chạy |
| AI | Chỉ đối chiếu schema tại điểm tích hợp | Dev AI tích hợp sau; ngoài phạm vi đánh giá tiến độ lần này |

Không gán phần trăm hoàn thành vì chưa có danh sách yêu cầu nghiệm thu đầy đủ. Số test đạt hoặc số lỗi đóng không tương đương phần trăm hoàn thành sản phẩm.

### Phạm vi và cách đọc trạng thái

Đã đọc `AGENTS.md`, báo cáo QA trước, README, source frontend, HTTP/storage backend, cấu hình build/manifest, hai demo, các test hiện có ngoài `backend/qa/` và danh sách scenario trong `docs/TESTCASE_PLAN.md`.

**Không quét `backend/qa/`, không chạy/đánh giá mô hình hoặc chất lượng AI.** Chỉ đọc phần schema/điểm gọi predictor để xác định hợp đồng frontend–backend. Chỉ cập nhật README và báo cáo này; giữ nguyên các thay đổi code có sẵn của người dùng.

- **Đã sửa:** cơ chế gây lỗi ban đầu đã được thay thế; cột bằng chứng ghi rõ có test hay chỉ kiểm tra source.
- **Một phần:** đã xử lý một phần nguyên nhân, vẫn còn việc thuộc finding.
- **Còn mở:** vấn đề vẫn hiện diện trong source hoặc kiểm tra bổ sung.
- **Chờ AI:** giữ lưu vết kết luận cũ, không tái xác nhận hoặc tính vào tiến độ ngoài AI.
- Test dùng stub xác nhận hành vi ứng dụng/hợp đồng, không xác nhận chất lượng mô hình.

## 2. Frontend đã nối tới backend đến đâu?

| API/chức năng | Nơi gọi hiện tại | Kết luận |
| --- | --- | --- |
| `POST /predict` | `content.ts → api.ts → background.ts`; demo độc lập dùng direct fetch | Luồng blur đã chạy trong Chromium với backend giả lập; API FastAPI có test stub riêng |
| `POST /events` | `gửiSựKiện()` sau debounce; background chuyển request | Có nối; gửi tuần tự và chia lô tối đa 10.000, nhưng chưa bảo đảm lưu bền/idempotency |
| `GET /stats?range=day` | Popup qua API adapter và background | Có nối trong source; chưa có test popup/đối soát số đếm toàn tuyến |
| `GET /stats?range=week` | Có trong API adapter, background và storage | Chưa có UI gọi nhánh tuần |
| `GET /health` | Scanner dùng sau lỗi để thử tiếp hàng đợi | Có test phục hồi với mock; không kiểm tra readiness AI và không điều khiển dòng trạng thái popup |
| Xoá thống kê | Popup gọi `chrome.storage.local.remove` | Có UI nhưng backend chưa có endpoint tương ứng |
| Metadata | Tải `model.json`, lưu `cs_meta`, hiển thị popup | Luồng có nối nhưng dữ liệu vẫn thuộc artifact cũ |

Các endpoint hiện có đều có call site phía frontend. Qua đọc source không thấy route nào hoàn toàn bỏ không; nhánh `week` chưa được UI sử dụng. Các thành phần chưa được dùng trong luồng sản phẩm hoặc còn từ thiết kế cũ:

- `threat` vẫn nằm trong event/stats schema và popup, nhưng scanner nhị phân không tăng bộ đếm này; CSS `.cs-threat` không được scanner hiện tại tạo ra.
- `model.json` khoảng 280 KiB: chỉ `meta` được đọc, vocab/coef/intercept không được dùng để suy luận.
- `window.CyberShield.quét/stats/cache/dừng` là tiện ích debug/test; `dừng` không nối vào công tắc bật/tắt cho người dùng và không phải teardown đầy đủ cho mọi request/timer đang chạy.
- Bộ demo có ô nhập gọi API riêng. Các nút thích/bình luận/chia sẻ và ô bình luận trong `feed_demo.html` là giao diện fixture, chưa phải ứng dụng mạng xã hội có xử lý tương tác.

### Giao diện hiện có

1. **Popup:** tiêu đề “Tấm chắn đang bật”, metadata, thanh ba nhóm An toàn/Xúc phạm/Đe doạ, bốn số đếm và nút xoá. Chưa có trạng thái mất kết nối, nguồn dữ liệu đang dùng, lựa chọn tuần hoặc cài đặt.
2. **Can thiệp trên trang:** blur, badge độ tin cậy/hai xác suất và nút **Vẫn xem**. Test đã xác nhận mở lại bằng phím Enter trong Chromium; chưa nghiệm thu bố cục trên website thực tế.
3. **Cảnh báo link:** gạch chân lượn sóng, biểu tượng cảnh báo, tooltip, hộp `confirm` khi bấm.
4. **Demo độc lập:** các nội dung mẫu, ô gọi thử API, thêm/sửa DOM theo thời gian. **Feed demo:** trang fixture để nạp extension thật.

Frontend chưa hoàn tất: còn các lỗi dưới đây và các màn hình/chức năng chưa tồn tại. Thanh “An toàn” hiện suy ra từ `scanned - toxic - threat`; đó không phải số kết quả `label=0`, vì label độc hại dưới ngưỡng blur vẫn được tính vào phần còn lại.

## 3. Đối soát 19 finding trong báo cáo cũ

**7 đã sửa, 4 sửa một phần, 6 còn mở, 2 chờ AI.** Những mục đã sửa được rút gọn vào bảng lưu vết thay cho mô tả lỗi cũ; nên giữ test hồi quy dù đã bỏ khỏi backlog đang mở.

### Đã sửa — có thể đóng finding cũ

| ID | Nội dung | Bằng chứng và giới hạn |
| --- | --- | --- |
| QA-003 | Request lỗi bị bỏ vĩnh viễn; thiếu timeout/recovery | `background.ts: fetchOnce/dispatch` có deadline và retry; `content.ts: chạyHàngĐợi/lênLịchThửLại` giữ phần tử lỗi; khởi động không chờ metadata. Test đạt cho retry mạng, transport không retry 4xx và hàng đợi phục hồi. Chưa có test treo request đủ deadline hoặc metadata hỏng. |
| QA-006 | Không kiểm tra lại khi text/href đổi | WeakMap lưu fingerprint riêng, observer theo dõi characterData và href. Test DOM đạt cho textContent/href, E2E đạt cho sửa text. Không suy rộng thành mọi loại mutation; xem QA-021. |
| QA-007 | Mỗi lần thêm node lại quét toàn body | Observer truyền subtree mới hoặc parent của text thay đổi vào `quét`; body chỉ được dùng lúc khởi động trong luồng tự động. Đã kiểm tra source và test node động; chưa benchmark feed lớn. |
| QA-008 | Scanner phân loại chính badge của mình | Badge có `data-cs-ui`; collection/observer loại subtree này. Test blur/reveal không phát sinh thêm request cho UI đạt. |
| QA-009 | Các lần gửi event chồng nhau, ACK bị lùi | `chuỗiGửiSựKiện` nối promise tuần tự; ACK tăng theo từng lô đã nhận phản hồi. Đóng race cũ dựa trên source, chưa có test ACK trễ. Mất ACK sau khi server đã ghi vẫn có thể gây đếm lặp do thiếu idempotency. |
| QA-013 | Dùng chung marker cho text và link làm bỏ text trong anchor | Text và URL dùng WeakMap riêng; không còn `data-cs-done` chung. Test href và source xác nhận cơ chế tách biệt; chưa có assertion riêng cho anchor độc hại. |
| QA-017 | Quyền scripting/activeTab không dùng | Manifest chỉ còn permission `storage` và host permission backend. Extension với manifest hiện tại đã nạp được trong smoke Chromium; chưa kiểm tra luồng nâng cấp trên Edge. |

Build note cũ đã được xử lý ở công cụ và hướng dẫn: `npm run verify` typecheck, test, build đủ content/popup/background. Vẫn phải reload extension và tab sau mỗi lần build.

### Đã sửa một phần — tiếp tục giữ trong backlog

| ID / mức cũ | Phần đã làm | Phần còn lại và điều kiện đóng |
| --- | --- | --- |
| QA-004 / High | CORS từ wildcard thành hai origin demo; content 1–1.200; count 1–10.000. Test validation/CORS đạt. | Chưa có xác thực caller hoặc rate limit; giới hạn field chưa phải giới hạn tổng tài nguyên request. CORS không phải cơ chế xác thực. Cần chốt bảo vệ API cục bộ và kiểm thử burst/caller không hợp lệ. |
| QA-010 / Medium | Content script và popup đều dùng ngày `Asia/Ho_Chi_Minh`. | Mỗi tab vẫn ghi đè nguyên stats từ số 0; backend dùng ngày hệ điều hành. Stats trong tab không reset qua nửa đêm. Cần tổng hợp nhiều tab, chia bucket ngày nhất quán và kiểm thử tab sống qua ngày mới. |
| QA-014 / Medium | Prediction TypeScript và demo đã dùng hai xác suất; README nay mô tả nhị phân đúng source. | Metadata vẫn TF-IDF ba nhãn, ModelMeta khai báo hai nhãn nhưng JSON có ba; popup còn Đe doạ và tên “xúc phạm” chưa đồng nhất “độc hại”. Cần đồng bộ artifact/UI/contracts và quyết định compatibility cho threat khi bàn giao AI. |
| QA-016 / Medium | Đã loại input, textarea, contenteditable, hidden, aria-hidden, display:none, visibility:hidden và UI của extension. Test draft đạt. | Button và nhiều vùng tương tác vẫn có thể bị gửi phân loại/làm mờ. Kiểm tra JSDOM bổ sung xác nhận text của button được gửi. Chưa có giới hạn website hoặc công tắc người dùng; cần chính sách chọn vùng và test tương ứng. |

### Còn mở — nguyên nhân vẫn có trong source

| ID / mức cũ | Hiện trạng và bằng chứng | Điều kiện đóng |
| --- | --- | --- |
| QA-005 / Medium | `backend/server.py: analyze_text` là async nhưng gọi trực tiếp hàm predict đồng bộ; scanner tuần tự từng phần tử. Chưa đo tải. | Tách công việc nặng qua worker/queue có giới hạn và kiểm tra health/stats khi có nhiều predict. Không đánh giá tốc độ AI trong đợt này. |
| QA-011 / Medium | `lưuTrễ` debounce 1,5 giây; chưa có durable outbox hoặc flush lúc đóng tab. Lỗi events bị nuốt; nếu không có lần lưu tiếp theo thì delta chưa được tự gửi lại. | Lưu bền delta trước khi trì hoãn mạng; retry độc lập; test đóng tab, event lỗi rồi phục hồi, service worker khởi động lại. |
| QA-012 / Medium | Popup ưu tiên backend nhưng nút xoá chỉ xoá key local và vẽ 0; mở lại vẫn thấy SQLite, tab đang chạy cũng có thể ghi lại local. | Chốt phạm vi xoá và thực hiện theo nguồn thật, hoặc đổi nhãn/ẩn nút; kiểm thử mở lại popup và tab đang chạy. |
| QA-015 / Medium | `bọcNộiDung` gắn các badge vào cùng parent; CSS absolute chung góc dưới trái. Inline position của parent chưa được phục hồi. | Badge gắn đúng từng mục, không chồng nhau; restore style khi reveal/re-evaluate; test layout nhiều sibling và zoom. |
| QA-018 / Low | `server.py` dùng `import storage`, `from predictor import ...`; không hỗ trợ import package chuẩn từ root theo cấu trúc hiện tại. | Sửa package imports và test lệnh chạy/import được công bố. README đã ghi cách chạy từ backend, không coi sửa hướng dẫn là sửa lỗi code. |
| QA-019 / Low | `git ls-files` vẫn có `.DS_Store` và ba file `backend/__pycache__/*.pyc`, dù ignore đã có. | Bỏ track các artifact trong thay đổi code/repo riêng. Đợt này không xoá file ngoài hai tài liệu được phép. |

### Chờ tích hợp AI — không tái đánh giá

| ID / mức cũ | Finding được giữ lại từ báo cáo trước | Cách xử lý |
| --- | --- | --- |
| QA-001 / High | Báo cáo trước ghi nhận chuyển logits sang xác suất không đúng và vấn đề invariant confidence. | Dev AI kiểm chứng lại với mô hình cuối, chốt schema và bộ test xác suất. Không gắn trạng thái đã sửa dựa trên test stub. |
| QA-002 / High | Báo cáo trước ghi nhận lỗi mô hình trả an toàn mặc định; health không phản ánh readiness. | Chốt error/readiness contract khi tích hợp AI. Route health hiện vẫn trả ok cố định; lần này không chạy nhánh lỗi mô hình. |

## 4. Khoảng trống phát hiện thêm khi đối chiếu

Hai finding sau nằm ngoài AI, được tái hiện bằng bundle vừa build trong JSDOM với fetch giả lập; không thêm hoặc sửa file testcase.

### QA-020 — Bỏ sót văn bản trực tiếp trong phần tử có thẻ con (Medium, còn mở)

`làKhốiVănBản` loại parent nếu có child dài ít nhất hai ký tự. Với:

```html
<p>Phần văn bản trực tiếp <strong>tên người dùng</strong> phần còn lại</p>
```

Chỉ “tên người dùng” được gửi `/predict`; hai phần văn bản trực tiếp của `p` không được kiểm tra. Nội dung thực tế có mention/link/in đậm có thể mất phần quan trọng trước khi tới backend.

**Cần làm:** chọn đơn vị văn bản bảo toàn nội dung xen thẻ, tránh phân loại/đếm chồng; thêm test với mention, link và thẻ định dạng.

### QA-021 — Chưa quét nội dung chỉ hiện lại hoặc thay đổi chỉ do xóa node (Medium, còn mở)

Observer chỉ nhận attribute `href`, và callback childList chỉ xử lý addedNodes. Hai kiểm tra bổ sung:

- Một `p hidden` được gỡ hidden: không phát sinh request cho nội dung vừa hiện.
- `p` chứa văn bản trực tiếp và `strong`: xóa `strong` mà không thêm node thì văn bản còn lại không được kiểm tra.

**Cần làm:** xử lý chuyển trạng thái đủ điều kiện quét và parent bị thay đổi bởi removal, đồng thời tránh vòng lặp từ UI extension. Thêm test hidden/class/style và mutation chỉ xóa node.

### Các rủi ro cần test thêm, chưa coi là finding đã tái hiện

- Backend trả 4xx/schema sai liên tục: transport không retry 4xx nhưng scanner bắt mọi lỗi rồi đưa lại hàng đợi; chưa phân biệt lỗi tạm thời/vĩnh viễn ở tầng này.
- Chưa duyệt Shadow DOM hoặc bật all_frames; chưa kiểm thử ứng dụng thực tế trên Chrome/Edge.
- Quy tắc URL có danh sách hậu tố thủ công; test content hiện mock link checker, nên không chứng minh độ chính xác của thuật toán thật.
- `đánhDấuLink` xoá title gốc của anchor, kể cả khi link an toàn; cần kiểm tra tác động lên tooltip của website.
- Demo input gọi fetch riêng chưa xử lý lỗi, giới hạn chiều dài, debounce hoặc response đến sai thứ tự.
- Chưa đo SQLite contention, độ trễ nhiều tab, tác động CPU/DOM, zoom/screen reader hoặc vòng đời service worker.

Rủi ro cũ “không có in-flight cache” không còn khớp source: hiện có map `đangGọi`, cache và cờ `đangXửLý`. Vẫn cần kiểm thử tải nhưng không giữ nhận định cũ là hiện trạng.

## 5. Bằng chứng kiểm thử ngày 13/09/2026

| Kiểm tra | Kết quả | Phạm vi thực sự |
| --- | --- | --- |
| `npm run verify` trong extension | Đạt: typecheck, 9 test Vitest, build | 7 test DOM + 2 test background; không có test popup hoặc thuật toán URL thật |
| `backend/test_server.py` | 4/4 đạt | Health/predict với stub, empty/oversize content, giới hạn count, CORS một origin demo và website lạ |
| `npm run test:e2e` | 1/1 đạt | Chromium nạp extension thật; initial/dynamic text, draft input, blur/reveal bàn phím, service worker transport, hai hostname demo và feed fixture |
| Kiểm tra JSDOM bổ sung | 4 tình huống đã chạy | Mixed text bị bỏ, button được quét, hidden→visible không quét, removal-only không quét; bằng chứng QA-016/020/021 |
| Source và Git index | Đã đối chiếu | Call site API, schema, popup/CSS, storage, quyền manifest và artifact còn track |

Test API được chạy qua Python trong `.venv`, tắt bytecode bằng `-B`, thay `sqlite3.connect` sang file trong TemporaryDirectory trước khi import test. Không tải AI, không dùng/ghi DB thống kê hiện có. Test này cần `httpx`, chưa được khai báo trong requirements backend.

Smoke E2E dùng HTTP server giả lập viết bằng Node, **không khởi động FastAPI hoặc mô hình thật**; `/stats` trả số 0 cố định và events chỉ ACK. Vì vậy chưa chứng minh được thống kê SQLite và popup đồng bộ toàn tuyến. Build và test chỉ sinh các artifact bị ignore, ngoài hai tài liệu được cập nhật.

### Đối chiếu danh sách 100 scenario trong TESTCASE_PLAN.md

Danh sách đó là **kế hoạch**, chưa phải 100 kết quả QA. Không dùng tiến độ trong `backend/qa/` để suy đoán pass/fail.

| Scenario | Trạng thái được chứng minh trong đợt này |
| --- | --- |
| 1 | HTTP health trả 200/JSON đúng trong test stub; chưa chứng minh model readiness |
| 6, 10 | Đạt: content rỗng và 1.201 ký tự bị từ chối 422 |
| 85 | Một phần: API nhận count=10.000, mock increment được gọi đúng; chưa kiểm tra SQLite tăng 10.000 |
| 86 | Một phần: test hiện chỉ kiểm tra count=10.001; chưa chạy các biến thể còn lại |
| 95 | Một phần: test API xác nhận CORS localhost:8080; 127.0.0.1:8080 có trong source nhưng chưa có assertion preflight riêng |
| 96 | Một phần: website lạ không được cấp CORS header; chưa kiểm thử CORS của extension origin với FastAPI thật |
| 2–5, 19–82, 97 | Chờ AI hoặc có phần phụ thuộc AI; không chạy đánh giá trong đợt này |
| 7–9, 11–18, 83–84, 87–94, 98–100 | Chưa chạy đầy đủ scenario. Có đọc source liên quan nhưng không đánh dấu pass |

Không xoá các scenario này khỏi kế hoạch chỉ vì chức năng đã có hoặc finding đã đóng. Với mục đã sửa, giữ test như regression; với mục chưa chạy, giữ trạng thái chưa kiểm chứng.

## 6. Thứ tự hoàn thiện đề xuất

1. **Thống kê và dữ liệu:** QA-010/011/012; gom delta nhiều tab, lưu bền, idempotency, đúng ngày và xoá đúng nguồn.
2. **Độ bao phủ và giao diện:** QA-020/021/016/015; bảo toàn văn bản, theo dõi trạng thái hiển thị, tránh can thiệp controls, bố trí badge đúng mục. Thêm trạng thái kết nối/nguồn thống kê vào popup.
3. **Backend ngoài AI:** QA-004/005; kiểm soát caller/tần suất và ranh giới xử lý nặng; kiểm thử tải và lỗi HTTP.
4. **Bàn giao AI:** QA-014 cùng QA-001/002; schema nhị phân, ngữ nghĩa confidence, metadata, readiness và lỗi có thể phục hồi.
5. **Kiểm thử và đóng gói:** popup, stats/storage, link checker, full-stack với FastAPI, Chrome/Edge; sau đó QA-018/019 và CI.

README đã được viết lại theo kiến trúc hiện tại, hướng dẫn chạy/build/test, API nhị phân, giao diện và các giới hạn đã xác nhận. Các finding còn mở đòi hỏi sửa code trong đợt tiếp theo; chỉnh tài liệu không đồng nghĩa đã xử lý các lỗi đó.
