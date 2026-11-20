# Chốt Công

Ứng dụng Next.js để ghi nhận ca làm, tổng hợp giờ theo tuần, xuất nội dung chốt công và tính lương theo tuần hoặc tháng sau khi nhập hệ số theo giờ. Có thể nhập mức lương riêng theo giờ cho ngày đặc biệt; ngày công, mức lương riêng, tên người làm chung và hệ số lương được lưu trong MongoDB.

## Chạy ứng dụng

1. Cài Node.js 20.9 trở lên.
2. Tạo cơ sở dữ liệu MongoDB local hoặc MongoDB Atlas.
3. Sao chép `.env.example` thành `.env.local` và điền chuỗi kết nối:

   ```env
   MONGODB_URI=mongodb+srv://.../cham_cong?retryWrites=true&w=majority
   ```

4. Cài gói và chạy ứng dụng:

   ```bash
   npm install
   npm run dev
   ```

5. Mở `http://localhost:3000`.

## Các tab

- **Ca trong tuần · text:** xem lịch từ thứ Hai đến Chủ nhật, danh sách ca đã ghi và sao chép text chốt công cho đúng tuần đang chọn.
- **Ghi nhận ca làm:** chọn ngày, một hoặc nhiều ca, nhập số giờ thực tế trực tiếp hoặc chỉnh giờ vào/ra theo bước 30 phút (hai cách cập nhật lẫn nhau), nhập giờ làm thêm theo bước 0,5 giờ, mức lương riêng theo giờ cho ngày đặc biệt và tên người làm chung nếu có. Ví dụ, ca A làm 5 tiếng thì nhập 5 tiếng; giờ tan tự cập nhật theo giờ vào. Mức riêng được nhân với tổng giờ trong ngày; để trống thì dùng hệ số tuần.
- **Ghi/xóa nhiều ngày:** chọn nhiều ngày trong tháng để thêm cùng một ca hoặc xóa công đã ghi. Ca được thêm vào các ca hiện có, ngày đã có ca đó sẽ bỏ qua; thao tác xóa yêu cầu xác nhận.
- **Tính công theo tuần:** nhập hệ số lương theo giờ, xem tổng giờ và tiền công theo từng ngày. Sau khi lưu thêm ca hoặc cập nhật mức lương riêng của một ngày, tổng lương tuần cập nhật theo dữ liệu đã lưu.
- **Tính công theo tháng:** tính các ngày từ ngày 1 đến ngày cuối tháng, kể cả khi ngày 1 nằm giữa tuần; tuần đầu và tuần cuối chỉ tính những ngày thuộc tháng. Mức lương riêng của ngày được nhân với số giờ; nếu không có thì dùng hệ số tuần. Ngày thiếu cả hai mức sẽ bị bỏ qua, còn các khoản tính được vẫn được cộng vào tổng. Tab tháng cũng có text chốt công riêng, chỉ lấy ngày làm thuộc tháng đang chọn và tự cập nhật khi đổi tháng.
- **Bảng công tháng:** xem toàn bộ ngày trong tháng theo hàng, gồm thứ, ca và giờ làm, mức lương riêng theo giờ, hệ số tuần, tiền công và trạng thái. Bấm ngày để mở phần ghi công và chỉnh sửa ngày đó.

Có thể chọn trực tiếp tuần cũ bằng bộ chọn tuần, kể cả tuần chưa nhập hệ số. Khoảng tuần luôn hiển thị đủ ngày bắt đầu và ngày kết thúc, gồm cả năm.

## Quy tắc ca

| Ca | Giờ hiển thị | Số giờ |
| --- | --- | ---: |
| A | 8–12 | 4 |
| B | 12–18 | 6 |
| C | 18–22 | 4 |
| F2 | 16–22 | 6 |
| F1 | 8–16 | 8 |
| BC | 12–22 | 10 |
| FA | 8–18 | 10 |
| FB | 14–22 | 8 |
| O | Nghỉ | 0 |

Có thể chọn nhiều ca trong ngày; tổng giờ ca cộng giờ làm thêm tối đa 14 tiếng/ngày. Tuần tính từ thứ Hai đến Chủ nhật. Text chốt công hiển thị giờ vào/ra thực tế, có cộng giờ làm thêm vào giờ tan của ca cuối. Text chốt công tuần chỉ lấy các ngày có giờ làm đến ngày đang chọn trong tuần; text tháng chỉ lấy các ngày có giờ làm trong tháng đang chọn. Hệ số lương được lưu riêng cho từng nhân viên và từng tuần.

## Đăng nhập, tài khoản và nhiều bảng chấm công

- Cấu hình `AUTH_SESSION_SECRET` (chuỗi ngẫu nhiên tối thiểu 32 ký tự), `AUTH_ADMIN_NAME`, `AUTH_ADMIN_PHONE`, `AUTH_ADMIN_EMAIL` và `AUTH_ADMIN_PASSWORD` cùng môi trường với `MONGODB_URI`. Tài khoản admin được tạo một lần từ các giá trị này; mật khẩu lưu dạng băm có muối, phiên đăng nhập dùng cookie HttpOnly.
- Lần đầu mở ứng dụng, dữ liệu chấm công và hệ số lương cũ được chuyển vào tài khoản admin và bảng **Thăng Hoa Thạch Lam**. Việc chuyển dữ liệu được đánh dấu trong MongoDB để không chạy lại mỗi lần tải trang.
- Mỗi tài khoản chỉ xem được bảng và dữ liệu của chính tài khoản đó. API kiểm tra quyền admin khi liệt kê, thêm, sửa hoặc xóa tài khoản; giao diện tài khoản chỉ hiện với admin.
- Sau đăng nhập có thể chọn hoặc tạo bảng chấm công. Mỗi bảng lưu `logicKey` riêng để bổ sung cách tính khác sau này; bảng mới hiện dùng logic chấm công hiện tại.
- Khi chạy trên Vercel hoặc máy chủ khác, thêm các biến xác thực nêu trên vào phần Environment Variables của môi trường đó rồi triển khai lại. `.env.local` chỉ dùng tại máy đang phát triển và không được đưa lên Git.
