import { NextResponse } from "next/server";
import { ensureDefaultTimesheet, getAuthenticatedAccount } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Timesheet from "@/models/Timesheet";

export const runtime = "nodejs";

export async function GET() {
  const account = await getAuthenticatedAccount();
  if (!account) return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
  try {
    await connectToDatabase();
    let sheets = await Timesheet.find({ ownerId: String(account._id) }).sort({ createdAt: 1 }).lean();
    if (!sheets.length) {
      const defaultName = account.role === "admin" ? "Thăng Hoa Thạch Lam" : "Bảng chấm công của tôi";
      await ensureDefaultTimesheet(String(account._id), defaultName);
      sheets = await Timesheet.find({ ownerId: String(account._id) }).sort({ createdAt: 1 }).lean();
    }
    return NextResponse.json({ timesheets: sheets.map((sheet) => ({ id: String(sheet._id), name: sheet.name, logicKey: sheet.logicKey })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tải danh sách bảng chấm công";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const account = await getAuthenticatedAccount();
  if (!account) return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
  try {
    const body = await request.json() as { name?: unknown };
    const name = String(body.name || "").trim();
    if (name.length < 2 || name.length > 100) return NextResponse.json({ error: "Tên bảng cần từ 2 đến 100 ký tự" }, { status: 400 });
    await connectToDatabase();
    const sheet = await Timesheet.create({ ownerId: String(account._id), name, logicKey: "standard" });
    return NextResponse.json({ timesheet: { id: String(sheet._id), name: sheet.name, logicKey: sheet.logicKey } }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return NextResponse.json({ error: "Bạn đã có bảng chấm công cùng tên" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Không thể tạo bảng chấm công";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
