// Kanallar için ortak yardımcılar: reklam vergisi, hesap durumu, nakit sınırı ile harcama.
import { pn } from '../core/params';
import type { DayCtx } from '../core/ctx';
import { addTo } from '../core/ctx';
import type { GameState, PaidChannel } from '../core/types';

/** Reklam faturasına eklenen vergi oranı (TR: DHV, Meta konum ücreti vb.; yoksa 0). */
export function adTaxRate(s: GameState, ch: PaidChannel): number {
  return pn(s, 'tax.dhv_rate', 0) + (ch === 'meta' ? pn(s, 'tax.meta_location_fee', 0) : 0);
}

export function accountActive(s: GameState, ch: PaidChannel): boolean {
  const a = s.accounts[ch];
  return !a.permanent && (a.suspendedUntil === null || a.suspendedUntil <= s.day);
}

/** Harcamayı nakitten düşer (vergi dahil) ve günlük birikimlere yazar. */
export function chargeAds(s: GameState, ctx: DayCtx, ch: PaidChannel, cost: number): void {
  const tax = cost * adTaxRate(s, ch);
  s.cash -= cost + tax;
  s.ledger.adSpend += cost;
  s.ledger.adTax += tax;
  ctx.cashLimit -= cost + tax;
  ctx.acc.cashOut += cost + tax;
  addTo(ctx.acc.spend, ch, cost);
  addTo(ctx.acc.spend, 'adTax', tax);
}
