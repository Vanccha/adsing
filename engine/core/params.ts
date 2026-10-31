// Parametre erişimi: state.params (çözümlenmiş düz değerler). Eksik kimlik => açık hata veya çağıranın varsayılanı.
import { MissingParamError } from '../data/resolve';
import type { GameState } from './types';

type P = Pick<GameState, 'params'>;

/** Sayı parametresi; fallback verilmezse ve yoksa MissingParamError. */
export function pn(s: P, id: string, fallback?: number): number {
  const v = s.params[id];
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (fallback !== undefined) return fallback;
  throw new MissingParamError([id]);
}

export function ps(s: P, id: string, fallback?: string): string {
  const v = s.params[id];
  if (typeof v === 'string') return v;
  if (fallback !== undefined) return fallback;
  throw new MissingParamError([id]);
}

export function hasParam(s: P, id: string): boolean {
  return id in s.params;
}

/** Pazar/ürün zorunlu kimlikleri (sözleşme). Eksik olan varsa initState hata verir. */
export const REQUIRED_PARAM_IDS: readonly string[] = [
  'gads.search.cpc',
  'gads.search.ctr',
  'gads.search.cvr_lead',
  'gads.search.competition',
  'gads.match.broad.leak',
  'gads.match.phrase.leak',
  'gads.match.exact.leak',
  'gads.smart.min_conversions',
  'gads.smart.window_days',
  'meta.cpm',
  'meta.ctr',
  'meta.cvr_lead',
  'meta.learn.events',
  'meta.learn.window_days',
  'meta.fatigue.f0',
  'meta.fatigue.lambda',
  'measure.consent_rate',
  'measure.platform_overreport',
  'measure.ios_att_optin',
  'funnel.lp_to_lead',
  'funnel.lead_qualified',
  'funnel.trial_start',
  'funnel.trial_to_paid',
  'funnel.lead_decay_tau_hours',
  'churn.monthly_base',
  'price.monthly',
  'pay.fee_pct',
  'pay.fee_fixed',
  'tax.vat_rate',
  'legal.cold_email',
  'legal.cold_call',
  'legal.sms',
  'events.legal_rate_mult',
  'events.macro_rate_mult',
  'local.gbp_effect',
  'local.referral_rate',
  'local.field_sales_close',
  'market.salon_count',
  'founder.hours_per_week',
];
