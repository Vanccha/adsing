// Seçiciler (türetilmiş okuma fonksiyonları): oyuncunun gördüğü (observed) ve gerçek (true) metrikler ayrı tutulur.
// observedMetrics oyuncuya gösterilir; trueMetrics yalnızca sonuç analizinde. Motor metin üretmez: ipuçları i18n anahtarıdır
// ve yalnızca learningMode açıkken döner.
import { ACTION_DEFS, ACTION_TYPES } from '../core/actions';
import type { ActionDef } from '../core/actiondef';
import { K } from '../core/constants';
import { founderCapacity } from '../core/env';
import { pn } from '../core/params';
import type { ActionType, DayRecord, GameState, LeadChannel, PaidChannel, StageCounts } from '../core/types';
import { STAGES } from '../core/types';
import { ageMonths, isStale } from '../data/freshness';
import { expectedGoogle } from '../channels/google';
import { expectedMeta } from '../channels/meta';
import { activeCustomers } from '../funnel/customers';
import { unitEconomics } from '../funnel/finance';
import { onbFactor, priceFactor } from '../funnel/rates';
import { trackedFraction } from '../measurement/tracking';
import { posterior, probAGreaterB } from '../quality/bayes';
import { runwayMonths } from './finance';

export { runwayMonths };

const sumRec = (recs: Array<Record<string, number>>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const r of recs) for (const [k, v] of Object.entries(r)) out[k] = (out[k] ?? 0) + v;
  return out;
};
const lastN = (s: GameState, n: number): DayRecord[] => s.history.slice(-n);

// ---------- Oyuncunun gördüğü ----------

export interface ObservedMetrics {
  day: number;
  cash: number;
  mrr: number;
  customers: number;
  window: number;
  spend: Record<string, number>;
  platform: { conv: Record<string, number>; cpa: Record<string, number | null> };
  analytics: { conv: number; cpl: number | null };
  crm: { leads: number; customers: number; cpl: number | null; cac: number | null };
  campaigns: Array<{ id: string; name: string; type: string; status: string; strategy: string; learning: string; dailyBudget: number; impressions: number; clicks: number; cost: number; conv: number; isShare: number | null; isLostBudget: number | null; isLostRank: number | null; qsBand: 'below' | 'average' | 'above' | null; hasSearchTerms: boolean }>;
  adSets: Array<{ id: string; name: string; status: string; learning: string; audience: string; dailyBudget: number; impressions: number; clicks: number; cost: number; conv: number; frequency: number | null; cpm: number | null }>;
  assets: ReturnType<typeof assetEstimates>;
  hints: string[]; // yalnızca learningMode
}

export function observedMetrics(s: GameState, window = 7): ObservedMetrics {
  const h = lastN(s, window);
  const spend = sumRec(h.map((r) => r.spend));
  const conv = sumRec(h.map((r) => r.platformConv));
  const cpa: Record<string, number | null> = {};
  for (const ch of ['google', 'meta']) cpa[ch] = (conv[ch] ?? 0) > 0 ? (spend[ch] ?? 0) / (conv[ch] as number) : null;
  const analytics = h.reduce((a, r) => a + r.analyticsConv, 0);
  const adSpend = (spend.google ?? 0) + (spend.meta ?? 0);
  // CRM gecikmeli: son crmDelay gün henüz görünmez
  const hc = s.history.slice(Math.max(0, s.history.length - window - K.crmDelayDays), Math.max(0, s.history.length - K.crmDelayDays));
  const crmLeads = hc.reduce((a, r) => a + r.crmLeads, 0);
  const crmCust = hc.reduce((a, r) => a + r.crmCustomers, 0);
  const crmSpend = hc.reduce((a, r) => a + (r.spend.google ?? 0) + (r.spend.meta ?? 0), 0);
  const band = (q: number | undefined): 'below' | 'average' | 'above' | null => (q === undefined || q === 0 ? null : q < 4 ? 'below' : q < 7 ? 'average' : 'above');
  const hints: string[] = [];
  if (s.learningMode) hints.push(...funnelAnalysis(s).hintKeys);
  return {
    day: s.day,
    cash: s.cash,
    mrr: s.mrr,
    customers: activeCustomers(s),
    window: h.length,
    spend,
    platform: { conv, cpa },
    analytics: { conv: analytics, cpl: analytics > 0 ? adSpend / analytics : null },
    crm: { leads: crmLeads, customers: crmCust, cpl: crmLeads > 0 ? crmSpend / crmLeads : null, cac: crmCust > 0 ? crmSpend / crmCust : null },
    campaigns: s.google.campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      strategy: c.strategy,
      learning: c.learning.state,
      dailyBudget: c.dailyBudget,
      impressions: c.stats.impressions,
      clicks: c.stats.clicks,
      cost: c.stats.cost,
      conv: c.stats.conv,
      isShare: c.last ? c.last.isShare : null,
      isLostBudget: c.last ? c.last.isLostBudget : null,
      isLostRank: c.last ? c.last.isLostRank : null,
      qsBand: band(c.last?.avgQs),
      hasSearchTerms: c.searchTerms !== null,
    })),
    adSets: s.meta.adSets.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      learning: a.learning.state,
      audience: a.audience,
      dailyBudget: a.dailyBudget,
      impressions: a.stats.impressions,
      clicks: a.stats.clicks,
      cost: a.stats.cost,
      conv: a.stats.conv,
      frequency: a.last ? a.last.frequency : null,
      cpm: a.last ? a.last.cpm : null,
    })),
    assets: assetEstimates(s),
    hints,
  };
}

