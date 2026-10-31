// Oyuncunun gördüğü günlük gözlem günlüğü (gizli gerçekler yok): platform gösterim/tık/maliyet, analitik, CRM.
import type { DayRecord, GameState } from '@engine/core/types';

export interface ObsDay {
  day: number;
  impressions: number; // platform (günlük)
  clicks: number;
  platformCost: number;
  platformConv: number;
  cumImpressions: number; // birikimli (fark almak için)
  cumClicks: number;
  cumCost: number;
  cumConv: number;
  analyticsConv: number;
  crmLeads: number;
  crmCustomers: number;
  spend: number;
  cash: number;
  mrr: number;
  reputation: number;
  geoScore: number;
}

export function platformTotals(s: GameState): { impressions: number; clicks: number; cost: number; conv: number } {
  const t = { impressions: 0, clicks: 0, cost: 0, conv: 0 };
  for (const c of s.google.campaigns) {
    t.impressions += c.stats.impressions;
    t.clicks += c.stats.clicks;
    t.cost += c.stats.cost;
    t.conv += c.stats.conv;
  }
  for (const a of s.meta.adSets) {
    t.impressions += a.stats.impressions;
    t.clicks += a.stats.clicks;
    t.cost += a.stats.cost;
    t.conv += a.stats.conv;
  }
  return t;
}

export function captureObs(s: GameState, rec: DayRecord, prev: ObsDay | undefined): ObsDay {
  const t = platformTotals(s);
  const p = prev ?? { cumImpressions: 0, cumClicks: 0, cumCost: 0, cumConv: 0 };
  return {
    day: rec.day,
    impressions: Math.max(0, t.impressions - p.cumImpressions),
    clicks: Math.max(0, t.clicks - p.cumClicks),
    platformCost: Math.max(0, t.cost - p.cumCost),
    platformConv: Math.max(0, t.conv - p.cumConv),
    cumImpressions: t.impressions,
    cumClicks: t.clicks,
    cumCost: t.cost,
    cumConv: t.conv,
    analyticsConv: rec.analyticsConv,
    crmLeads: rec.crmLeads,
    crmCustomers: rec.crmCustomers,
    spend: (rec.spend.google ?? 0) + (rec.spend.meta ?? 0),
    cash: s.cash,
    mrr: s.mrr,
    reputation: s.reputation,
    geoScore: s.geo.observedScore,
  };
}
