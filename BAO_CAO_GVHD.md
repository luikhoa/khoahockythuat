> **⚠️ LƯU Ý QUAN TRỌNG — ĐỌC TRƯỚC KHI SỬ DỤNG**
> Văn bản này là **bản DỰ THẢO** báo cáo đánh giá, được soạn bằng công cụ AI dựa trên việc đọc trực tiếp mã nguồn, dữ liệu, log huấn luyện và kết quả kiểm thử thực tế có trong repository tại thời điểm 2026‑09‑16. Toàn bộ số liệu ở **Mục III** được trích dẫn nguyên văn kèm tên file nguồn, **không có số liệu nào được suy diễn hay tự sinh thêm**.
>
> Các nội dung đòi hỏi **xác nhận cá nhân, trực tiếp** của Giáo viên hướng dẫn (GVHD) — ví dụ: đã trực tiếp kiểm tra sổ nhật ký nghiên cứu viết tay, đã đối chiếu Prompt Log đầy đủ, xác nhận danh dự về tính trung thực — **KHÔNG** được AI tự xác nhận thay, vì đây là những việc chỉ người giám sát trực tiếp học sinh mới có thể kiểm chứng. Các mục này được đánh dấu rõ **[CẦN GVHD TỰ XÁC NHẬN]** và để trống hoặc để placeholder. GVHD cần đọc, kiểm tra thực tế, chỉnh sửa/bổ sung phần đánh giá cá nhân và ký tên trước khi nộp văn bản cho Ban tổ chức. Văn bản chưa qua bước rà soát và ký này **không có giá trị xác nhận chính thức**.

---

# BÁO CÁO ĐÁNH GIÁ VÀ XÁC NHẬN CỦA GIÁO VIÊN HƯỚNG DẪN

**Dự án dự thi Khoa học Kỹ thuật (KHKT)**

---

## I. THÔNG TIN CHUNG

| Mục | Nội dung |
|---|---|
| Tên dự án | **CyberShield for Teens** — Tiện ích trình duyệt phát hiện và làm mờ bình luận độc hại, cảnh báo liên kết đáng ngờ trên mạng xã hội |
| Lĩnh vực dự thi | Khoa học máy tính / Hệ thống thông tin (Xử lý ngôn ngữ tự nhiên tiếng Việt ứng dụng an toàn không gian mạng) |
| Học sinh thực hiện | **[CẦN ĐIỀN — Họ và tên, lớp]** *(không xác định được từ repo mã nguồn)* |
| Giáo viên hướng dẫn | **[CẦN ĐIỀN]** |
| Trường / Đơn vị | **[CẦN ĐIỀN]** |
| Kho mã nguồn đánh giá | Thư mục dự án `khoahockythuat/` (Git, 9 commit tính đến thời điểm đánh giá) |
| Ngày lập báo cáo (dự thảo) | 2026‑09‑16 |

---

## II. ĐÁNH GIÁ QUÁ TRÌNH NGHIÊN CỨU & NĂNG LỰC HỌC SINH

### 1. Năng lực Tư duy Dữ liệu (Data)

- Học sinh sử dụng bộ dữ liệu công khai **ViHSD** (Vietnamese Hate Speech Detection, nhóm UIT – ĐHQG‑HCM, Luu et al. 2021, arXiv:2103.11528), quy mô khoảng **33.400 bình luận mạng xã hội**, có trích dẫn nguồn rõ ràng trong `phobert_experiment_complete/README.md`. Việc chủ động tìm và trích dẫn đúng nguồn dữ liệu học thuật là một chỉ dấu tốt về liêm chính nghiên cứu ở lứa tuổi cấp 2.
- Tự viết pipeline tiền xử lý (`phobert_experiment_complete/preprocess.py`): tải dữ liệu qua thư viện `datasets` của HuggingFace, tự dò cột văn bản/nhãn giữa nhiều khả năng đặt tên khác nhau (`detect_columns`), làm sạch văn bản (loại bỏ URL, mention `@`, khoảng trắng thừa bằng regex), và **gộp lại nhãn gốc 3 lớp (CLEAN/OFFENSIVE/HATE) thành bài toán nhị phân** (an toàn/công kích) — đây là một quyết định mô hình hoá có chủ đích, không phải dùng nguyên trạng dữ liệu.
- Dữ liệu sau xử lý được chia và lưu cache thành 3 tập tại `phobert_experiment_complete/data/processed/`:

  | Tập | Số dòng (không tính header) |
  |---|---|
  | Train | 24.045 |
  | Validation | 2.672 |
  | Test | 6.680 |

