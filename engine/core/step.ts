// Günlük adım: 11 aşamalı SABİT sıra (determinizm).
//  1 olaylar | 2 aksiyonlar (kurucu saati) | 3 rakipler | 4 kanal teslimatı | 5 huni (lead) | 6 satış süreci |
//  7 deneme/aktivasyon | 8 faturalama | 9 churn | 10 nakit | 11 ölçüm/raporlama + sonuç denetimi.
// Her modül gün kökünden ayrı bir RNG alt akışı alır: aksiyon eklemek diğer rastgeleliği kaydırmaz.
import { Rng } from '../rng';
import { runGoogleDay, updateGoogleLearning } from '../channels/google';
import { runLocalDay } from '../channels/local';
import { runMetaDay, updateMetaLearning } from '../channels/meta';
import { generateLeads, processSales, processTrials } from '../funnel/leads';
import { runBilling, runChurn, updateOnboarding } from '../funnel/customers';
import { fixedMonthly, ledgerOut, runCash } from '../funnel/finance';
import { applyScheduled } from '../measurement/actions';
import { accumulateHoldouts } from '../measurement/holdout';
import { observeDay } from '../measurement/observe';
import { findCreative } from '../quality/assets';
import { caseTags } from '../cases/actionmap';
import { runCases, trackCaseResponses } from '../cases/runtime';
import { runFinancing } from '../funnel/financing';
import { ACTION_DEFS, validateAction } from './actions';
import type { ActionDef } from './actiondef';
import { K } from './constants';
import type { DayCtx } from './ctx';
import { newAcc } from './ctx';
import { founderCapacity } from './env';
import { runEvents } from './events';
import { checkLoss, evaluateEnd } from './outcome';
import { pn } from './params';
import type { Action, ActionResult, DayRecord, GameEvent, GameState, StepResult } from './types';
import { clamp, clamp01, sum } from './util';

function record(s: GameState, a: Action, status: 'applied' | 'queued' | 'rejected' | 'executed_from_queue', reason?: string, fromQueue = false, tags?: string[]): void {
  s.decisions.push({ day: s.day, action: a, status, ...(reason ? { reason } : {}), ...(fromQueue ? { fromQueue: true } : {}), ...(tags && tags.length ? { tags } : {}) });
}

/** Aşama 2: kuyruk + yeni aksiyonlar. Yetmeyen kurucu saati => kuyruğa; yetmeyen nakit/geçersiz => reddedilir. */
function processActions(s: GameState, ctx: DayCtx, actions: Action[]): void {
  const cap = s.founder.capacityToday;
  const otCap = 0.25 * cap;
  const results: ActionResult[] = ctx.actionResults;

  const tryApply = (a: Action, fromQueue: boolean, queuedDay: number): void => {
    const v = validateAction(s, a);
    if (!v.ok) {
      results.push({ action: a, status: 'rejected', reason: v.reason });
      record(s, a, 'rejected', v.reason?.key, fromQueue);
      return;
    }
    if (v.cash > s.cash) {
      results.push({ action: a, status: 'rejected', reason: { key: 'err.insufficient_cash', params: { need: Math.round(v.cash) } } });
      record(s, a, 'rejected', 'err.insufficient_cash', fromQueue);
      return;
    }
    const used = s.founder.usedToday;
    const free = cap - used;
    const otAvail = otCap - s.founder.overtimeToday;
    if (v.hours <= free + otAvail + 1e-9) {
      const over = Math.max(0, v.hours - Math.max(0, free));
      s.founder.overtimeToday += over;
      s.founder.usedToday += v.hours;
      s.cash -= v.cash;
      s.ledger.actionCosts += v.cash;
      const tags = s.cases.enabled ? caseTags(s, a) : undefined; // uygulanmadan ÖNCEKİ durumdan (bütçe artışı vb.)
      (ACTION_DEFS[a.type] as ActionDef<typeof a.type>).apply(a.params as never, s, ctx);
      results.push({ action: a, status: 'applied' });
      record(s, a, fromQueue ? 'executed_from_queue' : 'applied', undefined, false, tags);
      return;
    }
    if (v.hours > cap + otCap) {
      results.push({ action: a, status: 'rejected', reason: { key: 'err.too_many_hours', params: { hours: v.hours } } });
      record(s, a, 'rejected', 'err.too_many_hours', fromQueue);
      return;
    }
    if (fromQueue && s.day - queuedDay >= K.queueMaxDays) {
      results.push({ action: a, status: 'rejected', reason: { key: 'err.queue_expired' } });
      record(s, a, 'rejected', 'err.queue_expired', fromQueue);
      return;
    }
    s.founder.queue.push({ action: a, queuedDay });
    if (!fromQueue) {
      results.push({ action: a, status: 'queued', reason: { key: 'err.no_hours', params: { need: v.hours, free: Math.max(0, Math.round(free * 100) / 100) } } });
      record(s, a, 'queued', 'err.no_hours');
    }
  };

  const queued = s.founder.queue;
  s.founder.queue = [];
  for (const q of queued) tryApply(q.action, true, q.queuedDay);
  for (const a of actions) tryApply(a, false, s.day);
}

