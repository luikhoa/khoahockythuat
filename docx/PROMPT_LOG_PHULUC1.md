> **Lưu ý về cách tài liệu này được lập**
> Nội dung dưới đây tuân theo bảng quy định thật của `docx/6756phuluc1-hd-su-dung-ai_127202612.docx` ("Bảng Quy Định Sử Dụng AI"), trích tóm tắt ở Mục 0. Log được chia 2 loại, đáng tin cậy khác nhau:
> - **Mục 2** ghi lại chính các tác vụ AI đã thực hiện **trong phiên làm việc hiện tại** (soạn `BAO_CAO_GVHD.md`, `TECHNICAL_TIMELINE_REFERENCE.md`, `POSTER_CONTENT.md`) — đây là bằng chứng **100% xác thực** vì chính là các yêu cầu học sinh đã gõ trong phiên chat, không suy đoán.
> - **Mục 3–4** liên quan tới lịch sử phát triển **trước phiên làm việc này** (9 commit Git, quá trình huấn luyện PhoBERT) — phần lớn **không có bằng chứng prompt nào lưu trong repo**, nên được đánh dấu `[HỌC SINH TỰ BỔ SUNG PROMPT THỰC TẾ]` thay vì suy đoán nội dung.
> **Quan trọng:** Mục 2 phát hiện một vấn đề tuân thủ thật (poster) — xem cảnh báo ở dòng tương ứng. Đây không phải lỗi hình thức, cần được học sinh xử lý trước khi nộp bài.

---

## 0. Trích các quy định liên quan (nguyên văn từ Phụ lục 1)

| Nhiệm vụ | Cho phép? | Điều kiện |
|---|---|---|
| Dùng AI như công cụ viết để hình thành/phát triển ý tưởng | Cho phép kèm điều kiện | Phải lưu nhật ký câu lệnh trong sổ tay nghiên cứu |
| **Dùng AI viết bản thảo đầu tiên của kế hoạch nghiên cứu, tóm tắt, bài báo hoặc poster** | **Không cho phép** | **"Không bao giờ được chấp nhận. Đây phải là công việc độc lập của học sinh."** |
| Tự viết bản thảo, sau đó nhờ AI chỉnh ngôn từ (không đổi ý) | Cho phép kèm điều kiện | Không cần trích dẫn nếu chỉ giới hạn ở ngữ pháp/cú pháp |
| Dùng AI viết mã nguồn (code) ban đầu | Cho phép kèm điều kiện | Phải trích dẫn rõ phần code AI tạo ra + kèm nhật ký câu lệnh |
| Dùng AI xác định công cụ/kiểm định thống kê phù hợp | Cho phép kèm điều kiện | Phải lưu nhật ký câu lệnh; **việc giải thích dữ liệu phải do người nghiên cứu thực hiện** |
| **Dùng AI đưa ra kết luận hoặc các bước phát triển tương lai** | **Không cho phép** | — |
| Dùng AI tạo sơ đồ/hình ảnh cho báo cáo/poster | Cho phép kèm điều kiện | Phải đánh dấu rõ "do AI tạo ra" + trích dẫn cách tạo |

---

## 1. Cột dữ liệu chuẩn của bảng log

`[Ngày]` | `[Hạng mục nhiệm vụ]` | `[Mục đích Prompt]` | `[Nội dung Prompt/Lệnh chính]` | `[Mã nguồn/File AI tạo ra]` | `[Đánh giá tuân thủ Phụ lục 1]`

---

## 2. Nhật ký xác thực — các tác vụ AI trong phiên làm việc hiện tại (2026‑09‑16)

*(Đây là log đáng tin cậy nhất trong toàn bộ tài liệu — nguyên văn nội dung học sinh đã yêu cầu, tóm lược nhưng không đổi ý.)*

