export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeDate(input?: string | null): string {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return todayIso();
  return input;
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
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi} UTC`;
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
