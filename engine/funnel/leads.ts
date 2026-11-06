// Huni (kanal bağımsız): tıklama > LP ziyareti > lead > nitelikli > deneme > aktivasyon > ücretli.
// - Aşama 5 (generateLeads): reklam tıklarını LP üzerinden lead'e çevirir (A/B bölme, LP gizli kalitesi, teklif), organik taban ve doğrudan lead'ler.
// - Aşama 6 (processSales): satış kapasitesi (kurucu saati + satış elemanı), yanıt süresine bağlı lead çürümesi, nitelendirme, deneme başlangıcı.
// - Aşama 7 (processTrials): deneme bitişi -> aktivasyon (onboarding kalitesi) -> ücretli kohort.
import type { Rng } from '../rng';
import { K } from '../core/constants';
import type { DayCtx } from '../core/ctx';
import { addTo } from '../core/ctx';
import { buyingFactor } from '../core/env';
import { pn } from '../core/params';
import type { Cohort, GameState, LeadChannel, LeadBatch } from '../core/types';
import { clamp01 } from '../core/util';
import { defaultOfferId, organicExpected } from '../channels/local';
import { trackedFraction } from '../measurement/tracking';
import { findLp, findOffer } from '../quality/assets';
import { leadRate, loadRate, onbFactor, priceFactor, visitToLead } from './rates';

function addLeadBatch(s: GameState, ctx: DayCtx, ref: string | null, cls: string | null, b: Omit<LeadBatch, 'day'>): void {
  if (b.n <= 0) return;
  s.funnel.queue.push({ day: s.day, ...b });
  addTo(ctx.acc.leads, b.channel, b.n);
  addTo(ctx.acc.incrLeads, b.channel, b.n - b.nonIncr);
  ctx.acc.stages.leads += b.n;
  if (ref) {
    addTo(ctx.acc.leadsByRef, ref, b.n);
    if (cls) addTo(ctx.acc.leadsByRefCls, `${ref}|${cls}`, b.n);
  }
}

/** Aşama 5. */
export function generateLeads(s: GameState, ctx: DayCtx): void {
  const rng = ctx.root.fork('funnel.leads');
  const buying = buyingFactor(s);
  const tfA = trackedFraction(s, 'analytics');
  const abRunning = s.tests.ab.filter((t) => t.status === 'running' && t.startDay <= s.day);
  let paidNonIncr = 0;
  ctx.batches.forEach((b, i) => {
    const r: Rng = rng.fork(`b${i}`);
    ctx.acc.stages.impressions += b.impressions;
    ctx.acc.stages.clicks += b.clicks;
    const offer = findOffer(s, b.offerId);
    const base = b.channel === 'google' ? pn(s, 'gads.search.cvr_lead') : pn(s, 'meta.cvr_lead');
    const test = abRunning.find((t) => t.a === b.lpId);
    const bClicks = test ? r.binomial(b.clicks, test.split) : 0;
    const arms = test
      ? [
          { lpId: test.a, clicks: b.clicks - bClicks, arm: 'A' as const },
          { lpId: test.b, clicks: bClicks, arm: 'B' as const },
        ]
      : [{ lpId: b.lpId, clicks: b.clicks, arm: null }];
    let leadsTot = 0;
    for (const arm of arms) {
      const lp = findLp(s, arm.lpId);
      const visits = r.binomial(arm.clicks, loadRate(lp));
      const scent = b.message && lp?.message === b.message ? K.messageMatchBonus : 1; // reklamın vaadi sayfada karşılanıyor
      const lr = leadRate(s, base, b.cls, lp, offer, b.cvrMult * scent * buying * K.segment[s.product.segment].leads);
      const leads = r.binomial(visits, visitToLead(lr));
      ctx.acc.stages.visits += visits;
      ctx.acc.lpVisits += visits;
      const obsLeads = r.binomial(leads, tfA);
      if (lp) {
        lp.stats.cvr.n += visits;
        lp.stats.cvr.k += leads;
        lp.stats.cvr.kObs += obsLeads;
      }
      if (test && arm.arm) {
        const c = arm.arm === 'A' ? test.statsA : test.statsB;
        c.n += visits;
        c.k += leads;
        c.kObs += obsLeads;
      }
      leadsTot += leads;
      ctx.acc.lpLeads += leads;
    }
    const nonIncrTot = r.binomial(leadsTot, b.nonIncr);
    paidNonIncr += nonIncrTot;
    addLeadBatch(s, ctx, b.ref, b.cls, {
      channel: b.channel,
      n: leadsTot,
      qual: K.channelQual[b.channel] * K.classQualMult[b.cls] * b.qualMult,
      msg: b.mode === 'message',
      offerId: b.offerId,
      nonIncr: nonIncrTot,
      assisted: false,
      preQualified: false,
      trialP: null,
      tauMult: b.tauMult,
    });
  });
  ctx.acc.displaced = paidNonIncr;

  // Organik taban: artımsal olmayan reklam lead'leri organik tabandan yer değiştirir (toplam gerçek lead değişmez).
  const mu = organicExpected(s);
  ctx.acc.organicBase = mu;
  const orgRealized = ctx.root.fork('funnel.organic').poisson(mu);
  const org = Math.max(0, orgRealized - paidNonIncr);
  if (org > 0) {
    ctx.acc.stages.impressions += org;
    ctx.acc.stages.clicks += org;
    ctx.acc.stages.visits += org;
    addLeadBatch(s, ctx, null, null, { channel: 'organic', n: org, qual: K.channelQual.organic, msg: false, offerId: defaultOfferId(s), nonIncr: 0, assisted: false, preQualified: false, trialP: null, tauMult: 1 });
  }
  // Doğrudan lead'ler (yerel, referans, saha, soğuk temas, GEO)
  for (const d of ctx.direct) {
    ctx.acc.stages.impressions += d.n;
    ctx.acc.stages.clicks += d.n;
    ctx.acc.stages.visits += d.n;
    addLeadBatch(s, ctx, null, null, { channel: d.channel, n: d.n, qual: d.qual, msg: false, offerId: d.offerId, nonIncr: 0, assisted: d.assisted, preQualified: d.preQualified, trialP: d.trialP, tauMult: d.tauMult });
  }
  // A/B bitişi
  for (const t of s.tests.ab) {
    if (t.status === 'running' && s.day + 1 >= t.endDay) {
      t.status = 'done';
      ctx.events.push({ day: s.day, id: 'ab_done', key: 'event.ab_done', params: { testId: t.id }, tone: 'info' });
    }
  }
}

