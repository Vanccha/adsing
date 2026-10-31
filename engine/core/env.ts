// Ortam: takvim, mevsimsellik (pazar meta.seasonality), tatiller ve talep/maliyet çarpanları.
import { addDays } from '../data/freshness';
import { K } from './constants';
import type { GameState } from './types';
import { dayOfWeek, modMult } from './util';
import { dayNumber } from '../data/freshness';

export const dateOf = (s: Pick<GameState, 'startDate'>, day: number): string => addDays(s.startDate, day);
export const monthKey = (date: string): string => date.slice(5, 7);

export function startDow(startDate: string): number {
  return (((dayNumber(startDate) + 4) % 7) + 7) % 7; // 1970-01-01 Perşembe (4)
}

export function dowOf(s: Pick<GameState, 'startDate' | 'day'>, day = s.day): number {
  return dayOfWeek(startDow(s.startDate), day);
}

export function holidayFx(s: Pick<GameState, 'startDate' | 'day' | 'holidays'>, day = s.day): { salonDemand: number; saasBuying: number; closed: boolean } {
  const d = dateOf(s, day);
  let sd = 1;
  let sb = 1;
  let closed = false;
  for (const h of s.holidays) {
    if (d >= h.date && d <= h.endDate) {
      sd *= h.salonDemand;
      sb *= h.saasBuying;
      closed = closed || h.closed;
    }
  }
  return { salonDemand: sd, saasBuying: sb, closed };
}

const seas = (rec: Record<string, number>, m: string): number => rec[m] ?? 1;

/** Arama/talep hacmi çarpanı (haftanın günü x mevsim x tatil x olay modifier'ı). */
export function demandFactor(s: GameState, day = s.day): number {
  const m = monthKey(dateOf(s, day));
  return K.weekdayShape[dowOf(s, day)]! * seas(s.seasonality.salonDemand, m) * holidayFx(s, day).salonDemand * modMult(s, 'demand');
}

/** Reklam maliyeti (CPC/CPM) mevsim çarpanı. */
export function adCostFactor(s: GameState, day = s.day): number {
  return seas(s.seasonality.adCost, monthKey(dateOf(s, day)));
}

/** SaaS satın alma eğilimi (lead -> deneme/ücretli etkisi). */
export function buyingFactor(s: GameState, day = s.day): number {
  return seas(s.seasonality.saasBuying, monthKey(dateOf(s, day))) * holidayFx(s, day).saasBuying;
}

/** Pazar kanal göreli etkinliği (meta.channels[x].relative). Yoksa 1. */
export function channelRelative(s: GameState, key: string, fallback = 1): number {
  return s.channelRel[key]?.relative ?? fallback;
}

/** Marka bilinirliği 0-1 (türetilmiş: gösterim, müşteri ve yorumlardan). */
export function awareness(s: GameState): number {
  const salons = typeof s.params['market.salon_count'] === 'number' ? (s.params['market.salon_count'] as number) : 1e5;
  let customers = 0;
  for (const c of s.cohorts) customers += c.n0;
  const mass = s.funnel.cum.impressions + 50 * customers + 20 * s.local.gbp.reviews;
  return 1 - Math.exp(-mass / (salons * K.awarenessScale));
}

/** O günkü kurucu kapasitesi (saat): hafta içi hpw/6, hafta sonu hpw/12 (haftalık toplam = hpw). */
export function founderCapacity(s: GameState, day = s.day): number {
  const hpw = typeof s.params['founder.hours_per_week'] === 'number' ? (s.params['founder.hours_per_week'] as number) : 40;
  const d = dowOf(s, day);
  return d === 0 || d === 6 ? hpw / 12 : hpw / 6;
}
