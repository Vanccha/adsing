// Vaka / olay çalışma zamanı: tetikleyici değerlendirme, etki uygulama, tepki izleme, JSON olay havuzu.
// Determinizm: her çekiliş gün kökünden etiketli alt akış (case.<id>, jevent.<id>, case.flag.*) kullanır.
import { Rng } from '../rng';
import { K } from '../core/constants';
import type { DayCtx } from '../core/ctx';
import { dateOf } from '../core/env';
import { pn } from '../core/params';
import type { CaseActive, GameEvent, GameState, Modifier } from '../core/types';
import { clamp01 } from '../core/util';
import { ABSTAIN_ACTIONS } from './actionmap';
import { caseDefs, eventDefs, getCase } from './defs';
import { COSTLY_METRICS, metricValue, paramValue } from './metrics';
import type { MetricValue } from './metrics';
import type { CaseDef, Condition, Effect, EventDef, Trigger } from './schema';

// ---------- Koşul değerlendirme ----------

function cmp(a: number | string, op: Condition['op'], b: number | string): boolean {
  switch (op) {
    case '>': return a > b;
    case '>=': return a >= b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '==': return a === b;
    case '!=': return a !== b;
  }
}

type Cache = Map<string, MetricValue>;

export function evalCondition(s: GameState, c: Condition, cache: Cache = new Map()): boolean {
  let v = cache.get(c.metric);
  if (v === undefined) {
    v = metricValue(s, c.metric);
    cache.set(c.metric, v);
  }
  if (v === null) return false;
  const rhs = typeof c.value === 'object' ? paramValue(s, c.value.param) : c.value;
  if (rhs === null) return false;
  if (typeof v !== typeof rhs) return false;
  return cmp(v, c.op, rhs);
}

/** all (hepsi) ve/veya any (en az biri) koşulları; pahalı metrikler en sona bırakılır. */
export function evalTrigger(s: GameState, t: Pick<Trigger, 'all' | 'any'>, cache: Cache = new Map()): boolean {
  const order = (cs: Condition[]): Condition[] => [...cs].sort((a, b) => Number(COSTLY_METRICS.has(a.metric)) - Number(COSTLY_METRICS.has(b.metric)));
  if (t.all && !order(t.all).every((c) => evalCondition(s, c, cache))) return false;
  if (t.any && t.any.length > 0 && !t.any.some((c) => evalCondition(s, c, cache))) return false;
  return !!(t.all?.length || t.any?.length);
}

/** Pazara göre etkin tetikleyici: marketOverrides.<pazar>.trigger varsa TAMAMEN onun yerini alır (birleştirme yok). */
export function effectiveTrigger(def: CaseDef, market: string): Trigger {
  return def.marketOverrides[market]?.trigger ?? def.trigger;
}
export function effectiveEffects(def: CaseDef, market: string): Effect[] {
  return def.marketOverrides[market]?.effects ?? def.effects;
}

// ---------- Etki uygulama ----------

function setFlag(s: GameState, name: string, value: number, days: number): void {
  s.cases.flags[name] = { value, until: s.day + Math.max(1, days) };
}

function pushMod(s: GameState, source: string, target: string, kind: 'mult' | 'add', value: number, days: number): void {
  const m: Modifier = { id: `${source}.${target}.${s.day}`, target, kind, value, from: s.day, until: s.day + Math.max(1, days), source };
  s.modifiers.push(m);
}

function resolveNum(s: GameState, v: number | string, extra?: Record<string, number>): number {
  if (typeof v === 'number') return v;
  const neg = v.startsWith('-');
  const key = neg ? v.slice(1) : v;
  const x = extra?.[key] ?? (key.startsWith('derived.') ? Number(paramValue(s, key)) : Number(paramValue(s, key)));
  const r = Number.isFinite(x) ? x : 0;
  return neg ? -r : r;
}

