# Travel Ops Suite

Web app tiếng Việt cho điều hành tour & vé máy bay (Next.js 16, React 19, TypeScript). Gồm 3 công cụ:

| Tab | Chức năng |
|---|---|
| **01 Săn vé** | Quét Google Flights theo khoảng ngày + thứ khởi hành + tổng số ngày, bay thẳng / ≤1 điểm dừng, lọc hãng & giá trần, xuất CSV |
| **02 Tối ưu tour** | Quét mẫu cả 7 thứ trong mùa tour, thống kê giá TB / đáy / độ ổn định / % bay thẳng / hãng, chấm điểm /10, khuyến nghị thứ nên chọn – nên tránh, biểu đồ + bản đồ nhiệt |
| **03 Visa UK** | Dán hồ sơ khách (Việt/Czech/Anh), Claude bóc tách theo 6 nhóm mục form UK Standard Visitor, tiếng Anh chuẩn, ngày `DD Month YYYY`, mục thiếu gắn `NOT PROVIDED — ask the client` |

## Chạy

```bash
npm install
cp .env.example .env.local   # điền ANTHROPIC_API_KEY (chỉ cần cho Tab 3)
npm run dev                  # http://localhost:3000
```

Triển khai: `vercel deploy` (hoặc bất kỳ nền tảng Node serverless nào). Đặt biến môi trường `ANTHROPIC_API_KEY`.

## Cách lấy dữ liệu vé (không API trả phí, không headless browser)

- `lib/tfs.ts` tự mã hoá protobuf tham số `tfs` của Google Flights (chặng, ngày, sân bay, `max_stops` 0/1, mã hãng, khứ hồi/một chiều) → base64url.
- `lib/gflights.ts` tải HTML bằng `fetch` (kèm cookie consent EU) và dùng **node-html-parser** đọc `aria-label` của từng thẻ chuyến bay (giá, hãng, giờ đi/đến, +1 ngày, thời lượng, điểm dừng, quá cảnh); có phương án dự phòng theo class CSS.
- Mỗi cặp ngày = 1 truy vấn khứ hồi (tổng giá) + 1 truy vấn một chiều cho giờ bay chiều về tham khảo (có thể tắt).
- Trình duyệt chạy hàng đợi song song 1–5 luồng (mặc định 4) với độ trễ ngẫu nhiên, giới hạn 120 cặp ngày/đợt. Kết quả đổ dần vào bảng.
- Google trả trang captcha (`/sorry/`) khi truy vấn dồn dập → được nhận diện là `RATE_LIMITED`; sau 3 lần liên tiếp app tự dừng. Các cặp lỗi có nút **Thử lại**.

> Lưu ý: dùng dữ liệu Google Flights theo cách này phụ thuộc cấu trúc trang của Google và có thể bị chặn theo IP. IP của nền tảng cloud dùng chung dễ bị captcha hơn – giảm số luồng nếu gặp lỗi.

## Tab 3 – bảo mật & AI

- `app/api/visa/route.ts` gọi Claude (`claude-opus-5-5`, structured output theo schema Zod) – không log, không lưu DB; dữ liệu chỉ tồn tại trên trình duyệt.
- Danh sách câu hỏi và thứ tự nằm ở `lib/visaQuestions.ts` (đã loại bỏ câu hỏi an ninh/tiền án). Server tự bổ sung mục AI bỏ sót thành "thiếu".
- Bật server-side fallback (`fallbacks: "default"`): nếu model chính từ chối do bộ lọc an toàn, API tự chạy lại trên model dự phòng.