/** Gizli latent değerler OLMADAN: gözlenen sayımlarla posterior, aralık ve "yeterli veri yok" bayrağı. */
export function assetEstimates(s: GameState) {
  const strength = pn(s, 'prior.strength', K.priorStrength);
  const level = pn(s, 'ci.level', K.ciLevel);
  const minN = pn(s, 'stats.min_n_clicks', K.minN);
  const o = { strength, level, minN };
  return {
    creatives: s.assets.creatives.map((c) => ({ id: c.id, channel: c.channel, angle: c.angle, ctr: posterior(c.stats.ctr, pn(s, c.channel === 'google' ? 'gads.search.ctr' : 'meta.ctr'), o) })),
    lps: s.assets.lps.map((l) => ({ id: l.id, style: l.style, cvr: posterior(l.stats.cvr, pn(s, 'funnel.lp_to_lead'), o) })),
    offers: s.assets.offers.map((f) => ({ id: f.id, kind: f.kind, trialRate: posterior(f.stats.trial, pn(s, 'funnel.trial_start'), o) })),
  };
}

export function abResult(s: GameState, testId: string) {
  const t = s.tests.ab.find((x) => x.id === testId);
  if (!t) return null;
  const o = { strength: pn(s, 'prior.strength', K.priorStrength), level: pn(s, 'ci.level', K.ciLevel), minN: pn(s, 'stats.min_n_clicks', K.minN) };
  const prior = pn(s, 'funnel.lp_to_lead');
  const a = posterior(t.statsA, prior, o);
  const b = posterior(t.statsB, prior, o);
  return { test: t, a, b, pAGreaterB: probAGreaterB(a, b), insufficient: a.insufficient || b.insufficient };
}

// ---------- Gerçek (yalnız sonuç analizinde) ----------

export function trueMetrics(s: GameState) {
  const ue = unitEconomics(s, 90);
  const byChannel: Record<string, { leads: number; incrLeads: number; paid: number; spend: number; cplTrue: number | null; incrShare: number | null }> = {};
  for (const [ch, b] of Object.entries(s.funnel.byChannel)) {
    byChannel[ch] = { leads: b.leads, incrLeads: b.incrLeads, paid: b.paid, spend: b.spend, cplTrue: b.leads > 0 && b.spend > 0 ? b.spend / b.leads : null, incrShare: b.leads > 0 ? b.incrLeads / b.leads : null };
  }
  return {
    day: s.day,
    trackingHealth: s.tracking.health,
    trackedFraction: { google: trackedFraction(s, 'google'), meta: trackedFraction(s, 'meta'), analytics: trackedFraction(s, 'analytics') },
    competitorIndex: s.competitorIndex,
    reputation: s.reputation,
    onboarding: s.product.onboarding,
    unitEconomics: ue,
    byChannel,
    latent: {
      creatives: s.assets.creatives.map((c) => ({ id: c.id, q: c.q, ctrTrue: c.stats.ctr.n > 0 ? c.stats.ctr.k / c.stats.ctr.n : null })),
      lps: s.assets.lps.map((l) => ({ id: l.id, q: l.q, speed: l.speed, cvrTrue: l.stats.cvr.n > 0 ? l.stats.cvr.k / l.stats.cvr.n : null })),
      offers: s.assets.offers.map((o) => ({ id: o.id, q: o.q })),
    },
    cum: s.funnel.cum,
    geoVisibility: s.geo.visibility,
  };
}

// ---------- Huni ve darboğaz ----------

export interface FunnelView {
  window: number;
  counts: StageCounts;
  rates: Record<string, number | null>;
  bottleneck: { stage: string; ratio: number } | null;
  hintKeys: string[];
}

