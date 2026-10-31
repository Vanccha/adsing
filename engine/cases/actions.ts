// 'case.respond': motorda doğrudan karşılığı olmayan vaka tepkileri (cases/metrics-and-actions.md) için tek aksiyon.
// Her tepkinin küçük, belgelenmiş bir etkisi vardır; çoğu yalnızca doğru/yanlış tepki kaydına yarar.
import type { ActionDef, PartialDefs } from '../core/actiondef';
import { K } from '../core/constants';
import { priceCost } from '../core/params';
import type { GameState } from '../core/types';
import { clamp01 } from '../core/util';
import { RESPOND_ONLY } from './actionmap';
import { taxDueEstimate } from './metrics';

type Ctx = Parameters<ActionDef<'case.respond'>['apply']>[2];
interface Resp {
  hours: number;
  cash?: (s: GameState) => number;
  apply?: (s: GameState, ctx: Ctx) => void;
}

const flag = (s: GameState, id: string, days: number, value = 1): void => {
  s.cases.flags[id] = { value, until: s.day + days };
};
const mod = (s: GameState, id: string, target: string, kind: 'mult' | 'add', value: number, days: number): void => {
  s.modifiers.push({ id: `resp.${id}.${s.day}`, target, kind, value, from: s.day, until: s.day + days, source: `resp.${id}` });
};

