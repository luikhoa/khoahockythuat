# CyberShield for Teens — bản nguyên mẫu chạy được

Tiện ích trình duyệt làm mờ bình luận độc hại và cảnh báo liên kết đáng ngờ.
**Toàn bộ xử lý diễn ra trên máy người dùng.** Không có server, không có API,
không có chữ nào rời khỏi trình duyệt.

---

## 1. Kết quả hiện tại

Đo trên bộ dữ liệu mẫu 342 câu, Stratified**Group**KFold 5 fold:

| Phương án | macro-F1 |
|---|---|
| Baseline danh sách từ khoá cấm | 0.594 |
| TF-IDF n-gram **từ** (1–2) | 0.781 |
| **TF-IDF n-gram ký tự (2–5)** ← đang dùng | **0.797** |

Chi tiết theo lớp:

| Lớp | Precision | Recall | F1 | Số mẫu |
|---|---|---|---|---|
| An toàn | 0.783 | 0.929 | 0.850 | 140 |
| Xúc phạm | 0.807 | 0.787 | 0.797 | 122 |
| Đe doạ | 0.895 | 0.637 | 0.745 | 80 |

Hiệu năng bản JavaScript: **37 µs/câu** (~27.000 câu/giây), model.json nặng 276 KB.

> **Lưu ý bắt buộc đọc:** con số trên chạy trên *dữ liệu mẫu do script tự sinh*,
> không phải dữ liệu nghiên cứu. Nó chỉ chứng minh đường ống kỹ thuật hoạt động.
> Không được đưa những con số này vào báo cáo dự thi.

---

## 2. Cấu trúc thư mục

```
cybershield/
├── model/
│   ├── build_dataset.py   Sinh dữ liệu MẪU để chạy thử
│   └── train.py           Huấn luyện · so sánh · đánh giá · xuất model.json
├── data/
│   └── dataset.csv        text, label, group
└── extension/
    ├── manifest.json      Manifest V3
    ├── classifier.js      Bản sao pipeline sklearn viết bằng JS
    ├── linkcheck.js       Dò link đáng ngờ bằng heuristic (KHÔNG phải AI)
    ├── content.js         Quét DOM · làm mờ · thống kê
    ├── content.css        Lớp phủ hiển thị
    ├── popup.html/.js     Bảng điều khiển
    ├── model.json         Tham số mô hình (do train.py sinh ra)
    └── demo.html          Bảng tin giả lập để thử nghiệm
```

---

## 3. Cách chạy

**Huấn luyện lại mô hình**

```bash
pip install scikit-learn pandas numpy
python3 model/build_dataset.py     # bỏ qua bước này khi đã có dữ liệu thật
python3 model/train.py             # in báo cáo + ghi extension/model.json
```

**Thử nhanh không cần cài extension**

```bash
cd extension && python3 -m http.server 8000
# mở http://localhost:8000/demo.html
```

(Phải chạy qua http; mở thẳng file bằng `file://` sẽ bị trình duyệt chặn `fetch`.)

**Cài vào Chrome / Edge**

1. Vào `chrome://extensions`
2. Bật **Developer mode** (góc trên bên phải)
3. Bấm **Load unpacked** → chọn thư mục `extension/`
4. Mở `demo.html` hoặc một trang bất kỳ để xem hoạt động

---

## 4. Thay dữ liệu mẫu bằng dữ liệu thật

Đây là phần chiếm phần lớn công sức nghiên cứu, và cũng là phần giám khảo hỏi kỹ nhất.

Ghi đè `data/dataset.csv` với đúng ba cột:

| Cột | Ý nghĩa |
|---|---|
| `text` | Câu bình luận, đã xoá sạch tên/username/link/ảnh |
| `label` | 0 = an toàn, 1 = xúc phạm, 2 = đe doạ |
| `group` | Mã nhóm — các câu có liên quan nhau phải cùng số |

**Cột `group` quan trọng hơn vẻ ngoài của nó.** Lần chạy đầu tiên của dự án này
cho macro-F1 = 1.000, nghe thì tuyệt nhưng thực ra là *rò rỉ dữ liệu*: các biến
thể của cùng một câu gốc rơi vào cả tập huấn luyện lẫn tập kiểm tra, mô hình chỉ
việc học thuộc. Khi chia fold theo `group`, điểm tụt về 0.797 — và đó mới là con
số thật. Với dữ liệu thật, hãy gán cùng `group` cho các bình luận trong cùng một
bài đăng hoặc cùng một cuộc hội thoại.

**Quy trình gán nhãn nên làm:**

1. Mỗi câu được **ít nhất 2 bạn gán độc lập**, không nhìn bài nhau.
2. Tính **hệ số đồng thuận Cohen's Kappa** giữa hai người:
   ```python
   from sklearn.metrics import cohen_kappa_score
   print(cohen_kappa_score(nhãn_bạn_A, nhãn_bạn_B))
   ```
   Kappa > 0.6 là chấp nhận được, > 0.8 là tốt. Đưa con số này vào báo cáo.
3. Câu nào hai bạn gán khác nhau thì cả nhóm ngồi lại thống nhất, và **ghi lại
   lý do** vào sổ nhật ký. Chính những trang ghi chép "vì sao câu này khó gán"
   mới là bằng chứng thuyết phục nhất rằng dữ liệu do các em tự làm.

---

## 5. Vì sao chạy trong trình duyệt thay vì gọi API

Đề cương ban đầu thiết kế: extension đọc text → gửi về server Flask → nhận kết
quả. Cách đó có một vấn đề nghiêm trọng: mọi bình luận và tin nhắn học sinh nhìn
thấy đều rời khỏi máy các em.

