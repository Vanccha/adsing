// Meta Ads aksiyonları.
import type { ActionDef, PartialDefs } from '../core/actiondef';
import { posNum } from '../core/actiondef';
import { K } from '../core/constants';
import { pn } from '../core/params';
import type { GameState, MAdSet } from '../core/types';
import { findCreative, findLp, findOffer } from '../quality/assets';
import { accountActive } from './common';
import { resetMetaLearning } from './meta';

const adset = (s: GameState, id: string): MAdSet | undefined => s.meta.adSets.find((a) => a.id === id);
const okCreative = (s: GameState, id: string): boolean => {
  const c = findCreative(s, id);
  return !!c && c.channel === 'meta' && c.availableDay <= s.day;
};

const create: ActionDef<'meta.create_adset'> = {
  minHours: 2,
  hours: (p) => 1.5 + 0.25 * p.creativeIds.length,
  cash: () => 0,
  check: (p, s) => {
    if (!accountActive(s, 'meta')) return 'err.account_suspended';
    if (!posNum(p.dailyBudget)) return 'err.bad_budget';
    if (p.creativeIds.length === 0) return 'err.need_creative';
    if (!p.creativeIds.every((c) => okCreative(s, c))) return 'err.unknown_asset';
    const lp = findLp(s, p.lpId);
    if (!lp || lp.availableDay > s.day || !findOffer(s, p.offerId)) return 'err.unknown_asset';
    return null;
  },
  apply: (p, s) => {
    const id = `ma${s.meta.nextId++}`;
    s.meta.adSets.push({
      id,
      name: p.name ?? id,
      objective: p.objective,
      audience: p.audience,
      dailyBudget: p.dailyBudget,
      ads: p.creativeIds.map((creativeId) => ({ creativeId, impr7: 0 })),
      lpId: p.lpId,
      offerId: p.offerId,
      status: 'active',
      learning: { state: 'learning', sinceReset: s.day, resets: 0, events: [] },
      stats: { impressions: 0, clicks: 0, cost: 0, conv: 0 },
      last: null,
      createdDay: s.day,
    });
  },
};

const setBudget: ActionDef<'meta.set_budget'> = {
  minHours: 0.1,
  hours: () => 0.1,
  cash: () => 0,
  check: (p, s) => (!adset(s, p.adSetId) ? 'err.unknown_adset' : posNum(p.dailyBudget) ? null : 'err.bad_budget'),
  apply: (p, s) => {
    const a = adset(s, p.adSetId)!;
    const rel = Math.abs(p.dailyBudget - a.dailyBudget) / Math.max(a.dailyBudget, 1e-9);
    a.dailyBudget = p.dailyBudget;
    if (rel > pn(s, 'meta.reset.budget_change', K.metaResetBudgetChange)) resetMetaLearning(s, a);
  },
};

const setAudience: ActionDef<'meta.set_audience'> = {
  minHours: 0.5,
  hours: () => 0.5,
  cash: () => 0,
  check: (p, s) => (adset(s, p.adSetId) ? null : 'err.unknown_adset'),
  apply: (p, s) => {
    const a = adset(s, p.adSetId)!;
    if (a.audience !== p.audience) {
      a.audience = p.audience;
      for (const ad of a.ads) ad.impr7 = 0;
      resetMetaLearning(s, a);
    }
  },
};

const addCreative: ActionDef<'meta.add_creative'> = {
  minHours: 0.25,
  hours: () => 0.25,
  cash: () => 0,
  check: (p, s) => (!adset(s, p.adSetId) ? 'err.unknown_adset' : !okCreative(s, p.creativeId) ? 'err.unknown_asset' : adset(s, p.adSetId)!.ads.some((x) => x.creativeId === p.creativeId) ? 'err.duplicate' : null),
  apply: (p, s) => {
    const a = adset(s, p.adSetId)!;
    a.ads.push({ creativeId: p.creativeId, impr7: 0 });
    resetMetaLearning(s, a);
  },
};

const removeCreative: ActionDef<'meta.remove_creative'> = {
  minHours: 0.1,
  hours: () => 0.1,
  cash: () => 0,
  check: (p, s) => {
    const a = adset(s, p.adSetId);
    if (!a) return 'err.unknown_adset';
    if (!a.ads.some((x) => x.creativeId === p.creativeId)) return 'err.unknown_asset';
    return a.ads.length > 1 ? null : 'err.last_creative';
  },
  apply: (p, s) => {
    const a = adset(s, p.adSetId)!;
    a.ads = a.ads.filter((x) => x.creativeId !== p.creativeId);
    resetMetaLearning(s, a);
  },
};

const setStatus: ActionDef<'meta.set_status'> = {
  minHours: 0.1,
  hours: () => 0.1,
  cash: () => 0,
  check: (p, s) => (adset(s, p.adSetId) ? null : 'err.unknown_adset'),
  apply: (p, s) => {
    const a = adset(s, p.adSetId)!;
    if (p.status === 'active' && a.status === 'paused') resetMetaLearning(s, a);
    a.status = p.status;
  },
};

export const metaActions: PartialDefs = {
  'meta.create_adset': create,
  'meta.set_budget': setBudget,
  'meta.set_audience': setAudience,
  'meta.add_creative': addCreative,
  'meta.remove_creative': removeCreative,
  'meta.set_status': setStatus,
};
