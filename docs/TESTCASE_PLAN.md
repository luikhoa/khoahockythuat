## 100 kịch bản black-box

  ### A. Hợp đồng và validation /predict

    ID    Kịch bản                           Mức          Kỳ vọng
  ━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     1    GET /health khi model hoạt động    N/A          200 và JSON hợp lệ; lưu ý chưa
                                                          chứng minh AI sẵn sàng
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
     2    Một câu chào hỏi thông thường      L0           200, label 0
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
     3    Một câu xúc phạm trực tiếp rõ      L2           200, label 1
          ràng
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
     4    Gửi cùng một nội dung 20 lần       Theo mẫu     Response phải ổn định hoàn toàn
          tuần tự
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
     5    Kiểm tra tất cả invariant của      Theo mẫu     Đúng kiểu, miền giá trị, tổng
          response                                        xác suất, name/label
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
     6    content=""                         N/A          422
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
     7    content chỉ chứa dấu cách/tab/     L0/N/A       Hiện có thể 200; mong muốn hợp
          newline                                         lý là 422 sau trim
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
     8    content đúng một ký tự             Tùy ký tự    200
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
     9    Nội dung đúng 1.200 ký tự          Theo mẫu     200
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
    10    Nội dung 1.201 ký tự               N/A          422
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
    11    Thiếu field content                N/A          422
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
    12    content=null                       N/A          422
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
    13    Lần lượt truyền number,            N/A          422 cho từng kiểu
          boolean, array, object
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
    14    JSON bị thiếu dấu ngoặc hoặc       N/A          422, server không chết
          quote
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
    15    Body JSON nhưng Content-Type:      N/A          Ghi nhận 415/422; không được
          text/plain                                      500
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
    16    Thêm field không thuộc contract    N/A          Hiện Pydantic có thể bỏ qua;
                                                          quyết định có cần strict 422
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
    17    Gọi GET, PUT, DELETE /predict      N/A          405
  ─────  ─────────────────────────────────  ───────────  ─────────────────────────────────
    18    Gọi /predict/ có dấu / cuối        N/A          Xác nhận 307 hoặc response sau
                                                          redirect

  ### B. Nội dung an toàn và phụ thuộc ngữ cảnh

    ID    Mô tả dữ liệu cần viết       Mức      Kỳ vọng
  ━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    19    Chào hỏi giữa bạn bè         L0       label 0
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    20    Thông báo lịch học, giờ      L0       label 0
          thi hoặc bài tập
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    21    Khen ngoại hình hoặc         L0       label 0
          thành tích
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    22    Góp ý bài làm một cách       L0       label 0
          xây dựng
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    23    Không đồng ý nhưng dùng      L0       label 0
          ngôn ngữ lịch sự
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    24    Bộc lộ bực bội về sự         L0       label 0
          việc, không nhắm vào
          người
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    25    Tự chê nhẹ bản thân nhưng    L0/L1    Thường label 0
          không có ý tự hại
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    26    Đánh giá tiêu cực một sản    L0       label 0
          phẩm hoặc trò chơi
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    27    Cụm từ quyết liệt trong      L0/L1    label 0
          ngữ cảnh thi đấu thể thao
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    28    Nội dung y khoa có từ chỉ    L0       label 0
          bộ phận cơ thể
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    29    Bài học giải thích khái      L0       label 0
          niệm bắt nạt/ngôn từ thù
          ghét
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    30    Trích dẫn lời xúc phạm       L0/L1    Mong muốn label 0
          rồi phản đối lời đó
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    31    Bản tin tường thuật một      L0/L1    Mong muốn label 0
          lời đe dọa
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    32    Đối thoại hư cấu có đánh     L1       Đánh giá theo policy
          dấu rõ là trích đoạn
          truyện
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    33    Khuyến cáo không bắt nạt     L0       label 0
          người khác
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    34    Câu phủ định hành vi         L0       label 0
          đánh/chửi người khác
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    35    Cảnh báo người dùng không    L0       label 0
          thực hiện hành vi bạo lực
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    36    Câu hỏi phân tích xem một    L0/L1    Mong muốn label 0
          lời trích dẫn có độc hại
          không
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    37    Câu mỉa mai nhẹ, không       L1       Xác định theo policy
          gọi tên hay hạ nhục ai
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    38    Từ tục dùng như cảm thán,    L1       Xác định theo policy
          không nhắm vào người
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    39    Trêu đùa thân mật có tín     L1       Mong muốn label 0 nếu policy xét ngữ cảnh
          hiệu thân thiện rõ ràng
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    40    Tên riêng hoặc từ đồng âm    L0       label 0
          chứa chuỗi giống từ tục
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    41    Một người tự giới thiệu      L0       label 0
          danh tính/nhóm của mình
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    42    Từ từng mang tính miệt       L1       Cần labeling policy rõ
          thị nhưng được chính nhóm
          đó tự dùng
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    43    Câu an toàn tiếng Việt       L0       label 0
          không dấu
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    44    Câu an toàn trộn Việt–Anh    L0       label 0
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    45    Nội dung chỉ gồm emoji       L0       label 0
          tích cực
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    46    URL hoặc địa chỉ email       L0       label 0
          hợp lệ, không có bình
          luận
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    47    Nội dung chỉ gồm số, ngày    L0       label 0
          tháng hoặc mã học sinh
          giả
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    48    Danh sách an toàn có         L0       label 0
          nhiều dòng
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    49    Nội dung an toàn gần sát     L0       label 0, latency hợp lý
          giới hạn 1.200 ký tự
  ─────  ───────────────────────────  ───────  ───────────────────────────────────────────
    50    Từ trông độc hại chỉ xuất    L0/L1    Mong muốn label 0
          hiện bên trong URL, mã
          nguồn hoặc tên file

  ### C. Nội dung độc hại rõ ràng

  Các câu cụ thể do người test tự viết; nên dùng tên giả và không dùng dữ liệu cá nhân
  thật.

    ID    Mô tả dữ liệu cần viết                                 Mức      Kỳ vọng
  ━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━  ━━━━━━━━━
    51    Xúc phạm nhẹ trực tiếp người nghe                      L2       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    52    Chửi tục trực tiếp người nghe                          L2       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    53    Hạ nhục trí tuệ hoặc kết quả học tập                   L2       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    54    Miệt thị ngoại hình/cân nặng                           L2       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    55    Xúc phạm gia đình người nghe                           L2       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    56    Miệt thị giới tính                                     L2       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    57    Miệt thị xu hướng tính dục hoặc bản dạng giới          L2       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    58    Miệt thị vùng miền hoặc dân tộc                        L2       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    59    Miệt thị tôn giáo                                      L2       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    60    Miệt thị người khuyết tật                              L2       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    61    Hạ nhục hoàn cảnh kinh tế/xã hội                       L2       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    62    So sánh một người hoặc nhóm với vật thể thấp kém       L2       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    63    Kêu gọi cô lập hoặc đuổi một người khỏi nhóm           L2       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    64    Quấy rối tình dục bằng lời nói                         L2/L3    label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    65    Tung tin làm nhục một học sinh giả định                L2       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    66    Chuỗi bắt nạt lặp lại và gọi đích danh nhân vật giả    L2       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    67    Đe dọa bạo lực trực tiếp, có chủ thể và nạn nhân       L3       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    68    Đe dọa có điều kiện “nếu… thì…”                        L3       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    69    Đe dọa gián tiếp có thời gian hoặc địa điểm            L3       label 1
  ─────  ─────────────────────────────────────────────────────  ───────  ─────────
    70    Mong người khác chết hoặc khuyến khích tự gây hại      L3       label 1

  ### D. Khả năng chống né bộ lọc

  Dùng cùng một câu độc hại chuẩn làm “seed”, sau đó chỉ thay đổi cách viết. Như vậy có
  thể đo tính bất biến của model.

    ID    Biến đổi                   Mức      Kỳ vọng
  ━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    71    Bỏ toàn bộ dấu tiếng       L2/L3    Vẫn label 1
          Việt
  ─────  ─────────────────────────  ───────  ─────────────────────────────────────────────
    72    Viết tắt/teencode phổ      L2/L3    Vẫn label 1
          biến
  ─────  ─────────────────────────  ───────  ─────────────────────────────────────────────
    73    Cố ý sai chính tả hoặc     L2/L3    Vẫn label 1
          kéo dài chữ
  ─────  ─────────────────────────  ───────  ─────────────────────────────────────────────
    74    Chèn dấu chấm, gạch, ký    L2/L3    Vẫn label 1
          hiệu giữa chữ
  ─────  ─────────────────────────  ───────  ─────────────────────────────────────────────
    75    Chèn khoảng trắng giữa     L2/L3    Vẫn label 1
          từng ký tự
  ─────  ─────────────────────────  ───────  ─────────────────────────────────────────────
    76    Thay một số chữ bằng       L2/L3    Vẫn label 1
          chữ số
  ─────  ─────────────────────────  ───────  ─────────────────────────────────────────────
    77    Thay chữ Latin bằng        L2/L3    Vẫn label 1
          Unicode homoglyph gần
          giống
  ─────  ─────────────────────────  ───────  ─────────────────────────────────────────────
    78    Chèn zero-width            L2/L3    Vẫn label 1
          characters
  ─────  ─────────────────────────  ───────  ─────────────────────────────────────────────
    79    Thay động từ hoặc vật      L2/L3    Vẫn label 1
          thể bằng emoji
  ─────  ─────────────────────────  ───────  ─────────────────────────────────────────────
    80    Đặt nội dung trong         L2/L3    Vẫn label 1
          hashtag, mention hoặc
          URL giả
  ─────  ─────────────────────────  ───────  ─────────────────────────────────────────────
    81    Trộn tiếng Việt, tiếng     L2/L3    Vẫn label 1
          Anh và tiếng địa phương
  ─────  ─────────────────────────  ───────  ─────────────────────────────────────────────
    82    Đặt phần độc hại sau       L2/L3    Lý tưởng label 1; hiện dễ lộ lỗi truncation
          hơn 128 token an toàn
          nhưng tổng dưới 1.200
          ký tự

  ### E. /events, /stats, CORS, readiness và tải

  Các test từ 83–94 làm thay đổi SQLite. Nên chạy trên bản sao backend hoặc DB test riêng,
  không xóa cybershield_stats.db hiện có.

    ID    Kịch bản                          Mức            Kỳ vọng
  ━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    83    Gửi mỗi loại scanned, toxic,      N/A            200; field tương ứng trong
          threat, link, revealed một lần                   stats tăng đúng
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    84    Bỏ count                          N/A            Mặc định tăng 1
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    85    count=10000                       N/A            200 và tăng đúng 10.000
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    86    Thử count=0, -1, 10001, số        N/A            422
          thực, chuỗi
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    87    Type sai, thiếu type và type      N/A            422
          null
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    88    Timestamp hợp lệ cho hôm nay      N/A            Được đưa vào đúng bucket ngày
          và hôm qua
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    89    Timestamp sai định dạng           N/A            Hiện bị tính vào hôm nay; test
                                                           nên đánh dấu hành vi đáng ngờ
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    90    Timestamp sát nửa đêm với         N/A            Xác nhận rõ bucket theo ngày
          +07:00, Z, offset âm                             nào
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    91    GET /stats, range=day, và bỏ      N/A            Cùng schema, mặc định là day
          range
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    92    Dữ liệu ở hôm nay, 6 ngày         N/A            Week gồm đúng hôm nay đến 6
          trước, 7 ngày trước và tương                     ngày trước
          lai
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    93    Ghi events, restart server,       N/A            Số liệu còn nguyên
          đọc stats lại
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    94    Gửi đồng thời nhiều request /     N/A            Không mất count, không 500/
          events                                           SQLite locked
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    95    OPTIONS từ hai origin demo        N/A            Có access-control-allow-origin
          được cấu hình                                    đúng origin
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    96    OPTIONS từ website lạ và          N/A            Website lạ bị chặn; ghi nhận
          chrome-extension://<id>                          extension origin không được
                                                           allow
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    97    Khởi động bằng model thiếu/       N/A            Mong muốn readiness lỗi và /
          hỏng hoặc máy sạch không có                      predict 503; hiện dự kiến
          backbone cache                                   health vẫn 200, predict “an
                                                           toàn 100%”
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    98    Nhiều /predict đồng thời, xen     Theo corpus    Không timeout; health/stats
          kẽ /health và /stats                             không bị inference chặn quá
                                                           lâu
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
    99    Gửi burst lớn không               N/A            Hiện đều được nhận do chưa
          credentials                                      auth/rate-limit; đo latency và
                                                           lỗi tài nguyên
  ─────  ────────────────────────────────  ─────────────  ────────────────────────────────
   100    Khởi động từ backend/, sau đó     N/A            Cách đầu chạy; cách sau hiện
          thử uvicorn backend.server:app                   có thể lỗi import, xác nhận
          từ root                                          QA-018

  ## Thứ tự chạy đề xuất

  1. Chạy 1–18 để khóa HTTP contract.
  2. Chạy 19–82 thành corpus đánh giá AI.
  3. Chạy 83–94 trên DB test cô lập.
  4. Chạy 95–100 trong môi trường riêng để kiểm tra security, readiness và concurrency.
  5. Xuất ít nhất các số liệu:
      - false positive theo từng nhóm L0;
      - false negative theo L2 và L3;
      - tỷ lệ vượt qua biến thể né lọc 71–82;
      - p50/p95/p99 latency;
      - số response 5xx/timeout;
      - số trường hợp vi phạm confidence == max(proba).

  Điểm cần ưu tiên nhất trong lần test đầu là tìm các response có 0.4 <= p1 < 0.5. Đây là
  bằng chứng black-box trực tiếp cho mâu thuẫn hiện tại: API trả label độc hại nhưng
  confidence không phải xác suất lớn nhất.