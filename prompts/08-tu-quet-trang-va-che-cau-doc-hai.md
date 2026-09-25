# 08 — Tự quét trang và che câu độc hại

Bây giờ tôi muốn CyberShield tự làm việc trên trang đang đọc. Khi trang vừa mở hoặc khi bình luận mới xuất hiện, tiện ích kiểm tra các đoạn chữ tiếng Việt phù hợp. Nếu AI đánh giá khả năng độc hại từ 60% trở lên, đoạn đó được che theo cách tôi đã thử ở chặng 04. Nếu thấp hơn, nó được để nguyên. Tôi muốn xem lại bằng chuột hoặc bàn phím, và có thể che lại sau này. Không hỏi tôi phải chọn phần tử hay file nào.

Hãy nối AI thật vào phần che/mở đã làm, rồi bỏ mọi cách nhận diện mẫu tạm thời của chặng 04 khỏi luồng dùng thật. Hãy tránh đọc nội dung tôi đang gõ trong ô nhập, vùng soạn thảo, nội dung bị ẩn và chính chữ do tiện ích tạo ra. Nếu bình luận cũ thay đổi, hoặc nội dung đang ẩn trở thành hiện, hãy kiểm tra lại. Trang có nhiều nội dung vẫn cần dùng được; đừng kiểm tra lặp vô hạn hoặc làm trang giật mạnh. Khi AI đang nạp, đừng bỏ quên những câu chưa kịp kiểm tra.

Tạo vài ví dụ trên trang thử để tôi thấy câu mới được thêm, câu cũ bị sửa, một câu có chữ in đậm hoặc link ở giữa và một ô soạn thảo không bị đụng tới. Tự chạy kiểm tra và sửa lỗi; khi báo kết quả, chỉ rõ điều nào đã thử bằng chương trình, điều nào phải xem trong trình duyệt thật. Nhắc tôi rằng AI có thể đoán sai và việc che không phải đánh giá con người. Ghi lại tiến độ.