const PAIRS: Array<{ stage: string; num: keyof StageCounts; den: keyof StageCounts; bench: (s: GameState) => number }> = [
  { stage: 'lp', num: 'leads', den: 'visits', bench: (s) => pn(s, 'funnel.lp_to_lead') },
  { stage: 'qualify', num: 'qualified', den: 'leads', bench: (s) => pn(s, 'funnel.lead_qualified') },
  { stage: 'trial', num: 'trials', den: 'qualified', bench: (s) => pn(s, 'funnel.trial_start') },
  { stage: 'paid', num: 'paid', den: 'trials', bench: (s) => pn(s, 'funnel.trial_to_paid') },
];

function funnelAnalysis(s: GameState, window = 30): FunnelView {
  const h = lastN(s, window);
  const counts = { impressions: 0, clicks: 0, visits: 0, leads: 0, qualified: 0, trials: 0, activated: 0, paid: 0 } as StageCounts;
  for (const r of h) for (const k of STAGES) counts[k] += r.stages[k];
  const rates: Record<string, number | null> = {};
  for (let i = 1; i < STAGES.length; i++) {
    const a = STAGES[i - 1] as keyof StageCounts;
    const b = STAGES[i] as keyof StageCounts;
    rates[`${a}>${b}`] = counts[a] > 0 ? counts[b] / counts[a] : null;
  }
  // Deneme -> ücretli gecikmelidir: ücretliler, deneme süresi kadar önceki pencerenin denemeleriyle kıyaslanır.
  const trialDays = Math.round(pn(s, 'scn.trial_days', K.trialDaysDefault));
  const end = Math.max(0, s.history.length - trialDays);
  let lpV = 0;
  let lpL = 0;
  for (const r of h) {
    lpV += r.lpVisits;
    lpL += r.lpLeads;
  }
  let trialsLag = 0;
  for (const r of s.history.slice(Math.max(0, end - window), end)) trialsLag += r.stages.trials;
  let bn: { stage: string; ratio: number } | null = null;
  for (const p of PAIRS) {
    const den = p.stage === 'paid' ? trialsLag : p.stage === 'lp' ? lpV : counts[p.den];
    const num = p.stage === 'lp' ? lpL : counts[p.num];
    if (den < 30) continue; // yeterli hacim yok
    const ratio = num / den / Math.max(p.bench(s), 1e-9);
    if (!bn || ratio < bn.ratio) bn = { stage: p.stage, ratio };
  }
  const hintKeys: string[] = [];
  if (bn && bn.ratio < 0.8) hintKeys.push(`hint.bottleneck.${bn.stage}`);
  if (s.tracking.health < 0.9) hintKeys.push('hint.tracking_health');
  return { window: h.length, counts, rates, bottleneck: bn, hintKeys };
}

/** Huni görünümü. İpucu anahtarları yalnızca learningMode açıkken döner. */
export function funnel(s: GameState, window = 30): FunnelView {
  const f = funnelAnalysis(s, window);
  return s.learningMode ? f : { ...f, hintKeys: [] };
}

// ---------- CAC / marjinal CAC ----------

/** Lead -> ücretli müşteri beklenen verimi (yaklaşık; kanal nitelik çarpanıyla). */
export function leadToCustomerYield(s: GameState, ch: LeadChannel): number {
  const tau = pn(s, 'funnel.lead_decay_tau_hours');
  const h0 = s.autoReply ? K.autoReplyResponseHours : K.baseResponseHours;
  const contact = K.contactP0 * Math.exp(-h0 / tau);
  const q = Math.min(1, pn(s, 'funnel.lead_qualified') * K.channelQual[ch]);
  return contact * q * pn(s, 'funnel.trial_start') * Math.min(1, pn(s, 'funnel.trial_to_paid') * priceFactor(s) * onbFactor(s.product.onboarding) * (0.7 + 0.6 * 0.5) / 1);
}

export interface CacView {
  cacFull: number | null;
  cacAds: number | null;
  ltv: number;
  ltvCac: number | null;
  paybackMonths: number | null;
  marginal?: Record<string, number | null>;
}

/** CAC; {marginal:true} ise kanal başına "bir sonraki %25 bütçe" artımsal müşteri maliyeti (beklenen değer what-if). */
export function cac(s: GameState, o: { marginal?: boolean; window?: number; delta?: number } = {}): CacView {
  const ue = unitEconomics(s, o.window ?? 90);
  const out: CacView = { cacFull: ue.cacFull, cacAds: ue.cacAds, ltv: ue.ltv, ltvCac: ue.ltvCac, paybackMonths: ue.paybackMonths };
  if (o.marginal) {
    const d = o.delta ?? 0.25;
    const m: Record<string, number | null> = {};
    for (const ch of ['google', 'meta'] as PaidChannel[]) {
      const f = ch === 'google' ? expectedGoogle : expectedMeta;
      const a = f(s, { budgetScale: 1 });
      const b = f(s, { budgetScale: 1 + d });
      const dc = (b.leads - a.leads) * leadToCustomerYield(s, ch);
      m[ch] = dc > 1e-9 ? (b.spend - a.spend) / dc : null;
    }
    out.marginal = m;
  }
  return out;
}