- Ngoài tập ViHSD công khai, học sinh **tự thiết kế thêm một bộ dữ liệu đánh giá riêng** (`predict_semantic.csv`, 100 câu), phân loại theo 5 nhóm ngữ cảnh (`safe`, `insult`, `threat`, `context`, `evasion`) và 4 mức độ độc hại (`L0`–`L3`). Đây là biểu hiện rõ của tư duy dữ liệu chủ động: không chỉ dùng dataset có sẵn mà còn tự đặt ra các ca kiểm thử theo mức độ ngữ nghĩa.
- Tự tổ chức một đợt kiểm thử **black‑box** độc lập với **1.000 request thực tế** gửi tới hệ thống đang chạy (`tests/blackbox_runner.py`), bao trùm **10 kỹ thuật né lọc/obfuscation tiếng Việt mạng** khác nhau (chèn ký tự, ký tự rộng‑0, không dấu, teencode, ký tự đồng dạng Cyrillic/Latin, leetspeak…) — thể hiện hiểu biết thực chất, không hời hợt, về cách ngôn ngữ mạng bị biến đổi để né bộ lọc.

### 2. Năng lực Trí tuệ nhân tạo (AI)

- Lựa chọn kiến trúc **PhoBERT‑base‑v2** (mô hình ngôn ngữ tiếng Việt pretrained của VinAI, cũng là baseline trong chính paper gốc của ViHSD) làm backbone, **đóng băng hoàn toàn** trọng số backbone và chỉ huấn luyện một **adapter MLP head** nhỏ (`Linear → GELU → Dropout → Linear`) đặt trên embedding của token `[CLS]` (`phobert_experiment_complete/model.py`). Đây là kỹ thuật **transfer learning / parameter‑efficient fine‑tuning** đúng chuẩn — không phải chỉ gọi API có sẵn, mà học sinh hiểu và chủ động vận dụng khái niệm embedding, đóng băng trọng số và học chuyển giao.
- Quy trình huấn luyện chạy **12 epoch** trên GPU (theo `phobert_experiment_complete/full_training_console.log`, thực hiện trên Kaggle theo `KAGGLE_GUIDE.md`), có cơ chế lưu checkpoint và chọn checkpoint tốt nhất theo **validation macro‑F1**.
- Biết đánh giá mô hình bằng bộ số liệu chuẩn của bài toán phân loại mất cân bằng (accuracy, precision/recall/F1 theo từng lớp, ma trận nhầm lẫn) thay vì chỉ dừng ở accuracy tổng thể — số liệu chi tiết ở Mục III.

### 3. Tư duy phản biện và kiểm thử hệ thống (điểm nổi bật của dự án)

- Học sinh tự lập một **báo cáo kiểm thử AI/NLP độc lập** (`AI_TESTING_REPORT_VI.md`, 364 dòng), tự đặt vai trò QA/Test Engineer, tiến hành kiểm thử cả white‑box (đọc mã nguồn) lẫn black‑box (gửi request thật), và **tự phát hiện 14 vấn đề kỹ thuật** xếp loại theo mức độ nghiêm trọng (ví dụ: thiếu bước chuẩn hoá văn bản trước khi đưa vào mô hình, cơ chế "fail‑open" âm thầm trả về "an toàn" khi model lỗi, `/health` không phản ánh đúng trạng thái model, CORS mở hoàn toàn không xác thực, gọi PyTorch đồng bộ chặn event loop bất đồng bộ...).
- Đây là năng lực **hiếm gặp và đáng ghi nhận đặc biệt** ở học sinh cấp 2: không chỉ dừng lại ở việc xây dựng ra một mô hình hoạt động, mà còn chủ động, có hệ thống đi tìm điểm yếu của chính sản phẩm mình làm ra — đúng tinh thần nghiên cứu khoa học thực chứng.
- Học sinh **phân biệt rõ hai loại số liệu khác bản chất** và không đánh tráo chúng để "làm đẹp" báo cáo: (a) số liệu đo trên **tập test giữ lại (held‑out)** của chính quy trình huấn luyện (Test Accuracy 87,19%, F1‑macro 0,7312) và (b) số liệu đo qua **kiểm thử API bằng dữ liệu tổng hợp có né lọc do QA tự biên soạn** (Accuracy 67,5%, Recall 0,35) — báo cáo ghi chú tường minh rằng bộ số liệu thứ hai "có giá trị chỉ báo (indicative), không thay thế đánh giá trên tập test gốc". Đây là tư duy khoa học dữ liệu chuẩn mực.

