// Başlangıç durumu: veri paketi (global + pazar + senaryo) -> çözümlenmiş parametreler + başlangıç varlıkları.
// Aynı (veri, tohum, seçenekler) her zaman aynı durumu üretir.
import { DEFAULT_REF_DATE } from '../data/freshness';
import { MissingParamError, missingIds, resolveParams } from '../data/resolve';
import type { DataBundle, MarketMeta } from '../data/schema';
import { Rng } from '../rng';
import { makeCreative, makeLp, makeOffer } from '../quality/assets';
import { geoLen } from '../channels/geo';
import { K, ENGINE_VERSION } from './constants';
import { pn, priceCost, REQUIRED_PARAM_IDS } from './params';
import type { Difficulty, GameState, HolidayFx, Mode, Seasonality } from './types';

export interface InitOpts {
  difficulty?: Difficulty;
  mode?: Mode;
  learningMode?: boolean;
  startingCash?: number;
  refDate?: string; // "bugün" (tazelik için); varsayılan brief tarihi
  startDate?: string; // oyun takvimi başlangıcı; varsayılan refDate
  drawRanges?: boolean; // range -> tohumdan çekim (varsayılan true)
  extraRequired?: readonly string[];
}

function parseHolidays(meta: MarketMeta): HolidayFx[] {
  const out: HolidayFx[] = [];
  for (const h of meta.holidays ?? []) {
    if (typeof h === 'string') {
      out.push({ date: h, endDate: h, salonDemand: 1, saasBuying: 1, closed: false });
      continue;
    }
    const o = h as Record<string, unknown>;
    if (typeof o.date !== 'string') continue;
    const fx = (o.effects ?? {}) as Record<string, unknown>;
    out.push({
      date: o.date,
      endDate: typeof o.endDate === 'string' ? o.endDate : o.date,
      salonDemand: typeof fx.salonDemand === 'number' ? fx.salonDemand : 1,
      saasBuying: typeof fx.saasBuying === 'number' ? fx.saasBuying : 1,
      closed: o.closed === true,
    });
  }
  return out;
}

function parseSeasonality(meta: MarketMeta): Seasonality {
  const m = (meta.seasonality ?? {}) as Record<string, unknown>;
  const rec = (k: string): Record<string, number> => {
    const v = m[k];
    const out: Record<string, number> = {};
    if (v && typeof v === 'object') for (const [a, b] of Object.entries(v)) if (typeof b === 'number') out[a] = b;
    return out;
  };
  return { adCost: rec('adCost'), salonDemand: rec('salonDemand'), saasBuying: rec('saasBuying') };
}

