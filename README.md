# Chốt Công

Ứng dụng Next.js để ghi nhận ca làm, tổng hợp giờ theo tuần, xuất nội dung chốt công và tính lương sau khi nhập hệ số theo giờ. Ngày công, tên người làm chung và hệ số lương được lưu trong MongoDB.

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
- **Ghi nhận ca làm:** chọn ngày, một hoặc nhiều ca và nhập tên người làm chung nếu có.
- **Tính công theo tuần:** nhập hệ số lương theo giờ, xem tổng giờ và tiền công theo từng ngày. Sau khi lưu thêm ca, tổng lương của tuần cập nhật theo hệ số đã lưu.

Khoảng tuần luôn hiển thị đủ ngày bắt đầu và ngày kết thúc, gồm cả năm.

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

Có thể chọn nhiều ca trong ngày, tối đa 14 tiếng/ngày. Tuần tính từ thứ Hai đến Chủ nhật. Text chốt công chỉ lấy các ngày có giờ làm trong tuần đang chọn. Hệ số lương được lưu riêng cho từng nhân viên và từng tuần.
