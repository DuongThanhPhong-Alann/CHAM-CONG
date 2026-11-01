export const SHIFT_OPTIONS = [
  { code: "A", start: 8, end: 12, hours: 4, tone: "yellow" },
  { code: "B", start: 12, end: 18, hours: 6, tone: "green" },
  { code: "C", start: 18, end: 22, hours: 4, tone: "cyan" },
  { code: "F2", start: 16, end: 22, hours: 6, tone: "blue" },
  { code: "F1", start: 8, end: 16, hours: 8, tone: "orange" },
  { code: "BC", start: 12, end: 22, hours: 10, tone: "sky" },
  { code: "FA", start: 8, end: 18, hours: 10, tone: "lime" },
  { code: "FB", start: 14, end: 22, hours: 8, tone: "sage" },
  { code: "O", start: 0, end: 0, hours: 0, tone: "rest" },
] as const;

export type ShiftCode = (typeof SHIFT_OPTIONS)[number]["code"];
export type Shift = { code: ShiftCode; start: number; end: number; hours: number };

export function isShiftCode(code: unknown): code is ShiftCode {
  return typeof code === "string" && SHIFT_OPTIONS.some((shift) => shift.code === code);
}
