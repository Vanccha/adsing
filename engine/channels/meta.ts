// Meta Ads: hedef > reklam seti > reklam.
// - Teslimat: CPM (rekabet, mevsim, kitle, öğrenme, frekans) -> gösterim -> CTR (yaratıcı kalitesi x yorgunluk) -> tık.
// - Öğrenme: learning / active / learning_limited; önemli düzenleme (bütçe sıçraması, kitle, reklam ekleme/çıkarma) sıfırlar (kısmi).
// - Yorgunluk: CTR_eff = CTR0 x exp(-λ x max(0, f - f0)); frekans f = impr7 / reach7 (kitle büyüklüğüne bağlı).
// - Advantage+: veri bolsa ve takip sağlıklıysa verimli; veri azsa zayıf; marka/mevcut müşteri payı artımsal olmayan.
// - Mesajlaşma reklamı: tık -> sohbet başlangıcı (WhatsApp pazarında güçlü), hızlı yanıt gerektirir (lead zayıf: tau yarı).
import type { Rng } from '../rng';
import { K } from '../core/constants';
import type { ClickBatch, DayCtx } from '../core/ctx';
import { addTo } from '../core/ctx';
import { adCostFactor, channelRelative } from '../core/env';
import { pn } from '../core/params';
import type { GameState, MAdSet } from '../core/types';
import { clamp01, modMult } from '../core/util';
import { leadRate } from '../funnel/rates';
import { holdoutScale } from '../measurement/holdout';
import { trackedFraction } from '../measurement/tracking';
import { findCreative, findLp, findOffer } from '../quality/assets';
import { accountActive, adTaxRate, chargeAds } from './common';

export interface MetaPlan {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  frequency: number;
  ctrEff: number;
  cpm: number;
  perAd: Array<{ creativeId: string; impr: number; ctr: number; f: number }>;
  qualMult: number;
  tauMult: number;
  cvrMult: number;
  mode: 'lp' | 'message';
}

/** Frekans: benzersiz erişime göre kişi başına gösterim. */
export function frequency(impr7: number, pool: number): number {
  if (impr7 <= 0 || pool <= 0) return 1;
  const reach = pool * (1 - Math.exp(-impr7 / pool));
  return reach > 0 ? Math.max(1, impr7 / reach) : 1;
}

/** Yorgunluk uygulanmış CTR. */
export function fatigueCtr(ctr0: number, f: number, f0: number, lambda: number): number {
  return ctr0 * Math.exp(-lambda * Math.max(0, f - f0));
}

export function messagingMult(s: GameState): number {
  return pn(s, 'meta.msg.mult', 1 + 0.5 * channelRelative(s, 'whatsapp', 0.3));
}

export function eventsSum(a: MAdSet): number {
  return a.learning.events.reduce((x, y) => x + y, 0);
}