Logistic Regression chỉ là phép nhân rồi cộng vector. Vì vậy `train.py` xuất
từ điển, giá trị IDF và trọng số ra `model.json`, còn `classifier.js` tính lại y
hệt bằng JavaScript. Kết quả đã được đối chiếu trên toàn bộ 342 câu:

```
Sai lệch xác suất lớn nhất = 3.02e-6, số nhãn lệch = 0
```

(Sai lệch 10⁻⁶ đến từ việc làm tròn 5 chữ số khi ghi JSON, không phải lỗi thuật toán.)

Lợi ích kèm theo: không cần server khi mang đi thi, không phụ thuộc Internet,
và độ trễ 37 µs thay vì hàng trăm mili-giây chờ mạng.

---

## 6. Ba mẹo hiệu năng trong `content.js`

Nếu quét lại toàn trang mỗi lần có thay đổi, extension sẽ làm treo Facebook hay
TikTok trong vài giây. Ba biện pháp đang dùng:

1. `MutationObserver` + debounce 250 ms — chỉ quét phần DOM mới thêm vào.
2. Cache theo nội dung đã chuẩn hoá — câu lặp lại không phải tính lại.
3. `requestIdleCallback` — xử lý theo lô vào lúc trình duyệt rảnh, không chặn cuộn trang.

---

## 7. Hạn chế cần nói thẳng trong báo cáo

Giám khảo đánh giá cao sự trung thực hơn là những con số đẹp.

- Mô hình chỉ nhìn **một câu tách rời**, không hiểu ngữ cảnh hội thoại. Cùng một
  câu giữa hai bạn thân và giữa hai người lạ mang ý nghĩa hoàn toàn khác nhau.
- **Recall lớp "đe doạ" chỉ 0.637** — cứ 3 câu đe doạ thì bỏ sót 1. Đây là lớp
  nguy hiểm nhất, và cũng là lớp ít dữ liệu nhất (80 mẫu). Cần thu thập thêm.
- Mô-đun link **không dùng AI**, chỉ là bộ quy tắc. Đừng gọi nó là AI trong poster.
- Chưa xử lý ảnh, video, sticker — vốn là kênh bắt nạt rất phổ biến.
- Kết luận về tác động tâm lý sau 2 tuần thử nghiệm chỉ có giá trị **sơ bộ**.

---

## 8. Việc phải làm trước khi thu thập dữ liệu

Đây là phần dễ khiến dự án bị loại nhất, và không liên quan gì đến code.

- [ ] Nộp hồ sơ **Hội đồng thẩm định (SRC)** và **được duyệt** *trước khi* khảo sát
      học sinh. Khảo sát trước rồi mới nộp thì dữ liệu có nguy cơ không được công nhận.
- [ ] Phiếu **chấp thuận của phụ huynh** cho từng học sinh tham gia (đối tượng vị thành niên).
- [ ] Quy trình **ẩn danh hoá**: xoá tên, username, ảnh đại diện, link bài gốc
      *ngay khi thu thập*, trước khi lưu vào file.
- [ ] Cam kết **không công bố** bất kỳ bình luận nào kèm thông tin nhận dạng người viết.
- [ ] Trong khảo sát tâm lý: dùng thang đo có sẵn, tránh mọi từ ngữ chẩn đoán
      ("trầm cảm", "lo âu"). Chỉ hỏi về *cảm nhận khi sử dụng mạng xã hội*.
- [ ] Có sẵn phương án hỗ trợ nếu một học sinh trong nhóm khảo sát bộc lộ dấu hiệu
      đang bị bắt nạt: báo giáo viên hướng dẫn, không tự nhóm xử lý.

---

## 9. Câu giám khảo hay hỏi

**"Dữ liệu của học sinh có bị gửi đi đâu không?"**
Không. Mở tab Network trong DevTools khi extension đang chạy — không có một yêu
cầu mạng nào ngoài lần đọc `model.json` từ chính thư mục extension.

**"Sao không dùng Google Perspective API cho nhanh?"**
Perspective hỗ trợ tiếng Việt hạn chế và không hiểu teencode. Baseline từ khoá
trong bảng ở mục 1 chính là để trả lời câu này: 0.594 so với 0.797.

**"Vì sao n-gram ký tự tốt hơn n-gram từ?"**
Vì học sinh viết `n.g.u`, `ng*u`, `nguuuu`. Với n-gram từ, mỗi biến thể là một từ
hoàn toàn mới chưa từng gặp. Với n-gram ký tự, chuỗi `ngu` vẫn còn nguyên bên trong.

**"Nếu mô hình chặn nhầm câu đùa giữa bạn bè thì sao?"**
Có xảy ra — precision lớp an toàn là 0.783. Vì vậy tiện ích **làm mờ chứ không
xoá**, và luôn có nút "Vẫn xem". Quyền quyết định cuối cùng thuộc về học sinh.

---

## 10. Hướng phát triển tiếp

- Cho phép người dùng bấm **"Cái này không độc hại"** để thu phản hồi, phục vụ
  huấn luyện lại — biến chính người dùng thành nguồn dữ liệu.
- Bổ sung lớp thứ tư: **quấy rối tình dục / gạ gẫm**, hiện chưa xử lý.
- Chế độ **nhật ký cho phụ huynh** — nhưng phải cân nhắc kỹ: học sinh biết mình
  bị giám sát sẽ chuyển sang nền tảng khác. Đây là một câu hỏi nghiên cứu thú vị
  tự nó, đáng đưa vào phần thảo luận.
