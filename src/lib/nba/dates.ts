export const DISPLAY_TIME_ZONE = "Asia/Shanghai";

export function dateInZone(iso: string | number | Date, timeZone = DISPLAY_TIME_ZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function todayIso(): string {
  return dateInZone(Date.now());
}

export function normalizeDate(input?: string | null): string {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return todayIso();
  const parsed = new Date(`${input}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input) return todayIso();
  return input;
}

/** ESPN 按美国东部比赛日查询；覆盖北京时间自然日的两端，兼容夏令时。 */
export function espnQueryDates(date: string): string[] {
  const start = new Date(`${date}T00:00:00+08:00`).getTime();
  return [...new Set([start, start + 24 * 3600 * 1000 - 1]
    .map((time) => dateInZone(time, "America/New_York")))];
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function formatDateZh(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${WEEK[d.getUTCDay()]}`;
}

export function timeZh(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(d);
  return `${dateInZone(d).slice(5)} ${time} 北京时间`;
}

/** 比赛卡片保留英文日期及 AM/PM 表达，始终展示北京时间。 */
export function gameTimeEn(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIME_ZONE, month: "short", day: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(date);
  return `${day}, ${time} GMT+8`;
}

export function relativeZh(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 60) return mins >= 0 ? `${mins} 分钟前` : `${-mins} 分钟后`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return hours >= 0 ? `${hours} 小时前` : `${-hours} 小时后`;
  const days = Math.round(hours / 24);
  return days >= 0 ? `${days} 天前` : `${-days} 天后`;
}