function mainAdChannel(s: GameState): 'google' | 'meta' {
  const g = s.history.slice(-7).reduce((a, r) => a + (r.spend.google ?? 0), 0);
  const m = s.history.slice(-7).reduce((a, r) => a + (r.spend.meta ?? 0), 0);
  return m > g ? 'meta' : 'google';
}

const apply = (cur: number, op: Effect['op'], v: number): number => (op === 'mul' ? cur * v : op === 'add' ? cur + v : v);

/** Tek bir etkiyi uygular; bilinmeyen hedef sessizce atlanır (docs/engine-api.md'de listelidir). */
export function applyEffect(s: GameState, ctx: DayCtx, e: Effect, source: string, extra?: Record<string, number>): void {
  const v = resolveNum(s, e.value, extra);
  const dur = typeof e.durationDays === 'number' ? e.durationDays : resolveNum(s, e.durationDays, extra);
  switch (e.target) {
    case 'account.health': {
      const a = s.accounts[mainAdChannel(s)];
      a.health = clamp01(apply(a.health, e.op, v));
      break;
    }
    case 'cash.balance': {
      s.cash += v;
      s.ledger.fines -= v; // kimlik: negatif değer gider (ceza/vergi sürprizi), pozitif gelir
      ctx.acc.cashOut -= v;
      break;
    }
    case 'cost.usdDenominatedMult':
      // Maliyetin yarısı USD cinsi varsayılır: CPC/CPM çarpanı sqrt(v)
      pushMod(s, source, 'cpc', 'mult', Math.sqrt(v), dur);
      pushMod(s, source, 'cpm', 'mult', Math.sqrt(v), dur);
      break;
    case 'event.negative_review_active':
      setFlag(s, 'negative_review_active', v, dur);
      break;
    case 'finance.invoiceComplianceWork':
      setFlag(s, 'invoice_compliance', v, dur);
      pushMod(s, source, 'founder_cap', 'mult', 0.9, dur);
      break;
    case 'funnel.emailDeliverabilityMult':
      pushMod(s, source, 'email_deliv', 'mult', v, dur);
      break;
    case 'funnel.organicLeadsMult':
      pushMod(s, source, 'organic', 'mult', v, dur);
      break;
    case 'funnel.saasBuyingMult':
      pushMod(s, source, 'buying', 'mult', v, dur);
      break;
    case 'funnel.trialStartMult':
      pushMod(s, source, 'trial_start', 'mult', v, dur);
      break;
    case 'funnel.trialToPaidMult':
      pushMod(s, source, 'conv_paid', 'mult', v, dur);
      break;
    case 'fx.tryPerUsdMult':
      s.fxToUSD = s.fxToUSD / (v > 0 ? v : 1);
      break;
    case 'gads.cpcMult':
      pushMod(s, source, 'cpc', 'mult', v, dur);
      break;
    case 'meta.cpmMult':
      pushMod(s, source, 'cpm', 'mult', v, dur);
      break;
    case 'gads.delivery': {
      // 0 => teslimat durur: hesap geçici askıya alınır (ihlal sayılmaz)
      if (v <= 0) {
        const ch = s.google.campaigns.length > 0 || s.meta.adSets.length === 0 ? 'google' : 'meta';
        const a = s.accounts[ch];
        a.suspendedUntil = Math.max(a.suspendedUntil ?? 0, s.day + Math.max(1, dur));
      }
      break;
    }
    case 'gads.smart_learning_reset': {
      const frac = clamp01(v);
      for (const c of s.google.campaigns) {
        if (c.strategy === 'manual') continue;
        c.learning.convWindow = c.learning.convWindow.map((x) => x * (1 - frac));
        c.learning.state = 'learning';
        c.learning.sinceReset = s.day;
        c.learning.resets += 1;
      }
      for (const a of s.meta.adSets) {
        a.learning.events = a.learning.events.map((x) => x * (1 - frac));
        a.learning.state = 'learning';
        a.learning.sinceReset = s.day;
        a.learning.resets += 1;
      }
      break;
    }
    case 'market.seasonal_index':
      pushMod(s, source, 'seasonal', 'mult', v, dur);
      pushMod(s, source, 'demand', 'mult', v, dur);
      break;
    case 'measure.consentLoss':
      pushMod(s, source, 'consent_loss', 'add', v, dur);
      break;
    case 'measure.trackingHealth':
      pushMod(s, source, 'tracking', 'mult', v, dur);
      break;
    case 'reputation': {
      const before = s.reputation;
      s.reputation = clamp01(apply(s.reputation, e.op, v));
      // Geçici itibar kaybı: süre sonunda kaybın %60'ı geri döner
      if (dur > 0 && s.reputation < before) s.cases.recoveries.push({ day: s.day + dur, rep: 0.6 * (before - s.reputation) });
      break;
    }
    default:
      break;
  }
}

