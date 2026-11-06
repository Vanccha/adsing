// Vaka aksiyon kimlikleri (cases/metrics-and-actions.md) <-> motor aksiyonları.
// caseTags(): bir motor aksiyonunun HANGİ vaka aksiyonlarını karşıladığını (uygulanmadan önceki durumdan) hesaplar;
// etiketler DecisionEntry.tags'e yazılır. Karşılığı olmayan aksiyonlar 'case.respond' ile seçilir.
import type { Action, GameState } from '../core/types';

/** Motorda doğrudan aksiyon karşılığı olmayan, 'case.respond' ile seçilebilen vaka aksiyonları. */
export const RESPOND_ONLY: readonly string[] = [
  'account.createWorkaroundAccount',
  'account.fixAndAppeal',
  'core.overhire',
  'finance.cashForecast',
  'finance.reserveTax',
  'finance.setupDunning',
  'finance.trackMarginalCac',
  'gads.resubmitSameAd',
  'legal.addOptOut',
  'legal.buildPermissionList',
  'legal.buyList',
  'legal.checkMarketRules',
  'measure.removeConsentBanner',
  'measure.separateBrandTraffic',
  'measure.setupAlerts',
  'planning.adjustForSeasonality',
  'product.fixRootCause',
  'reputation.argueInPublic',
  'reputation.fakeReviews',
  'onboarding.defineActivation',
  'onboarding.firstWeekCall',
  'onboarding.shortTraining',
  'meta.mergeAdsets',
  'gads.excludeBrand',
  'account.prepareBackupChannel',
  'funnel.scheduleResponseSlots',
  'funnel.prioritizeLeads',
  'product.retainExistingCustomers',
  'product.differentiatePositioning',
  'retention.focusOnRetentionInLowSeason',
];

/** Hareketsizlik ile seçilmiş sayılan vaka aksiyonları (pencere sonunda hiç tepki yoksa). */
export const ABSTAIN_ACTIONS: readonly string[] = ['core.wait', 'core.ignore', 'core.blameSeason'];

const META_EDIT_TYPES = new Set(['meta.set_audience', 'meta.add_creative', 'meta.remove_creative', 'meta.set_budget', 'meta.set_status']);
const GADS_EDIT_TYPES = new Set(['gads.set_budget', 'gads.set_keyword_bid', 'gads.set_strategy']);

const recentCount = (s: GameState, types: Set<string>, days = 7): number => s.decisions.filter((d) => d.day > s.day - days && d.status !== 'rejected' && types.has(d.action.type)).length;