/** Günlük satış kapasitesi (lead/gün). */
export function salesCapacity(s: GameState): number {
  const loss = pn(s, 'founder.overtime_efficiency_loss', 0);
  const eff = (1 - s.founder.burnout * K.burnoutEffect) * (s.founder.overtimeYesterday > 0 ? 1 - loss : 1);
  const hours = Math.min(s.founder.reserved.sales, s.founder.capacityToday) * eff;
  return hours / K.hoursPerLead + s.reps * K.repLeadsPerDay;
}

function chBucket(s: GameState, ch: LeadChannel) {
  return (s.funnel.byChannel[ch] ??= { leads: 0, incrLeads: 0, qualified: 0, trials: 0, paid: 0, spend: 0 });
}

/** Aşama 6. */
export function processSales(s: GameState, ctx: DayCtx): void {
  const rng = ctx.root.fork('funnel.sales');
  const tau = pn(s, 'funnel.lead_decay_tau_hours');
  const qBase = pn(s, 'funnel.lead_qualified');
  const tBase = pn(s, 'funnel.trial_start');
  const trialDays = Math.max(1, Math.round(pn(s, 'scn.trial_days', K.trialDaysDefault)));
  const buying = buyingFactor(s);
  const h0 = s.autoReply ? K.autoReplyResponseHours : K.baseResponseHours;
  let cap = Math.floor(salesCapacity(s));
  const keep: LeadBatch[] = [];
  // Varsayılan FIFO (en eski önce): yük altında eski lead'ler kapasiteyi yer ve yenileri bekler. 'funnel.prioritizeLeads'
  // tepkisi (case.respond) en yeniyi öne alır: lead değeri zamanla çürüdüğü için taze lead önce aranır.
  const prioritized = (s.cases.flags.lead_priority?.until ?? 0) > s.day;
  s.funnel.queue.sort((a, b) => (prioritized ? b.day - a.day : a.day - b.day));
  let idx = 0;
  for (const b of s.funnel.queue) {
    if (s.day - b.day > K.maxLeadWaitDays) {
      ctx.acc.unreachable += b.n; // süresi dolan lead kaybolur
      continue;
    }
    if (cap <= 0) {
      keep.push(b);
      continue;
    }
    const r = rng.fork(`q${idx++}`);
    const take = Math.min(b.n, cap);
    cap -= take;
    const dt = (s.day - b.day) * 24 + h0;
    const pContact = K.contactP0 * Math.exp(-dt / (tau * b.tauMult));
    const contacted = r.binomial(take, pContact);
    ctx.acc.unreachable += take - contacted;
    ctx.acc.respHoursSum += dt * take;
    ctx.acc.respN += take;
    const qualified = b.preQualified ? contacted : r.binomial(contacted, clamp01(qBase * b.qual * K.segment[s.product.segment].qual));
    const offer = findOffer(s, b.offerId);
    const pTrial = clamp01((b.trialP ?? tBase * Math.pow(offer ? offer.q : 1, 0.5)) * buying * modMult(s, 'trial_start'));
    const trials = r.binomial(qualified, pTrial);
    const frac = b.n > 0 ? take / b.n : 0;
    const nonIncrT = r.binomial(trials, b.n > 0 ? b.nonIncr / b.n : 0);
    if (offer) {
      offer.stats.trial.n += qualified;
      offer.stats.trial.k += trials;
      offer.stats.trial.kObs += trials;
    }
    ctx.acc.stages.qualified += qualified;
    ctx.acc.stages.trials += trials;
    const cb = chBucket(s, b.channel);
    cb.qualified += qualified;
    cb.trials += trials;
    if (trials > 0) s.funnel.trials.push({ startDay: s.day, endDay: s.day + trialDays, channel: b.channel, n: trials, assisted: b.assisted, nonIncr: nonIncrT });
    const left = b.n - take;
    if (left > 0) keep.push({ ...b, n: left, nonIncr: Math.round(b.nonIncr * (1 - frac)) });
  }
  s.funnel.queue = keep;
}