function emptyReport(s: GameState): DayRecord {
  const last = s.history[s.history.length - 1];
  if (last) return last;
  return {
    day: s.day, stages: { impressions: 0, clicks: 0, visits: 0, leads: 0, qualified: 0, trials: 0, activated: 0, paid: 0 }, spend: {}, leads: {}, incrLeads: {}, newCustomers: {}, platformConv: {}, analyticsConv: 0,
    crmLeads: 0, crmCustomers: 0, organicBase: 0, revenueNet: 0, cashIn: 0, cashOut: 0, cash: s.cash, mrr: s.mrr, mrrMove: { new: 0, expansion: 0, contraction: 0, churn: 0 }, customers: 0, churned: 0, lpVisits: 0, lpLeads: 0, trackedFraction: {}, hoursUsed: 0, hoursCapacity: 0, queueLen: 0,
  };
}

/** Test/analiz yardımcısı: o günün boş bağlamı. */
export function newDayCtx(s: GameState): DayCtx {
  return { root: new Rng(`seed:${s.seed}`).fork(`d${s.day}`), events: [], actionResults: [], cashLimit: 0, batches: [], direct: [], acc: newAcc() };
}

/** Durumu yerinde değiştirir (runDays için). Dışarıya step() ile saf arayüz verilir. */
export function stepInPlace(s: GameState, actions: Action[]): StepResult {
  if (s.outcome) return { state: s, events: [], report: emptyReport(s), actionResults: [] };
  const ctx: DayCtx = {
    root: new Rng(`seed:${s.seed}`).fork(`d${s.day}`),
    events: [],
    actionResults: [],
    cashLimit: 0,
    batches: [],
    direct: [],
    acc: newAcc(),
  };
  const ledgerBefore = { ...s.ledger };
  const cashBefore = s.cash;

  // Kurucu saati: hafta içi hpw/6, hafta sonu hpw/12 (toplam hpw); sabit tahsisler önce düşer.
  pn(s, 'founder.hours_per_week'); // zorunlu parametre kontrolü
  const capacity = founderCapacity(s);
  s.founder.capacityToday = capacity;
  s.founder.overtimeToday = 0;
  const reservedEff = Math.min(s.founder.reserved.sales + s.founder.reserved.onboarding, capacity);
  s.founder.usedToday = reservedEff;

  // 1 olaylar
  runEvents(s, ctx);
  runCases(s, ctx); // vaka tetikleyicileri + JSON olay havuzu
  // 2 aksiyonlar
  applyScheduled(s);
  processActions(s, ctx, actions);
  trackCaseResponses(s);
  // 3 rakipler: ortalamaya dönen rassal yürüyüş
  const cr = ctx.root.fork('market.competitors');
  s.competitorIndex = clamp(s.competitorIndex + 0.05 * (1 - s.competitorIndex) + 0.02 * cr.normal(), 0.7, 1.6);
  // 4 kanallar
  ctx.cashLimit = Math.max(0, s.cash - fixedMonthly(s) / 30);
  runLocalDay(s, ctx);
  runGoogleDay(s, ctx);
  runMetaDay(s, ctx);
  boldPolicyRisk(s, ctx);
  // 5-7 huni
  generateLeads(s, ctx);
  processSales(s, ctx);
  processTrials(s, ctx);
  // 8-10 finans
  runBilling(s, ctx);
  runChurn(s, ctx);
  updateOnboarding(s);
  runCash(s, ctx);
  runFinancing(s, ctx);
  // 11 ölçüm / raporlama
  const rngObs = ctx.root.fork('measure');
  observeDay(s, ctx, rngObs);
  updateGoogleLearning(s, ctx, rngObs);
  updateMetaLearning(s, ctx, rngObs);
  accumulateHoldouts(s, ctx, rngObs);
  updateCumulative(s, ctx);
  updateResources(s, ctx);

  const out = ledgerOut(s.ledger) - ledgerOut(ledgerBefore);
  const inc = s.ledger.revenue + s.ledger.vatCollected + s.ledger.financingIn - ledgerBefore.revenue - ledgerBefore.vatCollected - ledgerBefore.financingIn;
  const acc = ctx.acc;
  const rec: DayRecord = {
    day: s.day,
    stages: acc.stages,
    spend: acc.spend,
    leads: acc.leads,
    incrLeads: acc.incrLeads,
    newCustomers: acc.newCustomers,
    platformConv: acc.platformConv,
    analyticsConv: acc.analyticsConv,
    crmLeads: acc.crmLeads,
    crmCustomers: acc.crmCustomers,
    organicBase: acc.organicBase,
    lpVisits: acc.lpVisits,
    lpLeads: acc.lpLeads,
    revenueNet: acc.revenueNet,
    cashIn: inc,
    cashOut: out,
    cash: s.cash,
    mrr: s.mrr,
    mrrMove: acc.mrrMove,
    customers: sum(s.cohorts.map((c) => c.alive)),
    churned: acc.churned,
    trackedFraction: acc.trackedFraction,
    hoursUsed: s.founder.usedToday,
    hoursCapacity: capacity,
    queueLen: s.founder.queue.length,
    gClicks: acc.gClicks,
    gImpr: acc.gImpr,
    gCls: acc.gCls,
    gMatchCost: acc.gMatchCost,
    gBudget: s.google.campaigns.reduce((a, c) => a + (c.status === 'active' ? c.dailyBudget : 0), 0),
    respHoursSum: acc.respHoursSum,
    respN: acc.respN,
    unreachable: acc.unreachable,
  };
  void cashBefore;
  s.history.push(rec);
  s.events.push(...ctx.events);
  if (s.events.length > 120) s.events = s.events.slice(-120);

  // Sonuç
  s.day += 1;
  const loss = checkLoss(s);
  if (loss) {
    s.outcome = { ...loss, day: s.day };
  } else if (s.day >= s.horizon) {
    s.outcome = { ...evaluateEnd(s), day: s.day };
  }
  if (s.outcome) {
    const e: GameEvent = { day: s.day - 1, id: 'game_over', key: s.outcome.reason, params: { ...s.outcome.detail }, tone: s.outcome.status === 'lost' ? 'bad' : 'good' };
    ctx.events.push(e);
    s.events.push(e);
  }
  return { state: s, events: ctx.events, report: rec, actionResults: ctx.actionResults };
}