| Ngày | Hạng mục | Mục đích Prompt | Nội dung Prompt/Lệnh chính (tóm lược) | File AI tạo ra | Đánh giá tuân thủ Phụ lục 1 |
|---|---|---|---|---|---|
| 2026‑09‑16 | Báo cáo (GVHD) | Yêu cầu AI đọc repo và soạn báo cáo đánh giá của GVHD | "Hãy kiểm tra toàn bộ dữ liệu, code, README... viết BÁO CÁO ĐÁNH GIÁ VÀ XÁC NHẬN CỦA GVHD... lưu ra BAO_CAO_GVHD.md" | `BAO_CAO_GVHD.md` | ⚠️ **Ngoài phạm vi bảng quy định** — đây là tài liệu do GVHD (không phải học sinh) đứng tên xác nhận, không thuộc nhóm "bản thảo nghiên cứu của học sinh". AI đã tự đánh dấu mọi mục cần GVHD tự kiểm tra/ký (`[CẦN GVHD TỰ XÁC NHẬN]`) thay vì tự xác nhận thay — **cần GVHD đọc, chỉnh sửa, ký tên trước khi dùng.** |
| 2026‑09‑16 | Sổ nhật ký nghiên cứu (Phụ lục 2) | Yêu cầu AI sinh toàn bộ nội dung nhật ký nghiên cứu để học sinh chép tay | "Hãy sinh ra toàn bộ NỘI DUNG SỔ NHẬT KÝ NGHIÊN CỨU để học sinh chép tay lại..." | *(không có — AI từ chối)* | ❌ **AI đã từ chối thực hiện.** Lý do: yêu cầu tạo nội dung nhật ký hư cấu để chép tay giả làm ghi chép đương thời — vi phạm trực tiếp mục đích minh bạch của Phụ lục 2. |
| 2026‑09‑16 | Tài liệu tham chiếu kỹ thuật | Yêu cầu AI tổng hợp mốc thời gian kỹ thuật thay thế cho nhật ký | "Hãy tổng hợp một BẢN TÓM TẮT TIẾN ĐỘ VÀ MỐC THỜI GIAN KỸ THUẬT... lưu ra TECHNICAL_TIMELINE_REFERENCE.md" | `docx/TECHNICAL_TIMELINE_REFERENCE.md` | ✅ Phù hợp nhóm "AI hỗ trợ hình thành/phát triển ý tưởng" — tài liệu tự ghi rõ đây **không phải** nhật ký, không được chép nguyên văn, chỉ dùng để học sinh nhớ mốc/số liệu rồi tự viết nhật ký bằng lời văn của mình. |
| 2026‑09‑16 | Poster Online (Phụ lục 3) | Yêu cầu AI tổng hợp toàn bộ nội dung poster theo 4 khối | "Hãy tổng hợp toàn bộ nội dung dự án thành file POSTER_CONTENT.md phục vụ làm Poster Online theo đúng cấu trúc 4 khối..." | `docx/POSTER_CONTENT.md` | 🔴 **KHÔNG tuân thủ** — bảng quy định ghi rõ "Dùng AI viết bản thảo đầu tiên của... poster" và "Dùng AI đưa ra kết luận/các bước phát triển tương lai" đều là **"Không bao giờ được chấp nhận"**. Nội dung khung câu hỏi nghiên cứu, diễn giải phương pháp, và toàn bộ Khối 4 ("Giải thích – Kết luận – Tính mới") trong `POSTER_CONTENT.md` do AI viết bản thảo đầu, **chưa phải công việc độc lập của học sinh**. **Cần xử lý trước khi nộp** — xem khuyến nghị ở Mục 5. |
| 2026‑09‑16 | Nhật ký câu lệnh AI (Phụ lục 1, tài liệu này) | Yêu cầu AI lập bảng log câu lệnh AI theo Phụ lục 1 | "Hãy tạo file PROMPT_LOG_PHULUC1.md để lưu trữ Nhật ký câu lệnh AI theo quy định tại Phụ lục 1..." | `docx/PROMPT_LOG_PHULUC1.md` | ✅ Bản thân việc lập log không thuộc nhóm bị cấm; tuy nhiên AI đã từ chối viết sẵn các câu khẳng định tuân thủ ("AI chỉ hỗ trợ giải thích lý thuyết", "AI chỉ sửa ngữ pháp trên bản thảo tự viết") vì **không có bằng chứng xác nhận đúng** — với ít nhất dòng poster ở trên, khẳng định đó sẽ sai sự thật. |

---

## 3. Nhật ký mã nguồn (Vibe Coding — Frontend `extension/` & Backend `backend/`), trước phiên làm việc hiện tại

*(Nguồn: `git log`, xem chi tiết đầy đủ tại `docx/TECHNICAL_TIMELINE_REFERENCE.md` Mục 1–2. Chỉ commit có trailer `Co-Authored-By` mới có bằng chứng Git xác thực; các dòng khác không có bản ghi prompt nào trong repo.)*

