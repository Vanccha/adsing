// Google Ads (Arama + PMax): kampanya > reklam grubu > anahtar kelime.
// - Eşleme türü -> sorgu sınıfı sızıntısı (hedef / komşu / alakasız / bilgi / marka), negatif kelime, arama terimleri raporu.
// - QS bileşenleri (beklenen CTR, alaka, LP deneyimi) gizli latent; Ad Rank = teklif x (QS/QSref)^alpha.
// - Rakip Ad Rank'i log-normal; kazanma olasılığı Φ(z); ödenen CPC = koşullu ortalama rank / kalite çarpanı (ikinci fiyat benzeri).
// - Gösterim payı: bütçe ve rank kaybı ayrı; bütçe sınırı verimli satırları önce doldurur (akıllı teklifte), manuelde orantılı.
// - Akıllı teklif: öğrenme / kararlı / sınırlı; sinyal kalitesi (takip) bilgiyi ve teklifleri belirler.
// - PMax: hacim yüksek, şeffaflık düşük, marka sorgusu yamama (artımsal olmayan).
import { Rng } from '../rng';
import { K } from '../core/constants';
import type { ClassKey } from '../core/constants';
import type { ClickBatch, DayCtx } from '../core/ctx';
import { addTo } from '../core/ctx';
import { adCostFactor, awareness, demandFactor } from '../core/env';
import { pn } from '../core/params';
import type { BidStrategy, GCampaign, GKeyword, GameState, MatchType, Negative, QueryClass } from '../core/types';
import { clamp, clamp01, modMult, normCdf } from '../core/util';
import { leadRate } from '../funnel/rates';
import { holdoutScale } from '../measurement/holdout';
import { signalQuality, trackedFraction } from '../measurement/tracking';
import { findCreative, findLp, findOffer } from '../quality/assets';
import { accountActive, adTaxRate, chargeAds } from './common';

type Mix = Partial<Record<ClassKey, number>>;

export interface Row {
  kwId: string | null;
  cls: ClassKey;
  eligible: number;
  pWin: number;
  impr: number;
  ctr: number;
  cpc: number;
  lr: number; // tık -> lead
  qs: number;
  f: number; // bütçe sonrası uygulanan oran
}
export interface CampaignPlan {
  rows: Row[];
  eligible: number;
  impressions: number;
  clicks: number;
  cost: number;
  leads: number;
  isShare: number;
  isLostBudget: number;
  isLostRank: number;
  avgQs: number;
  budget: number;
  iota: number;
}

export function googleEnv(s: GameState) {
  const cpcRef = pn(s, 'gads.search.cpc') * s.competitorIndex * modMult(s, 'cpc') * adCostFactor(s);
  const comp = clamp01(pn(s, 'gads.search.competition'));
  return {
    cpcRef,
    sigma: K.rankSigmaBase + K.rankSigmaComp * comp,
    alpha: pn(s, 'gads.rank.alpha', K.rankAlpha),
    baseCtr: pn(s, 'gads.search.ctr'),
    baseCvr: pn(s, 'gads.search.cvr_lead'),
    salons: pn(s, 'market.salon_count'),
    demand: demandFactor(s),
  };
}

function classMix(s: GameState, match: MatchType): Mix {
  const leak = clamp01(pn(s, `gads.match.${match}.leak`));
  const nb = K.matchNeighborShare[match];
  return {
    target: (1 - leak) * (1 - nb),
    neighbor: (1 - leak) * nb,
    irrelevant: leak * K.leakIrrelevantShare,
    info: leak * (1 - K.leakIrrelevantShare),
  };
}

function applyNegatives(mix: Mix, negs: Negative[], reviewed: boolean): Mix {
  const out: Mix = { ...mix };
  for (const n of negs) {
    const eff = K.negativeEff[n.breadth] * (reviewed ? 1 : K.negativeBlindPenalty);
    if (out[n.cls] !== undefined) out[n.cls] = (out[n.cls] as number) * (1 - eff);
    if (n.cls !== 'target' && out.target !== undefined) out.target *= 1 - K.negativeFalsePositive[n.breadth];
  }
  return out;
}

/** Hesaplanan Kalite Puanı (1-10, sürekli). Oyuncuya yalnızca bant gösterilir. */
export function qualityScore(creativeQ: number, relQ: number, lpQ: number): number {
  const w = K.qsWeights;
  return clamp(1 + 9 * (w.eCtr * clamp01(creativeQ / 2) + w.rel * relQ + w.lp * clamp01(lpQ / 2)), 1, 10);
}

interface Unit {
  kw: GKeyword | null;
  V: number;
  mix: Mix;
  reach: number;
  creativeQ: number;
  relQ: number;
  kwBid: number | null;
  brand: boolean;
  pmax: boolean;
}

