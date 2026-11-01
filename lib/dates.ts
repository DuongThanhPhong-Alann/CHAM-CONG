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
