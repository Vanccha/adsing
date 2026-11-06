// Vaka metrik kimliklerini (cases/metrics-and-actions.md) motor durumuna eşler.
// Değerler GERÇEK (true) durumdan okunur: vaka tetikleme dünyanın durumuna bağlıdır; oyuncuya gösterilen sürüm seçicilerdedir.
// Eşlenemeyen kimlik => null (koşul sağlanmaz). Eşleme notları docs/engine-api.md'de.
import { K } from '../core/constants';
import { dateOf, holidayFx, monthKey } from '../core/env';
import { hasParam, pn } from '../core/params';
import type { GameState } from '../core/types';
import { clamp, clamp01, modMult } from '../core/util';
import { activeCustomers } from '../funnel/customers';
import { unitEconomics } from '../funnel/finance';
import { priceFactor } from '../funnel/rates';
import { consentEff, trackedFraction } from '../measurement/tracking';
import { cac as cacSel, runwayMonths } from '../selectors/internal';

export type MetricValue = number | string | null;

const lastN = (s: GameState, n: number) => s.history.slice(-n);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const flag = (s: GameState, id: string): number => {
  const f = s.cases.flags[id];
  return f && f.until > s.day ? f.value : 0;
};
const sumRec = (rs: Array<Record<string, number> | undefined>, key?: string): number => {
  let t = 0;
  for (const r of rs) if (r) for (const [k, v] of Object.entries(r)) if (!key || k === key) t += v;
  return t;
};

/** Vergi tahmini sapması (derived.tax_due_estimate): bekleyen KDV borcunun K.taxSurpriseFrac'i. */
export function taxDueEstimate(s: GameState): number {
  const vatOwed = Math.max(0, s.ledger.vatCollected - s.ledger.vatRemitted);
  const rate = pn(s, 'tax.corporate_rate', 0);
  const l = s.ledger;
  const profit = l.revenue - (l.cogs + l.payFees + l.adSpend + l.adTax + l.fixed + l.reps + l.tools + l.actionCosts + l.referralRewards + l.fines);
  const inc = Math.max(0, rate * profit - l.incomeTax);
  return K.taxSurpriseFrac * (vatOwed + inc);
}

export function maxMarginalCac(s: GameState): number {
  const ue = unitEconomics(s, 90);
  return ue.ltv / K.maxMarginalLtvRatio; // oyuncunun hedefinden bağımsız kanal güvenlik eşiği
}

const adSets = (s: GameState) => s.meta.adSets.filter((a) => a.status === 'active');
const smartCamps = (s: GameState) => s.google.campaigns.filter((c) => c.status === 'active' && c.strategy !== 'manual');
const META_EDITS = new Set(['meta.set_audience', 'meta.add_creative', 'meta.remove_creative', 'meta.set_budget', 'meta.set_status']);

function seasonalIndex(s: GameState): number {
  const m = monthKey(dateOf(s, s.day));
  const mo = s.seasonality.salonDemand[m] ?? 1;
  return mo * holidayFx(s).salonDemand * modMult(s, 'seasonal');
}

function earlyChurn(s: GameState): number {
  // ilk 3 ay kohortlarının ortalama aylık kayıp oranı
  let lost = 0;
  let exposure = 0;
  for (const c of s.cohorts) {
    const ageD = s.day - c.startDay;
    if (ageD < 15 || ageD > 100) continue;
    lost += c.churned;
    exposure += c.n0 * (ageD / 30) - (c.churned * (ageD / 30)) / 2;
  }
  return exposure > 1 ? lost / exposure : 0;
}

export type MetricFn = (s: GameState) => MetricValue;

