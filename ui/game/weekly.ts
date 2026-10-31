// Haftalık özet ve (yalnız öğrenme modunda) tur sonu geri bildirimi. Yalnızca oyuncunun görebildiği verilerden üretilir.
import type { GameEvent, GameState } from '@engine/core';
import { selectors } from '@engine/index';
import type { ObsDay } from '../engine/obs';

export interface WeeklySummary {
  weekNo: number;
  fromDay: number;
  toDay: number;
  spend: number;
  revenue: number;
  crmLeads: number;
  crmCustomers: number;
  mrrStart: number;
  mrrEnd: number;
  cashStart: number;
  cashEnd: number;
  hoursUsed: number;
  hoursCapacity: number;
  events: GameEvent[];
  tips: Array<{ key: string; params?: Record<string, number | string> }>;
}

export function learningTips(s: GameState): WeeklySummary['tips'] {
  const tips: WeeklySummary['tips'] = [];
  const om = selectors.observedMetrics(s, 7);
  const f = selectors.funnel(s);
  for (const k of f.hintKeys) tips.push({ key: k });
  if (!s.decisions.some((d) => d.action.type === 'track.fix' && d.status !== 'rejected')) tips.push({ key: 'tip.set_tracking' });
  const limited = [...om.campaigns.filter((c) => c.learning === 'limited'), ...om.adSets.filter((a) => a.learning === 'limited')];
  if (limited.length) tips.push({ key: 'tip.learning_limited', params: { n: limited.length } });
  if (om.adSets.some((a) => (a.frequency ?? 0) > 3)) tips.push({ key: 'tip.frequency' });
  const platform = (om.platform.conv.google ?? 0) + (om.platform.conv.meta ?? 0);
  if (platform > 5 && om.crm.leads > 0 && platform > 1.3 * om.crm.leads) tips.push({ key: 'tip.platform_vs_crm' });
  if (om.campaigns.some((c) => c.isLostBudget !== null && c.isLostBudget > 0.3)) tips.push({ key: 'tip.lost_budget' });
  const last7 = s.history.slice(-7);
  const used = last7.reduce((a, r) => a + r.hoursUsed, 0);
  const cap = last7.reduce((a, r) => a + r.hoursCapacity, 0);
  if (cap > 0 && used / cap < 0.5) tips.push({ key: 'tip.hours_idle' });
  if (cap > 0 && used / cap > 0.95) tips.push({ key: 'tip.burnout_risk' });
  if (om.spend.google === undefined && om.spend.meta === undefined && s.day > 7 && s.mrr === 0) tips.push({ key: 'tip.no_traffic' });
  return tips;
}

export function weeklySummary(s: GameState, obs: ObsDay[], showTips: boolean): WeeklySummary {
  const toDay = s.day;
  const fromDay = Math.max(0, toDay - 7);
  const h = s.history.filter((r) => r.day >= fromDay && r.day < toDay);
  const first = h[0];
  const o = obs.filter((x) => x.day >= fromDay && x.day < toDay);
  return {
    weekNo: Math.ceil(toDay / 7),
    fromDay,
    toDay,
    spend: o.reduce((a, r) => a + r.spend, 0),
    revenue: h.reduce((a, r) => a + r.revenueNet, 0),
    crmLeads: o.reduce((a, r) => a + r.crmLeads, 0),
    crmCustomers: o.reduce((a, r) => a + r.crmCustomers, 0),
    mrrStart: first ? first.mrr : 0,
    mrrEnd: s.mrr,
    cashStart: first ? first.cash - (first.cashIn - first.cashOut) : s.cash,
    cashEnd: s.cash,
    hoursUsed: h.reduce((a, r) => a + r.hoursUsed, 0),
    hoursCapacity: h.reduce((a, r) => a + r.hoursCapacity, 0),
    events: s.events.filter((e) => e.day >= fromDay),
    tips: showTips ? learningTips(s) : [],
  };
}
