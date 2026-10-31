// Operasyon aksiyonları: kurucu saati tahsisi, satış elemanı, fiyat, otomatik yanıt, dokümantasyon.
import type { ActionDef, PartialDefs } from '../core/actiondef';
import { posNum } from '../core/actiondef';
import { K } from '../core/constants';
import { pn, priceCost } from '../core/params';
import { addTo } from '../core/ctx';

const MAX_REPS = 5;

const setAlloc: ActionDef<'ops.set_alloc'> = {
  minHours: 0,
  hours: () => 0,
  cash: () => 0,
  check: (p) => (p.sales >= 0 && p.onboarding >= 0 && p.sales + p.onboarding <= 8 ? null : 'err.bad_hours'),
  apply: (p, s) => {
    s.founder.reserved = { sales: p.sales, onboarding: p.onboarding };
  },
};

const hireRep: ActionDef<'ops.hire_rep'> = {
  minHours: 6,
  hours: () => 6,
  cash: (_p, s) => priceCost(s, 5),
  check: (_p, s) => (s.reps >= MAX_REPS ? 'err.max_reps' : null),
  apply: (_p, s) => {
    s.reps += 1;
  },
};

const fireRep: ActionDef<'ops.fire_rep'> = {
  minHours: 1,
  hours: () => 1,
  cash: () => 0,
  check: (_p, s) => (s.reps > 0 ? null : 'err.no_rep'),
  apply: (_p, s) => {
    s.reps -= 1;
  },
};

const setPrice: ActionDef<'ops.set_price'> = {
  minHours: 1,
  hours: () => 1,
  cash: () => 0,
  check: (p, s) => {
    const base = pn(s, 'price.monthly');
    return posNum(p.price) && p.price >= 0.4 * base && p.price <= 2.5 * base ? null : 'err.bad_price';
  },
  apply: (p, s, ctx) => {
    const ratio = p.price / s.product.price;
    // Mevcut aboneler yeni fiyata geçer: MRR hareketi (genişleme/daralma) olarak kaydedilir.
    for (const c of s.cohorts) {
      if (c.alive <= 0) continue;
      const delta = c.alive * c.arpa * (ratio - 1);
      if (delta >= 0) ctx.acc.mrrMove.expansion += delta;
      else ctx.acc.mrrMove.contraction += -delta;
      c.arpa *= ratio;
    }
    s.mrr = s.cohorts.reduce((a, c) => a + c.alive * c.arpa, 0);
    if (ratio > 1.1) {
      const shock = pn(s, 'churn.price_hike_shock', 0.01);
      s.modifiers.push({ id: `pricehike.${s.day}`, target: 'churn_add', kind: 'add', value: shock, from: s.day, until: s.day + 30, source: 'price_hike' });
      ctx.events.push({ day: s.day, id: 'price_hike', key: 'event.price_hike', params: { ratio }, tone: 'info' });
    }
    s.product.price = p.price;
    addTo(ctx.acc.spend, 'noop', 0);
  },
};

const setAutoReply: ActionDef<'ops.set_auto_reply'> = {
  minHours: 1,
  hours: () => 1,
  cash: () => 0,
  check: () => null,
  apply: (p, s) => {
    s.autoReply = p.on;
  },
};

const buildDocs: ActionDef<'ops.build_docs'> = {
  minHours: 1,
  hours: (p) => p.hours,
  cash: () => 0,
  check: (p) => (posNum(p.hours) ? null : 'err.bad_hours'),
  apply: (p, s) => {
    s.founder.docsStock = Math.min(K.docsMax, s.founder.docsStock + p.hours * K.docsPerHour);
  },
};

const pivot: ActionDef<'ops.pivot'> = {
  minHours: 4,
  hours: () => K.pivotHours,
  cash: (_p, s) => priceCost(s, 2),
  check: (p, s) => {
    if (!(p.segment in K.segment)) return 'err.bad_segment';
    if (p.segment === s.product.segment) return 'err.same_segment';
    if (s.product.pivotDay !== null && s.day - s.product.pivotDay < K.pivotMinGapDays) return 'err.pivot_cooldown';
    return null;
  },
  apply: (p, s) => {
    s.product.segment = p.segment;
    s.product.price = pn(s, 'price.monthly') * K.segment[p.segment].price;
    s.product.pivotDay = s.day;
    // Geçiş dönemi: konumlandırma oturana kadar dönüşüm düşer
    s.modifiers.push({ id: `pivot.${s.day}`, target: 'conv_paid', kind: 'mult', value: K.pivotTransitionConv, from: s.day, until: s.day + K.pivotTransitionDays, source: 'pivot' });
  },
};

export const opsActions: PartialDefs = {
  'ops.pivot': pivot,
  'ops.set_alloc': setAlloc,
  'ops.hire_rep': hireRep,
  'ops.fire_rep': fireRep,
  'ops.set_price': setPrice,
  'ops.set_auto_reply': setAutoReply,
  'ops.build_docs': buildDocs,
};