export const RESPONSES: Record<string, Resp> = {
  'account.createWorkaroundAccount': {
    hours: 2,
    apply: (s) => {
      const a = s.accounts.google;
      a.strikes += 1;
      a.health = clamp01(a.health - 0.25);
      if (a.strikes >= 3) a.permanent = true;
    },
  },
  'account.fixAndAppeal': {
    hours: 2,
    apply: (s) => {
      const a = s.accounts.google;
      a.health = clamp01(a.health + 0.15);
      if (a.suspendedUntil !== null && a.suspendedUntil > s.day + 1) a.suspendedUntil = s.day + 1;
    },
  },
  'core.overhire': { hours: 4, cash: (s) => priceCost(s, 5), apply: (s) => { if (s.reps < 5) s.reps += 1; } },
  'finance.cashForecast': { hours: 1.5, apply: (s) => flag(s, 'cash_forecast', 60) },
  'finance.reserveTax': { hours: 1, apply: (s) => flag(s, 'tax_reserve', 35, Math.max(1, (s.ledger.vatCollected - s.ledger.vatRemitted) * 1.2 + taxDueEstimate(s))) },
  'finance.setupDunning': { hours: 2, apply: (s) => { s.params['pay.dunning_recover'] = 0.85; } },
  'finance.trackMarginalCac': { hours: 1, apply: (s) => flag(s, 'marginal_cac_tracking', 90) },
  'gads.resubmitSameAd': { hours: 0.5, apply: (s) => { s.accounts.google.health = clamp01(s.accounts.google.health - 0.1); } },
  'legal.addOptOut': { hours: 1.5, apply: (s) => flag(s, 'opt_out', 400) },
  'legal.buildPermissionList': { hours: 4, apply: (s) => flag(s, 'compliant_list', 400) },
  'legal.buyList': {
    hours: 1,
    apply: (s, ctx) => {
      ctx.direct.push({ channel: 'outreach', n: 12, qual: 0.4, assisted: false, preQualified: false, trialP: null, offerId: s.assets.offers[0]!.id, tauMult: 1 });
      s.local.outreach.domainHealth = clamp01(s.local.outreach.domainHealth - 0.3);
      s.reputation = clamp01(s.reputation - 0.03);
      s.local.outreach.sent30 += 300;
    },
  },
  'legal.checkMarketRules': { hours: 0.5, apply: (s) => flag(s, 'rules_checked', 120) },
  'measure.removeConsentBanner': {
    hours: 1,
    apply: (s, ctx) => {
      mod(s, 'banner', 'consent_loss', 'add', -0.1, 60); // kayıp geçici azalır ama yasal risk
      s.reputation = clamp01(s.reputation - 0.02);
      if (ctx.root.fork(`resp.banner.${s.day}`).bernoulli(0.12)) {
        const fine = priceCost(s, 60);
        s.cash -= fine;
        s.ledger.fines += fine;
        ctx.acc.cashOut += fine;
      }
    },
  },
  'measure.separateBrandTraffic': { hours: 1.5, apply: (s) => flag(s, 'brand_separated', 120) },
  'measure.setupAlerts': { hours: 1, apply: (s) => flag(s, 'alerts', 400) },
  'planning.adjustForSeasonality': { hours: 1.5, apply: (s) => flag(s, 'season_plan', 90) },
  'product.fixRootCause': { hours: 6, apply: (s) => { s.product.onboarding = clamp01(s.product.onboarding + 0.05); mod(s, 'rootcause', 'churn', 'mult', 0.9, 30); } },
  'reputation.argueInPublic': { hours: 1, apply: (s) => { s.reputation = clamp01(s.reputation - 0.05); } },
  'reputation.fakeReviews': {
    hours: 1,
    apply: (s) => {
      s.local.gbp.reviews += 8;
      s.reputation = clamp01(s.reputation - 0.06);
      s.accounts.google.health = clamp01(s.accounts.google.health - 0.05);
    },
  },
  'onboarding.defineActivation': { hours: 2, apply: (s) => { s.founder.docsStock = Math.min(K.docsMax, s.founder.docsStock + 0.03); } },
  'onboarding.firstWeekCall': { hours: 3, apply: (s) => { s.founder.docsStock = Math.min(K.docsMax, s.founder.docsStock + 0.04); } },
  'onboarding.shortTraining': { hours: 3, apply: (s) => { s.founder.docsStock = Math.min(K.docsMax, s.founder.docsStock + 0.04); } },
  'meta.mergeAdsets': {
    hours: 1.5,
    apply: (s) => {
      const act = s.meta.adSets.filter((a) => a.status === 'active');
      const first = act[0];
      if (!first || act.length < 2) return;
      for (const a of act.slice(1)) {
        first.dailyBudget += a.dailyBudget;
        a.status = 'paused';
      }
      first.learning.state = 'learning';
      first.learning.sinceReset = s.day;
    },
  },
  'gads.excludeBrand': {
    hours: 1,
    apply: (s) => {
      for (const c of s.google.campaigns) if (c.type === 'pmax' && !c.negatives.some((n) => n.cls === 'brand')) c.negatives.push({ cls: 'brand', breadth: 'narrow' });
    },
  },
  'account.prepareBackupChannel': { hours: 1.5, apply: (s) => flag(s, 'backup_channel', 120) },
  'funnel.scheduleResponseSlots': { hours: 1, apply: (s) => { s.autoReply = true; } },
  'funnel.prioritizeLeads': { hours: 1, apply: (s) => flag(s, 'lead_priority', 60) },
  'product.retainExistingCustomers': { hours: 2, apply: (s) => mod(s, 'retain', 'churn', 'mult', 0.9, 30) },
  'product.differentiatePositioning': { hours: 3, apply: (s) => mod(s, 'position', 'conv_paid', 'mult', 1.05, 45) },
  'retention.focusOnRetentionInLowSeason': { hours: 2, apply: (s) => mod(s, 'lowseason', 'churn', 'mult', 0.92, 30) },
};

const respond: ActionDef<'case.respond'> = {
  minHours: 0.5,
  hours: (p) => RESPONSES[p.response]?.hours ?? 1,
  cash: (p, s) => RESPONSES[p.response]?.cash?.(s) ?? 0,
  check: (p) => (RESPONSES[p.response] ? null : 'err.unknown_response'),
  apply: (p, s, ctx) => RESPONSES[p.response]?.apply?.(s, ctx),
};

export const caseActions: PartialDefs = { 'case.respond': respond };

/** case.respond ile seçilebilen tepkiler (RESPOND_ONLY ile tutarlı olmalı; test edilir). */
export const RESPOND_IDS: readonly string[] = Object.keys(RESPONSES);
export { RESPOND_ONLY };
