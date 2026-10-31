// TEST FIXTURE — gerçek veri DEĞİLDİR. Motor testleri için minimal, sahte pazar/senaryo parametreleri.
// Sayılar yalnızca makul büyüklük mertebesi içindir; hiçbir kaynağa dayanmaz. Gerçek veri: data/, markets/, scenarios/.
import type { DataBundle, Param, ParamFile, ScenarioFile } from '../data/schema';
import { parseParamFile, parseScenarioFile } from '../data/schema';

const NOTE = 'TEST FIXTURE - gerçek veri değil';

function P(id: string, value: number | string, unit: string, market: Param['market'], range?: [number, number]): Param {
  return {
    id,
    value,
    ...(range ? { range: { min: range[0], max: range[1] } } : {}),
    unit,
    market,
    layer: 'assumption',
    source: null,
    confidence: 'low',
    note: NOTE,
  };
}

function globalParams(): Param[] {
  const g = (id: string, v: number | string, unit: string, r?: [number, number]) => P(id, v, unit, 'global', r);
  return [
    g('gads.smart.min_conversions', 30, 'count', [15, 50]),
    g('gads.smart.window_days', 30, 'days'),
    g('gads.smart.learning_days', 14, 'days'),
    g('gads.smart.learn_reset_frac', 0.5, 'ratio'),
    g('gads.match.broad.leak', 0.4, 'ratio', [0.25, 0.6]),
    g('gads.match.phrase.leak', 0.15, 'ratio'),
    g('gads.match.exact.leak', 0.04, 'ratio'),
    g('gads.rank.alpha', 1, 'multiplier'),
    g('meta.learn.events', 50, 'count'),
    g('meta.learn.window_days', 7, 'days'),
    g('meta.learn.reset_frac', 0.7, 'ratio'),
    g('meta.fatigue.f0', 3, 'count'),
    g('meta.fatigue.lambda', 0.15, 'ratio'),
    g('consent.recovery', 0.6, 'ratio'),
    g('pmax.brand_cannibalization', 0.35, 'ratio'),
    g('funnel.lead_decay_tau_hours', 24, 'hours'),
    g('prior.strength', 10, 'count'),
    g('ci.level', 0.9, 'ratio'),
    g('stats.min_n_clicks', 100, 'count'),
    g('geo.lag_days', 60, 'days'),
    g('founder.hours_per_week', 50, 'hours'),
    g('founder.overtime_efficiency_loss', 0.1, 'ratio'),
  ];
}

interface MarketNums {
  cpc: number; ctr: number; cvr: number; comp: number; cpm: number; mctr: number; mcvr: number;
  consent: number; over: number; att: number; price: number; vat: number; salons: number; churn: number; fx: number;
  coldEmail: 'allowed' | 'restricted' | 'banned';
}

const US: MarketNums = { cpc: 5.5, ctr: 0.066, cvr: 0.08, comp: 0.75, cpm: 30, mctr: 0.015, mcvr: 0.04, consent: 0.88, over: 1.35, att: 0.25, price: 50, vat: 0, salons: 90000, churn: 0.05, fx: 1, coldEmail: 'allowed' };
const TR: MarketNums = { cpc: 15, ctr: 0.06, cvr: 0.07, comp: 0.5, cpm: 70, mctr: 0.016, mcvr: 0.04, consent: 0.85, over: 1.5, att: 0.3, price: 700, vat: 0.2, salons: 90000, churn: 0.06, fx: 0.02, coldEmail: 'restricted' };