### 4. Phương pháp "Vibe Coding" (AI hỗ trợ lập trình) — Frontend & Backend

- `README.md` và `plan.md` của dự án thể hiện rõ việc **phân chia ranh giới trách nhiệm** giữa phần do AI hỗ trợ triển khai ("Dev AI" — được ghi chú tường minh trong code và tài liệu, ví dụ mục 4 của README: *"Dev AI chú ý: Chỉ sửa `backend/predictor.py`… Không cần đụng `backend/server.py`"*) và phần do học sinh tự thiết kế và kiểm soát: hợp đồng API (`Prediction` contract), luồng dữ liệu client → backend, ngưỡng quyết định, kiến trúc thư mục (`plan.md` — kế hoạch refactor 5 bước, TypeScript hoá, backend persistence). Điều này cho thấy học sinh không sử dụng AI để "làm hộ toàn bộ" mà chủ động thiết kế kiến trúc rồi mới dùng AI để lấp đầy phần triển khai chi tiết — đúng tinh thần Vibe Coding có kiểm soát, có tư duy hệ thống đứng sau.
- Lịch sử Git của repo (9 commit) phản ánh một tiến trình phát triển theo từng bước có chủ đích, không phải nộp một lần: kiến trúc client‑server ban đầu → refactor TypeScript & backend persistence → tích hợp mô hình PhoBERT thật vào `predictor.py` → sửa lỗi mô hình nhị phân/Sigmoid và hiển thị UI.

> **[CẦN GVHD TỰ XÁC NHẬN — không tự xác nhận thay]**
> Việc tuân thủ đầy đủ **Phụ lục 1 – Hướng dẫn sử dụng AI** đòi hỏi học sinh lưu trữ **Prompt Log đầy đủ** (nhật ký các prompt đã dùng, phản hồi của AI, phần học sinh tự chỉnh sửa) và học sinh hiểu rõ luồng tích hợp hệ thống mình đã làm ra. Repo hiện có file mẫu/hướng dẫn cách thực hiện (`docx/6756phuluc1-hd-su-dung-ai_127202612.docx`) nhưng **không chứa file Prompt Log đã điền** — tài liệu này thường được lưu riêng ngoài kho mã nguồn (viết tay hoặc file log tách biệt). Đề nghị GVHD đối chiếu trực tiếp với Prompt Log thực tế của học sinh, và qua trao đổi trực tiếp xác nhận học sinh hiểu đúng luồng tích hợp (không chỉ chép lại code AI sinh ra mà không hiểu), trước khi xác nhận mục này.

---

## III. XÁC NHẬN SỐ LIỆU KỸ THUẬT VÀ KẾT QUẢ THỰC NGHIỆM

*Toàn bộ số liệu dưới đây được trích dẫn nguyên văn từ các file trong repo, có ghi rõ nguồn. Không có số liệu nào được tự sinh thêm ngoài repo.*

### 1. Số liệu huấn luyện mô hình AI

Nguồn: `phobert_experiment_complete/full_training_console.log`, `phobert_experiment_complete/README.md`

| Chỉ số | Giá trị |
|---|---|
| Dataset | ViHSD — 33.400 dòng (tổng train+val+test đã xử lý, xem bảng Mục II.1) |
| Kiến trúc mô hình | PhoBERT‑base‑v2 (backbone đóng băng) + Adapter MLP head |
| Số epoch huấn luyện | 12 |
| Best validation F1‑macro | **0,7414** |
| Test Accuracy | **87,19%** |
| Test F1‑macro | **0,7312** |
| Test F1‑weighted (theo classification report) | 0,86 |

**Confusion matrix trên tập test (6.680 mẫu):**

| | Dự đoán: An toàn (0) | Dự đoán: Công kích (1) |
|---|---|---|
| **Thực tế: An toàn (0)** | 5.328 | 220 |
| **Thực tế: Công kích (1)** | 636 | 496 |

**Chi tiết theo lớp:**

| Lớp | Precision | Recall | F1‑score | Support |
|---|---|---|---|---|
| 0 — An toàn | 0,89 | 0,96 | 0,93 | 5.548 |
| 1 — Công kích | 0,69 | 0,44 | 0,54 | 1.132 |

