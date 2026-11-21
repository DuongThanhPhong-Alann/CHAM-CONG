# Supabase cho dữ liệu chấm công

Ứng dụng dùng Supabase làm nơi đọc/ghi chính cho ngày công và hệ số lương tuần. Mỗi lần lưu, API ghi đồng thời vào Supabase và MongoDB. Nếu Supabase không cấu hình được, lỗi hoặc quá 5 giây, API đọc từ MongoDB; thao tác ghi vẫn thử cả hai nơi và báo trong log nếu chỉ một nơi lưu thành công.

Đăng nhập, tài khoản và danh sách bảng chấm công vẫn dùng MongoDB.

## Cài đặt

1. Tạo project Supabase và chạy nội dung `supabase/migrations/20261121000000_attendance_tables.sql` trong SQL Editor.
2. Lấy Project URL và **Secret API key** trong Supabase Dashboard, rồi điền vào `.env.local`:

   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...
   ```

   Có thể dùng khóa `service_role` cũ bằng `SUPABASE_SERVICE_ROLE_KEY`; khóa mới `sb_secret_...` được khuyến nghị. Các khóa này chỉ được dùng ở máy chủ, không thêm tiền tố `NEXT_PUBLIC_`.

3. Đăng nhập ứng dụng ít nhất một lần để MongoDB hoàn tất chuyển dữ liệu cũ sang tài khoản và bảng công hiện tại.
4. Nhập dữ liệu hiện có từ MongoDB vào Supabase:

   ```bash
   npm run migrate:supabase
   ```

   Lệnh đọc `MONGODB_URI`, `SUPABASE_URL` và khóa Supabase từ môi trường hoặc từ `.env` / `.env.local` (`.env.local` được ưu tiên). Có thể chạy lại an toàn; dữ liệu được gộp theo tài khoản, bảng công, nhân viên và ngày/tuần.
5. Khởi động lại ứng dụng. Khi Supabase đọc thành công nhưng không tìm thấy dòng nào, API trả danh sách rỗng đó; MongoDB chỉ được dùng làm đường dự phòng khi request Supabase lỗi.

Migration bật RLS và chỉ cấp quyền bảng cho `service_role`. Secret key chỉ được gửi từ API máy chủ sau khi API đã xác thực tài khoản và quyền truy cập bảng công.