/** Aşama 7: biten denemeler -> aktivasyon -> ücretli (yeni kohort). */
export function processTrials(s: GameState, ctx: DayCtx): void {
  const rng = ctx.root.fork('funnel.trials');
  const onbF = onbFactor(s.product.onboarding);
  const tpBase = pn(s, 'funnel.trial_to_paid');
  const pAct = Math.min(0.95, K.act0 * onbF);
  const pPaidGivenAct = clamp01((tpBase * priceFactor(s)) / K.act0);
  const rest = [];
  const byChannel: Partial<Record<LeadChannel, number>> = {};
  let paidTotal = 0;
  let i = 0;
  for (const t of s.funnel.trials) {
    if (t.endDay > s.day) {
      rest.push(t);
      continue;
    }
    const r = rng.fork(`t${i++}`);
    const assistedBoost = t.assisted ? K.fieldAssistedBoost : 1;
    const activated = r.binomial(t.n, clamp01(pAct * (t.assisted ? Math.min(1.2, assistedBoost) : 1)));
    const paid = r.binomial(activated, clamp01(pPaidGivenAct * modMultConv(s) * K.segment[s.product.segment].paid));
    ctx.acc.stages.activated += activated;
    ctx.acc.stages.paid += paid;
    if (paid > 0) {
      byChannel[t.channel] = (byChannel[t.channel] ?? 0) + paid;
      paidTotal += paid;
      addTo(ctx.acc.newCustomers, t.channel, paid);
      const cb = chBucket(s, t.channel);
      cb.paid += paid;
      if (t.channel === 'referral' && s.local.referral.active) {
        const cost = paid * s.local.referral.reward;
        s.cash -= cost;
        s.ledger.referralRewards += cost;
      }
    }
  }
  s.funnel.trials = rest;
  if (paidTotal > 0) {
    const c: Cohort = { id: s.nextCohortId++, startDay: s.day, n0: paidTotal, alive: paidTotal, arpa: s.product.price, onb: s.product.onboarding, byChannel, churned: 0, seg: s.product.segment };
    s.cohorts.push(c);
    ctx.acc.mrrMove.new += paidTotal * c.arpa;
  }
}

import { modMult } from '../core/util';
const modMultConv = (s: GameState): number => modMult(s, 'conv_paid');
