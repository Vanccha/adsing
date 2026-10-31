// Google Ads aksiyonları (kampanya, reklam grubu, anahtar kelime, bütçe, strateji, negatif, arama terimleri).
import { Rng } from '../rng';
import type { ActionDef, PartialDefs } from '../core/actiondef';
import { posNum } from '../core/actiondef';
import { K } from '../core/constants';
import { pn } from '../core/params';
import type { GCampaign, GameState } from '../core/types';
import { findCreative, findLp, findOffer } from '../quality/assets';
import { accountActive } from './common';
import { resetGoogleLearning } from './google';

const camp = (s: GameState, id: string): GCampaign | undefined => s.google.campaigns.find((c) => c.id === id);
const ready = (day: number, x: { availableDay: number } | undefined): boolean => !!x && x.availableDay <= day;

type StrategyArgs = { strategy: GCampaign['strategy']; manualBid?: number; tcpaTarget?: number; type?: GCampaign['type'] };
function checkStrategy(p: StrategyArgs, type: GCampaign['type']): string | null {
  if (type === 'pmax' && p.strategy !== 'maxConversions' && p.strategy !== 'tcpa') return 'err.pmax_strategy';
  if (p.strategy === 'manual' && p.manualBid !== undefined && !posNum(p.manualBid)) return 'err.bad_bid';
  if (p.strategy === 'tcpa' && !posNum(p.tcpaTarget)) return 'err.need_tcpa_target';
  return null;
}

const createCampaign: ActionDef<'gads.create_campaign'> = {
  minHours: 1.5,
  hours: (p) => (p.type === 'pmax' ? 1.5 : 2),
  cash: () => 0,
  check: (p, s) => {
    if (!accountActive(s, 'google')) return 'err.account_suspended';
    if (!posNum(p.dailyBudget)) return 'err.bad_budget';
    if (!ready(s.day, findLp(s, p.lpId)) || !ready(s.day, findOffer(s, p.offerId))) return 'err.unknown_asset';
    return checkStrategy(p, p.type);
  },
  apply: (p, s) => {
    const id = `gc${s.google.nextId++}`;
    const manual = p.strategy === 'manual';
    s.google.campaigns.push({
      id,
      name: p.name ?? id,
      type: p.type,
      status: 'active',
      dailyBudget: p.dailyBudget,
      strategy: p.strategy,
      manualBid: manual ? (p.manualBid ?? pn(s, 'gads.search.cpc')) : (p.manualBid ?? null),
      tcpaTarget: p.tcpaTarget ?? null,
      lpId: p.lpId,
      offerId: p.offerId,
      adGroups: [],
      negatives: [],
      learning: { state: manual ? 'manual' : 'learning', sinceReset: s.day, resets: 0, convWindow: [] },
      stats: { impressions: 0, clicks: 0, cost: 0, conv: 0 },
      last: null,
      searchTerms: null,
      termAcc: {},
      createdDay: s.day,
    });
  },
};

const addAdgroup: ActionDef<'gads.add_adgroup'> = {
  minHours: 0.5,
  hours: () => 0.5,
  cash: () => 0,
  check: (p, s) => {
    const c = camp(s, p.campaignId);
    if (!c) return 'err.unknown_campaign';
    if (c.type === 'pmax') return 'err.pmax_no_adgroup';
    return ready(s.day, findCreative(s, p.creativeId)) ? null : 'err.unknown_asset';
  },
  apply: (p, s) => {
    const c = camp(s, p.campaignId)!;
    const id = `ag${s.google.nextId++}`;
    c.adGroups.push({ id, name: p.name ?? id, creativeId: p.creativeId, keywords: [] });
  },
};

const addKeywords: ActionDef<'gads.add_keywords'> = {
  minHours: 0.5,
  hours: (p) => Math.max(0.5, 0.25 + 0.05 * p.keywords.length),
  cash: () => 0,
  check: (p, s) => {
    const c = camp(s, p.campaignId);
    if (!c) return 'err.unknown_campaign';
    if (!c.adGroups.some((g) => g.id === p.adGroupId)) return 'err.unknown_adgroup';
    if (p.keywords.length === 0) return 'err.empty';
    for (const k of p.keywords) if (k.bid !== undefined && !posNum(k.bid)) return 'err.bad_bid';
    return null;
  },
  apply: (p, s) => {
    const c = camp(s, p.campaignId)!;
    const g = c.adGroups.find((x) => x.id === p.adGroupId)!;
    for (const k of p.keywords) {
      const id = `kw${s.google.nextId++}`;
      const r = new Rng(`seed:${s.seed}`).fork(`kw.${id}`);
      const relQ = k.theme === 'core' ? r.beta(6, 4) : k.theme === 'brand' ? r.beta(8, 2) : r.beta(4, 6);
      g.keywords.push({
        id,
        text: k.text ?? id,
        theme: k.theme,
        match: k.match,
        bid: k.bid ?? null,
        status: 'active',
        relQ,
        stats: { impressions: 0, clicks: 0, cost: 0, conv: 0 },
      });
    }
  },
};