const effectDuration = (s: GameState, e: Effect, extra?: Record<string, number>): number => (typeof e.durationDays === 'number' ? e.durationDays : resolveNum(s, e.durationDays, extra));

// ---------- Vaka başlatma / tepki ----------

function startCase(s: GameState, ctx: DayCtx, def: CaseDef): void {
  const effects = effectiveEffects(def, s.marketId);
  const src = `case.${def.id}`;
  const active: CaseActive = {
    id: def.id,
    triggerDay: s.day,
    windowEnd: s.day + K.caseResponseWindow,
    effectEnd: s.day + Math.max(1, ...effects.map((e) => effectDuration(s, e))),
    response: 'pending',
    respondedDay: null,
    respondedAction: null,
  };
  for (const e of effects) applyEffect(s, ctx, e, src);
  s.cases.active.push(active);
  s.cases.lastTrigger[def.id] = s.day;
  ctx.events.push({ day: s.day, id: src, key: `case.${def.id}.title`, params: { caseId: def.id, stage: def.stage }, tone: 'bad' });
}

function scaleCaseModifiers(s: GameState, id: string, factor: number): void {
  for (const m of s.modifiers) {
    if (m.source !== `case.${id}`) continue;
    m.until = s.day + Math.max(1, Math.ceil((m.until - s.day) * factor));
  }
}

/** Aşama 2 sonrası: bugünkü uygulanan aksiyonların vaka etiketlerine göre doğru/yanlış tepki kaydı. */
export function trackCaseResponses(s: GameState): void {
  if (!s.cases.enabled || s.cases.active.length === 0) return;
  const today = s.decisions.filter((d) => d.day === s.day && (d.status === 'applied' || d.status === 'executed_from_queue') && d.tags && d.tags.length > 0);
  if (today.length === 0) return;
  for (const a of s.cases.active) {
    if (a.response === 'correct' || s.day >= a.windowEnd) continue;
    const def = getCase(a.id);
    if (!def) continue;
    const good = new Set(def.correctResponses.map((r) => r.action));
    const bad = new Set(def.wrongResponses.map((r) => r.action));
    for (const d of today) {
      const tags = d.tags as string[];
      const g = tags.find((t) => good.has(t));
      if (g) {
        a.response = 'correct';
        a.respondedDay = s.day;
        a.respondedAction = g;
        scaleCaseModifiers(s, a.id, K.caseCorrectShorten);
        break;
      }
      const w = tags.find((t) => bad.has(t));
      if (w && a.response === 'pending') {
        a.response = 'wrong';
        a.respondedDay = s.day;
        a.respondedAction = w;
        scaleCaseModifiers(s, a.id, K.caseWrongExtend);
      }
    }
  }
}