/** Belirli bir kanalda belirli günlük bütçe için beklenen (spend, lead, müşteri) — marjinal CAC eğrisi için. */
export function responseAt(s: GameState, ch: PaidChannel, budgetScale: number) {
  const r = (ch === 'google' ? expectedGoogle : expectedMeta)(s, { budgetScale });
  return { ...r, customers: r.leads * leadToCustomerYield(s, ch) };
}

// ---------- MRR, kurucu saati, tazelik, aksiyonlar ----------

export function mrr(s: GameState) {
  const last = s.history[s.history.length - 1];
  const h30 = lastN(s, 30);
  const mv = { new: 0, expansion: 0, contraction: 0, churn: 0 };
  for (const r of h30) {
    mv.new += r.mrrMove.new;
    mv.expansion += r.mrrMove.expansion;
    mv.contraction += r.mrrMove.contraction;
    mv.churn += r.mrrMove.churn;
  }
  return { mrr: s.mrr, arr: s.mrr * 12, lastDay: last ? last.mrrMove : { new: 0, expansion: 0, contraction: 0, churn: 0 }, last30: mv, customers: activeCustomers(s) };
}

export function runway(s: GameState): number {
  return runwayMonths(s);
}

export function founderHours(s: GameState) {
  const f = s.founder;
  return {
    capacityToday: f.capacityToday,
    used: f.usedToday,
    free: Math.max(0, f.capacityToday - f.usedToday),
    reserved: f.reserved,
    queued: f.queue.length,
    burnout: f.burnout,
    overtimeToday: f.overtimeToday,
  };
}

export interface FreshnessWarning {
  id: string;
  status: 'stale' | 'unsourced' | 'low_confidence';
  ageMonths: number | null;
  refDate: string | null;
  layer: string;
  sourceName: string | null;
}

/** Bayat (12 aydan eski), kaynaksız (varsayım) ve düşük güvenli parametreler. today: varsayılan state.refDate. */
export function freshnessWarnings(s: GameState, today: string = s.refDate): FreshnessWarning[] {
  const out: FreshnessWarning[] = [];
  for (const [id, info] of Object.entries(s.paramInfo)) {
    const age = info.refDate ? ageMonths(info.refDate, today) : null;
    const base = { id, ageMonths: age, refDate: info.refDate, layer: info.layer, sourceName: info.sourceName };
    if (info.refDate && isStale(info.refDate, today)) out.push({ ...base, status: 'stale' });
    else if (info.layer === 'assumption') out.push({ ...base, status: 'unsourced' });
    else if (info.confidence === 'low') out.push({ ...base, status: 'low_confidence' });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export interface AvailableAction {
  type: ActionType;
  enabled: boolean;
  reasonKey?: string;
  minHours: number;
}

/** Hangi aksiyon tipleri şu an denenebilir (oyun bitmedi, hesap askıda değil, vb.). Parametre doğrulaması aksiyon anında yapılır. */
export function availableActions(s: GameState): AvailableAction[] {
  const out: AvailableAction[] = [];
  const cap = s.founder.capacityToday > 0 ? s.founder.capacityToday : founderCapacity(s);
  const free = Math.max(0, cap - s.founder.usedToday);
  for (const type of ACTION_TYPES) {
    const def = ACTION_DEFS[type] as ActionDef<typeof type>;
    let reasonKey: string | undefined;
    if (s.outcome) reasonKey = 'err.game_over';
    else if (type.startsWith('gads.create') && s.accounts.google.permanent) reasonKey = 'err.account_suspended';
    else if (type.startsWith('meta.create') && s.accounts.meta.permanent) reasonKey = 'err.account_suspended';
    else if (type === 'ops.hire_rep' && s.reps >= 5) reasonKey = 'err.max_reps';
    else if (type === 'ops.fire_rep' && s.reps === 0) reasonKey = 'err.no_rep';
    else if (def.minHours > cap * 1.25) reasonKey = 'err.too_many_hours';
    const hint = free < def.minHours && !reasonKey ? 'err.no_hours' : undefined;
    out.push({ type, enabled: !reasonKey, ...(reasonKey || hint ? { reasonKey: reasonKey ?? hint } : {}), minHours: def.minHours });
  }
  return out;
}

export const selectors = { observedMetrics, trueMetrics, funnel, cac, mrr, runway, founderHours, freshnessWarnings, availableActions, assetEstimates, abResult, responseAt };