export function planCampaign(s: GameState, c: GCampaign, o: { noise?: number; budget?: number } = {}): CampaignPlan {
  const env = googleEnv(s);
  const lp = findLp(s, c.lpId);
  const offer = findOffer(s, c.offerId);
  const lpQ = lp ? lp.q : 1;
  const state = c.strategy === 'manual' ? 'manual' : c.learning.state;
  const signal = signalQuality(s, 'google');
  const iota = clamp01(K.smartIota[state] * signal);
  const reviewed = c.searchTerms !== null;
  const noise = o.noise ?? 1;
  const budget = o.budget ?? c.dailyBudget;

  const units: Unit[] = [];
  const coreV = env.salons * K.volCorePerSalon;
  const adjV = env.salons * K.volAdjacentPerSalon;
  const brandV = env.salons * K.volBrandBase * (1 + 20 * awareness(s));
  if (c.type === 'search') {
    for (const ag of c.adGroups) {
      const cr = findCreative(s, ag.creativeId);
      for (const kw of ag.keywords) {
        if (kw.status !== 'active') continue;
        const V = kw.theme === 'core' ? coreV : kw.theme === 'adjacent' ? adjV : brandV;
        const mix: Mix = kw.theme === 'brand' ? { brand: 1 } : applyNegatives(classMix(s, kw.match), c.negatives, reviewed);
        units.push({ kw, V, mix, reach: K.matchReach[kw.match], creativeQ: cr ? cr.q : 1, relQ: kw.relQ, kwBid: kw.bid, brand: kw.theme === 'brand', pmax: false });
      }
    }
  } else {
    const qs = s.assets.creatives.filter((x) => x.channel === 'google' && x.availableDay <= s.day);
    const q = qs.length ? qs.reduce((a, x) => a + x.q, 0) / qs.length : 1;
    units.push({ kw: null, V: (coreV + adjV) * K.pmaxReach, mix: { ...K.pmaxClassMix }, reach: 1, creativeQ: q, relQ: 0.5, kwBid: null, brand: false, pmax: true });
    const capture = pn(s, 'pmax.brand_cannibalization', K.pmaxBrandCapture);
    units.push({ kw: null, V: brandV * capture, mix: { brand: 1 }, reach: 1, creativeQ: q, relQ: 0.5, kwBid: null, brand: true, pmax: true });
  }

  const rows: Row[] = [];
  for (const u of units) {
    const classes = (Object.keys(u.mix) as ClassKey[]).filter((k) => (u.mix[k] ?? 0) > 1e-9);
    let mixSum = 0;
    let lrSum = 0;
    for (const cls of classes) {
      const share = u.mix[cls] as number;
      mixSum += share;
      lrSum += share * leadRate(s, env.baseCvr, cls, lp, offer);
    }
    const avgLr = mixSum > 0 ? lrSum / mixSum : 1e-9;
    const qs = qualityScore(u.creativeQ, u.relQ, lpQ);
    const qsFactor = Math.pow(qs / K.qsRef, env.alpha);
    for (const cls of classes) {
      const share = u.mix[cls] as number;
      const S = u.V * u.reach * env.demand * share;
      if (S <= 0) continue;
      const clsCpc = env.cpcRef * (cls === 'brand' ? K.brandCpcMult : 1);
      const median = clsCpc * K.rankMedianRatio;
      const lr = leadRate(s, env.baseCvr, cls, lp, offer);
      let bid: number;
      if (c.strategy === 'manual') {
        bid = u.kwBid ?? c.manualBid ?? clsCpc;
      } else {
        const base = clsCpc * K.autoBidBase * noise;
        if (c.strategy === 'maxClicks') bid = base;
        else if (c.strategy === 'maxConversions') bid = base * clamp(1 - iota + iota * (lr / avgLr), 0.2, 2.5);
        else {
          // Değer/tık = hedef CPA x gözlenen dönüşüm olasılığı. Sinyal (takip) bozulunca gözlenen oran düşer => teklifler düşer.
          // iota yalnızca sınıflar arası ayrımı belirler (düşükse ortalama değere yakınsar).
          const v = (c.tcpaTarget ?? clsCpc * 10) * (iota * lr + (1 - iota) * avgLr) * signal;
          bid = clamp(v, 0.3 * clsCpc, 3 * clsCpc) * noise;
        }
      }
      const ar = bid * qsFactor;
      const z = Math.log(Math.max(ar, 1e-9) / median) / env.sigma;
      const pWin = normCdf(z);
      if (pWin < 1e-6) continue;
      const condMean = (median * Math.exp((env.sigma * env.sigma) / 2) * normCdf(z - env.sigma)) / pWin;
      const cpc = Math.min(bid, condMean / qsFactor + 0.005 * clsCpc);
      const impr = S * pWin;
      const ctr = clamp(env.baseCtr * u.creativeQ * K.classCtrMult[cls] * (0.8 + 0.4 * u.relQ) * (u.pmax ? K.pmaxCtrMult : 1), 0, 0.6);
      rows.push({ kwId: u.kw ? u.kw.id : null, cls, eligible: S, pWin, impr, ctr, cpc, lr, qs, f: 1 });
    }
  }

  // Bütçe dağıtımı: manuel/maxClicks orantılı; akıllı teklif verimli satırları önce doldurur (iota ağırlığıyla).
  let total = 0;
  for (const r of rows) total += r.impr * r.ctr * r.cpc;
  if (total > budget && total > 0) {
    const fProp = budget / total;
    const iotaAlloc = c.strategy === 'maxConversions' || c.strategy === 'tcpa' ? iota : 0;
    const order = rows.map((r, i) => i).sort((a, b) => (rows[b] as Row).lr / (rows[b] as Row).cpc - (rows[a] as Row).lr / (rows[a] as Row).cpc);
    let rem = budget;
    const fBf = new Array<number>(rows.length).fill(0);
    for (const i of order) {
      const r = rows[i] as Row;
      const full = r.impr * r.ctr * r.cpc;
      if (full <= 0) continue;
      const take = Math.min(rem, full);
      fBf[i] = take / full;
      rem -= take;
      if (rem <= 0) break;
    }
    rows.forEach((r, i) => {
      r.f = (1 - iotaAlloc) * fProp + iotaAlloc * (fBf[i] as number);
    });
  }

  let eligible = 0;
  let impressions = 0;
  let clicks = 0;
  let cost = 0;
  let leads = 0;
  let lostRank = 0;
  let lostBudget = 0;
  let qsW = 0;
  for (const r of rows) {
    eligible += r.eligible;
    impressions += r.impr * r.f;
    const cl = r.impr * r.f * r.ctr;
    clicks += cl;
    cost += cl * r.cpc;
    leads += cl * r.lr;
    lostRank += r.eligible * (1 - r.pWin);
    lostBudget += r.eligible * r.pWin * (1 - r.f);
    qsW += r.qs * r.eligible;
  }
  const e = Math.max(eligible, 1e-9);
  return {
    rows,
    eligible,
    impressions,
    clicks,
    cost,
    leads,
    isShare: impressions / e,
    isLostBudget: lostBudget / e,
    isLostRank: lostRank / e,
    avgQs: eligible > 0 ? qsW / eligible : 0,
    budget,
    iota,
  };
}

