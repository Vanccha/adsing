// Olay sistemi (aşama 1): tohumlu çekilişler; olaylar durum üzerinde geçici "modifier" kaydı bırakır.
// Her olay kendi RNG alt akışını kullanır (event.<id>.d<gün>): olay eklemek diğer rastgeleliği kaydırmaz.
// Olay oranları motor varsayımıdır (K.ev); yasal/makro olayların oranı pazar çarpanıyla ölçeklenir.
import { K } from './constants';
import type { DayCtx } from './ctx';
import { pn } from './params';
import type { GameEvent, GameState, Modifier } from './types';
import { clamp01 } from './util';
import { fixedMonthly } from '../funnel/finance';

interface EventDef {
  id: string;
  rate: (s: GameState) => number;
  bad: boolean;
  run: (s: GameState, ctx: DayCtx, r: ReturnType<DayCtx['root']['fork']>) => GameEvent | null;
}

const mod = (s: GameState, id: string, target: string, kind: 'mult' | 'add', value: number, days: number): void => {
  const m: Modifier = { id: `${id}.${s.day}`, target, kind, value, from: s.day, until: s.day + days, source: id };
  s.modifiers.push(m);
};

const ev = (s: GameState, id: string, tone: GameEvent['tone'], params: GameEvent['params'] = {}): GameEvent => ({ day: s.day, id, key: `event.${id}`, params, tone });

const DEFS: EventDef[] = [
  {
    id: 'tracking_break',
    bad: true,
    rate: () => K.ev.trackingBreak,
    run: (s, _c, r) => {
      const keep = r.uniform(0.3, 0.6);
      s.tracking.health = clamp01(s.tracking.health * keep);
      return ev(s, 'tracking_break', 'bad');
    },
  },
  {
    id: 'bid_surge',
    bad: true,
    rate: () => K.ev.bidSurge,
    run: (s, _c, r) => {
      const m = r.uniform(1.15, 1.4);
      mod(s, 'bid_surge', 'cpc', 'mult', m, 21);
      mod(s, 'bid_surge', 'cpm', 'mult', 1 + (m - 1) * 0.6, 21);
      return ev(s, 'bid_surge', 'bad', { mult: Math.round(m * 100) / 100, days: 21 });
    },
  },
  {
    id: 'competitor_price_cut',
    bad: true,
    rate: () => K.ev.priceCut,
    run: (s) => {
      mod(s, 'competitor_price_cut', 'conv_paid', 'mult', 0.9, 45);
      return ev(s, 'competitor_price_cut', 'bad', { days: 45 });
    },
  },
  {
    id: 'platform_policy_review',
    bad: true,
    rate: (s) => K.ev.policyReview * pn(s, 'events.legal_rate_mult', 1),
    run: (s, _c, r) => {
      const ch = r.bernoulli(0.5) ? 'google' : 'meta';
      s.accounts[ch].health = clamp01(s.accounts[ch].health - 0.25);
      return ev(s, 'platform_policy_review', 'bad', { channel: ch });
    },
  },
  {
    id: 'macro_downturn',
    bad: true,
    rate: (s) => K.ev.downturn * pn(s, 'events.macro_rate_mult', 1),
    run: (s) => {
      mod(s, 'macro_downturn', 'demand', 'mult', 0.85, 60);
      mod(s, 'macro_downturn', 'churn', 'mult', 1.15, 60);
      return ev(s, 'macro_downturn', 'bad', { days: 60 });
    },
  },
  {
    id: 'demand_boost',
    bad: false,
    rate: () => K.ev.demandBoost,
    run: (s) => {
      mod(s, 'demand_boost', 'demand', 'mult', 1.2, 14);
      return ev(s, 'demand_boost', 'good', { days: 14 });
    },
  },
  {
    id: 'payment_surprise',
    bad: true,
    rate: (s) => K.ev.paymentSurprise * pn(s, 'events.legal_rate_mult', 1),
    run: (s, ctx) => {
      const amount = 0.5 * fixedMonthly(s) + 0.25 * s.mrr;
      s.cash -= amount;
      s.ledger.fines += amount;
      ctx.acc.cashOut += amount;
      return ev(s, 'payment_surprise', 'bad', { amount: Math.round(amount) });
    },
  },
  {
    id: 'geo_model_update',
    bad: false,
    rate: () => K.ev.geoUpdate,
    run: (s, _c, r) => {
      const m = r.uniform(0.6, 1.6);
      s.geo.visibility = clamp01(s.geo.visibility * m);
      return ev(s, 'geo_model_update', m >= 1 ? 'good' : 'bad', { mult: Math.round(m * 100) / 100 });
    },
  },
  {
    id: 'viral_mention',
    bad: false,
    rate: () => K.ev.viralMention,
    run: (s) => {
      mod(s, 'viral_mention', 'organic', 'mult', 2, 10);
      return ev(s, 'viral_mention', 'good', { days: 10 });
    },
  },
  {
    id: 'product_bug',
    bad: true,
    rate: () => K.ev.productBug,
    run: (s) => {
      mod(s, 'product_bug', 'churn', 'mult', 1.3, 30);
      return ev(s, 'product_bug', 'bad', { days: 30 });
    },
  },
];

/** Aşama 1: olay çekilişleri + süresi dolan modifier temizliği + hesap sağlığı toparlanması. */
export function runEvents(s: GameState, ctx: DayCtx): void {
  s.modifiers = s.modifiers.filter((m) => m.until > s.day);
  const diff = K.difficultyBadMult[s.difficulty];
  for (const d of DEFS) {
    const r = ctx.root.fork(`event.${d.id}`);
    const p = d.rate(s) * (d.bad ? diff : 1);
    if (r.bernoulli(Math.min(1, p))) {
      const e = d.run(s, ctx, r.fork('x'));
      if (e) ctx.events.push(e);
    }
  }
  // Hesap sağlığı: toparlanma ve askıya alma
  for (const ch of ['google', 'meta'] as const) {
    const a = s.accounts[ch];
    if (a.permanent) continue;
    if (a.suspendedUntil !== null && a.suspendedUntil <= s.day) a.suspendedUntil = null;
    if (a.suspendedUntil === null) {
      a.health = clamp01(a.health + K.accountHealthRecover);
      if (a.health < K.suspendHealth) {
        a.strikes += 1;
        a.health = 0.5;
        if (a.strikes >= 3) {
          a.permanent = true;
          ctx.events.push({ day: s.day, id: 'account_banned', key: 'event.account_banned', params: { channel: ch }, tone: 'bad' });
        } else {
          a.suspendedUntil = s.day + K.suspendDays;
          ctx.events.push({ day: s.day, id: 'account_suspended', key: 'event.account_suspended', params: { channel: ch, days: K.suspendDays }, tone: 'bad' });
        }
      }
    }
  }
}
