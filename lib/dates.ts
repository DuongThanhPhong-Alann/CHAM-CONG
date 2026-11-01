export function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function mondayOf(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return localDateString(date);
}

export function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

export function dateLabel(dateString: string) {
  const [year, month, day] = dateString.split("-");
  return `${day}/${month}`;
}

export function isoWeekValue(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  const thursday = new Date(year, month - 1, day, 12);
  thursday.setDate(thursday.getDate() + 3);
  const isoYear = thursday.getFullYear();
  const januaryFourth = new Date(isoYear, 0, 4, 12);
  const firstMonday = new Date(januaryFourth);
  firstMonday.setDate(januaryFourth.getDate() - ((januaryFourth.getDay() + 6) % 7));
  const weekNumber = 1 + Math.floor((thursday.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${isoYear}-W${String(weekNumber).padStart(2, "0")}`;
}

export function mondayFromIsoWeek(weekValue: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekValue);
  if (!match) return "";
  const isoYear = Number(match[1]);
  const weekNumber = Number(match[2]);
  if (weekNumber < 1 || weekNumber > 53) return "";
  const januaryFourth = new Date(isoYear, 0, 4, 12);
  const monday = new Date(januaryFourth);
  monday.setDate(januaryFourth.getDate() - ((januaryFourth.getDay() + 6) % 7) + (weekNumber - 1) * 7);
  const mondayString = localDateString(monday);
  return isoWeekValue(mondayString) === weekValue ? mondayString : "";
}
