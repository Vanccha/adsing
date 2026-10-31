// Müşteri tarafı: faturalama (+ödeme hatası/dunning, KDV, komisyon, değişken maliyet), kohort churn, MRR hareketleri.
// Churn: aylık tehlike h = churn.monthly_base x g(onboarding) x (1 + (early-1)·exp(-yaş/decay)) x olay çarpanı (+ eklemeli şok).
// MRR kimliği: MRR_son = MRR_ilk + yeni + genişleme - daralma - churn (her gün).
import { K } from '../core/constants';
import type { DayCtx } from '../core/ctx';
import { pn } from '../core/params';
import type { Cohort, GameState, Segment } from '../core/types';
import { clamp, clamp01, modAdd, modMult } from '../core/util';

export function grossMargin(s: GameState): number {
  return clamp01(pn(s, 'scn.gross_margin', K.grossMarginDefault));
}

/** Satış vergisi / KDV oranı (US: oran 0 ise SaaS vergilenebilir payı x ortalama oran). */
export function effectiveTaxRate(s: GameState): number {
  const v = pn(s, 'tax.vat_rate', 0);
  if (v > 0) return v;
  return pn(s, 'tax.saas_taxable_share', 0) * pn(s, 'tax.saas_avg_rate', 0);
}

/** Kohortun aylık churn tehlikesi (yaş: ay). */
export function monthlyHazard(s: GameState, onb: number, ageMonths: number, seg: Segment = 'solo'): number {
  const base = pn(s, 'churn.monthly_base');
  const g = K.onbChurnA - K.onbChurnB * onb;
  const early = pn(s, 'scn.churn_early_mult', 1 + K.earlyChurnBoost);
  const decay = pn(s, 'scn.churn_decay_months', K.earlyChurnTauMonths);
  const h = base * g * (1 + (early - 1) * Math.exp(-ageMonths / decay)) * K.segment[seg].churn * modMult(s, 'churn') + modAdd(s, 'churn_add');
  return clamp(h, 0, 0.95);
}

export const dailyFromMonthly = (h: number): number => 1 - Math.pow(1 - h, 1 / 30);

/** Aşama 8. */
export function runBilling(s: GameState, ctx: DayCtx): void {
  const rng = ctx.root.fork('billing');
  const rate = effectiveTaxRate(s);
  const feePct = pn(s, 'pay.fee_pct');
  const feeFixed = pn(s, 'pay.fee_fixed');
  const gm = grossMargin(s);
  const failRate = pn(s, 'pay.fail_rate', K.payFailRate);
  for (const c of s.cohorts) {
    const age = s.day - c.startDay;
    if (c.alive <= 0 || age % 30 !== 0) continue;
    const r = rng.fork(`c${c.id}`);
    // Ödeme hatası: dunning ile bir kısmı geri kazanılır, kalanı istem dışı churn olur.
    if (age > 0) {
      const failed = r.binomial(c.alive, failRate);
      const lost = r.binomial(failed, 1 - pn(s, 'pay.dunning_recover', K.dunningRecover));
      c.alive -= lost;
      c.churned += lost;
      ctx.acc.churned += lost;
      ctx.acc.mrrMove.churn += lost * c.arpa;
    }
    const payers = c.alive;
    if (payers <= 0) continue;
    const net = payers * c.arpa;
    const vat = net * rate;
    const fee = feePct * (net + vat) + feeFixed * payers;
    const cogs = net * (1 - gm);
    s.cash += net + vat - fee - cogs;
    s.ledger.revenue += net;
    s.ledger.vatCollected += vat;
    s.ledger.payFees += fee;
    s.ledger.cogs += cogs;
    ctx.acc.revenueNet += net;
  }
}

/** Aşama 9: churn + genişleme/daralma + MRR. */
export function runChurn(s: GameState, ctx: DayCtx): void {
  const rng = ctx.root.fork('churn');
  const e = pn(s, 'mrr.expansion_monthly', K.expansionMonthly) / 30;
  const k = pn(s, 'mrr.contraction_monthly', K.contractionMonthly) / 30;
  for (const c of s.cohorts) {
    if (c.alive <= 0) continue;
    const age = s.day - c.startDay;
    if (age >= 1) {
      const p = dailyFromMonthly(monthlyHazard(s, c.onb, age / 30, c.seg ?? 'solo'));
      const ch = rng.fork(`c${c.id}`).binomial(c.alive, p);
      c.alive -= ch;
      c.churned += ch;
      ctx.acc.churned += ch;
      ctx.acc.mrrMove.churn += ch * c.arpa;
    }
    if (c.alive > 0) {
      ctx.acc.mrrMove.expansion += c.alive * c.arpa * e;
      ctx.acc.mrrMove.contraction += c.alive * c.arpa * k;
      c.arpa *= 1 + e - k;
    }
  }
  s.mrr = mrrOf(s.cohorts);
}

export const mrrOf = (cohorts: readonly Cohort[]): number => cohorts.reduce((a, c) => a + c.alive * c.arpa, 0);
export const activeCustomers = (s: Pick<GameState, 'cohorts'>): number => s.cohorts.reduce((a, c) => a + c.alive, 0);

/** Onboarding kalitesi dinamiği: tahsis edilen saat + dokümantasyon hedefe doğru çeker. */
export function updateOnboarding(s: GameState): void {
  const alloc = Math.min(s.founder.reserved.onboarding, s.founder.capacityToday);
  const target = clamp01(K.onbBase + K.onbGain * (1 - Math.exp(-alloc / K.onbHalfHours)) + s.founder.docsStock);
  s.product.onboarding = clamp01(s.product.onboarding + K.onbRate * (target - s.product.onboarding));
  s.founder.docsStock *= 1 - K.docsDecay;
}
