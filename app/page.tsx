"use client";

import { useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import Image from "next/image";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  Copy,
  FileText,
  Leaf,
  Menu,
  Plus,
  Sparkles,
  Table,
  Trash2,
  TreePine,
  UsersRound,
  Wallet,
  Waves,
  X,
} from "lucide-react";
import { addDays, dateLabel, isoWeekValue, localDateString, mondayFromIsoWeek, mondayOf } from "@/lib/dates";
import { SHIFT_OPTIONS, type Shift, type ShiftCode } from "@/lib/shifts";

type AttendanceEntry = {
  _id: string;
  employeeName: string;
  date: string;
  shifts: Shift[];
  coworkers: string[];
  totalHours: number;
  extraHours?: number;
  actualPay?: number | null;
};

type WeeklySummary = {
  weekStart: string;
  weekEnd: string;
  periodStart: string;
  periodEnd: string;
  hours: number;
  hourlyRate: number | null;
  missingRateDays: number;
  pay: number;
};

type MonthlyAttendanceEntry = AttendanceEntry;
type ShiftTimeDraft = { start: string; end: string };

const WEEKDAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
const SHORT_WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const TAB_LABELS = {
  week: "Ca trong tuần · text",
  entry: "Ghi nhận ca làm",
  bulk: "Ghi/xóa nhiều ngày",
  payroll: "Tính công theo tuần",
  monthly: "Tính công theo tháng",
  sheet: "Bảng công tháng",
} as const;
const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

function hoursLabel(hours: number) {
  return `${hours} tiếng`;
}

