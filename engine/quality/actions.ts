// Varlık (teklif / yaratıcı / LP) oluşturma ve A/B testi aksiyonları.
import type { ActionDef, PartialDefs } from '../core/actiondef';
import { K } from '../core/constants';
import { priceCost } from '../core/params';
import { findLp, makeCreative, makeLp, makeOffer } from './assets';

const createOffer: ActionDef<'asset.create_offer'> = {
  minHours: 1,
  hours: () => 1,
  cash: () => 0,
  check: () => null,
  apply: (p, s) => {
    s.assets.offers.push(makeOffer(s, p.kind, p.name ?? p.kind));
  },
};

const createCreative: ActionDef<'asset.create_creative'> = {
  minHours: 2,
  hours: () => 2,
  cash: (_p, s) => priceCost(s, K.creativePriceMult),
  check: () => null,
  apply: (p, s) => {
    s.assets.creatives.push(makeCreative(s, p.channel, p.angle ?? 'default', p.bold ?? false, 1));
  },
};

const createLp: ActionDef<'asset.create_lp'> = {
  minHours: 4,
  hours: () => 4,
  cash: (_p, s) => priceCost(s, K.lpPriceMult),
  check: () => null,
  apply: (p, s) => {
    s.assets.lps.push(makeLp(s, p.style ?? 'default', 2));
  },
};

const startAb: ActionDef<'asset.start_ab_test'> = {
  minHours: 2,
  hours: () => 2,
  cash: () => 0,
  check: (p, s) => {
    const a = findLp(s, p.a);
    const b = findLp(s, p.b);
    if (!a || !b || a.availableDay > s.day || b.availableDay > s.day) return 'err.unknown_asset';
    if (p.a === p.b) return 'err.same_asset';
    if (!(p.days >= 7 && p.days <= 90)) return 'err.bad_duration';
    if (!(p.split > 0 && p.split < 1)) return 'err.bad_share';
    if (s.tests.ab.some((t) => t.status === 'running' && (t.a === p.a || t.b === p.a || t.a === p.b))) return 'err.test_running';
    return null;
  },
  apply: (p, s) => {
    s.tests.ab.push({
      id: `ab${s.tests.ab.length + 1}`,
      kind: 'lp',
      a: p.a,
      b: p.b,
      split: p.split,
      startDay: s.day,
      endDay: s.day + p.days,
      status: 'running',
      statsA: { n: 0, k: 0, kObs: 0 },
      statsB: { n: 0, k: 0, kObs: 0 },
    });
  },
};

const stopAb: ActionDef<'asset.stop_ab_test'> = {
  minHours: 0.25,
  hours: () => 0.25,
  cash: () => 0,
  check: (p, s) => (s.tests.ab.some((t) => t.id === p.testId && t.status === 'running') ? null : 'err.unknown_test'),
  apply: (p, s) => {
    const t = s.tests.ab.find((x) => x.id === p.testId);
    if (t) t.status = 'stopped';
  },
};

export const qualityActions: PartialDefs = {
  'asset.create_offer': createOffer,
  'asset.create_creative': createCreative,
  'asset.create_lp': createLp,
  'asset.start_ab_test': startAb,
  'asset.stop_ab_test': stopAb,
};
