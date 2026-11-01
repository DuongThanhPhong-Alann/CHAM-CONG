import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chốt Công | Quản lý ca làm",
  description: "Ghi nhận ca làm, chốt công và tính lương theo tuần.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