function hoursToTimeInput(hours: number) {
  const minutes = Math.round(hours * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function timeInputToHours(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  return (Number(match[1]) * 60 + Number(match[2])) / 60;
}

function formatWorkTime(hours: number) {
  const minutes = Math.round(hours * 60);
  const wholeHours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? String(wholeHours) : `${wholeHours}:${String(remainingMinutes).padStart(2, "0")}`;
}

function actualShifts(record: AttendanceEntry) {
  const shifts = record.shifts.filter((shift) => shift.hours > 0).map((shift) => ({ ...shift }));
  const extraHours = record.extraHours ?? 0;
  if (extraHours > 0 && shifts.length > 0) {
    const lastShift = shifts.reduce((latest, shift) => shift.end > latest.end ? shift : latest);
    lastShift.end += extraHours;
  }
  return shifts.sort((a, b) => a.start - b.start);
}

function shiftTimeSummary(record: AttendanceEntry) {
  return actualShifts(record)
    .map((shift) => `${shift.code} ${formatWorkTime(shift.start)}-${formatWorkTime(shift.end)}`)
    .join(" · ");
}

function withoutEndingPunctuation(value: string) {
  return value.replace(/[.!?]+$/, "");
}

function formatWeekRange(start: string, end: string) {
  const formatFullDate = (value: string) => {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  };
  return `ngày ${formatFullDate(start)} đến ngày ${formatFullDate(end)}`;
}

function formatMonthLabel(month: string) {
  if (!month) return "";
  const [year, number] = month.split("-").map(Number);
  return new Date(year, number - 1, 1, 12).toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
}

function createExportText(employeeName: string, records: AttendanceEntry[], throughDate: string, heading = "Chốt công") {
  const lines = records
    .filter((record) => record.totalHours > 0 && (!throughDate || record.date <= throughDate))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((record) => {
      const intervals = actualShifts(record)
        .map((shift) => `${formatWorkTime(shift.start)}-${formatWorkTime(shift.end)}`)
        .join(", ");
      return `${dateLabel(record.date)}: ${intervals} (${record.totalHours})`;
    });
  return [heading, employeeName.trim() || "Nhân viên", ...lines].join("\n");
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"week" | "entry" | "bulk" | "payroll" | "monthly" | "sheet">("week");
  const [employeeName, setEmployeeName] = useState("Thanh Phong");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [attendance, setAttendance] = useState<AttendanceEntry[]>([]);
  const [monthlyAttendance, setMonthlyAttendance] = useState<MonthlyAttendanceEntry[]>([]);
  const [monthlyWeeks, setMonthlyWeeks] = useState<WeeklySummary[]>([]);
  const [sheetZoom, setSheetZoom] = useState(1);
  const sheetPinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const [bulkMode, setBulkMode] = useState<"add" | "delete">("add");
  const [bulkSelectedDates, setBulkSelectedDates] = useState<string[]>([]);
  const [bulkShiftCode, setBulkShiftCode] = useState<ShiftCode>("A");
  const [savingBulk, setSavingBulk] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<ShiftCode[]>([]);
  const [shiftTimeDrafts, setShiftTimeDrafts] = useState<Record<string, ShiftTimeDraft>>({});
  const [extraHoursDraft, setExtraHoursDraft] = useState("0");
  const [actualPayDraft, setActualPayDraft] = useState("");
  const [coworkersInput, setCoworkersInput] = useState("");
  const [hourlyRate, setHourlyRate] = useState<number | null>(null);
  const [rateDraft, setRateDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [successAction, setSuccessAction] = useState<"add" | "delete" | "edit">("add");
  const [copied, setCopied] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    const today = localDateString(new Date());
    setSelectedDate(today);
    setSelectedMonth(today.slice(0, 7));
  }, []);

  useEffect(() => {
    if (!error && !message) return;
    const timeout = window.setTimeout(() => {
      setError("");
      setMessage("");
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [error, message]);

  const weekStart = useMemo(() => (selectedDate ? mondayOf(selectedDate) : ""), [selectedDate]);
  const weekEnd = useMemo(() => (weekStart ? addDays(weekStart, 6) : ""), [weekStart]);
  const selectedShifts = selectedCodes.map((code) => {
    const option = SHIFT_OPTIONS.find((shift) => shift.code === code)!;
    if (code === "O") return { code, start: 0, end: 0, hours: 0, valid: true };
    const draft = shiftTimeDrafts[code] ?? { start: hoursToTimeInput(option.start), end: hoursToTimeInput(option.end) };
    const start = timeInputToHours(draft.start);
    const end = timeInputToHours(draft.end);
    const valid = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end <= 24 && end > start;
    return { code, start, end, hours: valid ? end - start : 0, valid };
  });
  const validShiftTimes = selectedShifts.every((shift) => shift.valid);
  const parsedExtraHours = extraHoursDraft.trim() === "" ? 0 : Number(extraHoursDraft);
  const hasWorkShift = selectedShifts.some((shift) => shift.code !== "O");
  const validExtraHours = Number.isFinite(parsedExtraHours)
    && parsedExtraHours >= 0
    && (parsedExtraHours === 0 || hasWorkShift);
  const parsedActualPay = actualPayDraft.trim() === "" ? null : Number(actualPayDraft);
  const validActualPay = parsedActualPay === null || (Number.isFinite(parsedActualPay) && parsedActualPay >= 0);
  const selectedTotalHours = selectedShifts.reduce((total, shift) => total + shift.hours, 0) + (validExtraHours ? parsedExtraHours : 0);
  const latestSelectedShift = selectedShifts
    .filter((shift) => shift.code !== "O")
    .sort((a, b) => b.end - a.end)[0];
  const weeklyHours = attendance.reduce((total, record) => total + record.totalHours, 0);
  const weeklyMissingRateDays = attendance.filter((record) => record.totalHours > 0 && record.actualPay == null && hourlyRate === null).length;
  const estimatedPay = attendance.reduce((total, record) => {
    if (record.actualPay != null) return total + record.totalHours * record.actualPay;
    return total + (hourlyRate === null ? 0 : record.totalHours * hourlyRate);
  }, 0);
  const monthlyHours = monthlyWeeks.reduce((total, week) => total + week.hours, 0);
  const monthlyMissingRateDays = monthlyWeeks.reduce((total, week) => total + week.missingRateDays, 0);
  const monthlyPay = monthlyWeeks.reduce((total, week) => total + week.pay, 0);
  const sheetRows = useMemo(() => {
    if (!selectedMonth) return [];
    const [year, month] = selectedMonth.split("-").map(Number);
    const dayCount = new Date(year, month, 0, 12).getDate();
    const recordByDate = new Map(monthlyAttendance.map((record) => [record.date, record]));
    const rateByWeek = new Map(monthlyWeeks.map((week) => [week.weekStart, week.hourlyRate]));
    return Array.from({ length: dayCount }, (_, index) => {
      const date = `${selectedMonth}-${String(index + 1).padStart(2, "0")}`;
      const record = recordByDate.get(date);
      const hourlyRate = rateByWeek.get(mondayOf(date)) ?? null;
      const pay = !record
        ? null
        : record.actualPay != null
          ? record.totalHours * record.actualPay
          : hourlyRate !== null
            ? record.totalHours * hourlyRate
            : record.totalHours === 0
              ? 0
              : null;
      const weekday = new Date(`${date}T12:00:00`).toLocaleDateString("vi-VN", { weekday: "long" });
      return { date, weekday, record, hourlyRate, pay };
    });
  }, [selectedMonth, monthlyAttendance, monthlyWeeks]);
  const monthlyWorkDays = monthlyAttendance.filter((record) => record.totalHours > 0).length;
  const bulkCalendarCells = useMemo(() => {
    if (!selectedMonth) return [];
    const [year, month] = selectedMonth.split("-").map(Number);
    const firstOffset = (new Date(year, month - 1, 1, 12).getDay() + 6) % 7;
    const dayCount = new Date(year, month, 0, 12).getDate();
    const cells: (string | null)[] = Array.from({ length: firstOffset }, () => null);
    for (let day = 1; day <= dayCount; day += 1) {
      cells.push(`${selectedMonth}-${String(day).padStart(2, "0")}`);
    }
    return cells;
  }, [selectedMonth]);
  function startSheetPinch(event: ReactTouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 2) return;
    const first = event.touches[0];
    const second = event.touches[1];
    sheetPinchStart.current = {
      distance: Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
      zoom: sheetZoom,
    };
  }

  function moveSheetPinch(event: ReactTouchEvent<HTMLDivElement>) {
    const start = sheetPinchStart.current;
    if (!start || event.touches.length !== 2 || start.distance === 0) return;
    const first = event.touches[0];
    const second = event.touches[1];
    const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
    setSheetZoom(Math.min(1.8, Math.max(0.7, start.zoom * distance / start.distance)));
  }

  function endSheetPinch(event: ReactTouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2) sheetPinchStart.current = null;
  }

  function adjustSheetZoom(amount: number) {
    setSheetZoom((current) => Math.min(1.8, Math.max(0.7, Math.round((current + amount) * 100) / 100)));
  }

  const exportText = useMemo(() => createExportText(employeeName, attendance, selectedDate), [employeeName, attendance, selectedDate]);
  const monthlyExportText = useMemo(
    () => createExportText(employeeName, monthlyAttendance, "", `Chốt công ${formatMonthLabel(selectedMonth)}`),
    [employeeName, monthlyAttendance, selectedMonth],
  );

  async function loadWeek(week: string, name: string) {
    if (!week) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ weekStart: week, employee: name.trim() || "Thanh Phong" });
      const response = await fetch(`/api/attendance?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không tải được dữ liệu tuần");
      setAttendance(data.attendance as AttendanceEntry[]);
      setHourlyRate(typeof data.hourlyRate === "number" ? data.hourlyRate : null);
      setRateDraft(data.hourlyRate === null ? "" : String(data.hourlyRate));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không tải được dữ liệu");
      setAttendance([]);
      setHourlyRate(null);
      setRateDraft("");
    } finally {
      setLoading(false);
    }
  }

  async function loadMonth(month: string, name: string) {
    if (!month) return;
    setMonthlyLoading(true);
    setError("");
    setMonthlyWeeks([]);
    setMonthlyAttendance([]);
    try {
      const params = new URLSearchParams({ month, employee: name.trim() || "Thanh Phong" });
      const response = await fetch(`/api/payroll/month?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không tải được dữ liệu tháng");
      setMonthlyWeeks(data.weeks as WeeklySummary[]);
      setMonthlyAttendance(data.attendance as MonthlyAttendanceEntry[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không tải được dữ liệu tháng");
      setMonthlyWeeks([]);
      setMonthlyAttendance([]);
    } finally {
      setMonthlyLoading(false);
    }
  }

  useEffect(() => {
    if (weekStart) void loadWeek(weekStart, employeeName);
    // Load the selected employee's records whenever the week or employee changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, employeeName]);

  useEffect(() => {
    if ((activeTab === "monthly" || activeTab === "sheet" || activeTab === "bulk") && selectedMonth) void loadMonth(selectedMonth, employeeName);
    // Load the monthly summary when its tab, month, or employee changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedMonth, employeeName]);

  useEffect(() => {
    setBulkSelectedDates([]);
  }, [selectedMonth, bulkMode, employeeName]);

  useEffect(() => {
    const existing = attendance.find((record) => record.date === selectedDate);
    setSelectedCodes(existing?.shifts.map((shift) => shift.code) ?? []);
    setExtraHoursDraft(String(existing?.extraHours ?? 0));
    setActualPayDraft(existing?.actualPay == null ? "" : String(existing.actualPay));
    const drafts: Record<string, ShiftTimeDraft> = {};
    if (existing) {
      for (const shift of existing.shifts) {
        drafts[shift.code] = {
          start: hoursToTimeInput(shift.start),
          end: hoursToTimeInput(shift.end),
        };
      }
    }
    setShiftTimeDrafts(drafts);
    setCoworkersInput(existing?.coworkers.join(", ") ?? "");
  }, [selectedDate, attendance]);

  function toggleShift(code: ShiftCode) {
    setMessage("");
    const option = SHIFT_OPTIONS.find((shift) => shift.code === code)!;
    if (selectedCodes.includes(code)) {
      setSelectedCodes((current) => current.filter((item) => item !== code));
      return;
    }
    setShiftTimeDrafts((current) => current[code] ? current : {
      ...current,
      [code]: { start: hoursToTimeInput(option.start), end: hoursToTimeInput(option.end) },
    });
    setSelectedCodes((current) => option.hours === 0 ? [code] : [...current.filter((item) => item !== "O"), code]);
  }

  async function saveAttendance() {
    if (!selectedDate || !selectedCodes.length) {
      setError("Hãy chọn ngày và ít nhất một ca làm");
      return;
    }
    if (!validShiftTimes) {
      setError("Giờ vào và giờ ra của từng ca chưa hợp lệ");
      return;
    }
    if (!validExtraHours) {
      setError(parsedExtraHours > 0 && !hasWorkShift
        ? "Hãy chọn ca làm trước khi nhập giờ làm thêm"
        : "Giờ làm thêm phải là số không âm");
      return;
    }
    if (!validActualPay) {
      setError("Mức lương riêng của ngày phải là số không âm");
      return;
    }
    if (selectedTotalHours > 14) {
      setError("Tổng giờ làm trong một ngày không được vượt quá 14 tiếng");
      return;
    }
    const isUpdating = attendance.some((record) => record.date === selectedDate);
    setSaving(true);
    setError("");
    setMessage("");
    const coworkers = coworkersInput.split(",").map((name) => name.trim()).filter(Boolean);
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName: employeeName.trim() || "Thanh Phong",
          date: selectedDate,
          shifts: selectedShifts.map(({ code, start, end, hours }) => ({ code, start, end, hours })),
          coworkers,
          extraHours: parsedExtraHours,
          actualPay: parsedActualPay,
          totalHours: selectedTotalHours,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không lưu được ngày công");
      await loadWeek(weekStart, employeeName);
      if (selectedDate.slice(0, 7) === selectedMonth) await loadMonth(selectedMonth, employeeName);
      setSuccessAction(isUpdating ? "edit" : "add");
      setMessage("Đã lưu ngày công vào MongoDB");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không lưu được ngày công");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAttendance(date: string) {
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/attendance", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeName: employeeName.trim() || "Thanh Phong", date }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không xóa được ngày công");
      await loadWeek(weekStart, employeeName);
      if (date.slice(0, 7) === selectedMonth) await loadMonth(selectedMonth, employeeName);
      setSuccessAction("delete");
      setMessage("Đã xóa ngày công");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Không xóa được ngày công");
    }
  }

  function toggleBulkDate(date: string) {
    setBulkSelectedDates((current) => current.includes(date)
      ? current.filter((item) => item !== date)
      : [...current, date].sort());
  }

  async function saveBulkAttendance() {
    if (bulkSelectedDates.length === 0) {
      setError("Chọn ít nhất một ngày chưa có ca đã chọn");
      return;
    }
    setSavingBulk(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/attendance/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName: employeeName.trim() || "Thanh Phong",
          dates: bulkSelectedDates,
          shiftCode: bulkShiftCode,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không ghi được công cho các ngày đã chọn");
      await Promise.all([loadWeek(weekStart, employeeName), loadMonth(selectedMonth, employeeName)]);
      setBulkSelectedDates([]);
      setSuccessAction("add");
      setMessage(data.skipped > 0
        ? `Đã thêm ca cho ${data.added} ngày; bỏ qua ${data.skipped} ngày đã có ca này`
        : `Đã ghi ca ${bulkShiftCode} cho ${data.added} ngày`);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Không ghi được công cho các ngày đã chọn");
    } finally {
      setSavingBulk(false);
    }
  }

  async function deleteBulkAttendance() {
    if (bulkSelectedDates.length === 0) {
      setError("Chọn ít nhất một ngày đã có công để xóa");
      return;
    }
    const confirmed = window.confirm(`Xóa công của ${bulkSelectedDates.length} ngày đã chọn?`);
    if (!confirmed) return;
    setSavingBulk(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/attendance/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeName: employeeName.trim() || "Thanh Phong", dates: bulkSelectedDates }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không xóa được công các ngày đã chọn");
      await Promise.all([loadWeek(weekStart, employeeName), loadMonth(selectedMonth, employeeName)]);
      setBulkSelectedDates([]);
      setSuccessAction("delete");
      setMessage(`Đã xóa công của ${data.deletedCount} ngày`);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Không xóa được công các ngày đã chọn");
    } finally {
      setSavingBulk(false);
    }
  }

  async function saveRate() {
    const parsed = Number(rateDraft);
    if (!Number.isFinite(parsed) || parsed < 0 || rateDraft.trim() === "") {
      setError("Nhập hệ số lương mỗi giờ bằng số không âm");
      return;
    }
    setSavingRate(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/payroll", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeName: employeeName.trim() || "Thanh Phong", weekStart, hourlyRate: parsed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không lưu được hệ số lương");
      setHourlyRate(data.hourlyRate);
      setSuccessAction("edit");
      setMessage("Đã lưu hệ số lương cho tuần này");
    } catch (rateError) {
      setError(rateError instanceof Error ? rateError.message : "Không lưu được hệ số lương");
    } finally {
      setSavingRate(false);
    }
  }

  async function copyText(text = exportText) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Trình duyệt không cho phép sao chép, hãy chọn và sao chép nội dung bên dưới");
    }
  }

  const moveWeek = (offset: number) => setSelectedDate(addDays(selectedDate || localDateString(new Date()), offset * 7));
  const moveDay = (offset: number) => setSelectedDate(addDays(selectedDate || localDateString(new Date()), offset));
  const moveMonth = (offset: number) => {
    const [year, month] = (selectedMonth || localDateString(new Date()).slice(0, 7)).split("-").map(Number);
    const next = new Date(year, month - 1 + offset, 1, 12);
    setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <main className="app-shell">
      {/* TOÀN CẢNH THIÊN NHIÊN: BIỂN · NƯỚC · NÚI ĐÁ · RỪNG CÂY · GỖ LŨA */}
      <div className="nature-scene" aria-hidden="true">
        <svg
          className="nature-svg"
          viewBox="0 0 1440 500"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="coastalSky" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#bce3f7" />
              <stop offset="42%" stopColor="#dff3fc" />
              <stop offset="78%" stopColor="#f2f9fd" />
              <stop offset="100%" stopColor="#efe8da" />
            </linearGradient>

            <radialGradient id="morningSun" cx="76%" cy="20%" r="42%">
              <stop offset="0%" stopColor="#fffdf5" stopOpacity="0.96" />
              <stop offset="24%" stopColor="#fff3d1" stopOpacity="0.55" />
              <stop offset="58%" stopColor="#bae6fd" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#bae6fd" stopOpacity="0" />
            </radialGradient>

            <linearGradient id="karstLit" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#d4eaf6" />
              <stop offset="100%" stopColor="#a8cde2" />
            </linearGradient>
            <linearGradient id="karstShade" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#7aaac5" />
              <stop offset="100%" stopColor="#9ec5dc" />
            </linearGradient>

            <linearGradient id="cliffStoneLit" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c5bba8" />
              <stop offset="100%" stopColor="#9c907d" />
            </linearGradient>
            <linearGradient id="cliffStoneDark" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#756b5c" />
              <stop offset="100%" stopColor="#585044" />
            </linearGradient>

            <linearGradient id="oceanBay" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3ba1ce" stopOpacity="0.72" />
              <stop offset="38%" stopColor="#63c5e6" stopOpacity="0.65" />
              <stop offset="74%" stopColor="#a5e3f6" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#efe7d6" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="pineDeep" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1e6b4b" />
              <stop offset="100%" stopColor="#124530" />
            </linearGradient>
            <linearGradient id="pineLush" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2f8f63" />
              <stop offset="100%" stopColor="#1a5e40" />
            </linearGradient>
            <linearGradient id="driftwood" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7f5539" />
              <stop offset="50%" stopColor="#b08968" />
              <stop offset="100%" stopColor="#6c472d" />
            </linearGradient>
          </defs>

          {/* Bầu trời biển & Ánh nắng ban mai */}
          <rect width="1440" height="500" fill="url(#coastalSky)" />
          <rect width="1440" height="500" fill="url(#morningSun)" />
          <circle cx="1095" cy="96" r="46" fill="#fffef7" fillOpacity="0.78" />

          {/* Mây trắng trôi nhẹ trên vịnh */}
          <g className="cloud-drift" opacity="0.72">
            <path d="M180 86C198 72 228 73 244 88C262 80 288 86 296 102H154C158 90 168 86 180 86Z" fill="#ffffff" />
            <path d="M840 66C860 50 894 52 912 68C930 60 956 66 966 82H812C818 70 828 66 840 66Z" fill="#ffffff" fillOpacity="0.85" />
          </g>

          {/* Dãy núi đá ven biển xa mờ */}
          <g opacity="0.68">
            <polygon points="0,256 175,148 340,256" fill="url(#karstShade)" />
            <polygon points="175,148 255,256 340,256" fill="url(#karstLit)" />
            <polygon points="240,256 445,126 650,256" fill="url(#karstShade)" />
            <polygon points="445,126 555,256 650,256" fill="url(#karstLit)" />
            <polygon points="870,256 1065,142 1265,256" fill="url(#karstShade)" />
            <polygon points="1065,142 1175,256 1265,256" fill="url(#karstLit)" />
            <polygon points="1160,256 1335,156 1440,235 1440,256" fill="url(#karstShade)" />
          </g>

          {/* Hòn đảo đá vôi giữa vịnh biển */}
          <g opacity="0.78">
            <path d="M685 256L735 192L778 214L812 184L864 256H685Z" fill="url(#karstShade)" />
            <path d="M735 192L762 256H778L778 214L735 192Z" fill="url(#karstLit)" />
            <path d="M812 184L834 256H864L812 184Z" fill="url(#karstLit)" />
          </g>

          {/* Mặt biển ngọc lam & Nước vịnh trong xanh */}
          <rect x="0" y="254" width="1440" height="210" fill="url(#oceanBay)" />

          {/* Vệt nắng lấp lánh trên mặt nước */}
          <g className="water-sparkles" opacity="0.55">
            <ellipse cx="1090" cy="274" rx="78" ry="3" fill="#fffef5" />
            <ellipse cx="1085" cy="292" rx="56" ry="2.5" fill="#fffef5" />
            <ellipse cx="1100" cy="312" rx="38" ry="2" fill="#ffffff" />
            <ellipse cx="775" cy="285" rx="44" ry="2" fill="#e0f7ff" />
          </g>

          {/* Các lớp sóng biển vỗ êm đềm */}
          <path
            className="sea-wave sea-wave-back"
            d="M-60 288C120 274 280 302 460 288C640 274 820 302 1000 288C1180 274 1340 300 1500 288V360H-60V288Z"
            fill="#7dd3fc"
            fillOpacity="0.28"
          />
          <path
            className="sea-wave sea-wave-mid"
            d="M-60 318C150 334 320 302 520 318C720 334 900 304 1100 318C1280 331 1390 310 1500 318V400H-60V318Z"
            fill="#bae6fd"
            fillOpacity="0.38"
          />
          <path
            className="sea-wave sea-wave-foam"
            d="M-60 348C140 335 310 362 510 348C710 334 890 362 1090 348C1270 335 1380 356 1500 348"
            stroke="#ffffff"
            strokeWidth="2.5"
            strokeOpacity="0.68"
            strokeLinecap="round"
          />

          {/* Mỏm đá cuội, Gỗ lũa & Rừng thông ven biển bên trái */}
          <g className="coastal-headland-left" opacity="0.86">
            <path d="M0 326L95 292L192 320L248 352H0V326Z" fill="url(#cliffStoneDark)" />
            <path d="M95 292L168 352H248L192 320L95 292Z" fill="url(#cliffStoneLit)" />
            {/* Khúc gỗ lũa ven bờ đá */}
            <path d="M132 344C158 336 192 338 222 347L218 354C190 347 158 346 130 352Z" fill="url(#driftwood)" />
            {/* Rừng cây thông biển */}
            <g className="breeze-trees">
              <polygon points="36,204 12,254 24,254 8,292 64,292 48,254 60,254" fill="url(#pineDeep)" />
              <polygon points="78,218 56,262 67,262 52,298 104,298 89,262 100,262" fill="url(#pineLush)" />
              <polygon points="122,236 104,272 113,272 100,302 144,302 131,272 140,272" fill="url(#pineDeep)" />
            </g>
          </g>

          {/* Mỏm đá & Rừng cây ven biển bên phải */}
          <g className="coastal-headland-right" opacity="0.84">
            <path d="M1440 322L1345 288L1258 318L1204 350H1440V322Z" fill="url(#cliffStoneDark)" />
            <path d="M1345 288L1292 350H1204L1258 318L1345 288Z" fill="url(#cliffStoneLit)" />
            <g className="breeze-trees breeze-trees-delayed">
              <polygon points="1396,202 1372,252 1384,252 1368,292 1424,292 1408,252 1420,252" fill="url(#pineDeep)" />
              <polygon points="1350,222 1328,266 1338,266 1325,298 1375,298 1362,266 1372,266" fill="url(#pineLush)" />
            </g>
          </g>
        </svg>
      </div>

      <div className="page-wrap">
        <header className="topbar">
          <a href="#top" className="brand" aria-label="Chốt Công trang chủ">
            <span className="brand-mark">
              <Image src="/site-logo.png" alt="" width={68} height={38} priority />
            </span>
            <span>chốt<span className="brand-light">công</span></span>
          </a>

          <div className="topbar-right">
            <span className="cloud-label"><span className="live-dot" /><Leaf size={13} className="leaf-accent" /> Dữ liệu MongoDB</span>
            <button className="profile-chip" type="button" onClick={() => { setActiveTab("entry"); window.setTimeout(() => document.getElementById("employee-name")?.focus(), 0); }}>
              <span className="avatar">{(employeeName.trim()[0] || "T").toUpperCase()}</span>
              <span>{employeeName || "Thanh Phong"}</span>
              <ChevronDown size={14} />
            </button>
            <button
              type="button"
              className="menu-toggle-btn"
              aria-label="Mở danh sách các tab chức năng"
              title="Menu chuyển tab (3 gạch)"
              onClick={() => setIsDrawerOpen(true)}
            >
              <Menu size={19} />
              <span className="menu-btn-label">Danh mục</span>
            </button>
          </div>
        </header>

        {/* DRAWER MENU 3 GẠCH (SLIDE-OVER SHEET) */}
        <div
          className={`drawer-backdrop ${isDrawerOpen ? "is-open" : ""}`}
          onClick={() => setIsDrawerOpen(false)}
          aria-hidden={!isDrawerOpen}
        >
          <div
            className="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Menu chức năng"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <div className="drawer-brand">
                <span className="brand-mark">
                  <Image src="/site-logo.png" alt="" width={68} height={38} />
                </span>
                <div>
                  <div className="drawer-title">chốt<span>công</span></div>
                  <div className="drawer-subtitle">Danh mục quản lý</div>
                </div>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                aria-label="Đóng menu"
                onClick={() => setIsDrawerOpen(false)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="drawer-user-card">
              <span className="avatar">{(employeeName.trim()[0] || "T").toUpperCase()}</span>
              <div className="drawer-user-info">
                <strong>{employeeName || "Thanh Phong"}</strong>
                <span>{selectedDate ? `Ngày ${dateLabel(selectedDate)}` : "Hôm nay"} · Tuần này: {weeklyHours}h</span>
              </div>
            </div>

            <div className="drawer-nav-group">
              <div className="drawer-group-title">CHỌN TAB CHỨC NĂNG</div>
              <button
                type="button"
                className={`drawer-tab-btn ${activeTab === "week" ? "active" : ""}`}
                onClick={() => { setActiveTab("week"); setIsDrawerOpen(false); }}
              >
                <div className="drawer-tab-icon icon-teal"><CalendarDays size={18} /></div>
                <div className="drawer-tab-text">
                  <strong>Ca trong tuần · Text</strong>
                  <small>Xem tổng 7 ngày & sao chép text chốt ca</small>
                </div>
                <span className="drawer-tab-pill">{weeklyHours}h</span>
              </button>

              <button
                type="button"
                className={`drawer-tab-btn ${activeTab === "entry" ? "active" : ""}`}
                onClick={() => { setActiveTab("entry"); setIsDrawerOpen(false); }}
              >
                <div className="drawer-tab-icon icon-blue"><Plus size={18} /></div>
                <div className="drawer-tab-text">
                  <strong>Ghi nhận ca làm</strong>
                  <small>Chọn ca, người làm chung & lưu MongoDB</small>
                </div>
              </button>

              <button
                type="button"
                className={`drawer-tab-btn ${activeTab === "bulk" ? "active" : ""}`}
                onClick={() => { setActiveTab("bulk"); setIsDrawerOpen(false); }}
              >
                <div className="drawer-tab-icon icon-blue"><CalendarDays size={18} /></div>
                <div className="drawer-tab-text">
                  <strong>Ghi/xóa nhiều ngày</strong>
                  <small>Áp dụng cùng một ca hoặc xóa nhiều ngày</small>
                </div>
              </button>

              <button
                type="button"
                className={`drawer-tab-btn ${activeTab === "payroll" ? "active" : ""}`}
                onClick={() => { setActiveTab("payroll"); setIsDrawerOpen(false); }}
              >
                <div className="drawer-tab-icon icon-amber"><Wallet size={18} /></div>
                <div className="drawer-tab-text">
                  <strong>Tính lương tuần</strong>
                  <small>Cài đặt hệ số lương/giờ và xem lương tuần</small>
                </div>
                {attendance.length > 0 && <span className="drawer-tab-pill">{currency.format(estimatedPay)}</span>}
              </button>

              <button
                type="button"
                className={`drawer-tab-btn ${activeTab === "monthly" ? "active" : ""}`}
                onClick={() => { setActiveTab("monthly"); setIsDrawerOpen(false); }}
              >
                <div className="drawer-tab-icon icon-violet"><FileText size={18} /></div>
                <div className="drawer-tab-text">
                  <strong>Tổng hợp tháng</strong>
                  <small>Cộng dồn số giờ và thu nhập các tuần</small>
                </div>
              </button>

              <button
                type="button"
                className={`drawer-tab-btn ${activeTab === "sheet" ? "active" : ""}`}
                onClick={() => { setActiveTab("sheet"); setIsDrawerOpen(false); }}
              >
                <div className="drawer-tab-icon icon-teal"><Table size={18} /></div>
                <div className="drawer-tab-text">
                  <strong>Bảng công tháng</strong>
                  <small>Xem từng ngày theo hàng và cột</small>
                </div>
                <span className="drawer-tab-pill">{monthlyWorkDays} ngày</span>
              </button>
            </div>

            <div className="drawer-actions">
              <button
                type="button"
                className="drawer-action-link"
                onClick={() => {
                  setActiveTab("entry");
                  setIsDrawerOpen(false);
                  window.setTimeout(() => document.getElementById("employee-name")?.focus(), 100);
                }}
              >
                <UsersRound size={16} /> Thay đổi nhân viên
              </button>
            </div>
          </div>
        </div>

        <section className="welcome" id="top">
          <div className="welcome-info">
            <div className="eyebrow"><Waves size={13} /> BẢNG CÔNG TÁC & CHỐT CA <TreePine size={13} /></div>
            <h1>Bảng chấm công <span>{employeeName || "Nhân viên"}</span></h1>
            <p>Ghi nhận ca làm việc, chốt công cuối tuần và theo dõi thu nhập minh bạch</p>
          </div>
          <div className="welcome-badges">
            <div className="stat-pill"><CalendarDays size={15} /> {selectedDate ? `Ngày ${dateLabel(selectedDate)}` : "Hôm nay"}</div>
            <div className="stat-pill highlight-pill"><Clock3 size={15} /> Tuần này: <strong>{weeklyHours} giờ</strong></div>
          </div>
        </section>

        {(error || message) && (
          <div className="notice-backdrop" onClick={() => { setError(""); setMessage(""); }}>
            <div className={`notice notice-modal ${error ? "notice-error notice-action-error" : `notice-success notice-action-${successAction}`}`} role={error ? "alertdialog" : "dialog"} aria-modal="true" aria-live={error ? "assertive" : "polite"} onClick={(event) => event.stopPropagation()}>
              <button className="notice-close" type="button" aria-label="Đóng thông báo" onClick={() => { setError(""); setMessage(""); }}><X size={17} /></button>
              <div className={`notice-modal-mark ${error ? "notice-mark-error" : `notice-mark-${successAction}`}`}>{error ? "!" : <Check size={25} strokeWidth={2.5} />}</div>
              <strong className="notice-modal-title">{error ? "Chưa hoàn tất" : successAction === "add" ? "Đã thêm" : successAction === "delete" ? "Đã xóa" : "Đã cập nhật"}</strong>
              <span className="notice-modal-message">{withoutEndingPunctuation(error || message)}</span>
              <button className="notice-modal-action" type="button" onClick={() => { setError(""); setMessage(""); }}>Đóng</button>
            </div>
          </div>
        )}

        {activeTab === "monthly" || activeTab === "sheet" || activeTab === "bulk" ? (
          <div className="week-selector">
            <div><span className="week-selector-label">THÁNG ĐANG XEM</span><strong>{formatMonthLabel(selectedMonth)}</strong></div>
            <div className="week-selector-actions">
              <label className="week-picker"><span>Chọn tháng</span><input type="month" aria-label="Chọn tháng để xem tổng công" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} /></label>
              <div className="week-controls">
                <button type="button" aria-label="Tháng trước" onClick={() => moveMonth(-1)}><ArrowLeft size={17} /></button>
                <button type="button" aria-label="Tháng sau" onClick={() => moveMonth(1)}><ArrowRight size={17} /></button>
              </div>
            </div>
          </div>
        ) : (
        <div className="week-selector">
          <div><span className="week-selector-label">TUẦN ĐANG XEM</span><strong>{weekStart && `Từ ${formatWeekRange(weekStart, weekEnd)}`}</strong></div>
          <div className="week-selector-actions">
            <label className="week-picker"><span>Chọn tuần</span><input type="week" aria-label="Chọn tuần để xem hoặc nhập hệ số" value={weekStart ? isoWeekValue(weekStart) : ""} onChange={(event) => { const monday = mondayFromIsoWeek(event.target.value); if (monday) setSelectedDate(monday); }} /></label>
            <div className="week-controls">
              <button type="button" aria-label="Tuần trước" onClick={() => moveWeek(-1)}><ArrowLeft size={17} /></button>
              <button type="button" aria-label="Tuần sau" onClick={() => moveWeek(1)}><ArrowRight size={17} /></button>
            </div>
          </div>
        </div>
        )}

        <div className={`dashboard-grid ${activeTab}-tab`}>
          <div className="main-column">
            {activeTab === "entry" && (
            <section className="panel entry-panel">
              <div className="section-heading">
                <div className="heading-icon heading-icon-blue"><Plus size={18} /></div>
                <div><h2>Ghi nhận ca làm</h2><p>Chọn ngày và những ca bạn đã làm</p></div>
                <span className="step-tag">01 / GHI CÔNG</span>
              </div>

              <div className="form-row identity-row">
                <label className="field-label" htmlFor="employee-name">Tên nhân viên</label>
                <div className="input-wrap name-input"><UsersRound size={17} /><input id="employee-name" value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} placeholder="Tên của bạn" /></div>
                <label className="field-label date-label" htmlFor="work-date">Ngày làm</label>
                <div className="date-stepper">
                  <div className="input-wrap date-input"><CalendarDays size={17} /><input id="work-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></div>
                  <div className="week-controls date-controls">
                    <button type="button" aria-label="Ngày trước" title="Ngày trước" onClick={() => moveDay(-1)}><ArrowLeft size={16} /></button>
                    <button type="button" aria-label="Ngày sau" title="Ngày sau" onClick={() => moveDay(1)}><ArrowRight size={16} /></button>
                  </div>
                </div>
              </div>

              <div className="shift-title-row">
                <div><h3>Chọn ca</h3><p>Ca kết thúc lúc 23h được tính đến 22h</p></div>
                <span className={`hours-chip ${selectedTotalHours > 14 || !validShiftTimes || !validExtraHours ? "hours-over" : ""}`}><Clock3 size={14} /> {selectedTotalHours} / 14 giờ</span>
              </div>
              <div className="shift-grid">
                {SHIFT_OPTIONS.map((shift) => {
                  const selected = selectedCodes.includes(shift.code);
                  return (
                    <button
                      type="button"
                      key={shift.code}
                      aria-pressed={selected}
                      className={`shift-card tone-${shift.tone} ${selected ? "is-selected" : ""}`}
                      onClick={() => toggleShift(shift.code)}
                    >
                      <span className="shift-code">{shift.code}</span>
                      <div className="shift-info">
                        <span className="shift-time">{shift.hours ? `${shift.start}:00 – ${shift.end}:00` : "Ngày nghỉ"}</span>
                        <span className="shift-hours">{shift.hours} giờ</span>
                      </div>
                      <span className="shift-check">{selected && <Check size={13} strokeWidth={3} />}</span>
                    </button>
                  );
                })}
              </div>
              {!validShiftTimes && (
                <div className="inline-warning">
                  Giờ kết thúc phải sau giờ bắt đầu.
                </div>
              )}
              {!validExtraHours && (
                <div className="inline-warning">
                  {parsedExtraHours > 0 && !hasWorkShift ? "Chọn ca làm trước khi nhập giờ làm thêm." : "Giờ làm thêm phải là số không âm."}
                </div>
              )}
              {selectedTotalHours > 14 && (
                <div className="inline-warning">
                  Tổng giờ làm trong một ngày không được vượt quá 14 tiếng.
                </div>
              )}

              {selectedShifts.some((shift) => shift.code !== "O") && (
                <div className="field-block actual-times-block">
                  <div>
                    <span className="field-label">Giờ làm thực tế</span>
                    <span className="field-hint actual-times-hint">Chỉnh khung giờ thực tế; giờ làm thêm sẽ nối tiếp vào giờ tan của ca cuối.</span>
                  </div>
                  <div className="actual-time-list">
                    {selectedShifts.filter((shift) => shift.code !== "O").map((shift) => {
                      const option = SHIFT_OPTIONS.find((item) => item.code === shift.code)!;
                      const draft = shiftTimeDrafts[shift.code] ?? {
                        start: hoursToTimeInput(option.start),
                        end: hoursToTimeInput(option.end),
                      };
                      return (
                        <div className="actual-time-row" key={shift.code}>
                          <strong className="actual-time-code">{shift.code}</strong>
                          <label className="actual-time-field" htmlFor={`shift-start-${shift.code}`}>
                            <span>Giờ vào</span>
                            <div className="input-wrap actual-time-input"><input id={`shift-start-${shift.code}`} type="time" step="1800" value={draft.start} onChange={(event) => setShiftTimeDrafts((current) => ({ ...current, [shift.code]: { ...draft, start: event.target.value } }))} /></div>
                          </label>
                          <label className="actual-time-field" htmlFor={`shift-end-${shift.code}`}>
                            <span>Giờ tan</span>
                            <div className="input-wrap actual-time-input"><input id={`shift-end-${shift.code}`} type="time" step="1800" value={draft.end} onChange={(event) => setShiftTimeDrafts((current) => ({ ...current, [shift.code]: { ...draft, end: event.target.value } }))} /></div>
                          </label>
                          <span className="actual-time-duration">{shift.valid && validExtraHours ? `${hoursLabel(shift.hours + (shift.code === latestSelectedShift?.code ? parsedExtraHours : 0))} · tan ${formatWorkTime(shift.end + (shift.code === latestSelectedShift?.code ? parsedExtraHours : 0))}` : "Kiểm tra giờ"}</span>
                        </div>
                      );
                    })}
                  </div>
                  <span className="field-hint">Ví dụ: chọn thêm 0,5 giờ cho ca A sẽ hiện giờ tan 12:30; ca C vào sớm thì sửa giờ vào thành 16:00.</span>
                </div>
              )}

              <div className="field-block extra-hours-block">
                <label className="field-label" htmlFor="extra-hours">Giờ làm thêm <span>(nếu có)</span></label>
                <div className="input-wrap full-input"><Clock3 size={17} /><input id="extra-hours" type="number" min="0" step="0.5" value={extraHoursDraft} onChange={(event) => setExtraHoursDraft(event.target.value)} placeholder="Ví dụ: 0.5" /><span className="input-suffix">giờ</span></div>
                <span className="field-hint">Nhập theo bước 0,5 giờ; thời gian này được cộng vào giờ tan của ca cuối.</span>
              </div>

              <div className="field-block actual-pay-block">
                <label className="field-label" htmlFor="actual-pay">Mức lương riêng của ngày <span>(mỗi giờ, nếu có)</span></label>
                <div className="input-wrap full-input"><Wallet size={17} /><input id="actual-pay" type="number" min="0" step="any" value={actualPayDraft} onChange={(event) => setActualPayDraft(event.target.value)} placeholder="Để trống để dùng hệ số tuần" /><span className="input-suffix">₫ / giờ</span></div>
                <span className="field-hint">Số này sẽ nhân với tổng giờ của ngày. Để trống sẽ dùng hệ số lương của tuần.</span>
                {!validActualPay && <span className="inline-warning">Mức lương riêng của ngày phải là số không âm.</span>}
              </div>

              <div className="field-block coworkers-block">
                <label className="field-label" htmlFor="coworkers">Người làm chung <span>(nếu có)</span></label>
                <div className="input-wrap full-input"><UsersRound size={17} /><input id="coworkers" value={coworkersInput} onChange={(event) => setCoworkersInput(event.target.value)} placeholder="Nhập tên, ngăn cách bằng dấu phẩy" /></div>
                <span className="field-hint">Tên người làm chung được lưu cùng ngày công</span>
              </div>

              <div className="entry-footer">
                <div className="selected-summary">{selectedCodes.length ? <><CheckCheck size={16} /> {selectedCodes.includes("O") ? "Đã chọn ngày nghỉ" : `Đã chọn ${selectedCodes.length} ca`} · Tổng {hoursLabel(selectedTotalHours)}</> : <><Clock3 size={16} /> Chưa chọn ca nào</>}</div>
                <button className="primary-button" type="button" disabled={saving || loading || !selectedCodes.length || !validShiftTimes || !validExtraHours || !validActualPay || selectedTotalHours > 14} onClick={saveAttendance}>
                  {saving ? "Đang lưu…" : <><Check size={17} /> Lưu ngày công</>}
                </button>
              </div>
            </section>
            )}

            {activeTab === "bulk" && (
              <section className="panel bulk-panel">
                <div className="section-heading">
                  <div className="heading-icon heading-icon-blue"><CalendarDays size={18} /></div>
                  <div><h2>Ghi hoặc xóa công nhiều ngày</h2><p>Chọn nhiều ngày trong tháng để áp dụng cùng một ca hoặc xóa công</p></div>
                </div>

                <div className="bulk-mode-switch" role="group" aria-label="Chọn thao tác nhiều ngày">
                  <button type="button" className={bulkMode === "add" ? "active" : ""} aria-pressed={bulkMode === "add"} onClick={() => setBulkMode("add")}>
                    <Plus size={15} /> Ghi cùng một ca
                  </button>
                  <button type="button" className={bulkMode === "delete" ? "active bulk-delete-active" : ""} aria-pressed={bulkMode === "delete"} onClick={() => setBulkMode("delete")}>
                    <Trash2 size={15} /> Xóa công đã ghi
                  </button>
                </div>

                {bulkMode === "add" && (
                  <div className="bulk-shift-field">
                    <label className="field-label" htmlFor="bulk-shift">Ca áp dụng cho tất cả ngày đã chọn</label>
                    <select id="bulk-shift" value={bulkShiftCode} onChange={(event) => { setBulkShiftCode(event.target.value as ShiftCode); setBulkSelectedDates([]); }}>
                      {SHIFT_OPTIONS.filter((shift) => shift.code !== "O").map((shift) => (
                        <option value={shift.code} key={shift.code}>{shift.code} · {shift.start}:00–{shift.end}:00 · {shift.hours} giờ</option>
                      ))}
                    </select>
                    <span className="field-hint">Ca mới được thêm cùng các ca đã có; ngày đã có đúng ca này sẽ được bỏ qua. Hệ số lương tuần vẫn áp dụng riêng theo từng ngày.</span>
                  </div>
                )}

                <div className="bulk-calendar-heading">
                  <strong>{formatMonthLabel(selectedMonth)}</strong>
                  <span>{bulkMode === "add" ? "Ngày đã có ca này được khóa" : "Chỉ chọn được ngày đã có công"}</span>
                </div>

                {monthlyLoading ? <div className="empty-state">Đang tải dữ liệu tháng…</div> : (
                  <div className="bulk-calendar-grid">
                    {SHORT_WEEKDAYS.map((weekday) => <span className="bulk-weekday" key={weekday}>{weekday}</span>)}
                    {bulkCalendarCells.map((date, index) => {
                      if (!date) return <span className="bulk-calendar-empty" key={`empty-${index}`} />;
                      const record = monthlyAttendance.find((item) => item.date === date);
                      const alreadyHasShift = record?.shifts.some((shift) => shift.code === bulkShiftCode) ?? false;
                      const disabled = bulkMode === "add" ? alreadyHasShift : !record;
                      const selected = bulkSelectedDates.includes(date);
                      return (
                        <button
                          type="button"
                          key={date}
                          className={`bulk-date-cell ${record ? "has-record" : ""} ${selected ? "selected" : ""} ${bulkMode === "delete" && selected ? "selected-delete" : ""}`}
                          aria-pressed={selected}
                          aria-label={`${dateLabel(date)}${record ? `, ${record.totalHours} giờ` : ", chưa ghi công"}`}
                          disabled={disabled}
                          onClick={() => toggleBulkDate(date)}
                        >
                          <strong>{Number(date.slice(-2))}</strong>
                          <small>{record ? `${record.shifts.map((shift) => shift.code).join("+")} · ${record.totalHours}h` : "Trống"}</small>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="bulk-action-footer">
                  <span>{bulkSelectedDates.length} ngày đã chọn</span>
                  {bulkMode === "add" ? (
                    <button className="primary-button" type="button" disabled={savingBulk || monthlyLoading || bulkSelectedDates.length === 0} onClick={saveBulkAttendance}>
                      {savingBulk ? "Đang ghi…" : <><Check size={16} /> Ghi ca {bulkShiftCode} cho {bulkSelectedDates.length} ngày</>}
                    </button>
                  ) : (
                    <button className="bulk-delete-button" type="button" disabled={savingBulk || monthlyLoading || bulkSelectedDates.length === 0} onClick={deleteBulkAttendance}>
                      {savingBulk ? "Đang xóa…" : <><Trash2 size={16} /> Xóa công {bulkSelectedDates.length} ngày</>}
                    </button>
                  )}
                </div>
              </section>
            )}

            {activeTab === "week" && (
            <section className="panel week-panel">
              <div className="section-heading week-heading">
                <div className="heading-icon heading-icon-teal"><CalendarDays size={18} /></div>
                <div><h2>Ca trong tuần</h2><p>Chọn ngày để lọc text chốt công hoặc bấm ghi ca</p></div>
                <button
                  type="button"
                  className="quick-entry-btn"
                  onClick={() => setActiveTab("entry")}
                >
                  <Plus size={14} strokeWidth={2.5} />
                  <span>Ghi ca {selectedDate ? dateLabel(selectedDate) : ""}</span>
                </button>
              </div>
              <div className="week-days">
                {WEEKDAYS.map((weekday, index) => {
                  const date = addDays(weekStart || localDateString(new Date()), index);
                  const record = attendance.find((item) => item.date === date);
                  const isSelected = selectedDate === date;
                  const shortWeekday = SHORT_WEEKDAYS[index];
                  return (
                    <button
                      type="button"
                      key={weekday}
                      className={`day-card ${record ? "day-has-work" : ""} ${isSelected ? "day-selected" : ""}`}
                      onClick={() => setSelectedDate(date)}
                    >
                      <span className="day-name">
                        <span className="day-name-full">{weekday}</span>
                        <span className="day-name-short">{shortWeekday}</span>
                      </span>
                      <span className="day-number">{date.slice(-2)}</span>
                      {record ? (
                        <span className="day-meta">{record.shifts.map((shift) => shift.code).join("·")}</span>
                      ) : (
                        <span className="day-meta empty-meta">Trống</span>
                      )}
                      <span className="day-hours">
                        {record ? (
                          <>
                            <span className="day-hours-full">{record.totalHours} giờ</span>
                            <span className="day-hours-short">{record.totalHours}h</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="week-total-row">
                <span><span className="total-dot" /> Tổng giờ tuần</span>
                <strong>{weeklyHours}<small> giờ</small></strong>
              </div>
            </section>
            )}

            {activeTab === "sheet" && (
              <section className="panel sheet-panel">
                <div className="section-heading sheet-heading">
                  <div className="heading-icon heading-icon-teal"><Table size={18} /></div>
                  <div><h2>Bảng chấm công tháng</h2><p>{formatMonthLabel(selectedMonth)} · bấm vào ngày để xem hoặc sửa công</p></div>
                </div>

                <div className="sheet-summary">
                  <div className="sheet-summary-card"><span>Ngày có công</span><strong>{monthlyWorkDays}</strong></div>
                  <div className="sheet-summary-card"><span>Tổng giờ</span><strong>{monthlyHours.toLocaleString("vi-VN")} giờ</strong></div>
                  <div className="sheet-summary-card sheet-summary-pay"><span>Tổng tiền công</span><strong>{currency.format(monthlyPay)}</strong></div>
                </div>

                <p className="sheet-gesture-hint">Trên điện thoại, chụm hoặc mở hai ngón tay để phóng to/thu nhỏ bảng; xoay ngang máy để xem rộng hơn.</p>
                <div className="sheet-zoom-toolbar" aria-label="Điều chỉnh kích thước bảng">
                  <span>Thu phóng bảng</span>
                  <div className="sheet-zoom-controls">
                    <button type="button" aria-label="Thu nhỏ bảng" onClick={() => adjustSheetZoom(-0.1)}>−</button>
                    <strong>{Math.round(sheetZoom * 100)}%</strong>
                    <button type="button" aria-label="Phóng to bảng" onClick={() => adjustSheetZoom(0.1)}>+</button>
                    <button className="sheet-zoom-reset" type="button" onClick={() => setSheetZoom(1)}>100%</button>
                  </div>
                </div>

                {monthlyMissingRateDays > 0 && !monthlyLoading && (
                  <p className="sheet-note">Đang bỏ qua {monthlyMissingRateDays} ngày chưa có mức lương riêng hoặc hệ số tuần.</p>
                )}

                {monthlyLoading ? <div className="empty-state">Đang tải bảng công…</div> : (
                  <div
                    className="sheet-table-wrap"
                    role="region"
                    aria-label="Bảng chấm công theo ngày trong tháng"
                    tabIndex={0}
                    onTouchStart={startSheetPinch}
                    onTouchMove={moveSheetPinch}
                    onTouchEnd={endSheetPinch}
                    onTouchCancel={endSheetPinch}
                  >
                    <table className="sheet-table" style={{ fontSize: `${12 * sheetZoom}px`, minWidth: `${980 * sheetZoom}px` }}>
                      <thead>
                        <tr>
                          <th>Ngày</th>
                          <th>Thứ</th>
                          <th>Ca / giờ làm</th>
                          <th className="sheet-number">Giờ</th>
                          <th className="sheet-number">Mức riêng / giờ</th>
                          <th className="sheet-number">Hệ số tuần</th>
                          <th className="sheet-number">Tiền công</th>
                          <th>Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sheetRows.map(({ date, weekday, record, hourlyRate: dayRate, pay }) => {
                          const status = !record
                            ? "Chưa ghi"
                            : record.totalHours === 0
                              ? "Nghỉ"
                              : pay === null
                                ? "Thiếu mức"
                                : record.actualPay != null
                                  ? "Mức riêng"
                                  : "Theo tuần";
                          return (
                            <tr className={!record ? "sheet-row-empty" : ""} key={date}>
                              <td><button className="sheet-date-button" type="button" onClick={() => { setSelectedDate(date); setActiveTab("entry"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{dateLabel(date)}</button></td>
                              <td className="sheet-weekday">{weekday}</td>
                              <td>{!record ? "—" : record.totalHours === 0 ? "Nghỉ" : shiftTimeSummary(record)}</td>
                              <td className="sheet-number">{record ? record.totalHours.toLocaleString("vi-VN") : "—"}</td>
                              <td className="sheet-number">{record?.actualPay != null ? currency.format(record.actualPay) : "—"}</td>
                              <td className="sheet-number">{dayRate !== null ? currency.format(dayRate) : "—"}</td>
                              <td className="sheet-number sheet-amount">{pay !== null ? currency.format(pay) : "—"}</td>
                              <td><span className={`sheet-status ${status === "Thiếu mức" ? "sheet-status-missing" : record ? "sheet-status-recorded" : ""}`}>{status}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th colSpan={3}>Tổng tháng</th>
                          <th className="sheet-number">{monthlyHours.toLocaleString("vi-VN")} giờ</th>
                          <th colSpan={2}>Ngày có công: {monthlyWorkDays}</th>
                          <th className="sheet-number sheet-amount">{currency.format(monthlyPay)}</th>
                          <th>{monthlyMissingRateDays ? `Bỏ qua ${monthlyMissingRateDays} ngày` : "Đã tính đủ"}</th>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="side-column">
            {activeTab === "payroll" && (
            <section className="pay-card">
              <div className="pay-card-top">
                <span className="pay-icon"><Wallet size={19} /></span>
                <span className="pay-week">KỲ LƯƠNG · {weekStart && formatWeekRange(weekStart, weekEnd)}</span>
              </div>
              <h2>{currency.format(estimatedPay)}</h2>
              <p>{weeklyMissingRateDays > 0 ? `${weeklyHours} giờ · đã bỏ qua ${weeklyMissingRateDays} ngày thiếu mức riêng và hệ số tuần` : `${weeklyHours} giờ · gồm hệ số tuần và mức riêng từng ngày`}</p>
              <div className="pay-divider" />
              <label className="rate-label" htmlFor="rate">Hệ số nhân / lương mỗi giờ</label>
              <div className="rate-entry">
                <input id="rate" type="number" min="0" step="any" value={rateDraft} onChange={(event) => setRateDraft(event.target.value)} placeholder="Ví dụ: 25000" />
                <span>₫ / giờ</span>
              </div>
              <button className="rate-button" type="button" disabled={savingRate || loading || !weekStart} onClick={saveRate}>{savingRate ? "Đang lưu…" : "Lưu hệ số cho tuần này"}</button>
              <div className="pay-footnote"><span className="lock-dot" /> Lương tự cập nhật khi lưu thêm ca trong tuần này</div>
            </section>
            )}

            {activeTab === "monthly" && (
            <section className="pay-card">
              <div className="pay-card-top">
                <span className="pay-icon"><CalendarDays size={19} /></span>
                <span className="pay-week">TỔNG CÔNG THÁNG · {formatMonthLabel(selectedMonth)}</span>
              </div>
              <h2>{monthlyLoading ? "Đang tính…" : currency.format(monthlyPay)}</h2>
              <p>{monthlyLoading ? "Đang tải tổng giờ…" : monthlyMissingRateDays > 0 ? `${monthlyHours} giờ · đã bỏ qua ${monthlyMissingRateDays} ngày thiếu mức riêng và hệ số tuần` : `${monthlyHours} giờ · cộng ${monthlyWeeks.length} tuần`}</p>
              <div className="pay-divider" />
              <div className="pay-footnote"><span className="lock-dot" /> Tổng công lấy từ ngày 1 đến ngày cuối tháng. Mức lương riêng trong ngày được nhân với số giờ; nếu chưa nhập thì dùng hệ số tuần. Ngày thiếu cả hai mức sẽ được bỏ qua.</div>
            </section>
            )}

            {activeTab === "week" && (
            <section className="panel export-panel">
              <div className="section-heading export-heading">
                <div className="heading-icon heading-icon-violet"><FileText size={18} /></div>
                <div><h2>Text chốt công</h2><p>{weekStart && selectedDate && formatWeekRange(weekStart, selectedDate)}</p></div>
              </div>
              <div className="export-preview">
                <pre>{exportText}</pre>
                <button type="button" className="copy-button" aria-label="Sao chép nội dung" onClick={() => copyText()}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
              </div>
              <button className="export-button" type="button" onClick={() => copyText()}>{copied ? <><Check size={16} /> Đã sao chép</> : <><Copy size={16} /> Sao chép text</>}</button>
              <div className="export-footnote"><span><ArrowDownToLine size={14} /> Dán vào nhóm chốt công</span><span>{attendance.filter((item) => item.totalHours > 0 && item.date <= selectedDate).length} ngày</span></div>
            </section>
            )}

            {activeTab === "week" && (
            <section className="panel records-panel">
              <div className="records-heading"><div><h2>Ca đã ghi</h2><p>Chi tiết trong tuần này</p></div><span className="record-count">{attendance.length}</span></div>
              {loading ? <div className="empty-state">Đang tải dữ liệu…</div> : attendance.length === 0 ? (
                <div className="empty-state"><span className="empty-illustration"><CalendarDays size={20} /></span><span>Chưa có ngày công nào<br />Chọn ca để bắt đầu nhé</span></div>
              ) : (
                <div className="record-list">
                  {[...attendance].sort((a, b) => b.date.localeCompare(a.date)).map((record) => (
                    <article className="record-item" key={record._id}>
                      <button type="button" className="record-date" onClick={() => { setSelectedDate(record.date); setActiveTab("entry"); }}>{dateLabel(record.date)}</button>
                      <div className="record-content">
                        <div className="record-main-line">
                          <span className="record-shift-summary">{shiftTimeSummary(record) || "Nghỉ"}</span>
                          <span className="record-separator" aria-hidden="true">·</span>
                          <span className="record-hours">{record.totalHours} giờ</span>
                        </div>
                        {record.coworkers.length > 0 && <span className="coworker-names"><UsersRound size={12} /> {record.coworkers.join(", ")}</span>}
                      </div>
                      <button className="delete-button" type="button" aria-label={`Xóa ngày ${dateLabel(record.date)}`} onClick={() => deleteAttendance(record.date)}><Trash2 size={15} /></button>
                    </article>
                  ))}
                </div>
              )}
            </section>
            )}

            {activeTab === "payroll" && (
              <section className="panel payroll-breakdown">
                <div className="records-heading"><div><h2>Chi tiết tính công</h2><p>{weekStart && `Từ ${formatWeekRange(weekStart, weekEnd)}`}</p></div><span className="record-count">{weeklyHours}h</span></div>
                {loading ? <div className="empty-state">Đang tải dữ liệu…</div> : attendance.length === 0 ? (
                  <div className="empty-state"><span className="empty-illustration"><Wallet size={20} /></span><span>Chưa có ca trong tuần này<br />Lưu ca làm để cập nhật lương</span></div>
                ) : (
                  <div className="payroll-day-list">
                    {[...attendance].sort((a, b) => a.date.localeCompare(b.date)).map((record) => (
                      <div className="payroll-day" key={record._id}>
                        <div><strong>{dateLabel(record.date)}</strong><span>{shiftTimeSummary(record)}</span></div>
                        <span className="payroll-day-hours">{record.totalHours} giờ</span>
                        <span className="payroll-day-amount">{record.actualPay != null ? currency.format(record.totalHours * record.actualPay) : record.totalHours === 0 ? currency.format(0) : hourlyRate === null ? "Thiếu hệ số" : currency.format(record.totalHours * hourlyRate)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="payroll-total"><span>Tổng tuần · theo hệ số và mức lương riêng từng ngày</span><strong>{currency.format(estimatedPay)}</strong></div>
              </section>
            )}

            {activeTab === "monthly" && (
              <section className="panel payroll-breakdown monthly-breakdown">
                <div className="records-heading"><div><h2>Kết quả từng tuần</h2><p>{formatMonthLabel(selectedMonth)} · tính theo các ngày trong tháng</p></div><span className="record-count">{monthlyLoading ? "…" : `${monthlyHours}h`}</span></div>
                {monthlyLoading ? <div className="empty-state">Đang tải dữ liệu…</div> : monthlyWeeks.length === 0 ? (
                  <div className="empty-state"><span className="empty-illustration"><Wallet size={20} /></span><span>Chưa có tuần công nào trong tháng này</span></div>
                ) : (
                  <div className="monthly-week-list">
                    {monthlyWeeks.map((week) => (
                      <div className="monthly-week" key={week.weekStart}>
                        <div><strong>{formatWeekRange(week.periodStart, week.periodEnd)}</strong><span>{week.hours} giờ · {week.missingRateDays > 0 ? `bỏ qua ${week.missingRateDays} ngày thiếu mức riêng và hệ số tuần` : week.hourlyRate === null ? "đã nhập mức lương riêng theo ngày" : `${currency.format(week.hourlyRate)} / giờ`}</span></div>
                        <strong>{currency.format(week.pay)}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {!monthlyLoading && <div className="payroll-total"><span>Cộng {monthlyWeeks.length} tuần trong tháng · {monthlyHours} giờ</span><strong>{currency.format(monthlyPay)}</strong></div>}
              </section>
            )}

            {activeTab === "monthly" && (
              <section className="panel export-panel monthly-export-panel">
                <div className="section-heading export-heading">
                  <div className="heading-icon heading-icon-violet"><FileText size={18} /></div>
                  <div><h2>Text chốt công tháng</h2><p>{formatMonthLabel(selectedMonth)} · chỉ gồm ngày trong tháng</p></div>
                </div>
                <div className="export-preview">
                  <pre>{monthlyExportText}</pre>
                  <button type="button" className="copy-button" aria-label="Sao chép text chốt công tháng" onClick={() => copyText(monthlyExportText)}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
                </div>
                <button className="export-button" type="button" onClick={() => copyText(monthlyExportText)}>{copied ? <><Check size={16} /> Đã sao chép</> : <><Copy size={16} /> Sao chép text tháng</>}</button>
                <div className="export-footnote"><span><ArrowDownToLine size={14} /> Dán vào nhóm chốt công</span><span>{monthlyAttendance.filter((item) => item.totalHours > 0).length} ngày</span></div>
              </section>
            )}
          </aside>
        </div>

        <footer className="footer-note"><span>Chốt công, an tâm cuối tuần</span><span>Được lưu an toàn trong cơ sở dữ liệu <span className="footer-cloud">◉</span></span></footer>
      </div>
    </main>
  );
}
