// Öğretici: ilk oyunda sırayla yapılacak adımlar. Adımlar oyun durumundan türetilir (saklanan ilerleme yok);
// yalnız "kapat" tercihi yerel depoda tutulur. İpuçları gibi yalnızca öğrenme kipinde görünür.
import type { Action, GameState } from '@engine/core/types';
import type { Route } from '../router';

export interface TutorialStep {
  id: string;
  route: Route;
  done: (s: GameState, queue: readonly Action[]) => boolean;
}

const sentOrQueued = (s: GameState, q: readonly Action[], type: Action['type']): boolean => q.some((a) => a.type === type) || s.decisions.some((d) => d.action.type === type && d.status !== 'rejected');

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'tracking', route: 'crm', done: (s, q) => s.tracking.health >= 0.99 || s.scheduled.length > 0 || sentOrQueued(s, q, 'track.fix') },
  { id: 'hours', route: 'ops', done: (s, q) => sentOrQueued(s, q, 'ops.set_alloc') },
  { id: 'channel', route: 'google', done: (s, q) => sentOrQueued(s, q, 'gads.create_campaign') || sentOrQueued(s, q, 'meta.create_adset') || sentOrQueued(s, q, 'local.optimize_gbp') },
  { id: 'advance', route: 'dashboard', done: (s) => s.day >= 1 },
  { id: 'week', route: 'dashboard', done: (s) => s.day >= 7 },
  { id: 'search_terms', route: 'google', done: (s, q) => sentOrQueued(s, q, 'gads.review_search_terms') || (s.day >= 14 && s.google.campaigns.length === 0) } /* Google'sız oyuncu takılmasın */,
  { id: 'crm', route: 'crm', done: (s) => s.day >= 21 },
  { id: 'test', route: 'studio', done: (s, q) => sentOrQueued(s, q, 'asset.start_ab_test') },
];

export interface TutorialView {
  doneCount: number;
  total: number;
  /** Sıradaki yapılmamış adım; hepsi bittiyse null. */
  next: TutorialStep | null;
  steps: Array<{ step: TutorialStep; done: boolean }>;
}

export function tutorialView(s: GameState, queue: readonly Action[]): TutorialView {
  const steps = TUTORIAL_STEPS.map((step) => ({ step, done: step.done(s, queue) }));
  return { doneCount: steps.filter((x) => x.done).length, total: steps.length, next: steps.find((x) => !x.done)?.step ?? null, steps };
}

const KEY = 'adsing.tutorial.off';

export function tutorialDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setTutorialDismissed(off: boolean): void {
  try {
    if (off) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* depolama yok: oturumluk kalır */
  }
}