function finalizeCases(s: GameState): void {
  const keep: CaseActive[] = [];
  for (const a of s.cases.active) {
    if (s.day >= a.windowEnd && a.response === 'pending') {
      const def = getCase(a.id);
      const metaEdits = s.decisions.filter((d) => d.day >= a.triggerDay && d.status !== 'rejected' && d.action.type.startsWith('meta.') && !d.action.type.startsWith('meta.create')).length;
      if (def?.correctResponses.some((r) => r.action === 'meta.reduceEdits') && metaEdits === 0) {
        a.response = 'correct';
        a.respondedAction = 'meta.reduceEdits';
      } else {
        a.response = 'ignored';
        a.respondedAction = def?.wrongResponses.find((r) => ABSTAIN_ACTIONS.includes(r.action))?.action ?? null;
      }
      a.respondedDay = s.day;
    }
    if (s.day >= a.windowEnd && s.day >= a.effectEnd) {
      s.cases.history.push(a);
      if (s.cases.history.length > 200) s.cases.history.shift();
    } else keep.push(a);
  }
  s.cases.active = keep;
}

// ---------- JSON olay havuzu ----------

const GOOD_UP = new Set(['funnel.organicLeadsMult', 'funnel.saasBuyingMult', 'funnel.trialStartMult', 'funnel.trialToPaidMult', 'reputation', 'account.health', 'measure.trackingHealth', 'funnel.emailDeliverabilityMult']);
const COST_UP = new Set(['gads.cpcMult', 'meta.cpmMult', 'cost.usdDenominatedMult', 'fx.tryPerUsdMult', 'measure.consentLoss']);

/** Olay iyi mi kötü mü (zorluk çarpanı yalnız kötü olaylara uygulanır). */
export function eventIsGood(e: EventDef): boolean {
  if (e.effects.length === 0) return true;
  return e.effects.every((x) => {
    const v = typeof x.value === 'number' ? x.value : 1;
    const up = x.op === 'mul' ? v >= 1 : x.op === 'add' ? v >= 0 : v > 0;
    if (x.target === 'cash.balance') return v >= 0;
    if (GOOD_UP.has(x.target)) return up;
    if (COST_UP.has(x.target)) return !up;
    return true;
  });
}

function holidayMatches(e: EventDef, h: { kind?: string; closed: boolean }): boolean {
  const m = e.calendar?.match as Record<string, unknown> | undefined;
  if (!m) return false;
  if (typeof m.kind === 'string') return h.kind === m.kind;
  if (Array.isArray(m.closedOrKind)) return h.closed || (!!h.kind && m.closedOrKind.includes(h.kind));
  return false;
}

function runJsonEvents(s: GameState, ctx: DayCtx): void {
  const diff = K.difficultyBadMult[s.difficulty];
  const today = dateOf(s, s.day);
  const cache: Cache = new Map();
  for (const def of eventDefs()) {
    if (!def.markets.includes(s.marketId)) continue;
    const fire = (): boolean => {
      if (def.calendar) return s.holidays.some((h) => h.date === today && holidayMatches(def, h));
      if (def.conditions.length > 0 && !def.conditions.every((c) => evalCondition(s, c, cache))) return false;
      const scale = def.rateScale ? pn(s, def.rateScale, 1) : 1;
      const p = Math.min(1, def.baseDailyProbability.value * scale * (eventIsGood(def) ? 1 : diff));
      return p > 0 && ctx.root.fork(`jevent.${def.id}`).bernoulli(p);
    };
    if (!fire()) continue;
    // E12 (tatil yoğunluğu) yalnız bilgilendirir: tatil talep etkisi env.holidayFx içinde zaten vardır (çifte sayım yok).
    if (def.slug !== 'holiday-density') for (const e of def.effects) applyEffect(s, ctx, e, `event.${def.slug}`);
    if (def.slug === 'abmahnung' || def.slug === 'tcpa-complaint') s.cases.complaints.push(s.day);
    s.cases.eventLog.push({ day: s.day, id: def.id });
    if (s.cases.eventLog.length > 200) s.cases.eventLog.shift();
    const ev: GameEvent = { day: s.day, id: `events.${def.slug}`, key: `events.${def.slug}.title`, params: { eventId: def.id }, tone: eventIsGood(def) ? (def.effects.length === 0 || def.slug === 'holiday-density' || def.slug === 'einvoice-deadline' ? 'info' : 'good') : 'bad' };
    ctx.events.push(ev);
  }
}

