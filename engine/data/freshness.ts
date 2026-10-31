// Tazelik mantığı: kaynak tarihi (published, yoksa accessed) 12 aydan eskiyse "bayat".
// Motor sistem saatini okumaz: "bugün" her zaman parametre olarak verilir.

export const STALE_MONTHS = 12;
export const DEFAULT_REF_DATE = '2026-10-31'; // brief: bugün

export type FreshnessStatus = 'ok' | 'stale' | 'unsourced';

export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const dim = new Array(12).fill(0).map((_, i) => daysInMonth(ny, i + 1))[nm - 1] as number;
  const nd = Math.min(d, dim);
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** Tarih (YYYY-MM-DD) için gün numarası (sivil takvim, Date kullanmadan). */
export function dayNumber(date: string): number {
  const [y0, m, d] = date.split('-').map(Number) as [number, number, number];
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Tarihe gün ekler. */
export function addDays(date: string, days: number): string {
  const z = dayNumber(date) + days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const yy = m <= 2 ? y + 1 : y;
  return `${String(yy).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function isStale(refDate: string, today: string): boolean {
  return today > addMonths(refDate, STALE_MONTHS);
}

export function ageMonths(refDate: string, today: string): number {
  const [ry, rm, rd] = refDate.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  return (ty - ry) * 12 + (tm - rm) - (td < rd ? 1 : 0);
}

/** Kaynak referans tarihi: published, yoksa accessed. */
export function sourceRefDate(src: { published?: string | null; accessed?: string | null } | null | undefined): string | null {
  if (!src) return null;
  return src.published ?? src.accessed ?? null;
}

export function olderOf(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? a : b;
}
