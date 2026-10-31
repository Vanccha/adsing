// Gözlenen (oyuncunun görebildiği) huni: platform + analitik + CRM. Aşama dönüşümleri için Wilson güven aralığı.
import { K } from '@engine/core';
import type { GameState } from '@engine/core';
import type { ObsDay } from '../engine/obs';

export interface StageRate {
  key: string;
  from: string;
  to: string;
  num: number;
  den: number;
  rate: number | null;
  lo: number | null;
  hi: number | null;
  insufficient: boolean;
  benchId: string | null;
  bench: number | null;
}

export function wilson(k: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (n <= 0) return { lo: 0, hi: 1 };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (c - r) / d), hi: Math.min(1, (c + r) / d) };
}

export interface ObservedFunnel {
  window: number;
  counts: { impressions: number; clicks: number; analytics: number; crmLeads: number; crmCustomers: number };
  rates: StageRate[];
}

export function observedFunnel(s: GameState, obs: ObsDay[], window = 30): ObservedFunnel {
  const w = obs.slice(-window);
  // CRM gecikmeli görünür: son crmDelayDays gün hariç.
  const wc = obs.slice(Math.max(0, obs.length - window - K.crmDelayDays), Math.max(0, obs.length - K.crmDelayDays));
  const sum = (a: ObsDay[], f: (o: ObsDay) => number) => a.reduce((x, o) => x + f(o), 0);
  const counts = {
    impressions: sum(w, (o) => o.impressions),
    clicks: sum(w, (o) => o.clicks),
    analytics: sum(w, (o) => o.analyticsConv),
    crmLeads: sum(wc, (o) => o.crmLeads),
    crmCustomers: sum(wc, (o) => o.crmCustomers),
  };
  const minN = typeof s.params['stats.min_n_clicks'] === 'number' ? (s.params['stats.min_n_clicks'] as number) : K.minN;
  const mk = (key: string, from: string, to: string, num: number, den: number, benchId: string | null): StageRate => {
    const rate = den > 0 ? num / den : null;
    const ci = den > 0 ? wilson(num, den) : null;
    const rel = ci && rate ? (ci.hi - ci.lo) / Math.max(rate, 1e-9) : Infinity;
    const b = benchId ? s.params[benchId] : undefined;
    return { key, from, to, num, den, rate, lo: ci?.lo ?? null, hi: ci?.hi ?? null, insufficient: den < minN || rel > K.minCiRelWidth, benchId, bench: typeof b === 'number' ? b : null };
  };
  const ctrBench = (s.google.campaigns.length ? 'gads.search.ctr' : 'meta.ctr') as string;
  return {
    window: w.length,
    counts,
    rates: [
      mk('ctr', 'impressions', 'clicks', counts.clicks, counts.impressions, ctrBench),
      mk('cvr', 'clicks', 'analytics', counts.analytics, counts.clicks, 'funnel.lp_to_lead'),
      mk('crm', 'analytics', 'crmLeads', counts.crmLeads, Math.max(counts.analytics, counts.crmLeads), null),
      mk('close', 'crmLeads', 'crmCustomers', counts.crmCustomers, counts.crmLeads, null),
    ],
  };
}

/** Son N günlük gözlenen CAC (CRM müşterisi başına reklam harcaması) serisi; veri yoksa null. */
export function cacSeries(obs: ObsDay[], window = 30): Array<{ x: number; y: number | null }> {
  const out: Array<{ x: number; y: number | null }> = [];
  for (let i = 0; i < obs.length; i++) {
    const a = obs.slice(Math.max(0, i - window - K.crmDelayDays + 1), Math.max(0, i - K.crmDelayDays + 1));
    const spend = a.reduce((x, o) => x + o.spend, 0);
    const c = a.reduce((x, o) => x + o.crmCustomers, 0);
    out.push({ x: obs[i]!.day, y: c >= 1 ? spend / c : null });
  }
  return out;
}
