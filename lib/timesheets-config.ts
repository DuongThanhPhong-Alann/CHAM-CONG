/**
 * CẤU HÌNH BẢNG CHẤM CÔNG TỪ CODE GỐC
 * 
 * Mỗi bảng chấm công trong hệ thống được định nghĩa trực tiếp từ code gốc tại đây.
 * Khi cần thêm bảng chấm công mới, chỉ cần khai báo thêm vào mảng `CONFIGURED_TIMESHEETS` bên dưới.
 * Khi được thêm vào code, bảng sẽ tự động xuất hiện trên danh sách chọn bảng của ứng dụng.
 */

export type ConfiguredTimesheet = {
  name: string;
  logicKey: string;
  role?: "admin" | "user" | "all";
};

export const CONFIGURED_TIMESHEETS: ConfiguredTimesheet[] = [
  // Bảng mặc định cho Admin
  {
    name: "Thăng Hoa Thạch Lam",
    logicKey: "standard",
    role: "all",
  },
  // Bảng mặc định cho tài khoản User thường
  {
    name: "Bảng chấm công của tôi",
    logicKey: "standard",
    role: "user",
  },
  /* Ví dụ khi cần thêm bảng mới từ code gốc, chỉ cần bỏ ghi chú hoặc thêm dòng mới:
  {
    name: "Bảng Ca Tối - Chi Nhánh 1",
    logicKey: "standard",
    role: "all",
  },
  */
];
