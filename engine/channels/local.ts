// Ücretsiz / yerel kanallar (Aşama 1'de basit, Aşama 2'de derinleşir): organik taban, GBP, yorum isteme, referans,
// saha satışı, soğuk temas (yasal rejime göre), içerik (sosyal/SEO). GEO için bkz. geo.ts.
import { Rng } from '../rng';
import { K } from '../core/constants';
import type { DayCtx, DirectLead } from '../core/ctx';
import type { ActionDef, PartialDefs } from '../core/actiondef';
import { posNum } from '../core/actiondef';
import { awareness, channelRelative, demandFactor } from '../core/env';
import { pn, priceCost, ps } from '../core/params';
import type { GameState } from '../core/types';
import { clamp, clamp01, modMult } from '../core/util';

export const defaultOfferId = (s: GameState): string => s.assets.offers[0]!.id;

/** Beklenen organik/doğrudan lead/gün (reklamsız taban). */
export function organicExpected(s: GameState): number {
  const salons = pn(s, 'market.salon_count');
  const rep = 0.6 + 0.8 * s.reputation;
  return salons * K.organicPerSalon * (1 + K.organicAwarenessGain * awareness(s)) * rep * modMult(s, 'organic') * (0.5 + 0.5 * demandFactor(s));
}

function activeCustomers(s: GameState): number {
  let n = 0;
  for (const c of s.cohorts) n += c.alive;
  return n;
}

function push(ctx: DayCtx, s: GameState, d: Partial<DirectLead> & { channel: DirectLead['channel']; n: number }): void {
  if (d.n <= 0) return;
  ctx.direct.push({ qual: K.channelQual[d.channel], assisted: false, preQualified: false, trialP: null, offerId: defaultOfferId(s), tauMult: 1, ...d });
}

/** Gün başı yerel kanallar: GBP, referans, içerik, GEO lead'leri + stok güncellemeleri. */
export function runLocalDay(s: GameState, ctx: DayCtx): void {
  const org = organicExpected(s);
  const l = s.local;
  // Bekleyen yorumlar
  const still: typeof l.gbp.pending = [];
  for (const p of l.gbp.pending) {
    if (p.day <= s.day) l.gbp.reviews += p.n;
    else still.push(p);
  }
  l.gbp.pending = still;
  l.gbp.score = clamp01(l.gbp.score * (1 - K.gbpDecay));
  // GBP
  const gbpMu = org * pn(s, 'local.gbp_effect') * l.gbp.score * channelRelative(s, 'gbp') * (1 + 0.2 * Math.min(1, l.gbp.reviews / K.reviewMax));
  push(ctx, s, { channel: 'gbp', n: ctx.root.fork('local.gbp').poisson(gbpMu) });
  // Referans
  const refMu = (activeCustomers(s) * pn(s, 'local.referral_rate') * channelRelative(s, 'referral') * (l.referral.active ? 1 : K.referralBaseline) * (0.6 + 0.8 * s.reputation)) / 30;
  push(ctx, s, { channel: 'referral', n: ctx.root.fork('local.referral').poisson(refMu) });
  // İçerik (SEO gecikmeli)
  l.content.seoEff += (l.content.seo - l.content.seoEff) * (1 - K.contentSeoLag);
  const cMu = K.contentLeadsPerPoint * (l.content.social * channelRelative(s, 'organic_social') + l.content.seoEff);
  push(ctx, s, { channel: 'content', n: ctx.root.fork('local.content').poisson(cMu) });
  l.content.social *= 1 - K.contentDecay;
  l.content.seo *= 1 - K.contentDecay / 2;
  // GEO
  const g = s.geo;
  const arr = g.pipeline.length ? (g.pipeline.shift() as number) : 0;
  g.pipeline.push(0);
  g.visibility = clamp01(g.visibility + K.geoGainPerHour * arr - K.geoDecay * g.visibility);
  const gr = ctx.root.fork('local.geo');
  if (gr.bernoulli(g.visibility)) push(ctx, s, { channel: 'geo', n: gr.poisson(K.geoLeadsAtFull) });
  // Soğuk temas alan sağlığı toparlanır
  l.outreach.domainHealth = clamp01(l.outreach.domainHealth + 0.01);
  l.outreach.sent30 *= 1 - 1 / 30;
}

const legalOf = (s: GameState, kind: 'email' | 'call' | 'sms'): 'allowed' | 'restricted' | 'banned' => {
  const v = ps(s, kind === 'sms' ? 'legal.sms' : `legal.cold_${kind}`, 'allowed');
  return v === 'banned' || v === 'restricted' ? v : 'allowed';
};