export function caseTags(s: GameState, a: Action): string[] {
  const t: string[] = [];
  switch (a.type) {
    case 'gads.review_search_terms':
      t.push('gads.reviewSearchTerms');
      break;
    case 'gads.add_negatives':
      t.push('gads.addNegativeKeywords');
      if (a.params.classes.includes('brand')) t.push('gads.excludeBrand');
      break;
    case 'gads.add_keywords':
      if (a.params.keywords.every((k) => k.match !== 'broad')) t.push('gads.shiftToPhraseExact');
      break;
    case 'gads.set_budget': {
      const c = s.google.campaigns.find((x) => x.id === a.params.campaignId);
      if (c) {
        const rel = (a.params.dailyBudget - c.dailyBudget) / Math.max(c.dailyBudget, 1e-9);
        if (rel > 0) t.push('gads.raiseBudget');
        if (rel > 0 && rel <= 0.2) t.push('gads.gradualBudgetIncrease');
      }
      if (recentCount(s, GADS_EDIT_TYPES) >= 2) t.push('gads.editBidsBudgetManually');
      break;
    }
    case 'gads.set_keyword_bid':
    case 'gads.set_strategy':
      if (recentCount(s, GADS_EDIT_TYPES) >= 2) t.push('gads.editBidsBudgetManually');
      break;
    case 'gads.set_status':
      if (a.params.status === 'paused') t.push('gads.pauseCampaign');
      break;
    case 'meta.set_audience':
      t.push(a.params.audience === 'advantage' || a.params.audience === 'broad' ? 'meta.broadenAudience' : 'meta.narrowAudience');
      if (recentCount(s, META_EDIT_TYPES) >= 2) t.push('meta.editFrequently');
      break;
    case 'meta.add_creative':
      t.push('meta.addCreativeVariants');
      if (recentCount(s, META_EDIT_TYPES) >= 2) t.push('meta.editFrequently');
      break;
    case 'asset.create_creative':
      if (a.params.channel === 'meta') t.push('meta.addCreativeVariants');
      break;
    case 'meta.create_adset':
      if (s.meta.adSets.length > 0) t.push('meta.splitAdsets');
      if (a.params.objective === 'leads') t.push('meta.optimizeUpperFunnelEvent');
      t.push('finance.diversifyChannels');
      break;
    case 'meta.set_budget': {
      const ad = s.meta.adSets.find((x) => x.id === a.params.adSetId);
      if (ad && a.params.dailyBudget > ad.dailyBudget) t.push('meta.raiseBudget');
      if (recentCount(s, META_EDIT_TYPES) >= 2) t.push('meta.editFrequently');
      break;
    }
    case 'meta.remove_creative':
      if (recentCount(s, META_EDIT_TYPES) >= 2) t.push('meta.editFrequently');
      break;
    case 'meta.set_status':
      if (a.params.status === 'paused' && s.meta.adSets.filter((x) => x.status === 'active').length > 1) t.push('meta.mergeAdsets');
      if (recentCount(s, META_EDIT_TYPES) >= 2) t.push('meta.editFrequently');
      break;
    case 'track.fix':
      if (a.params.level === 'basic') t.push('measure.fixTag');
      else if (a.params.level === 'server_side') t.push('measure.setupServerSideTracking');
      else if (a.params.level === 'crm_feedback') t.push('measure.useCrmAsReference', 'measure.importOfflineConversions');
      else t.push('measure.setupServerSideTracking');
      break;
    case 'measure.start_holdout':
      t.push('measure.runHoldoutTest');
      break;
    case 'ops.set_auto_reply':
      if (a.params.on) t.push('funnel.setupAutoReply');
      break;
    case 'ops.set_alloc':
      if (a.params.sales > s.founder.reserved.sales) t.push('funnel.scheduleResponseSlots');
      if (a.params.onboarding > s.founder.reserved.onboarding) t.push('onboarding.firstWeekCall', 'product.retainExistingCustomers', 'retention.focusOnRetentionInLowSeason');
      break;
    case 'ops.hire_rep':
      t.push('funnel.scheduleResponseSlots');
      break;
    case 'ops.build_docs':
      t.push('onboarding.shortTraining', 'onboarding.defineActivation', 'retention.focusOnRetentionInLowSeason');
      break;
    case 'ops.set_price':
      t.push(a.params.price < 0.9 * s.product.price ? 'product.matchCompetitorDiscount' : 'product.repackagePricing');
      break;
    case 'ops.pivot':
      t.push('product.differentiatePositioning', 'product.repackagePricing');
      break;
    case 'asset.create_offer':
      t.push('product.differentiatePositioning');
      break;
    case 'local.request_reviews':
      t.push('reputation.requestReviewsOrganic', 'product.retainExistingCustomers');
      break;
    case 'local.optimize_gbp':
      t.push('reputation.respondToReview', 'account.prepareBackupChannel', 'finance.diversifyChannels');
      break;
    case 'local.set_referral':
    case 'local.content':
    case 'local.field_sales':
    case 'geo.invest':
      t.push('account.prepareBackupChannel', 'finance.diversifyChannels');
      break;
    case 'local.cold_outreach':
      t.push('legal.scaleColdOutreach');
      break;
    case 'case.respond':
      t.push(a.params.response);
      break;
    default:
      break;
  }
  return t;
}
