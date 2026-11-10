// Tiện ích ngày tháng – làm việc thuần với chuỗi YYYY-MM-DD theo UTC để tránh lệch múi giờ.

export const WEEKDAYS_VI = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
export const WEEKDAYS_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
/** Thứ tự hiển thị Thứ 2 → CN (giá trị getUTCDay) */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function weekday(iso: string): number {
  return parseISO(iso).getUTCDay();
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function fmtDateWd(iso: string): string {
  return `${WEEKDAYS_SHORT[weekday(iso)]} ${fmtDate(iso)}`;
}

export interface DatePair {
  depart: string;
  ret: string;
  duration: number;
}

/**
 * Sinh danh sách cặp ngày: Ngày về = Ngày đi + (Tổng số ngày − 1).
 * VD: 5 ngày, đi Thứ Hai → về Thứ Sáu.
 */
export function generatePairs(start: string, end: string, weekdays: number[], durations: number[]): DatePair[] {
  const out: DatePair[] = [];
  if (!start || !end || start > end) return out;
  const wd = new Set(weekdays);
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (!wd.has(weekday(d))) continue;
    for (const dur of durations) {
      if (dur < 1) continue;
      out.push({ depart: d, ret: addDays(d, dur - 1), duration: dur });
    }
  }
  return out;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fmtDuration(min: number): string {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}g${m ? ` ${String(m).padStart(2, "0")}p` : ""}` : `${m}p`;
}