const setBudget: ActionDef<'gads.set_budget'> = {
  minHours: 0.1,
  hours: () => 0.1,
  cash: () => 0,
  check: (p, s) => (!camp(s, p.campaignId) ? 'err.unknown_campaign' : posNum(p.dailyBudget) ? null : 'err.bad_budget'),
  apply: (p, s) => {
    const c = camp(s, p.campaignId)!;
    const thr = pn(s, 'gads.reset.budget_change', K.googleResetBudgetChange);
    const rel = Math.abs(p.dailyBudget - c.dailyBudget) / Math.max(c.dailyBudget, 1e-9);
    c.dailyBudget = p.dailyBudget;
    if (rel > thr) resetGoogleLearning(s, c);
  },
};

const setStrategy: ActionDef<'gads.set_strategy'> = {
  minHours: 0.25,
  hours: () => 0.25,
  cash: () => 0,
  check: (p, s) => {
    const c = camp(s, p.campaignId);
    return c ? checkStrategy(p, c.type) : 'err.unknown_campaign';
  },
  apply: (p, s) => {
    const c = camp(s, p.campaignId)!;
    const changed = c.strategy !== p.strategy;
    const tgtChange =
      p.tcpaTarget !== undefined && c.tcpaTarget !== null ? Math.abs(p.tcpaTarget - c.tcpaTarget) / Math.max(c.tcpaTarget, 1e-9) > pn(s, 'gads.reset.target_change', K.googleResetTargetChange) : false;
    c.strategy = p.strategy;
    if (p.manualBid !== undefined) c.manualBid = p.manualBid;
    else if (p.strategy === 'manual' && c.manualBid === null) c.manualBid = pn(s, 'gads.search.cpc');
    if (p.tcpaTarget !== undefined) c.tcpaTarget = p.tcpaTarget;
    if (changed || tgtChange) resetGoogleLearning(s, c);
  },
};

const setKeywordBid: ActionDef<'gads.set_keyword_bid'> = {
  minHours: 0.1,
  hours: () => 0.1,
  cash: () => 0,
  check: (p, s) => {
    const c = camp(s, p.campaignId);
    if (!c) return 'err.unknown_campaign';
    if (!c.adGroups.some((g) => g.keywords.some((k) => k.id === p.keywordId))) return 'err.unknown_keyword';
    return p.bid === null || posNum(p.bid) ? null : 'err.bad_bid';
  },
  apply: (p, s) => {
    const kw = camp(s, p.campaignId)!.adGroups.flatMap((g) => g.keywords).find((k) => k.id === p.keywordId)!;
    kw.bid = p.bid;
  },
};

const setLp: ActionDef<'gads.set_lp'> = {
  minHours: 0.25,
  hours: () => 0.25,
  cash: () => 0,
  check: (p, s) => (!camp(s, p.campaignId) ? 'err.unknown_campaign' : ready(s.day, findLp(s, p.lpId)) ? null : 'err.unknown_asset'),
  apply: (p, s) => {
    camp(s, p.campaignId)!.lpId = p.lpId;
  },
};

const setStatus: ActionDef<'gads.set_status'> = {
  minHours: 0.1,
  hours: () => 0.1,
  cash: () => 0,
  check: (p, s) => (camp(s, p.campaignId) ? null : 'err.unknown_campaign'),
  apply: (p, s) => {
    const c = camp(s, p.campaignId)!;
    if (p.status === 'active' && c.status === 'paused' && c.strategy !== 'manual') resetGoogleLearning(s, c);
    c.status = p.status;
  },
};

const addNegatives: ActionDef<'gads.add_negatives'> = {
  minHours: 0.5,
  hours: () => 0.5,
  cash: () => 0,
  check: (p, s) => (!camp(s, p.campaignId) ? 'err.unknown_campaign' : p.classes.length === 0 ? 'err.empty' : null),
  apply: (p, s) => {
    const c = camp(s, p.campaignId)!;
    for (const cls of p.classes) if (!c.negatives.some((n) => n.cls === cls && n.breadth === p.breadth)) c.negatives.push({ cls, breadth: p.breadth });
  },
};

const reviewTerms: ActionDef<'gads.review_search_terms'> = {
  minHours: 1,
  hours: () => 1,
  cash: () => 0,
  check: (p, s) => (camp(s, p.campaignId) ? null : 'err.unknown_campaign'),
  apply: (p, s) => {
    const c = camp(s, p.campaignId)!;
    c.searchTerms = { day: s.day, rows: Object.values(c.termAcc).map((r) => ({ ...r })) };
  },
};

export const googleActions: PartialDefs = {
  'gads.create_campaign': createCampaign,
  'gads.add_adgroup': addAdgroup,
  'gads.add_keywords': addKeywords,
  'gads.set_budget': setBudget,
  'gads.set_strategy': setStrategy,
  'gads.set_keyword_bid': setKeywordBid,
  'gads.set_lp': setLp,
  'gads.set_status': setStatus,
  'gads.add_negatives': addNegatives,
  'gads.review_search_terms': reviewTerms,
};