/** Abartılı (bold) yaratıcılar kullanan kanalda politika ihlali riski. */
function boldPolicyRisk(s: GameState, ctx: DayCtx): void {
  const used: Array<'google' | 'meta'> = [];
  const gBold = s.google.campaigns.some((c) => c.status === 'active' && c.adGroups.some((g) => findCreative(s, g.creativeId)?.bold));
  const mBold = s.meta.adSets.some((a) => a.status === 'active' && a.ads.some((x) => findCreative(s, x.creativeId)?.bold));
  if (gBold) used.push('google');
  if (mBold) used.push('meta');
  for (const ch of used) {
    if (ctx.root.fork(`policy.bold.${ch}`).bernoulli(K.boldPolicyRisk)) {
      s.accounts[ch].health = clamp01(s.accounts[ch].health - 0.15);
      ctx.events.push({ day: s.day, id: 'ad_disapproved', key: 'event.ad_disapproved', params: { channel: ch }, tone: 'bad' });
    }
  }
}

function updateCumulative(s: GameState, ctx: DayCtx): void {
  const c = s.funnel.cum;
  const a = ctx.acc.stages;
  c.impressions += a.impressions;
  c.clicks += a.clicks;
  c.visits += a.visits;
  c.leads += a.leads;
  c.qualified += a.qualified;
  c.trials += a.trials;
  c.activated += a.activated;
  c.paid += a.paid;
  const bc = s.funnel.byChannel;
  for (const [ch, n] of Object.entries(ctx.acc.leads)) {
    const b = (bc[ch] ??= { leads: 0, incrLeads: 0, qualified: 0, trials: 0, paid: 0, spend: 0 });
    b.leads += n;
    b.incrLeads += ctx.acc.incrLeads[ch] ?? 0;
  }
  for (const ch of ['google', 'meta']) {
    const b = (bc[ch] ??= { leads: 0, incrLeads: 0, qualified: 0, trials: 0, paid: 0, spend: 0 });
    b.spend += ctx.acc.spend[ch] ?? 0;
  }
}

/** İtibar, tükenme, GEO gözlemi. */
function updateResources(s: GameState, ctx: DayCtx): void {
  s.reputation = clamp01(s.reputation + K.repRecover * (s.product.onboarding - 0.45));
  // Tükenme: sabit tahsisler yarım, aksiyon saatleri tam sayılır.
  const reservedEff = Math.min(s.founder.reserved.sales + s.founder.reserved.onboarding, s.founder.capacityToday);
  const util = s.founder.capacityToday > 0 ? (s.founder.usedToday - 0.5 * reservedEff) / s.founder.capacityToday : 0;
  if (util > K.burnoutHigh) s.founder.burnout = clamp01(s.founder.burnout + K.burnoutGain * (1 + (util - K.burnoutHigh) * 5));
  else if (util < K.burnoutLow) s.founder.burnout = clamp01(s.founder.burnout - K.burnoutRecover);
  s.founder.overtimeYesterday = s.founder.overtimeToday;
  s.geo.observedScore = Math.max(0, s.geo.visibility + ctx.root.fork('geo.obs').normal(0, 0.05));
}

/** Saf arayüz: yeni durum döner, girdi durumu değişmez. */
export function step(state: GameState, actions: Action[]): StepResult {
  return stepInPlace(structuredClone(state), actions);
}