/** Beklenen değer (gürültüsüz) günlük çıktı: marjinal CAC what-if'i için. */
export function expectedGoogle(s: GameState, o: { budgetScale?: number; campaignId?: string } = {}): { spend: number; clicks: number; leads: number; impressions: number } {
  let spend = 0;
  let clicks = 0;
  let leads = 0;
  let impressions = 0;
  for (const c of s.google.campaigns) {
    if (c.status !== 'active' || (o.campaignId && c.id !== o.campaignId)) continue;
    const p = planCampaign(s, c, { budget: c.dailyBudget * (o.budgetScale ?? 1) });
    spend += p.cost;
    clicks += p.clicks;
    leads += p.leads;
    impressions += p.impressions;
  }
  return { spend, clicks, leads, impressions };
}

export function resetGoogleLearning(s: GameState, c: GCampaign): void {
  if (c.strategy === 'manual') {
    c.learning.state = 'manual';
    return;
  }
  const frac = clamp01(pn(s, 'gads.smart.learn_reset_frac', 1));
  c.learning.convWindow = c.learning.convWindow.map((x) => x * (1 - frac));
  c.learning.state = 'learning';
  c.learning.sinceReset = s.day;
  c.learning.resets += 1;
}

/** Günlük teslimat: kampanyalar için tıklama partileri üretir, harcamayı nakitten düşer. */
export function runGoogleDay(s: GameState, ctx: DayCtx): void {
  const active = accountActive(s, 'google');
  for (const c of s.google.campaigns) {
    if (c.status !== 'active' || !active) {
      c.last = null;
      continue;
    }
    const rng: Rng = ctx.root.fork(`ads.google.${c.id}`);
    const z = rng.normal();
    const state = c.strategy === 'manual' ? 'manual' : c.learning.state;
    const noise = Math.exp(K.smartNoise[state] * z);
    const plan = planCampaign(s, c, { noise });
    const hold = holdoutScale(s, 'google');
    let remBudget = c.dailyBudget;
    const taxMult = 1 + adTaxRate(s, 'google');
    let impTot = 0;
    let clTot = 0;
    let costTot = 0;
    plan.rows.forEach((r, idx) => {
      const rr = rng.fork(`row${idx}`);
      const mu = r.impr * r.f * hold;
      const impr = rr.negBin(mu, K.impressionDispersion);
      let clicks = rr.binomial(impr, r.ctr);
      const maxClicks = Math.floor(Math.max(0, Math.min(remBudget, ctx.cashLimit / taxMult)) / r.cpc + 1e-9);
      clicks = Math.min(clicks, maxClicks);
      const cost = clicks * r.cpc;
      remBudget -= cost;
      impTot += impr;
      clTot += clicks;
      costTot += cost;
      if (clicks <= 0 && impr <= 0) return;
      const kw = r.kwId ? c.adGroups.flatMap((g) => g.keywords).find((k) => k.id === r.kwId) : undefined;
      if (kw) {
        kw.stats.impressions += impr;
        kw.stats.clicks += clicks;
        kw.stats.cost += cost;
      }
      const ag = kw ? c.adGroups.find((g) => g.keywords.includes(kw)) : undefined;
      const cr = ag ? findCreative(s, ag.creativeId) : undefined;
      if (cr) {
        cr.stats.ctr.n += impr;
        cr.stats.ctr.k += clicks;
        cr.stats.ctr.kObs += clicks;
      }
      const row = (c.termAcc[r.cls] ??= { cls: r.cls as QueryClass, impressions: 0, clicks: 0, cost: 0, conv: 0 });
      row.impressions += impr;
      row.clicks += clicks;
      row.cost += cost;
      const brandShare = r.cls === 'brand' ? K.brandNonIncr : K.searchNonIncr;
      ctx.batches.push({
        channel: 'google',
        ref: c.id,
        cls: r.cls,
        impressions: impr,
        clicks,
        cost,
        lpId: c.lpId,
        offerId: c.offerId,
        mode: 'lp',
        cvrMult: 1,
        qualMult: 1,
        nonIncr: brandShare,
        tauMult: 1,
      } satisfies ClickBatch);
    });
    chargeAds(s, ctx, 'google', costTot);
    c.stats.impressions += impTot;
    c.stats.clicks += clTot;
    c.stats.cost += costTot;
    c.last = {
      impressions: impTot,
      clicks: clTot,
      cost: costTot,
      conv: 0,
      convTrue: 0,
      eligible: plan.eligible * hold,
      isShare: plan.isShare,
      isLostBudget: plan.isLostBudget,
      isLostRank: plan.isLostRank,
      avgQs: plan.avgQs,
    };
    addTo(ctx.acc.spend, `google.${c.id}`, costTot);
  }
}