// ---------- Ana giriş (step aşama 1b) ----------

export function runCases(s: GameState, ctx: DayCtx): void {
  const cs = s.cases;
  if (!cs.enabled) return;
  // Bakım: bayrak temizliği, itibar geri dönüşleri, rakip endeksi halkası
  for (const k of Object.keys(cs.flags)) if ((cs.flags[k] as { until: number }).until <= s.day) delete cs.flags[k];
  const rest: typeof cs.recoveries = [];
  for (const r of cs.recoveries) {
    if (r.day <= s.day) s.reputation = clamp01(s.reputation + r.rep);
    else rest.push(r);
  }
  cs.recoveries = rest;
  cs.compIdx.push(s.competitorIndex);
  if (cs.compIdx.length > 8) cs.compIdx.shift();
  cs.complaints = cs.complaints.filter((d) => d > s.day - 60);
  // Rastgele bayraklar (site güncellemesi, onay bandı değişimi)
  if (ctx.root.fork('case.flag.site_update').bernoulli(K.siteUpdateRate)) setFlag(s, 'site_update', 1, K.siteUpdateDays);
  const bannerRate = K.consentBannerRate * (pn(s, 'measure.consent_rate', 1) < 0.5 ? 2 : 1);
  if (ctx.root.fork('case.flag.consent_banner').bernoulli(bannerRate)) setFlag(s, 'consent_banner_changed', 1, K.consentBannerDays);

  finalizeCases(s);
  runJsonEvents(s, ctx);

  // Vaka tetikleyicileri
  const cache: Cache = new Map();
  for (const def of caseDefs()) {
    if (!def.markets.includes(s.marketId)) continue;
    const t = effectiveTrigger(def, s.marketId);
    const last = cs.lastTrigger[def.id];
    if (last !== undefined && s.day - last < t.cooldownDays) continue;
    if (cs.active.some((a) => a.id === def.id && s.day < a.effectEnd)) continue;
    if (!evalTrigger(s, t, cache)) continue;
    if (t.chance < 1 && !ctx.root.fork(`case.${def.id}`).bernoulli(t.chance)) continue;
    startCase(s, ctx, def);
    cache.clear(); // etkiler durumu değiştirdi
  }
}

// ---------- Okuma yardımcıları (arayüz / analiz) ----------

export interface CaseView {
  id: string;
  titleKey: string;
  summaryKey: string;
  symptomsKey: string;
  hintKey: string | null; // yalnız learningMode
  symptoms: Array<{ metric: string; value: MetricValue }>;
  triggerDay: number;
  windowEnd: number;
  response: CaseActive['response'];
}

export function activeCaseViews(s: GameState): CaseView[] {
  return s.cases.active.map((a) => {
    const def = getCase(a.id);
    return {
      id: a.id,
      titleKey: def?.i18n.title ?? `case.${a.id}.title`,
      summaryKey: def?.i18n.summary ?? `case.${a.id}.summary`,
      symptomsKey: def?.i18n.symptoms ?? `case.${a.id}.symptoms`,
      hintKey: s.learningMode ? (def?.learningHint ?? null) : null,
      symptoms: (def?.symptoms ?? []).map((m) => ({ metric: m, value: metricValue(s, m) })),
      triggerDay: a.triggerDay,
      windowEnd: a.windowEnd,
      response: a.response,
    };
  });
}

/** Tüm vaka kayıtları (aktif + geçmiş). */
export const allCaseRecords = (s: GameState): CaseActive[] => [...s.cases.history, ...s.cases.active];

export { Rng };