export function initState(bundle: DataBundle, seed: string, opts: InitOpts = {}): GameState {
  const marketId = bundle.market.market;
  if (marketId === 'global') throw new Error('Pazar dosyası market="global" olamaz');
  const resolved = resolveParams(bundle, marketId, seed, { drawRanges: opts.drawRanges });
  const miss = missingIds(resolved, [...REQUIRED_PARAM_IDS, ...(opts.extraRequired ?? [])]);
  if (miss.length) throw new MissingParamError(miss);

  const meta = (bundle.market.meta ?? {}) as MarketMeta;
  const mode: Mode = opts.mode ?? 'full';
  const difficulty: Difficulty = opts.difficulty ?? 'normal';
  const refDate = opts.refDate ?? DEFAULT_REF_DATE;
  const startDate = opts.startDate ?? refDate;
  const horizon = mode === 'quick' ? 90 : 365;

  const base: GameState = {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    seed,
    scenarioId: bundle.scenario.id,
    marketId,
    mode,
    difficulty,
    learningMode: opts.learningMode ?? false,
    startDate,
    refDate,
    day: 0,
    horizon,
    currency: typeof meta.currency === 'string' ? meta.currency : 'USD',
    fxToUSD: typeof resolved.values['fx.to_usd'] === 'number' ? (resolved.values['fx.to_usd'] as number) : typeof meta.fxToUSD === 'number' ? meta.fxToUSD : 1,
    holidays: parseHolidays(meta),
    seasonality: parseSeasonality(meta),
    channelRel: {},
    params: resolved.values,
    paramInfo: resolved.info,
    goals: { mrr: 0, ltvCac: 3, paybackMonths: 12, reputationFloor: 0.1 },
    cash: 0,
    startCash: 0,
    ledger: { revenue: 0, vatCollected: 0, vatRemitted: 0, cogs: 0, payFees: 0, adSpend: 0, adTax: 0, fixed: 0, reps: 0, tools: 0, actionCosts: 0, referralRewards: 0, incomeTax: 0, fines: 0 },
    founder: { burnout: 0, queue: [], capacityToday: 0, usedToday: 0, overtimeToday: 0, overtimeYesterday: 0, reserved: { sales: 2, onboarding: 1 }, docsStock: 0 },
    reps: 0,
    autoReply: false,
    product: { price: 0, onboarding: K.onbStart },
    reputation: 0.6,
    accounts: { google: { health: 1, suspendedUntil: null, permanent: false, strikes: 0 }, meta: { health: 1, suspendedUntil: null, permanent: false, strikes: 0 } },
    tracking: { health: 0.7, consentMode: false, serverSide: false, crmFeedback: false },
    competitorIndex: 1,
    assets: { offers: [], creatives: [], lps: [], nextId: 1 },
    google: { campaigns: [], nextId: 1 },
    meta: { adSets: [], nextId: 1 },
    local: {
      gbp: { claimed: false, score: 0.1, reviews: 0, rating: 0, pending: [] },
      referral: { active: false, reward: 0 },
      content: { social: 0, seo: 0, seoEff: 0 },
      outreach: { domainHealth: 1, sent30: 0 },
    },
    geo: { visibility: 0.02, pipeline: [], observedScore: 0 },
    funnel: { queue: [], trials: [], cum: { impressions: 0, clicks: 0, visits: 0, leads: 0, qualified: 0, trials: 0, activated: 0, paid: 0 }, byChannel: {} },
    cohorts: [],
    nextCohortId: 1,
    mrr: 0,
    modifiers: [],
    tests: { ab: [], holdouts: [] },
    scheduled: [],
    history: [],
    decisions: [],
    events: [],
    outcome: null,
  };
  // Pazar kanal göreli etkinliği (meta.channels)
  for (const [k, v] of Object.entries(meta.channels ?? {})) {
    const o = v as Record<string, unknown>;
    if (o && typeof o.relative === 'number') base.channelRel[k] = { access: typeof o.access === 'string' ? o.access : 'open', relative: o.relative };
  }
  base.product.price = pn(base, 'price.monthly');
  base.startCash = opts.startingCash ?? pn(base, `scn.start_cash.${difficulty}`, priceCost(base, K.startCashPriceMult));
  base.cash = base.startCash;
  // Hedefler (senaryo): 12 ay veya 90 gün
  const g = mode === 'quick' ? 'scn.goal.90d' : 'scn.goal.12m';
  base.goals = {
    mrr: pn(base, `${g}.target_mrr`, priceCost(base, mode === 'quick' ? 25 : 150)),
    ltvCac: pn(base, `${g}.ltv_cac_min`, 3),
    paybackMonths: pn(base, `${g}.payback_months_max`, mode === 'quick' ? 9 : 12),
    reputationFloor: pn(base, 'scn.lose.reputation', 0.1),
  };
  // Başlangıç varlıkları (gizli kalite tohumdan)
  base.assets.offers.push(makeOffer(base, 'trial', 'Varsayılan deneme'));
  base.assets.lps.push(makeLp(base, 'default'));
  base.assets.creatives.push(makeCreative(base, 'google', 'default', false));
  base.assets.creatives.push(makeCreative(base, 'meta', 'default', false));
  base.geo.pipeline = new Array<number>(geoLen(base)).fill(0);
  void Rng;
  return base;
}
