# Supabase cho dữ liệu chấm công

Ứng dụng dùng Supabase làm nơi đọc/ghi chính cho đăng nhập, tài khoản, ngày công và hệ số lương tuần. Khi lưu, API chờ Supabase xác nhận rồi trả kết quả; MongoDB được ghi ngay sau response bằng `after()` của Next.js. Nếu Supabase không cấu hình được hoặc bị lỗi, API chuyển sang đọc/ghi MongoDB; truy vấn Supabase bị timeout sau 5 giây sẽ được xem là lỗi. Lỗi ghi bản sao MongoDB được ghi vào log máy chủ.

Danh sách bảng chấm công và dữ liệu xác thực một lần khi đăng nhập admin/di trú lần đầu vẫn dùng MongoDB. Hash và salt mật khẩu được lưu trong bảng `app_accounts`, chỉ truy cập bằng khóa server.

## Cài đặt

1. Trước khi kích hoạt bảng tài khoản Supabase, đăng nhập app hiện tại một lần nếu MongoDB chưa hoàn tất chuyển dữ liệu cũ sang tài khoản/bảng công. Bước này chạy `bootstrapAdminAndMigrate` trên MongoDB.
2. Tạo project Supabase và chạy nội dung `supabase/migrations/20261121000000_attendance_tables.sql` trong SQL Editor. Nếu đã chạy bản cũ, chạy lại file để tạo thêm bảng `app_accounts`.
3. Lấy Project URL và **Secret API key** trong Supabase Dashboard, rồi điền vào `.env.local`:

   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...
   ```

   Có thể dùng khóa `service_role` cũ bằng `SUPABASE_SERVICE_ROLE_KEY`; khóa mới `sb_secret_...` được khuyến nghị. Các khóa này chỉ được dùng ở máy chủ, không thêm tiền tố `NEXT_PUBLIC_`.

4. Trước khi chạy phiên bản mới, nhập dữ liệu hiện có từ MongoDB vào Supabase:

   ```bash
   npm run migrate:supabase
   ```

   Lệnh đọc `MONGODB_URI`, `SUPABASE_URL` và khóa Supabase từ môi trường hoặc từ `.env` / `.env.local` (`.env.local` được ưu tiên). Có thể chạy lại an toàn; tài khoản, ngày công và lương tuần được nhập theo ID/khóa duy nhất.
5. Deploy/khởi động phiên bản mới sau khi lệnh import báo đã xử lý tài khoản. Đăng nhập sẽ tìm tài khoản trong `app_accounts`; MongoDB chỉ được hỏi khi Supabase gặp lỗi, không phải khi truy vấn thành công nhưng không có tài khoản.

Migration bật RLS và chỉ cấp quyền bảng cho `service_role`. Secret key chỉ được gửi từ API máy chủ sau khi API đã xác thực tài khoản và quyền truy cập bảng công.
