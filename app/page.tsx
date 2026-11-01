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
  Plus,
  Sparkles,
  Trash2,
  UsersRound,
  Wallet,
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

const WEEKDAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
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

function createExportText(employeeName: string, records: AttendanceEntry[]) {
  const lines = records
    .filter((record) => record.totalHours > 0)
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
  const [activeTab, setActiveTab] = useState<"week" | "entry" | "payroll">("week");
  const [employeeName, setEmployeeName] = useState("Thanh Phong");
  const [selectedDate, setSelectedDate] = useState("");
  const [attendance, setAttendance] = useState<AttendanceEntry[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<ShiftCode[]>([]);
  const [coworkersInput, setCoworkersInput] = useState("");
  const [hourlyRate, setHourlyRate] = useState<number | null>(null);
  const [rateDraft, setRateDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => setSelectedDate(localDateString(new Date())), []);

  const weekStart = useMemo(() => (selectedDate ? mondayOf(selectedDate) : ""), [selectedDate]);
  const weekEnd = useMemo(() => (weekStart ? addDays(weekStart, 6) : ""), [weekStart]);
  const selectedShifts = useMemo(
    () => SHIFT_OPTIONS.filter((shift) => selectedCodes.includes(shift.code)),
    [selectedCodes],
  );
  const selectedHours = selectedShifts.reduce((total, shift) => total + shift.hours, 0);
  const weeklyHours = attendance.reduce((total, record) => total + record.totalHours, 0);
  const estimatedPay = hourlyRate === null ? null : weeklyHours * hourlyRate;
  const exportText = useMemo(() => createExportText(employeeName, attendance), [employeeName, attendance]);

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

  useEffect(() => {
    if (weekStart) void loadWeek(weekStart, employeeName);
    // Load the selected employee's records whenever the week or employee changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, employeeName]);

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

  return (
    <main className="app-shell">
      <div className="mountain-scene" aria-hidden="true">
        <svg
          className="mountain-svg"
          viewBox="0 0 1440 480"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            {/* Luminous Sun Bloom */}
            <radialGradient id="sunBloom" cx="78%" cy="22%" r="45%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="20%" stopColor="#e0f4ff" stopOpacity="0.6" />
              <stop offset="55%" stopColor="#bae6fd" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#bae6fd" stopOpacity="0" />
            </radialGradient>

            {/* Snowcaps & Light/Shadow Gradients for Alpine Peaks */}
            <linearGradient id="snowLit" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
              <stop offset="100%" stopColor="#e0f2fe" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="snowShadow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#cfe3f1" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#9fc8df" stopOpacity="0.85" />
            </linearGradient>

            {/* Layer 1: Distant Alpine Summits (Bầu trời xa & đỉnh núi tuyết) */}
            <linearGradient id="mountFarLit" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#c5e4f3" />
              <stop offset="100%" stopColor="#e4f4fb" />
            </linearGradient>
            <linearGradient id="mountFarShadow" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#9cc7dc" />
              <stop offset="100%" stopColor="#cee8f6" />
            </linearGradient>

            {/* Layer 2: Mid-range Azure Ridges (Dãy núi xanh lam trung cảnh) */}
            <linearGradient id="mountMidLit" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#6ba5c2" />
              <stop offset="100%" stopColor="#a7d5e9" />
            </linearGradient>
            <linearGradient id="mountMidShadow" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4f8aa7" />
              <stop offset="100%" stopColor="#82bbd5" />
            </linearGradient>

            {/* Layer 3: Foreground Deep Mountain Slopes (Đồi núi tiền cảnh xanh đậm) */}
            <linearGradient id="mountNearLit" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#287394" />
              <stop offset="100%" stopColor="#5ea5bf" />
            </linearGradient>
            <linearGradient id="mountNearShadow" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1a5975" />
              <stop offset="100%" stopColor="#4287a4" />
            </linearGradient>

            {/* Valley Mist Gradients (Sương mù thung lũng mềm mại) */}
            <linearGradient id="mist1" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="50%" stopColor="#dff2fc" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#edf7fc" stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id="mist2" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="60%" stopColor="#e8f5fb" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#f3f9fb" stopOpacity="0.98" />
            </linearGradient>
          </defs>

          {/* Morning Sun */}
          <circle cx="1120" cy="105" r="160" fill="url(#sunBloom)" />
          <circle cx="1120" cy="105" r="42" fill="#ffffff" fillOpacity="0.6" />

          {/* LAYER 1: Distant Snow-Capped Alpine Mountain Summits */}
          {/* Peak 1 Left */}
          <polygon points="210,110 380,290 60,290" fill="url(#mountFarLit)" />
          <polygon points="210,110 430,290 380,290" fill="url(#mountFarShadow)" />
          <polygon points="210,110 255,160 238,170 210,154 185,168 170,156" fill="url(#snowLit)" />
          <polygon points="210,110 255,160 272,172 245,163" fill="url(#snowShadow)" />

          {/* Peak 2 Grand Center Summit */}
          <polygon points="520,70 760,300 260,300" fill="url(#mountFarLit)" />
          <polygon points="520,70 810,300 760,300" fill="url(#mountFarShadow)" />
          <polygon points="520,70 580,135 554,148 520,130 488,146 460,135" fill="url(#snowLit)" />
          <polygon points="520,70 580,135 604,152 566,143" fill="url(#snowShadow)" />

          {/* Peak 3 Right Summit near Sun */}
          <polygon points="1030,85 1270,300 840,300" fill="url(#mountFarLit)" />
          <polygon points="1030,85 1310,300 1270,300" fill="url(#mountFarShadow)" />
          <polygon points="1030,85 1085,142 1062,154 1030,136 1000,152 978,142" fill="url(#snowLit)" />
          <polygon points="1030,85 1085,142 1108,156 1074,148" fill="url(#snowShadow)" />

          {/* Distant Valley Mist */}
          <rect x="0" y="220" width="1440" height="100" fill="url(#mist1)" />

          {/* LAYER 2: Mid-range Majestic Mountains */}
          <path d="M-60,340 L160,165 L360,340 Z" fill="url(#mountMidLit)" />
          <path d="M160,165 L410,340 L360,340 Z" fill="url(#mountMidShadow)" />

          <path d="M240,340 L440,150 L710,350 L240,350 Z" fill="url(#mountMidLit)" />
          <path d="M440,150 L810,350 L710,350 Z" fill="url(#mountMidShadow)" />

          <path d="M620,350 L840,140 L1100,350 L620,350 Z" fill="url(#mountMidLit)" />
          <path d="M840,140 L1180,350 L1100,350 Z" fill="url(#mountMidShadow)" />

          <path d="M960,350 L1210,175 L1490,350 L960,350 Z" fill="url(#mountMidLit)" />
          <path d="M1210,175 L1540,350 L1490,350 Z" fill="url(#mountMidShadow)" />

          {/* Floating Morning Cloud Mist */}
          <path d="M0,270 Q300,240 600,275 T1200,265 T1440,285 L1440,330 L0,330 Z" fill="#ffffff" fillOpacity="0.4" />

          {/* LAYER 3: Foreground Foothills & Slopes */}
          <path d="M-80,420 L90,235 L330,420 Z" fill="url(#mountNearLit)" />
          <path d="M90,235 L400,420 L330,420 Z" fill="url(#mountNearShadow)" />

          <path d="M210,420 L400,240 L660,420 Z" fill="url(#mountNearLit)" />
          <path d="M400,240 L760,420 L660,420 Z" fill="url(#mountNearShadow)" />

          <path d="M550,420 L760,220 L1030,420 Z" fill="url(#mountNearLit)" />
          <path d="M760,220 L1130,420 L1030,420 Z" fill="url(#mountNearShadow)" />

          <path d="M900,420 L1130,235 L1400,420 Z" fill="url(#mountNearLit)" />
          <path d="M1130,235 L1520,420 L1400,420 Z" fill="url(#mountNearShadow)" />

          {/* Atmospheric Mist Over Horizon */}
          <rect x="0" y="310" width="1440" height="170" fill="url(#mist2)" />
        </svg>
      </div>

      <div className="page-wrap">
        <header className="topbar">
          <a href="#top" className="brand" aria-label="Chốt Công trang chủ">
            <span className="brand-mark brand-mark-image"><Image src="/mountain-logo.png" alt="" width={52} height={29} priority /></span>
            <span>chốt<span className="brand-light">công</span></span>
          </a>
          <div className="topbar-right">
            <span className="cloud-label"><span className="live-dot" /> Dữ liệu MongoDB</span>
            <button className="profile-chip" type="button" onClick={() => { setActiveTab("entry"); window.setTimeout(() => document.getElementById("employee-name")?.focus(), 0); }}>
              <span className="avatar">{(employeeName.trim()[0] || "T").toUpperCase()}</span>
              <span>{employeeName || "Thanh Phong"}</span>
              <ChevronDown size={15} />
            </button>
          </div>
        </header>

        <section className="welcome" id="top">
          <div>
            <div className="eyebrow"><Sparkles size={14} /> MỖI CA LÀM, MỘT BƯỚC TIẾN</div>
            <h1>Chấm công <span>nhẹ nhàng</span></h1>
            <p>Ghi ca làm, chốt công cuối tuần và theo dõi lương trong một nơi</p>
          </div>
          <div className="today-pill"><CalendarDays size={16} /> {selectedDate ? dateLabel(selectedDate) : "..."}</div>
        </section>

        {(error || message) && (
          <div className={`notice ${error ? "notice-error" : "notice-success"}`} role="status">
            {error ? <span className="notice-icon">!</span> : <Check size={16} />}
            <span>{withoutEndingPunctuation(error || message)}</span>
            <button type="button" aria-label="Đóng thông báo" onClick={() => { setError(""); setMessage(""); }}>×</button>
          </div>
        )}

        <nav className="app-tabs" aria-label="Các mục chấm công">
          <button type="button" className={activeTab === "week" ? "active" : ""} onClick={() => setActiveTab("week")}><CalendarDays size={16} /> Ca trong tuần <span>· text</span></button>
          <button type="button" className={activeTab === "entry" ? "active" : ""} onClick={() => setActiveTab("entry")}><Plus size={16} /> Ghi nhận ca làm</button>
          <button type="button" className={activeTab === "payroll" ? "active" : ""} onClick={() => setActiveTab("payroll")}><Wallet size={16} /> Tính công theo tuần</button>
        </nav>

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
                      <span className="shift-check">{selected && <Check size={12} strokeWidth={3} />}</span>
                      <span className="shift-code">{shift.code}</span>
                      <span className="shift-time">{shift.hours ? `${shift.start}:00 – ${shift.end}:00` : "Ngày nghỉ"}</span>
                      <span className="shift-hours">{shift.hours} giờ</span>
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
                <div><h2>Ca trong tuần</h2><p>Chọn ngày để mở nhanh phần ghi nhận</p></div>
              </div>
              <div className="week-days">
                {WEEKDAYS.map((weekday, index) => {
                  const date = addDays(weekStart || localDateString(new Date()), index);
                  const record = attendance.find((item) => item.date === date);
                  const isSelected = selectedDate === date;
                  return (
                    <button type="button" key={weekday} className={`day-card ${record ? "day-has-work" : ""} ${isSelected ? "day-selected" : ""}`} onClick={() => setSelectedDate(date)}>
                      <span className="day-name">{weekday}</span>
                      <span className="day-number">{date.slice(-2)}</span>
                      {record ? <span className="day-meta">{record.shifts.map((shift) => shift.code).join(" · ")}</span> : <span className="day-meta empty-meta">Chưa có ca</span>}
                      <span className="day-hours">{record ? `${record.totalHours} giờ` : "—"}</span>
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

            {activeTab === "week" && (
            <section className="panel export-panel">
              <div className="section-heading export-heading">
                <div className="heading-icon heading-icon-violet"><FileText size={18} /></div>
                <div><h2>Text chốt công</h2><p>{weekStart && formatWeekRange(weekStart, weekEnd)}</p></div>
              </div>
              <div className="export-preview">
                <pre>{exportText}</pre>
                <button type="button" className="copy-button" aria-label="Sao chép nội dung" onClick={copyText}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
              </div>
              <button className="export-button" type="button" onClick={copyText}>{copied ? <><Check size={16} /> Đã sao chép</> : <><Copy size={16} /> Sao chép text</>}</button>
              <div className="export-footnote"><span><ArrowDownToLine size={14} /> Dán vào nhóm chốt công</span><span>{attendance.filter((item) => item.totalHours > 0).length} ngày</span></div>
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
          </aside>
        </div>

        <footer className="footer-note"><span>Chốt công, an tâm cuối tuần</span><span>Được lưu an toàn trong cơ sở dữ liệu <span className="footer-cloud">◉</span></span></footer>
      </div>
    </main>
  );
}