export function planAdSet(s: GameState, a: MAdSet, o: { budget?: number; steady?: boolean } = {}): MetaPlan {
  const pool = pn(s, 'market.salon_count') * K.audienceReach[a.audience];
  const learn = a.learning.state;
  const nAds = a.ads.length;
  const lp = findLp(s, a.lpId);
  const offer = findOffer(s, a.offerId);
  const budget = o.budget ?? a.dailyBudget;
  const f0 = pn(s, 'meta.fatigue.f0');
  const lambda = pn(s, 'meta.fatigue.lambda');
  const thr = pn(s, 'meta.learn.events');
  const d = clamp01(eventsSum(a) / (2 * thr)) * trackedFraction(s, 'meta');
  const aPlus = a.audience === 'advantage';
  let cpmMult = K.audienceCpmMult[a.audience] * K.metaLearnCpm[learn];
  let cvrMult = K.audienceCvrMult[a.audience] * K.metaLearnCvr[learn];
  if (aPlus) {
    cpmMult *= 1.05 - 0.15 * d;
    cvrMult *= 0.85 + 0.35 * d;
  }
  const message = a.objective === 'messages';
  const qualMult = message ? K.metaMessageQualMult : 1;
  const tauMult = message ? K.metaMessageTauMult : 1;
  if (message) cvrMult *= messagingMult(s);
  const none: MetaPlan = { spend: 0, impressions: 0, clicks: 0, leads: 0, frequency: 1, ctrEff: 0, cpm: 0, perAd: [], qualMult, tauMult, cvrMult, mode: message ? 'message' : 'lp' };
  if (nAds === 0 || budget <= 0) return none;
  let qAvg = 0;
  for (const ad of a.ads) qAvg += findCreative(s, ad.creativeId)?.q ?? 1;
  qAvg /= nAds;
  const cpm0 = pn(s, 'meta.cpm') * s.competitorIndex * modMult(s, 'cpm') * adCostFactor(s) * cpmMult * (1 / (0.85 + 0.15 * qAvg));
  const spend = budget * K.metaLearnDelivery[learn];
  // Frekans bağı döngüseldir; iki geçişli yaklaşım yeterli.
  let impr = (spend / cpm0) * 1000;
  let cpm = cpm0;
  let fAvg = 1;
  for (let it = 0; it < 3; it++) {
    const perAdImpr = impr / nAds;
    fAvg = 0;
    for (const ad of a.ads) fAvg += frequency(o.steady ? 7 * perAdImpr : ad.impr7, pool);
    fAvg /= nAds;
    cpm = cpm0 * (1 + K.metaFreqCpmSlope * Math.max(0, fAvg - 1));
    impr = (spend / cpm) * 1000;
    if (!o.steady) break; // gerçek koşuda frekans durumdan gelir (önceki gün); yineleme gerekmez
  }
  const base = pn(s, 'meta.ctr');
  const baseCvr = pn(s, 'meta.cvr_lead');
  const perAd: MetaPlan['perAd'] = [];
  let clicks = 0;
  for (const ad of a.ads) {
    const cr = findCreative(s, ad.creativeId);
    const imp = impr / nAds;
    const f = frequency(o.steady ? 7 * imp : ad.impr7, pool);
    const ctr = Math.min(0.5, fatigueCtr(base * (cr ? cr.q : 1), f, f0, lambda));
    perAd.push({ creativeId: ad.creativeId, impr: imp, ctr, f });
    clicks += imp * ctr;
  }
  const lr = leadRate(s, baseCvr, 'social', lp, offer, cvrMult);
  return {
    spend,
    impressions: impr,
    clicks,
    leads: clicks * lr,
    frequency: fAvg,
    ctrEff: impr > 0 ? clicks / impr : 0,
    cpm,
    perAd,
    qualMult,
    tauMult,
    cvrMult,
    mode: message ? 'message' : 'lp',
  };
}

export function expectedMeta(s: GameState, o: { budgetScale?: number; adSetId?: string } = {}): { spend: number; clicks: number; leads: number; impressions: number } {
  let spend = 0;
  let clicks = 0;
  let leads = 0;
  let impressions = 0;
  for (const a of s.meta.adSets) {
    if (a.status !== 'active' || (o.adSetId && a.id !== o.adSetId)) continue;
    const p = planAdSet(s, a, { budget: a.dailyBudget * (o.budgetScale ?? 1), steady: true });
    spend += p.spend;
    clicks += p.clicks;
    leads += p.leads;
    impressions += p.impressions;
  }
  return { spend, clicks, leads, impressions };
}

export function resetMetaLearning(s: GameState, a: MAdSet): void {
  const frac = clamp01(pn(s, 'meta.learn.reset_frac', 1));
  a.learning.events = a.learning.events.map((x) => x * (1 - frac));
  a.learning.state = 'learning';
  a.learning.sinceReset = s.day;
  a.learning.resets += 1;
}