/** Gün sonu: dönüşüm gözlemleri, öğrenme durumu ve arama terimi birikimi. */
export function updateGoogleLearning(s: GameState, ctx: DayCtx, rng: Rng): void {
  const tf = trackedFraction(s, 'google');
  const minConv = pn(s, 'gads.smart.min_conversions');
  const win = Math.max(1, Math.round(pn(s, 'gads.smart.window_days')));
  const learnDays = pn(s, 'gads.smart.learning_days', win / 2);
  for (const c of s.google.campaigns) {
    const trueLeads = ctx.acc.leadsByRef[c.id] ?? 0;
    const obs = rng.fork(`learn.${c.id}`).binomial(trueLeads, tf);
    const over = Math.max(1, pn(s, 'measure.platform_overreport', 1));
    if (c.last) {
      c.last.convTrue = trueLeads;
      c.last.conv = obs * over;
    }
    c.stats.conv += obs * over;
    for (const row of Object.values(c.termAcc)) {
      const t = ctx.acc.leadsByRefCls[`${c.id}|${row.cls}`] ?? 0;
      row.conv += t * tf;
    }
    c.learning.convWindow.push(obs);
    while (c.learning.convWindow.length > win) c.learning.convWindow.shift();
    if (c.strategy === 'manual') {
      c.learning.state = 'manual';
      continue;
    }
    const sum = c.learning.convWindow.reduce((a, b) => a + b, 0);
    const age = s.day - c.learning.sinceReset;
    if (sum >= minConv && age >= learnDays) c.learning.state = 'stable';
    else if (c.learning.state === 'stable' && sum < 0.5 * minConv) c.learning.state = 'limited';
    else if (c.learning.state === 'learning' && age >= Math.max(win, learnDays)) c.learning.state = 'limited';
  }
}

export const strategyNeedsTarget = (st: BidStrategy): boolean => st === 'tcpa';