### 2. Kết quả kiểm thử hệ thống thực tế (Black‑box, 1.000 request)

Nguồn: `tests/results/blackbox_summary.json`, `AI_TESTING_REPORT_VI.md`

> Lưu ý: đây là bộ dữ liệu **tổng hợp do học sinh/QA tự biên soạn** để kiểm tra khả năng chống né lọc của hệ thống đang chạy — khác với tập test held‑out ở Mục III.1, có giá trị chỉ báo chứ không thay thế số liệu huấn luyện gốc.

| Chỉ số (trên 800 ca có nhãn kỳ vọng) | Giá trị |
|---|---|
| Accuracy | 67,5% |
| Precision (lớp độc hại) | 1,000 |
| Recall (lớp độc hại) | 0,350 |
| F1‑score | 0,5185 |
| True Positive / False Negative | 140 / 260 |
| True Negative / False Positive | 400 / 0 |

**Tỉ lệ né lọc (bypass) theo kỹ thuật obfuscation — 40 ca/kỹ thuật:**

| Kỹ thuật | Tỉ lệ bị né lọc |
|---|---|
| Chèn ký tự `*` giữa từng chữ | 100,0% |
| Chèn ký tự rộng‑0 (zero‑width space) | 100,0% |
| Chèn dấu `.` giữa từng chữ | 90,0% |
| Đảo hoa/thường + ký tự bọc | 87,5% |
| Bỏ dấu tiếng Việt | 75,0% |
| Thay chữ bằng số (leetspeak) | 62,5% |
| Ký tự đồng dạng Cyrillic/Latin (homoglyph) | 42,5% |
| Chèn dấu `_` giữa từ | 32,5% |
| Không obfuscate (raw) | 30,0% |
| Teencode viết tắt phổ biến | 30,0% |

**Hiệu năng (latency), tổng thể 1.000 request:** trung bình **14,99 ms**, median 14,07 ms, P95 17,89 ms, max 378,70 ms (ca payload 1 MB). Không ghi nhận lỗi kết nối hay mã lỗi 5xx nào trong toàn bộ 1.000 request.

### 3. Kiểm thử đơn vị (unit test)

Nguồn: `tests/unit/` (31 test case `pytest`)

- Kết quả: **27 passed, 3 xfailed (ghi nhận lỗ hổng có chủ đích), 1 xpassed**.

### 4. Bộ dữ liệu đánh giá tự tạo bổ sung

Nguồn: `predict_semantic.csv` (100 dòng)

| Phân loại | Số lượng |
|---|---|
| Theo nhóm: safe / insult / threat / context / evasion | 25 / 25 / 20 / 15 / 15 |
| Theo mức độ: L0 / L1 / L2 / L3 | 25 / 15 / 35 / 25 |

---

## IV. ĐÁNH GIÁ TÍNH TRUNG THỰC VÀ TUÂN THỦ QUY CHẾ

- **Trích dẫn nguồn dữ liệu:** dataset ViHSD là bộ dữ liệu công khai, được trích dẫn rõ nguồn (tác giả, nhóm nghiên cứu UIT, đường dẫn paper arXiv) trong `phobert_experiment_complete/README.md` — đạt yêu cầu liêm chính học thuật trong trích dẫn nguồn dữ liệu.
- **Quản lý mã nguồn:** dự án được quản lý bằng Git với lịch sử 9 commit thể hiện quá trình phát triển tăng dần, không phải một lần nộp bài toàn bộ.
- **Tính khách quan của báo cáo kỹ thuật tự thực hiện:** `AI_TESTING_REPORT_VI.md` không tô hồng kết quả — nêu rõ cả điểm mạnh (Precision hoàn hảo 1,0, không báo động giả trên câu học thuật/tin tức) lẫn điểm yếu nghiêm trọng (Recall thực tế qua API chỉ 0,35, tỉ lệ né lọc lên tới 100% với một số kỹ thuật). Đây là chỉ dấu tích cực về tính trung thực học thuật của học sinh.

