// Biçimlendirme: para/sayı/tarih pazar yerel ayarına göre (Intl). Dil (TR/EN) arayüz metnini belirler, yerel ayar sayıları.
import { addDays } from '@engine/data/freshness';

export interface Fmt {
  locale: string;
  currency: string;
  money: (v: number | null | undefined, digits?: number) => string;
  num: (v: number | null | undefined, digits?: number) => string;
  pct: (v: number | null | undefined, digits?: number) => string;
  date: (iso: string) => string;
  gameDate: (startDate: string, day: number) => string;
}

const DASH = '—';

export function makeFmt(locale: string, currency: string): Fmt {
  const safe = (fn: () => string): string => {
    try {
      return fn();
    } catch {
      return DASH;
    }
  };
  const ok = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
  const money = (v: number | null | undefined, digits?: number) =>
    !ok(v) ? DASH : safe(() => new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: digits ?? (Math.abs(v) >= 100 ? 0 : 2), minimumFractionDigits: digits ?? 0 }).format(v));
  const num = (v: number | null | undefined, digits = 1) => (!ok(v) ? DASH : safe(() => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v)));
  const pct = (v: number | null | undefined, digits = 1) => (!ok(v) ? DASH : safe(() => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: digits }).format(v)));
  const date = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    return safe(() => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))));
  };
  return { locale, currency, money, num, pct, date, gameDate: (start, day) => date(addDays(start, day)) };
}

/** Haftanın günü: 0=Pzt .. 6=Paz (oyun takvimi). */
export function weekdayIndex(startDate: string, day: number): number {
  const iso = addDays(startDate, day);
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