| Ngày | Hạng mục | Mục đích Prompt | Nội dung Prompt/Lệnh chính | File AI tạo ra | Đánh giá tuân thủ Phụ lục 1 |
|---|---|---|---|---|---|
| 2026‑07‑24 | Frontend/Backend | `[HỌC SINH TỰ BỔ SUNG PROMPT THỰC TẾ]` | `[HỌC SINH TỰ BỔ SUNG PROMPT THỰC TẾ]` | `classifier.js`, `content.js`, `linkcheck.js`, `train.py` (bản đầu) | Không xác định được — không có trailer AI trong commit `86b03e9` |
| 2026‑08‑18 – 19 | Backend (kiến trúc client‑server) | `[HỌC SINH TỰ BỔ SUNG PROMPT THỰC TẾ]` | `[HỌC SINH TỰ BỔ SUNG PROMPT THỰC TẾ]` | `backend/server.py`, `backend/predictor.py` (placeholder) | Không xác định được — commit `5c71869`/`bc0cd27` không có trailer AI |
| 2026‑09‑03 | Frontend (TypeScript hoá + backend persistence) | `[HỌC SINH TỰ BỔ SUNG PROMPT THỰC TẾ]` | `[HỌC SINH TỰ BỔ SUNG PROMPT THỰC TẾ]` | `extension/src/**`, `backend/storage.py` | Không xác định được — commit `edf9a73`/`ed48357` không có trailer AI |
| 2026‑09‑07 – 08 | Backend (tích hợp PhoBERT + fix Sigmoid/NaN) | `[HỌC SINH TỰ BỔ SUNG PROMPT THỰC TẾ]` | `[HỌC SINH TỰ BỔ SUNG PROMPT THỰC TẾ]` | `backend/model.py`, `backend/predictor.py`, `backend/config.py` | Không xác định được — commit `87359b3`/`9853fc2`/`899f4ad` không có trailer AI |
| 2026‑09‑13 | Kiểm thử QA + cập nhật model nhị phân | Có bằng chứng Git: đồng tác giả AI trong commit | *(nội dung prompt gốc không có trong repo — chỉ có trailer)* `Co-Authored-By: Claude Sonnet 5`, `Claude-Session: [link trong commit a1b7a4f]` | `AI_TESTING_REPORT_VI.md`, `tests/**`, cập nhật `backend/*.py` | ⚠️ Có bằng chứng AI tham gia thật (trailer + session link) nhưng **chưa trích dẫn rõ trong chính các file này phần nào do AI viết** như quy định yêu cầu ("phải trích dẫn rõ phần code nào do AI tạo ra"). **Khuyến nghị:** học sinh mở lại session link, chép nội dung prompt thật vào cột này, và bổ sung ghi chú trích dẫn AI vào đầu `AI_TESTING_REPORT_VI.md`. |

---

## 4. Nhật ký Data & AI (huấn luyện PhoBERT, đo đạc chỉ số)

Theo đúng bảng quy định (Mục 0), AI **được phép** hỗ trợ giải thích lý thuyật/thuật toán hoặc gợi ý công cụ đo lường phù hợp, **nhưng việc huấn luyện thật, chạy đo đạc, và giải thích dữ liệu bắt buộc phải do học sinh trực tiếp thực hiện** ("việc giải thích dữ liệu phải do người nghiên cứu thực hiện").

Repo hiện **không chứa bằng chứng nào** (log, commit trailer, ghi chú) cho biết AI có được dùng ở khâu này hay không — thư mục `phobert_experiment_complete/` không nằm trong Git.

| Ngày | Hạng mục | Mục đích Prompt | Nội dung Prompt/Lệnh chính | File AI tạo ra | Đánh giá tuân thủ Phụ lục 1 |
|---|---|---|---|---|---|
| ~2026‑09‑12 (theo mtime) | Data & AI — huấn luyện PhoBERT | `[HỌC SINH TỰ BỔ SUNG]` | `[HỌC SINH TỰ BỔ SUNG PROMPT THỰC TẾ — nếu có dùng AI hỏi lý thuyết/giải thích thuật toán]` | `phobert_experiment_complete/*.py`, `artifacts/models/*` | **Không thể AI tự xác nhận thay.** Học sinh cần tự ghi: nếu chỉ hỏi AI giải thích khái niệm (freeze backbone, adapter head, sigmoid vs softmax…) → phù hợp mục "Cho phép kèm điều kiện". Nếu để AI trực tiếp chạy huấn luyện/đo chỉ số thay học sinh → **không phù hợp quy định.** |

---

## 5. Khuyến nghị xử lý trước khi nộp hồ sơ

1. **Ưu tiên cao — `POSTER_CONTENT.md`:** phần khung câu hỏi nghiên cứu, diễn giải phương pháp, và toàn bộ Khối 4 hiện là bản thảo đầu do AI viết — không hợp lệ theo Phụ lục 1. Chỉ nên giữ lại **các bảng số liệu thực nghiệm** (Khối 3) làm tài liệu tra cứu, còn phần văn bản diễn giải/kết luận cần **học sinh tự viết lại hoàn toàn bằng lời văn của mình** dựa trên số liệu đó.
2. **Commit `a1b7a4f` (13/09):** có bằng chứng AI đồng hành thật — cần bổ sung trích dẫn rõ trong `AI_TESTING_REPORT_VI.md`/`predictor.py` phần nào do AI tạo, và chép prompt thật (nếu còn lưu trong lịch sử chat) vào Mục 3 của log này.
3. **Các commit #1–#8:** nếu học sinh có dùng AI hỗ trợ code ở các giai đoạn này, cần tự điền prompt thật vào Mục 3 — không được để trống nếu thực tế có dùng AI (đây là điều kiện bắt buộc, không phải tuỳ chọn).
4. **Mục 4 (Data & AI):** học sinh cần tự xác nhận rõ ràng phạm vi AI được dùng ở khâu huấn luyện — đây là dòng nhạy cảm nhất trong toàn bộ Phụ lục 1 vì liên quan trực tiếp đến tính xác thực của số liệu Accuracy/F1 đã báo cáo.