function marketFile(id: 'us' | 'tr', n: MarketNums): ParamFile {
  const m = (pid: string, v: number | string, unit: string, r?: [number, number]) => P(pid, v, unit, id, r);
  return parseParamFile({
    schemaVersion: 1,
    market: id,
    params: [
      m('gads.search.cpc', n.cpc, 'currency'),
      m('gads.search.ctr', n.ctr, 'ratio'),
      m('gads.search.cvr_lead', n.cvr, 'ratio'),
      m('gads.search.competition', n.comp, 'ratio'),
      m('meta.cpm', n.cpm, 'currency'),
      m('meta.ctr', n.mctr, 'ratio'),
      m('meta.cvr_lead', n.mcvr, 'ratio'),
      m('measure.consent_rate', n.consent, 'ratio'),
      m('measure.platform_overreport', n.over, 'multiplier'),
      m('measure.ios_att_optin', n.att, 'ratio'),
      m('funnel.lp_to_lead', 0.05, 'ratio'),
      m('funnel.lead_qualified', 0.65, 'ratio'),
      m('funnel.trial_start', 0.75, 'ratio'),
      m('funnel.trial_to_paid', 0.18, 'ratio'),
      m('churn.monthly_base', n.churn, 'ratio'),
      m('price.monthly', n.price, 'currency'),
      m('pay.fee_pct', 0.029, 'ratio'),
      m('pay.fee_fixed', id === 'us' ? 0.3 : 0.25, 'currency'),
      m('tax.vat_rate', n.vat, 'ratio'),
      m('fx.to_usd', n.fx, 'USD'),
      m('legal.cold_email', n.coldEmail, 'enum'),
      m('legal.cold_call', 'restricted', 'enum'),
      m('legal.sms', 'banned', 'enum'),
      m('events.legal_rate_mult', 1, 'multiplier'),
      m('events.macro_rate_mult', 0.8, 'multiplier'),
      m('local.gbp_effect', 0.6, 'ratio'),
      m('local.referral_rate', 0.03, 'ratio'),
      m('local.field_sales_close', 0.08, 'ratio'),
      m('market.salon_count', n.salons, 'count'),
    ],
    meta: { currency: id === 'us' ? 'USD' : 'TRY', locale: id === 'us' ? 'en-US' : 'tr-TR', fxToUSD: n.fx, holidays: [{ date: '2026-12-25', endDate: '2026-12-25', closed: true, effects: { salonDemand: 0.3, saasBuying: 0.5 } }], seasonality: {}, channels: { whatsapp: { access: 'open', relative: id === 'us' ? 0.1 : 1 } } },
  });
}

function scenarioFile(): ScenarioFile {
  const s = (pid: string, v: number, unit: string, market: Param['market']) => P(pid, v, unit, market);
  return parseScenarioFile({
    schemaVersion: 1,
    id: 'fixture-scenario',
    params: [
      s('scn.trial_days', 14, 'days', 'global'),
      s('scn.gross_margin', 0.8, 'ratio', 'global'),
      s('scn.fixed_costs_monthly', 600, 'currency', 'us'),
      s('scn.fixed_costs_monthly', 12000, 'currency', 'tr'),
      s('scn.start_cash.normal', 20000, 'currency', 'us'),
      s('scn.start_cash.normal', 1000000, 'currency', 'tr'),
      s('scn.churn_early_mult', 2, 'multiplier', 'global'),
      s('scn.churn_decay_months', 6, 'count', 'global'),
      s('scn.goal.12m.target_mrr', 7500, 'currency', 'us'),
      s('scn.goal.12m.target_mrr', 105000, 'currency', 'tr'),
      s('scn.goal.12m.ltv_cac_min', 3, 'multiplier', 'global'),
      s('scn.goal.12m.payback_months_max', 12, 'count', 'global'),
      s('scn.goal.90d.target_mrr', 1250, 'currency', 'us'),
      s('scn.goal.90d.target_mrr', 17500, 'currency', 'tr'),
      s('scn.goal.90d.ltv_cac_min', 3, 'multiplier', 'global'),
      s('scn.goal.90d.payback_months_max', 9, 'count', 'global'),
    ],
  });
}

export function fixtureBundle(market: 'us' | 'tr' = 'us'): DataBundle {
  return {
    global: parseParamFile({ schemaVersion: 1, market: 'global', params: globalParams() }),
    market: marketFile(market, market === 'us' ? US : TR),
    scenario: scenarioFile(),
  };
}
