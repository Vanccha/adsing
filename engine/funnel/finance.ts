// Finans: sabit giderler, KDV/vergi ödemeleri, nakit muhasebesi kimliği, LTV / CAC / payback.
// Nakit kimliği: nakit = başlangıç + gelir + tahsil edilen KDV - (ödenen KDV + değişken maliyet + komisyon + reklam + reklam vergisi
//                + sabit + satış elemanı + araç + aksiyon maliyeti + referans ödülü + gelir vergisi + cezalar).
import { K } from '../core/constants';
import type { DayCtx } from '../core/ctx';
import { pn, priceCost } from '../core/params';
import type { GameState, Ledger } from '../core/types';
import { grossMargin } from './customers';

export function ledgerOut(l: Ledger): number {
  return l.vatRemitted + l.cogs + l.payFees + l.adSpend + l.adTax + l.fixed + l.reps + l.tools + l.actionCosts + l.referralRewards + l.incomeTax + l.fines;
}
export const ledgerIn = (l: Ledger): number => l.revenue + l.vatCollected;
export const ledgerCash = (s: GameState): number => s.startCash + ledgerIn(s.ledger) - ledgerOut(s.ledger);

export const fixedMonthly = (s: GameState): number => pn(s, 'scn.fixed_costs_monthly', priceCost(s, K.fixedMonthlyPriceMult));
export const repMonthly = (s: GameState): number => pn(s, 'cost.rep_monthly', priceCost(s, K.repMonthlyPriceMult));
export const autoReplyMonthly = (s: GameState): number => pn(s, 'cost.auto_reply_monthly', priceCost(s, K.autoReplyMonthlyPriceMult));

/** Aşama 10: sabit giderler, araçlar, satış elemanı maaşı; aylık KDV iadesi ve gelir vergisi. */
export function runCash(s: GameState, ctx: DayCtx): void {
  void ctx;
  const fixed = fixedMonthly(s) / 30;
  const reps = (s.reps * repMonthly(s)) / 30;
  const tools = s.autoReply ? autoReplyMonthly(s) / 30 : 0;
  s.cash -= fixed + reps + tools;
  s.ledger.fixed += fixed;
  s.ledger.reps += reps;
  s.ledger.tools += tools;
  if (s.day % 30 === 29) {
    const vatDue = s.ledger.vatCollected - s.ledger.vatRemitted;
    if (vatDue > 0) {
      s.cash -= vatDue;
      s.ledger.vatRemitted += vatDue;
    }
    const rate = pn(s, 'tax.corporate_rate', 0);
    if (rate > 0) {
      const l = s.ledger;
      const profit = l.revenue - (l.cogs + l.payFees + l.adSpend + l.adTax + l.fixed + l.reps + l.tools + l.actionCosts + l.referralRewards + l.fines);
      const due = Math.max(0, rate * profit - l.incomeTax);
      if (due > 0) {
        s.cash -= due;
        l.incomeTax += due;
      }
    }
  }
}

// ---- Birim ekonomi ----

export interface UnitEconomics {
  arpa: number;
  grossMargin: number;
  monthlyChurn: number; // gözlenen kohort churn'ü (yoksa model tabanı)
  ltv: number;
  cacFull: number | null; // tam yüklü
  cacAds: number | null; // yalnızca reklam
  ltvCac: number | null;
  paybackMonths: number | null;
  newCustomers: number;
}

/** Pencere (gün) içindeki yeni müşteri ve harcamalar üzerinden CAC; gözlenen churn'den LTV. */
export function unitEconomics(s: GameState, windowDays = 90): UnitEconomics {
  const hist = s.history.slice(-windowDays);
  let spend = 0;
  let newC = 0;
  let hours = 0;
  for (const h of hist) {
    spend += (h.spend.google ?? 0) + (h.spend.meta ?? 0) + (h.spend.adTax ?? 0);
    for (const v of Object.values(h.newCustomers)) newC += v;
    hours += h.hoursUsed;
  }
  const days = Math.max(1, hist.length);
  const arpa = s.cohorts.length ? s.mrr / Math.max(1, s.cohorts.reduce((a, c) => a + c.alive, 0)) : s.product.price;
  const gm = grossMargin(s);
  // gözlenen aylık churn: müşteri-ay başına kayıp
  let churned = 0;
  let custDays = 0;
  for (const c of s.cohorts) {
    churned += c.churned;
    const life = Math.max(0, s.day - c.startDay);
    custDays += c.n0 * life - (c.churned * life) / 2;
  }
  const observedChurn = custDays > 60 ? (churned / custDays) * 30 : 0;
  const monthlyChurn = observedChurn > 0 ? observedChurn : pn(s, 'churn.monthly_base');
  const ltv = (arpa * gm) / Math.max(monthlyChurn, 1e-6);
  // tam yüklü: reklam + araç + satış elemanı + kurucu saat değeri + referans ödülü
  const toolCost = ((s.autoReply ? autoReplyMonthly(s) : 0) + s.reps * repMonthly(s)) * (days / 30);
  const hourValue = pn(s, 'founder.hour_value', priceCost(s, K.founderHourValuePriceMult));
  const full = spend + toolCost + hours * hourValue;
  const cacFull = newC > 0 ? full / newC : null;
  const cacAds = newC > 0 ? spend / newC : null;
  return {
    arpa,
    grossMargin: gm,
    monthlyChurn,
    ltv,
    cacFull,
    cacAds,
    ltvCac: cacFull !== null && cacFull > 0 ? ltv / cacFull : null,
    paybackMonths: cacFull !== null ? cacFull / Math.max(arpa * gm, 1e-9) : null,
    newCustomers: newC,
  };
}
