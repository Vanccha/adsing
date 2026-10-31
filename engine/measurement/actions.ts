// Ölçüm aksiyonları: takip düzeltme (gecikmeli uygulanır), holdout/geo testi.
import type { PartialDefs } from '../core/actiondef';
import { priceCost } from '../core/params';
import { K } from '../core/constants';
import { startHoldout, finalizeHoldout } from './holdout';
import type { GameState, Scheduled } from '../core/types';

const FIX: Record<Scheduled['level'], { hours: number; delay: number }> = {
  basic: { hours: 3, delay: 1 },
  consent_mode: { hours: 4, delay: 2 },
  server_side: { hours: 6, delay: 5 },
  crm_feedback: { hours: 5, delay: 4 },
};

const alreadyDone = (s: GameState, level: Scheduled['level']): boolean => {
  if (s.scheduled.some((x) => x.kind === 'tracking' && x.level === level)) return true;
  if (level === 'basic') return s.tracking.health >= 0.999;
  if (level === 'consent_mode') return s.tracking.consentMode;
  if (level === 'server_side') return s.tracking.serverSide;
  return s.tracking.crmFeedback;
};

export const measurementActions: PartialDefs = {
  'track.fix': {
    minHours: 3,
    hours: (p) => FIX[p.level].hours,
    cash: (p, s) => (p.level === 'server_side' ? priceCost(s, K.serverSidePriceMult) : p.level === 'crm_feedback' ? priceCost(s, K.crmFeedbackPriceMult) : 0),
    check: (p, s) => (alreadyDone(s, p.level) ? 'err.nothing_to_fix' : null),
    apply: (p, s) => {
      s.scheduled.push({ day: s.day + FIX[p.level].delay, kind: 'tracking', level: p.level });
    },
  },
  'measure.start_holdout': {
    minHours: 3,
    hours: () => 3,
    cash: () => 0,
    check: (p, s) => {
      if (!(p.share >= 0.05 && p.share <= 0.5)) return 'err.bad_share';
      if (!(p.days >= 7 && p.days <= 60)) return 'err.bad_duration';
      if (s.tests.holdouts.some((h) => h.status === 'running' && h.channel === p.channel)) return 'err.test_running';
      return null;
    },
    apply: (p, s, ctx) => {
      startHoldout(s, p.channel, p.share, p.days, ctx.root.fork(`holdout.new.${s.tests.holdouts.length}`));
    },
  },
  'measure.stop_holdout': {
    minHours: 0.5,
    hours: () => 0.5,
    cash: () => 0,
    check: (p, s) => (s.tests.holdouts.some((h) => h.id === p.holdoutId && h.status === 'running') ? null : 'err.unknown_test'),
    apply: (p, s) => {
      const h = s.tests.holdouts.find((x) => x.id === p.holdoutId);
      if (h) {
        h.status = 'stopped';
        finalizeHoldout(h);
      }
    },
  },
};

/** Zamanlanmış takip düzeltmelerini uygular (aşama 2 başında). */
export function applyScheduled(s: GameState): void {
  const rest: Scheduled[] = [];
  for (const x of s.scheduled) {
    if (x.day > s.day) {
      rest.push(x);
      continue;
    }
    if (x.level === 'basic') s.tracking.health = 1;
    else if (x.level === 'consent_mode') s.tracking.consentMode = true;
    else if (x.level === 'server_side') s.tracking.serverSide = true;
    else s.tracking.crmFeedback = true;
  }
  s.scheduled = rest;
}
