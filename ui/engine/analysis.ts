// Sonuç analizi. engine/analysis (MOTOR-2) hazır olduğunda onu kullanır; yoksa karşı-olgusal koşularla geçici adaptör.
// Adaptör: aynı ActionLog'u (a) tek karar çıkarılarak, (b) farklı tohumlarda, (c) eksik fırsat eklenerek yeniden oynatır.
import { extractLog, runDays } from '@engine/core';
import type { Action, ActionLog, GameState } from '@engine/core';
import { selectors } from '@engine/index';
import { makeInitial } from './jobs';
import type { GameConfig } from './jobs';

export interface DecisionImpact {
  day: number;
  action: Action;
  delta: number; // oyuncunun skoru - kararsız skor (pozitif: karar yardımcı oldu)
}
export interface MissedOpportunity {
  id: string;
  action: Action;
  day: number;
  delta: number; // eklenseydi skor farkı
}
export interface AnalysisView {
  source: 'engine' | 'adapter';
  score: number;
  scoreLabelKey: string;
  topDecisions: DecisionImpact[];
  missed: MissedOpportunity[];
  bottleneck: { stage: string; ratio: number } | null;
  luck: { percentile: number; p10: number; p50: number; p90: number; runs: number } | null;
  truth: {
    byChannel: Array<{ channel: string; platformConv: number | null; trueLeads: number; incrShare: number | null; spend: number }>;
    trackedFraction: Record<string, number>;
    cacTrue: number | null;
    cacCrm: number | null;
  };
}

/** Skor = nakit + 12 × MRR (basit değer vekili). */
const scoreOf = (s: GameState): number => s.cash + 12 * s.mrr;

const without = (log: ActionLog, idx: number): ActionLog => {
  let i = 0;
  return log
    .map((e) => ({ day: e.day, actions: e.actions.filter(() => i++ !== idx) }))
    .filter((e) => e.actions.length > 0);
};

const withExtra = (log: ActionLog, day: number, a: Action): ActionLog => {
  const out = log.map((e) => ({ ...e, actions: [...e.actions] }));
  const e = out.find((x) => x.day === day);
  if (e) e.actions.push(a);
  else out.push({ day, actions: [a] });
  return out.sort((x, y) => x.day - y.day);
};

function candidates(s: GameState): Array<{ id: string; day: number; action: Action }> {
  const sent = (t: Action['type']) => s.decisions.some((d) => d.action.type === t && d.status !== 'rejected');
  const out: Array<{ id: string; day: number; action: Action }> = [];
  if (!sent('track.fix')) out.push({ id: 'tracking', day: 2, action: { type: 'track.fix', params: { level: 'basic' } } });
  if (!s.local.referral.active) out.push({ id: 'referral', day: 5, action: { type: 'local.set_referral', params: { on: true } } });
  if (!s.local.gbp.claimed) out.push({ id: 'gbp', day: 3, action: { type: 'local.optimize_gbp', params: { hours: 3 } } });
  if (!s.autoReply) out.push({ id: 'auto_reply', day: 3, action: { type: 'ops.set_auto_reply', params: { on: true } } });
  const c = s.google.campaigns[0];
  if (c && c.negatives.length === 0) {
    out.push({ id: 'negatives', day: c.createdDay + 16, action: { type: 'gads.add_negatives', params: { campaignId: c.id, classes: ['irrelevant', 'info'], breadth: 'narrow' } } });
  }
  if (!s.tracking.consentMode) out.push({ id: 'consent', day: 6, action: { type: 'track.fix', params: { level: 'consent_mode' } } });
  return out.filter((x) => x.day < s.day);
}

export function analyzeAdapter(cfg: GameConfig, finalState: GameState, opts: { seeds?: number; maxAblations?: number } = {}): AnalysisView {
  const log = extractLog(finalState);
  const total = finalState.day;
  const base = scoreOf(finalState);
  const flat = log.flatMap((e) => e.actions.map((a) => ({ day: e.day, action: a })));
  const maxAb = opts.maxAblations ?? 18;
  const stride = Math.max(1, Math.ceil(flat.length / maxAb));
  const impacts: DecisionImpact[] = [];
  const init = makeInitial(cfg);
  for (let i = 0; i < flat.length; i += stride) {
    const alt = runDays(init, without(log, i), total);
    impacts.push({ day: flat[i]!.day, action: flat[i]!.action, delta: base - scoreOf(alt) });
  }
  impacts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const missed: MissedOpportunity[] = [];
  for (const c of candidates(finalState)) {
    const alt = runDays(init, withExtra(log, c.day, c.action), total);
    missed.push({ id: c.id, action: c.action, day: c.day, delta: scoreOf(alt) - base });
  }
  missed.sort((a, b) => b.delta - a.delta);

  const seeds = opts.seeds ?? 10;
  const scores: number[] = [];
  for (let k = 1; k <= seeds; k++) {
    const s0 = makeInitial({ ...cfg, seed: `${cfg.seed}~${k}` });
    scores.push(scoreOf(runDays(s0, log, total)));
  }
  scores.sort((a, b) => a - b);
  const q = (p: number) => scores[Math.min(scores.length - 1, Math.floor(p * scores.length))] ?? 0;
  const luck = scores.length ? { percentile: scores.filter((x) => x < base).length / scores.length, p10: q(0.1), p50: q(0.5), p90: q(0.9), runs: scores.length } : null;

  const tm = selectors.trueMetrics(finalState);
  const om = selectors.observedMetrics(finalState, 30);
  const f = selectors.funnel(finalState, 60);
  const byChannel = Object.entries(tm.byChannel).map(([channel, b]) => ({ channel, platformConv: channel === 'google' || channel === 'meta' ? (om.platform.conv[channel] ?? null) : null, trueLeads: b.leads, incrShare: b.incrShare, spend: b.spend }));
  return {
    source: 'adapter',
    score: base,
    scoreLabelKey: 'outcome.score_label',
    topDecisions: impacts.slice(0, 3),
    missed: missed.filter((m) => m.delta > 0).slice(0, 3),
    bottleneck: f.bottleneck,
    luck,
    truth: { byChannel, trackedFraction: tm.trackedFraction, cacTrue: tm.unitEconomics.cacFull, cacCrm: om.crm.cac },
  };
}

export function analyze(cfg: GameConfig, finalState: GameState): AnalysisView {
  return analyzeAdapter(cfg, finalState);
}
