# Chốt Công

Ứng dụng Next.js để ghi nhận ca làm, tổng hợp giờ theo tuần, xuất nội dung chốt công và tính lương theo tuần hoặc tháng sau khi nhập hệ số theo giờ. Có thể nhập tiền thực riêng cho ngày đặc biệt; ngày công, tiền thực, tên người làm chung và hệ số lương được lưu trong MongoDB.

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
- **Ghi nhận ca làm:** chọn ngày, một hoặc nhiều ca, chỉnh giờ vào/ra thực tế theo bước 30 phút nếu cần, nhập giờ làm thêm theo bước 0,5 giờ, tiền thực của ngày đặc biệt và tên người làm chung nếu có. Tiền thực được ưu tiên cho ngày đó; để trống thì lương tính theo tổng giờ nhân hệ số tuần.
- **Tính công theo tuần:** nhập hệ số lương theo giờ, xem tổng giờ và tiền công theo từng ngày. Sau khi lưu thêm ca hoặc cập nhật tiền thực một ngày, tổng lương tuần cập nhật theo dữ liệu đã lưu.
- **Tính công theo tháng:** tính các ngày từ ngày 1 đến ngày cuối tháng, kể cả khi ngày 1 nằm giữa tuần; tuần đầu và tuần cuối chỉ tính những ngày thuộc tháng. Ngày có tiền thực dùng số tiền đã nhập, các ngày khác dùng hệ số của tuần. Nếu còn ngày chưa nhập tiền thực và tuần đó chưa có hệ số, tổng lương sẽ chờ đủ dữ liệu. Tab tháng cũng có text chốt công riêng, chỉ lấy ngày làm thuộc tháng đang chọn và tự cập nhật khi đổi tháng.

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
