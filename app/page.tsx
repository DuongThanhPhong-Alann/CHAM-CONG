"use client";

import { useEffect, useMemo, useState } from "react";
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
};

type WeeklySummary = {
  weekStart: string;
  weekEnd: string;
  hours: number;
  hourlyRate: number | null;
  pay: number | null;
};

const WEEKDAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
const SHORT_WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const TAB_LABELS = {
  week: "Ca trong tuần · text",
  entry: "Ghi nhận ca làm",
  payroll: "Tính công theo tuần",
  monthly: "Tính công theo tháng",
} as const;
const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

function hoursLabel(hours: number) {
  return `${hours} tiếng`;
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

function createExportText(employeeName: string, records: AttendanceEntry[], throughDate: string) {
  const lines = records
    .filter((record) => record.totalHours > 0 && (!throughDate || record.date <= throughDate))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((record) => {
      const intervals = [...record.shifts]
        .filter((shift) => shift.hours > 0)
        .sort((a, b) => a.start - b.start)
        .map((shift) => `${shift.start}-${shift.end}`)
        .join(", ");
      return `${dateLabel(record.date)}: ${intervals} (${record.totalHours})`;
    });
  return ["Chốt công", employeeName.trim() || "Nhân viên", ...lines].join("\n");
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"week" | "entry" | "payroll" | "monthly">("week");
  const [employeeName, setEmployeeName] = useState("Thanh Phong");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [attendance, setAttendance] = useState<AttendanceEntry[]>([]);
  const [monthlyWeeks, setMonthlyWeeks] = useState<WeeklySummary[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<ShiftCode[]>([]);
  const [coworkersInput, setCoworkersInput] = useState("");
  const [hourlyRate, setHourlyRate] = useState<number | null>(null);
  const [rateDraft, setRateDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    const today = localDateString(new Date());
    setSelectedDate(today);
    setSelectedMonth(today.slice(0, 7));
  }, []);

  const weekStart = useMemo(() => (selectedDate ? mondayOf(selectedDate) : ""), [selectedDate]);
  const weekEnd = useMemo(() => (weekStart ? addDays(weekStart, 6) : ""), [weekStart]);
  const selectedShifts = useMemo(
    () => SHIFT_OPTIONS.filter((shift) => selectedCodes.includes(shift.code)),
    [selectedCodes],
  );
  const selectedHours = selectedShifts.reduce((total, shift) => total + shift.hours, 0);
  const weeklyHours = attendance.reduce((total, record) => total + record.totalHours, 0);
  const estimatedPay = hourlyRate === null ? null : weeklyHours * hourlyRate;
  const monthlyHours = monthlyWeeks.reduce((total, week) => total + week.hours, 0);
  const monthlyMissingRates = monthlyWeeks.filter((week) => week.hours > 0 && week.hourlyRate === null).length;
  const monthlyPay = monthlyMissingRates > 0 ? null : monthlyWeeks.reduce((total, week) => total + (week.pay || 0), 0);
  const exportText = useMemo(() => createExportText(employeeName, attendance, selectedDate), [employeeName, attendance, selectedDate]);

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
    try {
      const params = new URLSearchParams({ month, employee: name.trim() || "Thanh Phong" });
      const response = await fetch(`/api/payroll/month?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không tải được dữ liệu tháng");
      setMonthlyWeeks(data.weeks as WeeklySummary[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không tải được dữ liệu tháng");
      setMonthlyWeeks([]);
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
    if (activeTab === "monthly" && selectedMonth) void loadMonth(selectedMonth, employeeName);
    // Load the monthly summary when its tab, month, or employee changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedMonth, employeeName]);

  useEffect(() => {
    const existing = attendance.find((record) => record.date === selectedDate);
    setSelectedCodes(existing?.shifts.map((shift) => shift.code) ?? []);
    setCoworkersInput(existing?.coworkers.join(", ") ?? "");
  }, [selectedDate, attendance]);

  function toggleShift(code: ShiftCode) {
    setMessage("");
    const option = SHIFT_OPTIONS.find((shift) => shift.code === code)!;
    setSelectedCodes((current) => {
      if (current.includes(code)) return current.filter((item) => item !== code);
      if (option.hours === 0) return [code];
      const working = current.filter((item) => item !== "O");
      return [...working, code];
    });
  }

  async function saveAttendance() {
    if (!selectedDate || !selectedCodes.length) {
      setError("Hãy chọn ngày và ít nhất một ca làm");
      return;
    }
    if (selectedHours > 14) {
      setError("Tổng thời gian các ca trong một ngày không được vượt quá 14 tiếng");
      return;
    }
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
          totalHours: selectedHours,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không lưu được ngày công");
      await loadWeek(weekStart, employeeName);
      if (selectedDate.slice(0, 7) === selectedMonth) await loadMonth(selectedMonth, employeeName);
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
      setMessage("Đã xóa ngày công");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Không xóa được ngày công");
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
      setMessage("Đã lưu hệ số lương cho tuần này");
    } catch (rateError) {
      setError(rateError instanceof Error ? rateError.message : "Không lưu được hệ số lương");
    } finally {
      setSavingRate(false);
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Trình duyệt không cho phép sao chép, hãy chọn và sao chép nội dung bên dưới");
    }
  }

  const moveWeek = (offset: number) => setSelectedDate(addDays(selectedDate || localDateString(new Date()), offset * 7));
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
                className={`drawer-tab-btn ${activeTab === "payroll" ? "active" : ""}`}
                onClick={() => { setActiveTab("payroll"); setIsDrawerOpen(false); }}
              >
                <div className="drawer-tab-icon icon-amber"><Wallet size={18} /></div>
                <div className="drawer-tab-text">
                  <strong>Tính lương tuần</strong>
                  <small>Cài đặt hệ số lương/giờ và xem lương tuần</small>
                </div>
                {estimatedPay !== null && <span className="drawer-tab-pill">{currency.format(estimatedPay)}</span>}
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
          <div className={`notice ${error ? "notice-error" : "notice-success"}`} role="status">
            {error ? <span className="notice-icon">!</span> : <Check size={16} />}
            <span>{withoutEndingPunctuation(error || message)}</span>
            <button type="button" aria-label="Đóng thông báo" onClick={() => { setError(""); setMessage(""); }}>×</button>
          </div>
        )}

        {activeTab === "monthly" ? (
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
                <div className="input-wrap date-input"><CalendarDays size={17} /><input id="work-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></div>
              </div>

              <div className="shift-title-row">
                <div><h3>Chọn ca</h3><p>Ca kết thúc lúc 23h được tính đến 22h</p></div>
                <span className={`hours-chip ${selectedHours > 14 ? "hours-over" : ""}`}><Clock3 size={14} /> {selectedHours} / 14 giờ</span>
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
              {selectedHours > 14 && (
                <div className="inline-warning">
                  Tổng ca vượt quá 14 tiếng/ngày.
                </div>
              )}

              <div className="field-block coworkers-block">
                <label className="field-label" htmlFor="coworkers">Người làm chung <span>(nếu có)</span></label>
                <div className="input-wrap full-input"><UsersRound size={17} /><input id="coworkers" value={coworkersInput} onChange={(event) => setCoworkersInput(event.target.value)} placeholder="Nhập tên, ngăn cách bằng dấu phẩy" /></div>
                <span className="field-hint">Tên người làm chung được lưu cùng ngày công</span>
              </div>

              <div className="entry-footer">
                <div className="selected-summary">{selectedCodes.length ? <><CheckCheck size={16} /> {selectedCodes.includes("O") ? "Đã chọn ngày nghỉ" : `Đã chọn ${selectedCodes.length} ca · ${hoursLabel(selectedHours)}`}</> : <><Clock3 size={16} /> Chưa chọn ca nào</>}</div>
                <button className="primary-button" type="button" disabled={saving || loading || !selectedCodes.length || selectedHours > 14} onClick={saveAttendance}>
                  {saving ? "Đang lưu…" : <><Check size={17} /> Lưu ngày công</>}
                </button>
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
          </div>

          <aside className="side-column">
            {activeTab === "payroll" && (
            <section className="pay-card">
              <div className="pay-card-top">
                <span className="pay-icon"><Wallet size={19} /></span>
                <span className="pay-week">KỲ LƯƠNG · {weekStart && formatWeekRange(weekStart, weekEnd)}</span>
              </div>
              <h2>{estimatedPay === null ? "Chưa tính lương" : currency.format(estimatedPay)}</h2>
              <p>{hourlyRate === null ? "Nhập và lưu hệ số để xem lương tuần" : `${weeklyHours} giờ × ${currency.format(hourlyRate)} / giờ`}</p>
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
              <h2>{monthlyLoading ? "Đang tính…" : monthlyPay === null ? "Chưa đủ hệ số" : currency.format(monthlyPay)}</h2>
              <p>{monthlyLoading ? "Đang tải tổng giờ…" : monthlyMissingRates > 0 ? `${monthlyHours} giờ · còn thiếu hệ số ${monthlyMissingRates} tuần` : `${monthlyHours} giờ · cộng ${monthlyWeeks.length} tuần`}</p>
              <div className="pay-divider" />
              <div className="pay-footnote"><span className="lock-dot" /> Cộng các tuần bắt đầu trong tháng. Nếu tháng bắt đầu giữa tuần, tuần đó thuộc tháng trước; tuần cuối có thể kéo sang tháng sau.</div>
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
                <button type="button" className="copy-button" aria-label="Sao chép nội dung" onClick={copyText}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
              </div>
              <button className="export-button" type="button" onClick={copyText}>{copied ? <><Check size={16} /> Đã sao chép</> : <><Copy size={16} /> Sao chép text</>}</button>
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
                        <div className="record-codes">
                          {record.shifts.map((shift) => {
                            const tone = SHIFT_OPTIONS.find((s) => s.code === shift.code)?.tone || "gray";
                            return (
                              <span className={`mini-code tone-${tone}`} key={shift.code}>
                                {shift.code}
                              </span>
                            );
                          })}
                        </div>
                        <span className="record-hours">{record.totalHours} giờ</span>
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
                        <div><strong>{dateLabel(record.date)}</strong><span>{record.shifts.map((shift) => shift.code).join(" · ")}</span></div>
                        <span className="payroll-day-hours">{record.totalHours} giờ</span>
                        {hourlyRate !== null && <span className="payroll-day-amount">{currency.format(record.totalHours * hourlyRate)}</span>}
                      </div>
                    ))}
                  </div>
                )}
                <div className="payroll-total"><span>{weeklyHours} giờ × {hourlyRate === null ? "chưa nhập hệ số" : currency.format(hourlyRate)}</span><strong>{estimatedPay === null ? "—" : currency.format(estimatedPay)}</strong></div>
              </section>
            )}

            {activeTab === "monthly" && (
              <section className="panel payroll-breakdown monthly-breakdown">
                <div className="records-heading"><div><h2>Kết quả từng tuần</h2><p>{formatMonthLabel(selectedMonth)} · tính trọn tuần</p></div><span className="record-count">{monthlyLoading ? "…" : `${monthlyHours}h`}</span></div>
                {monthlyLoading ? <div className="empty-state">Đang tải dữ liệu…</div> : monthlyWeeks.length === 0 ? (
                  <div className="empty-state"><span className="empty-illustration"><Wallet size={20} /></span><span>Chưa có tuần công nào trong tháng này</span></div>
                ) : (
                  <div className="monthly-week-list">
                    {monthlyWeeks.map((week) => (
                      <div className="monthly-week" key={week.weekStart}>
                        <div><strong>{formatWeekRange(week.weekStart, week.weekEnd)}</strong><span>{week.hours} giờ · {week.hourlyRate === null ? "Chưa nhập hệ số" : `${currency.format(week.hourlyRate)} / giờ`}</span></div>
                        <strong>{week.pay === null ? "Thiếu hệ số" : currency.format(week.pay)}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {!monthlyLoading && <div className="payroll-total"><span>Cộng {monthlyWeeks.length} tuần · {monthlyHours} giờ</span><strong>{monthlyPay === null ? "—" : currency.format(monthlyPay)}</strong></div>}
              </section>
            )}
          </aside>
        </div>

        <footer className="footer-note"><span>Chốt công, an tâm cuối tuần</span><span>Được lưu an toàn trong cơ sở dữ liệu <span className="footer-cloud">◉</span></span></footer>
      </div>
    </main>
  );
}
