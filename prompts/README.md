# Tự làm CyberShield bằng cách trò chuyện với coding agent

Bộ này dành cho người chưa biết lập trình. Bạn không cần biết extension gồm những file nào, dùng công cụ gì hay AI được đóng gói ra sao. Hãy hình dung mình đang nhờ một người làm sản phẩm: **nói điều muốn thấy, cách mình sẽ thử và điều không được xảy ra**. Coding agent chịu trách nhiệm chọn cách làm, viết mã và kiểm tra.

Mục tiêu là một tiện ích Chrome/Edge giống CyberShield hiện tại về trải nghiệm: che bình luận tiếng Việt có khả năng gây tổn thương; cho phép xem rồi che lại; cảnh báo link đáng ngờ; có bảng số liệu; chạy AI trên máy người dùng kể cả khi mất Internet. Việc dạy AI diễn ra trước lúc đóng gói, có thể cần bạn tự thao tác trên Kaggle. Kết quả dự đoán có thể khác dự án mẫu vì dữ liệu và lần huấn luyện khác.

## Hành trình bạn sẽ trải qua

| Bước | Bạn sẽ thấy hoặc làm gì | Prompt để dán |
| --- | --- | --- |
| 1 | Kể ý tưởng bằng lời thường; agent lập lộ trình dễ hiểu | [Tôi muốn làm tiện ích gì](01-toi-muon-lam-tien-ich-gi.md) |
| 2 | Cài được bản tiện ích đầu tiên, thấy cửa sổ nhỏ hiện lên | [Làm cho tiện ích xuất hiện](02-lam-cho-tien-ich-xuat-hien.md) |
| 3 | Link đáng ngờ được nhắc trước khi mở | [Nhắc trước link đáng ngờ](03-nhac-toi-truoc-link-dang-ngo.md) |
| 4 | Thử thao tác che/mở trên câu mẫu, chưa cần AI | [Thử cách che và mở](04-thu-cach-che-va-mo-noi-dung.md) |
| 5 | Tìm câu tiếng Việt có quyền sử dụng để dạy AI | [Tìm dữ liệu](05-tim-du-lieu-de-day-ai.md) |
| 6 | Chạy bài học AI trên Kaggle, tải kết quả về | [Dạy AI trên Kaggle](06-day-ai-hoc-tren-kaggle.md) |
| 7 | Đưa AI vào tiện ích; thử khi mất mạng | [Đưa AI vào tiện ích](07-dua-ai-vao-tien-ich-khong-can-mang.md) |
| 8 | Tiện ích tự quét bình luận trên trang và che khi cần | [Tự quét và che](08-tu-quet-trang-va-che-cau-doc-hai.md) |
| 9 | Xem số liệu, che lại từ cửa sổ tiện ích | [Đếm và điều khiển](09-dem-ket-qua-va-dieu-khien.md) |
| 10 | Có hai trang mẫu để tự thử | [Làm trang thử](10-lam-trang-de-tu-thu.md) |
| 11 | Kiểm tra toàn bộ và nhận hướng dẫn sử dụng | [Kiểm tra và bàn giao](11-kiem-tra-va-ban-giao.md) |

Các bước đầu tập trung vào thứ bạn nhìn và bấm được. Phần khó về AI chỉ xuất hiện sau khi tiện ích và cách che/mở đã dễ hình dung. Bạn không cần tự viết code AI: prompt số 06 yêu cầu agent chuẩn bị, còn bạn làm những thao tác Kaggle mà agent không thể bấm thay. Prompt số 07 yêu cầu agent đưa kết quả ấy vào tiện ích. Khi sử dụng xong, tiện ích không cần Kaggle hay một chương trình máy chủ chạy bên cạnh.

## Cách dùng từng prompt

1. Tạo một **thư mục mới, trống** cho dự án của bạn rồi mở thư mục đó trong Codex hoặc coding agent khác. Đừng mở thư mục source CyberShield mẫu để làm bài này: mục tiêu là tự dựng lại từ yêu cầu, không sao chép mã có sẵn.
2. Mở prompt số 01 ở bảng trên, sao chép toàn bộ nội dung và dán cho agent. Để agent làm xong, đọc phần nó nói bạn cần tự kiểm tra. Sau đó mới dán prompt số 02 vào **cùng dự án**. Tiếp tục như vậy; bạn có thể dùng cuộc trò chuyện mới nếu agent đọc được thư mục dự án và ghi chú tiến độ đã tạo.
3. Mỗi bước, hãy tự làm thử điều được mô tả trong cột giữa. Nếu kết quả khác lời agent nói, đưa ảnh chụp màn hình hoặc thông báo lỗi cho agent và yêu cầu sửa ngay bước đó. Đừng chuyển bước chỉ vì agent nói “đã xong”.
4. Nếu agent cần bạn tải dữ liệu, chạy Kaggle hoặc cài tiện ích, hãy yêu cầu chỉ dẫn từng thao tác. Sau khi làm xong, gửi lại kết quả cho agent kiểm tra. Thiếu kết quả Kaggle thì bước 07 chưa thể xác nhận AI thật chạy được.

Bạn có thể dán câu này bất cứ khi nào bị kẹt:

> Tôi không hiểu bước này. Đây là điều tôi đã bấm/làm: … Đây là điều tôi thấy hoặc thông báo lỗi: … Hãy kiểm tra dự án hiện tại, sửa phần bạn làm được, rồi chỉ cho tôi từng thao tác còn lại. Đừng chuyển bước hoặc báo đạt khi tôi chưa thấy kết quả.

Một vài từ hay gặp: “huấn luyện” nghĩa là cho AI học từ các câu có nhãn; “kết quả AI” là gói được tải về sau khi học; “chạy offline” nghĩa là lúc dùng tiện ích không phải gửi câu bạn đọc lên Internet. Bạn chỉ cần hiểu đến mức đó để dùng bộ prompt này.

## Tự viết một prompt tương tự

Bạn không cần chỉ agent tạo file nào. Hãy điền năm ý sau bằng lời của mình:

> Tôi muốn **[điều mình muốn làm]**. Khi **[tình huống xảy ra]**, tôi muốn nhìn thấy **[kết quả cụ thể]**. Tôi sẽ thử bằng cách **[vài thao tác có thể tự bấm]**. Điều không được xảy ra là **[lỗi hoặc điều mình không chấp nhận]**. Tôi không biết code; hãy tự chọn cách làm, thực hiện trong dự án này, kiểm tra kết quả rồi hướng dẫn tôi phần phải tự làm.

Ví dụ, nếu sau này muốn tạm ngừng CyberShield trên một trang, bạn có thể viết:

> Tôi muốn có nút tạm dừng CyberShield cho trang đang xem. Khi tôi bấm nút, những đoạn đang che trên trang đó hiện lại; khi tôi bật lại, tiện ích tiếp tục kiểm tra. Tôi sẽ thử bằng cách mở hai trang khác nhau và tạm dừng một trang. Trang còn lại vẫn phải được bảo vệ. Tôi không biết cần sửa chỗ nào; hãy tự làm, kiểm tra và chỉ tôi cách thử.

Một prompt tốt không cần dài hoặc nhiều thuật ngữ. Nó cần nói rõ **người dùng làm gì, nhìn thấy gì và kiểm tra bằng cách nào**. Nếu agent hỏi bạn “muốn sửa file nào?” hoặc “chọn thư viện nào?”, bạn có thể trả lời: “Bạn hãy tự quyết định phần kỹ thuật; giải thích lựa chọn bằng lời dễ hiểu và chỉ hỏi tôi về trải nghiệm tôi muốn.”