const M: Record<string, MetricFn> = {
  // En kötü hesap: riskli iddia sayısı (gads.policy_risk_claims) Google ve Meta reklamlarını birlikte sayar
  'account.health': (s) => Math.min(s.accounts.google.health, s.accounts.meta.health),
  'cash.avg_cac': (s) => unitEconomics(s, 90).cacFull,
  'cash.balance': (s) => s.cash,
  'cash.collection_vs_mrr': (s) => (s.mrr > 0 ? sum(lastN(s, 30).map((r) => r.revenueNet)) / s.mrr : null),
  'cash.ltv_cac': (s) => unitEconomics(s, 90).ltvCac,
  'cash.marginal_cac': (s) => {
    const m = cacSel(s, { marginal: true }).marginal ?? {};
    const vals = Object.values(m).filter((x): x is number => x !== null && Number.isFinite(x));
    return vals.length ? Math.max(...vals) : null;
  },
  'cash.payment_failure_rate': (s) => pn(s, 'pay.fail_rate', K.payFailRate),
  'cash.runway_months': (s) => {
    const r = runwayMonths(s);
    return Number.isFinite(r) ? r : 999;
  },
  'cash.tax_reserve': (s) => flag(s, 'tax_reserve'),
  'competitor.brand_search_trend': (s) => {
    const h = s.cases.compIdx;
    if (h.length < 2) return 0;
    return (h[h.length - 1] as number) / (h[0] as number) - 1;
  },
  'competitor.price_index': (s) => {
    const anchor = hasParam(s, 'price.anchor.mean') ? pn(s, 'price.anchor.mean') : pn(s, 'price.monthly');
    return (anchor * (flag(s, 'competitor_price_cut') ? 0.8 : 1)) / Math.max(s.product.price, 1e-9);
  },
  day: (s) => s.day + 1,
  'event.competitor_price_cut_active': (s) => (flag(s, 'competitor_price_cut') || s.modifiers.some((m) => m.source === 'competitor_price_cut' && m.until > s.day) ? 1 : 0),
  'event.negative_review_active': (s) => flag(s, 'negative_review_active') || (s.modifiers.some((m) => m.source === 'review_crisis' && m.until > s.day) ? 1 : 0),
  'event.site_update_recent': (s) => flag(s, 'site_update'),
  'event.tax_due_soon': (s) => {
    const toDue = (29 - (s.day % 30) + 30) % 30; // KDV/vergi günü: day % 30 === 29
    // 'Sürpriz': ödeme yakın VE tutar kasaya göre ağır (nakdin %12'sinden fazla)
    const heavy = s.ledger.vatCollected - s.ledger.vatRemitted > K.taxHeavyCashFrac * Math.max(s.cash, 1);
    return toDue <= K.taxDueSoonDays && taxDueEstimate(s) > 0 && heavy ? 1 : 0;
  },
  'funnel.activation_rate': (s) => {
    const open = sum(s.funnel.trials.map((t) => t.n));
    const closed = s.funnel.cum.trials - open;
    return closed > 5 ? s.funnel.cum.activated / closed : null;
  },
  'funnel.email_deliverability': (s) => clamp01(s.local.outreach.domainHealth * modMult(s, 'email_deliv')),
  'funnel.lead_response_hours': (s) => {
    const h = lastN(s, 7);
    const n = sum(h.map((r) => r.respN ?? 0));
    return n > 0 ? sum(h.map((r) => r.respHoursSum ?? 0)) / n : null;
  },
  'funnel.lead_to_trial': (s) => (s.funnel.cum.leads > 20 ? s.funnel.cum.trials / s.funnel.cum.leads : null),
  'funnel.leads_7d': (s) => sum(lastN(s, 7).map((r) => r.stages.leads)),
  'funnel.price_objection_rate': (s) => clamp01(0.15 + 0.6 * Math.max(0, 1 - priceFactor(s)) + (flag(s, 'competitor_price_cut') ? 0.15 : 0)),
  'funnel.trial_start_rate': (s) => (s.funnel.cum.qualified > 20 ? s.funnel.cum.trials / s.funnel.cum.qualified : null),
  'funnel.trial_to_paid': (s) => {
    const open = sum(s.funnel.trials.map((t) => t.n));
    const closed = s.funnel.cum.trials - open;
    return closed > 5 ? s.funnel.cum.paid / closed : null;
  },
  'funnel.unreachable_leads_7d': (s) => sum(lastN(s, 7).map((r) => r.unreachable ?? 0)),
  // Dönüşüm ağırlıklı pay: PMax'in CPA'sını güzel gösteren marka dönüşümleridir (tıklama payı düşük kalsa da)
  'gads.brand_query_share': (s) => {
    const h = lastN(s, 7).map((r) => r.gCls);
    let brand = 0;
    let total = 0;
    for (const r of h) {
      if (!r) continue;
      for (const [k, v] of Object.entries(r)) {
        const w = v * (K.classCvrMult[k as keyof typeof K.classCvrMult] ?? 0);
        total += w;
        if (k === 'brand') brand += w;
      }
    }
    return total > 0 ? brand / total : 0;
  },
  'gads.budget_jump_ratio_7d': (s) => {
    const prev = s.history.slice(-14, -7).map((r) => r.gBudget ?? 0);
    if (prev.length < 7 || prev.some((x) => x <= 0)) return null; // yeni kampanyanın başlangıcı sıçrama sayılmaz
    return sum(lastN(s, 7).map((r) => r.gBudget ?? 0)) / sum(prev);
  },
  'gads.clicks_7d': (s) => sum(lastN(s, 7).map((r) => r.gClicks ?? 0)),
  'gads.cpa_observed': (s) => {
    const h = lastN(s, 7);
    const conv = sum(h.map((r) => r.platformConv.google ?? 0));
    return conv > 0 ? sum(h.map((r) => r.spend.google ?? 0)) / conv : null;
  },
  'gads.cpc_observed': (s) => {
    const h = lastN(s, 7);
    const c = sum(h.map((r) => r.gClicks ?? 0));
    return c > 0 ? sum(h.map((r) => r.spend.google ?? 0)) / c : null;
  },
  'gads.impressions_7d': (s) => sum(lastN(s, 7).map((r) => r.gImpr ?? 0)),
  'gads.lead_quality': (s) => {
    const b = s.funnel.byChannel.google;
    return b && b.leads > 10 ? b.qualified / b.leads : null;
  },
  'gads.match_broad_share': (s) => {
    const h = lastN(s, 7).map((r) => r.gMatchCost);
    const t = sumRec(h);
    return t > 0 ? sumRec(h, 'broad') / t : 0;
  },
  'gads.negative_keywords_count': (s) => s.google.campaigns.reduce((a, c) => a + c.negatives.length, 0) * K.negativesPerClass,
  'gads.pmax_enabled': (s) => (s.google.campaigns.some((c) => c.type === 'pmax' && c.status === 'active') ? 1 : 0),
  'gads.policy_risk_claims': (s) => {
    let n = 0;
    const used = new Set<string>();
    for (const c of s.google.campaigns) if (c.status === 'active') for (const g of c.adGroups) used.add(g.creativeId);
    for (const a of adSets(s)) for (const ad of a.ads) used.add(ad.creativeId);
    for (const cr of s.assets.creatives) if (cr.bold && used.has(cr.id)) n += 1;
    return n;
  },
  'gads.policy_status': (s) => {
    const a = s.accounts.google;
    return a.permanent || (a.suspendedUntil !== null && a.suspendedUntil > s.day) ? 'suspended' : a.health < 0.4 ? 'restricted' : a.health < 0.7 ? 'warning' : 'ok';
  },
  'gads.share_irrelevant_queries_7d': (s) => {
    const h = lastN(s, 7).map((r) => r.gCls);
    const t = sumRec(h) - sumRec(h, 'brand');
    if (t < 30) return 0;
    return (sumRec(h, 'irrelevant') + sumRec(h, 'info')) / t;
  },
  'gads.smart_bidding_enabled': (s) => (smartCamps(s).length > 0 ? 1 : 0),
  'gads.smart_state': (s) => smartCamps(s)[0]?.learning.state ?? null,
  'gads.spend_7d': (s) => sum(lastN(s, 7).map((r) => r.spend.google ?? 0)),
  'legal.cold_outreach_active': (s) => (s.local.outreach.sent30 > 1 ? 1 : 0),
  'legal.complaints_30d': (s) => s.cases.complaints.filter((d) => d > s.day - 30).length,
  'legal.compliant_list': (s) => flag(s, 'compliant_list'),
  'market.seasonal_index': seasonalIndex,
  'measure.consent_banner_changed': (s) => flag(s, 'consent_banner_changed'),
  'measure.consent_loss': (s) => clamp01(1 - consentEff(s)),
  'measure.crm_completeness': (s) => (s.tracking.crmFeedback ? 0.98 : 0.8) * 0.95,
  'measure.crm_leads_7d': (s) => sum(lastN(s, 7).map((r) => r.crmLeads)),
  'measure.crm_paid_customers_30d': (s) => sum(lastN(s, 30).map((r) => r.crmCustomers)),
  'measure.modeling_enabled': (s) => (s.tracking.consentMode || s.tracking.serverSide ? 1 : 0),
  'measure.observed_conversions_7d': (s) => sum(lastN(s, 7).map((r) => sumRec([r.platformConv]))),
  'measure.paid_customers_30d': (s) => sum(lastN(s, 30).map((r) => sumRec([r.newCustomers]))),
  // Platformların raporladığı dönüşüm / CRM'de gerçekten nitelikli çıkan ücretli-kanal lead'i (kümülatif, organik pay paydayı şişirmesin)
  'measure.platform_vs_crm_ratio': (s) => {
    const crm = (s.funnel.byChannel.google?.qualified ?? 0) + (s.funnel.byChannel.meta?.qualified ?? 0);
    return crm > 10 ? sum(s.history.map((r) => sumRec([r.platformConv]))) / crm : null;
  },
  'measure.tracking_health': (s) => clamp01(s.tracking.health * modMult(s, 'tracking')),
  'meta.adset_count': (s) => adSets(s).length,
  'meta.adsets_learning_limited_share': (s) => {
    const a = adSets(s);
    return a.length ? a.filter((x) => x.learning.state === 'limited').length / a.length : 0;
  },
  'meta.audience_size': (s) => {
    const a = adSets(s)[0];
    return a ? pn(s, 'market.salon_count') * K.audienceReach[a.audience] : null;
  },
  'meta.cpa_observed': (s) => {
    const h = lastN(s, 7);
    const conv = sum(h.map((r) => r.platformConv.meta ?? 0));
    return conv > 0 ? sum(h.map((r) => r.spend.meta ?? 0)) / conv : null;
  },
  'meta.cpm': (s) => {
    const a = adSets(s).filter((x) => x.last);
    const imp = sum(a.map((x) => x.last!.impressions));
    return imp > 0 ? sum(a.map((x) => x.last!.cpm * x.last!.impressions)) / imp : null;
  },
  'meta.ctr': (s) => {
    const a = adSets(s).filter((x) => x.last);
    const imp = sum(a.map((x) => x.last!.impressions));
    return imp > 0 ? sum(a.map((x) => x.last!.clicks)) / imp : null;
  },
  'meta.days_since_creative_refresh': (s) => {
    const m = s.assets.creatives.filter((c) => c.channel === 'meta').map((c) => c.availableDay);
    return m.length ? s.day - Math.max(...m) : null;
  },
  'meta.edits_7d': (s) => s.decisions.filter((d) => d.day > s.day - 7 && d.status !== 'rejected' && META_EDITS.has(d.action.type)).length,
  'meta.events_per_adset_per_window': (s) => {
    const a = adSets(s);
    return a.length ? sum(a.map((x) => sum(x.learning.events))) / a.length : null;
  },
  'meta.frequency': (s) => {
    const a = adSets(s).filter((x) => x.last);
    return a.length ? sum(a.map((x) => x.last!.frequency)) / a.length : null;
  },
  reputation: (s) => s.reputation,
  'retention.early_churn_rate': earlyChurn,
  'retention.onboarding_quality': (s) => s.product.onboarding,
  'retention.usage_rate': (s) => clamp(0.3 + 0.6 * s.product.onboarding - 0.3 * earlyChurn(s), 0, 1),
  'review.avg_rating': (s) => (s.local.gbp.rating > 0 ? s.local.gbp.rating : clamp(2.5 + 3.5 * s.reputation, 1, 5)),
  'support.tickets_7d': (s) => Math.round(activeCustomers(s) * 0.04 * (1.5 - s.product.onboarding)),
};

/** Metrik kimliklerinin tam listesi (belgelerle çapraz denetim için). */
export const METRIC_IDS: readonly string[] = Object.keys(M);
export const COSTLY_METRICS = new Set(['cash.marginal_cac', 'cash.avg_cac', 'cash.ltv_cac']);

export function metricValue(s: GameState, id: string): MetricValue {
  const f = M[id];
  if (!f) return null;
  const v = f(s);
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v;
}

/** Karşılaştırma değeri: sayı, dize veya {param}; derived.* özel. */
export function paramValue(s: GameState, id: string): number | string | null {
  if (id === 'derived.max_marginal_cac') return maxMarginalCac(s);
  if (id === 'derived.tax_due_estimate') return taxDueEstimate(s);
  const v = s.params[id];
  return typeof v === 'number' || typeof v === 'string' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : null;
}

export { trackedFraction };