> **[CẦN GVHD TỰ XÁC NHẬN — không tự xác nhận thay]**
> 1. **Sổ nhật ký nghiên cứu viết tay (Phụ lục 2):** repo chỉ chứa file hướng dẫn cách lập sổ nhật ký (`docx/6756phuluc2-hd-so-nhat-ky-nghien-cuu_127202612.docx`). Bản thân sổ nhật ký viết tay, theo đúng bản chất của nó, không thể tồn tại dưới dạng file trong kho mã nguồn — đây là tài liệu vật lý học sinh cần trình trực tiếp. Đề nghị GVHD xác nhận đã tự tay kiểm tra sổ nhật ký bản cứng, cập nhật đều đặn, và tiến độ ghi trong sổ khớp với lịch sử phát triển nêu ở Mục II.4.
> 2. **Minh bạch sử dụng AI tạo sinh (Phụ lục 1):** tương tự, cần đối chiếu Prompt Log thực tế (xem khuyến nghị ở Mục II.4).
> 3. **Xác nhận danh dự về tính trung thực tổng thể của dự án** (học sinh tự thực hiện, không sao chép, hiểu rõ những gì mình trình bày): cần chữ ký và xác nhận trực tiếp của GVHD dựa trên quá trình giám sát thực tế, không thể suy ra chỉ từ việc đọc mã nguồn.

---

## V. KẾT LUẬN VÀ KHUYẾN NGHỊ

**Đánh giá tổng thể:** Dự án thể hiện một quá trình nghiên cứu thực chất, có chiều sâu kỹ thuật vượt mức phổ biến ở học sinh cấp 2, đặc biệt ở ba điểm: (1) áp dụng đúng kỹ thuật transfer learning (đóng băng backbone PhoBERT, huấn luyện adapter head) thay vì chỉ gọi API có sẵn; (2) tự tổ chức kiểm thử black‑box quy mô 1.000 ca với hiểu biết thực tế về các kỹ thuật né lọc tiếng Việt mạng; (3) tư duy phản biện rõ rệt khi tự phát hiện và công khai 14 điểm yếu kỹ thuật của chính hệ thống mình xây dựng, thay vì chỉ báo cáo kết quả tốt.

**Giá trị thực tiễn:** Sản phẩm là một tiện ích trình duyệt (Chrome/Edge) hoạt động thật, có kiến trúc client‑server rõ ràng (extension TypeScript ↔ FastAPI backend), giải quyết một vấn đề thực tế và có ý nghĩa xã hội: bảo vệ trẻ vị thành niên khỏi nội dung độc hại/đe doạ trên mạng xã hội.

**Hạn chế cần lưu ý trước khi nhân rộng ngoài phạm vi cuộc thi** (căn cứ theo chính báo cáo kiểm thử của học sinh, Mục III.2):
1. Recall thực tế qua API (0,35) còn thấp so với accuracy trên tập test huấn luyện (87,19%) — mô hình hiện ưu tiên tránh báo động giả hơn là bắt đủ nội dung độc hại, đặc biệt dễ bị né lọc bởi các thủ thuật chèn ký tự đơn giản.
2. Backend hiện chưa có xác thực (CORS mở hoàn toàn) và có cơ chế "fail‑open" khi mô hình lỗi — cần khắc phục trước khi triển khai ngoài môi trường thử nghiệm cục bộ.
3. `extension/model.json` mô tả kiến trúc mô hình cũ (TF‑IDF, 3 nhãn) chưa được cập nhật khớp với mô hình PhoBERT nhị phân thực tế đang chạy.

Những hạn chế này **không làm giảm giá trị của dự án** ở góc độ học thuật — ngược lại, việc học sinh tự phát hiện và trình bày minh bạch các điểm yếu này là một dấu hiệu tích cực về năng lực tư duy khoa học và tính trung thực, đáng được ghi nhận trong đánh giá.

**Khuyến nghị:** Dự án đủ điều kiện về mặt kỹ thuật để trình bày tại cuộc thi, với điều kiện các mục **[CẦN GVHD TỰ XÁC NHẬN]** ở Mục II.4 và Mục IV được GVHD hoàn thiện dựa trên giám sát thực tế trước khi nộp hồ sơ chính thức.

---

## XÁC NHẬN CỦA GIÁO VIÊN HƯỚNG DẪN

Tôi đã đọc, kiểm tra và xác nhận nội dung báo cáo này phản ánh đúng quá trình nghiên cứu thực tế của học sinh mà tôi trực tiếp hướng dẫn, bao gồm việc đã kiểm tra sổ nhật ký nghiên cứu viết tay và Prompt Log sử dụng AI theo đúng Phụ lục 1 và Phụ lục 2 của cuộc thi.

| | |
|---|---|
| Họ và tên GVHD | ...................................................... |
| Chữ ký | ...................................................... |
| Ngày ký | ...................................................... |