const optimizeGbp: ActionDef<'local.optimize_gbp'> = {
  minHours: 1,
  hours: (p) => p.hours,
  cash: () => 0,
  check: (p) => (posNum(p.hours) ? null : 'err.bad_hours'),
  apply: (p, s) => {
    s.local.gbp.claimed = true;
    s.local.gbp.score = clamp01(s.local.gbp.score + K.gbpScorePerHour * p.hours * (1 - s.local.gbp.score));
  },
};

const requestReviews: ActionDef<'local.request_reviews'> = {
  minHours: 0.5,
  hours: (p) => 0.5 + 0.05 * p.count,
  cash: () => 0,
  check: (p, s) => (!posNum(p.count) ? 'err.bad_count' : activeCustomers(s) < p.count ? 'err.not_enough_customers' : null),
  apply: (p, s, ctx) => {
    const r: Rng = ctx.root.fork(`local.reviews.${s.day}`);
    const got = r.binomial(Math.floor(p.count), K.reviewArrivalRate * 3);
    for (let i = 0; i < got; i++) s.local.gbp.pending.push({ day: s.day + 1 + r.int(10), n: 1 });
  },
};

const setReferral: ActionDef<'local.set_referral'> = {
  minHours: 1,
  hours: () => 1,
  cash: () => 0,
  check: (p) => (p.reward !== undefined && p.reward < 0 ? 'err.bad_reward' : null),
  apply: (p, s) => {
    s.local.referral.active = p.on;
    s.local.referral.reward = p.reward ?? priceCost(s, 1);
  },
};

const fieldSales: ActionDef<'local.field_sales'> = {
  minHours: 2,
  hours: (p) => p.hours,
  cash: (p, s) => 0.2 * p.hours * priceCost(s, 0.1),
  check: (p) => (posNum(p.hours) ? null : 'err.bad_hours'),
  apply: (p, s, ctx) => {
    const rel = channelRelative(s, 'field_sales');
    const n = ctx.root.fork(`local.field.${s.day}`).poisson(p.hours * K.fieldVisitsPerHour * rel);
    push(ctx, s, { channel: 'field', n, assisted: true, preQualified: true, trialP: clamp01(pn(s, 'local.field_sales_close')) });
  },
};

const coldOutreach: ActionDef<'local.cold_outreach'> = {
  minHours: 1,
  hours: (p) => Math.max(0.5, p.volume / K.outreachPerHour),
  cash: () => 0,
  check: (p) => (posNum(p.volume) ? null : 'err.bad_volume'),
  apply: (p, s, ctx) => {
    const status = legalOf(s, p.kind);
    const rel = channelRelative(s, p.kind === 'sms' ? 'sms' : `cold_${p.kind}`, 1);
    const r: Rng = ctx.root.fork(`local.outreach.${s.day}.${p.kind}`);
    const y = K.outreachYield[status] * rel * s.local.outreach.domainHealth;
    push(ctx, s, { channel: 'outreach', n: r.binomial(Math.floor(p.volume), clamp01(y)) });
    s.reputation = clamp01(s.reputation - (p.volume * K.outreachRepHit[status]) / 100);
    s.local.outreach.domainHealth = clamp01(s.local.outreach.domainHealth - (p.volume * 0.0005 * (status === 'allowed' ? 1 : 3)));
    s.local.outreach.sent30 += p.volume;
    const fineP = p.kind === 'email' && status !== 'allowed' ? pn(s, 'market.abmahnung_prob_per_cold_email_batch', K.outreachFineProb[status]) : K.outreachFineProb[status];
    if (r.bernoulli(fineP)) {
      const fine = priceCost(s, 50);
      s.cash -= fine;
      s.ledger.fines += fine;
      ctx.acc.cashOut += fine;
      ctx.events.push({ day: s.day, id: 'outreach_fine', key: 'event.outreach_fine', params: { amount: fine, kind: p.kind }, tone: 'bad' });
    }
  },
};

const content: ActionDef<'local.content'> = {
  minHours: 1,
  hours: (p) => p.hours,
  cash: () => 0,
  check: (p) => (posNum(p.hours) ? null : 'err.bad_hours'),
  apply: (p, s) => {
    if (p.kind === 'social') s.local.content.social = clamp(s.local.content.social + p.hours * K.contentSocialPerHour * 20, 0, 40);
    else s.local.content.seo = clamp(s.local.content.seo + p.hours * K.contentSeoPerHour * 20, 0, 40);
  },
};

export const localActions: PartialDefs = {
  'local.optimize_gbp': optimizeGbp,
  'local.request_reviews': requestReviews,
  'local.set_referral': setReferral,
  'local.field_sales': fieldSales,
  'local.cold_outreach': coldOutreach,
  'local.content': content,
};