export function runMetaDay(s: GameState, ctx: DayCtx): void {
  const active = accountActive(s, 'meta');
  const lambdaDecay = 1 / 7;
  for (const a of s.meta.adSets) {
    if (a.status !== 'active' || !active) {
      a.last = null;
      for (const ad of a.ads) ad.impr7 *= 1 - lambdaDecay;
      continue;
    }
    const rng: Rng = ctx.root.fork(`ads.meta.${a.id}`);
    const plan = planAdSet(s, a);
    const hold = holdoutScale(s, 'meta');
    const taxMult = 1 + adTaxRate(s, 'meta');
    const noise = a.learning.state === 'limited' ? 1 + 0.1 * rng.normal() : 1;
    let remBudget = a.dailyBudget;
    let impTot = 0;
    let clTot = 0;
    let costTot = 0;
    plan.perAd.forEach((pa, i) => {
      const ad = a.ads[i]!;
      const rr = rng.fork(`ad${i}`);
      const mu = pa.impr * hold * Math.max(0.5, Math.min(1.2, noise));
      let impr = rr.negBin(mu, K.impressionDispersion);
      const maxImpr = Math.floor((Math.max(0, Math.min(remBudget, ctx.cashLimit / taxMult)) / plan.cpm) * 1000);
      impr = Math.min(impr, maxImpr);
      const clicks = rr.binomial(impr, pa.ctr);
      const cost = (impr * plan.cpm) / 1000;
      remBudget -= cost;
      impTot += impr;
      clTot += clicks;
      costTot += cost;
      ad.impr7 = ad.impr7 * (1 - lambdaDecay) + impr;
      const cr = findCreative(s, pa.creativeId);
      if (cr) {
        cr.stats.ctr.n += impr;
        cr.stats.ctr.k += clicks;
        cr.stats.ctr.kObs += clicks;
      }
      if (impr <= 0) return;
      ctx.batches.push({
        channel: 'meta',
        ref: a.id,
        cls: 'social',
        impressions: impr,
        clicks,
        cost,
        lpId: a.lpId,
        offerId: a.offerId,
        mode: plan.mode,
        cvrMult: plan.cvrMult,
        qualMult: plan.qualMult,
        nonIncr: K.audienceNonIncr[a.audience],
        tauMult: plan.tauMult,
      } satisfies ClickBatch);
    });
    chargeAds(s, ctx, 'meta', costTot);
    a.stats.impressions += impTot;
    a.stats.clicks += clTot;
    a.stats.cost += costTot;
    a.last = { impressions: impTot, clicks: clTot, cost: costTot, conv: 0, convTrue: 0, frequency: plan.frequency, ctrEff: plan.ctrEff, cpm: plan.cpm };
    addTo(ctx.acc.spend, `meta.${a.id}`, costTot);
  }
}

export function updateMetaLearning(s: GameState, ctx: DayCtx, rng: Rng): void {
  const tf = trackedFraction(s, 'meta');
  const thr = pn(s, 'meta.learn.events');
  const win = Math.max(1, Math.round(pn(s, 'meta.learn.window_days')));
  const over = Math.max(1, pn(s, 'measure.platform_overreport', 1));
  for (const a of s.meta.adSets) {
    const trueLeads = ctx.acc.leadsByRef[a.id] ?? 0;
    const obs = rng.fork(`learn.${a.id}`).binomial(trueLeads, tf);
    if (a.last) {
      a.last.convTrue = trueLeads;
      a.last.conv = obs * over;
    }
    a.stats.conv += obs * over;
    if (a.status !== 'active') continue;
    a.learning.events.push(obs);
    while (a.learning.events.length > win) a.learning.events.shift();
    const sum = eventsSum(a);
    const age = s.day - a.learning.sinceReset;
    if (sum >= thr) a.learning.state = 'active';
    else if (age >= win) a.learning.state = a.learning.state === 'active' && sum >= 0.6 * thr ? 'active' : 'limited';
  }
}
