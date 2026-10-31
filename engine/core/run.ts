// Çoklu gün koşusu: politika (durumdan aksiyon üreten fonksiyon) veya ActionLog ile yeniden oynatma.
import { stepInPlace } from './step';
import type { Action, ActionLog, GameState } from './types';

export type Policy = (state: GameState) => Action[];

/** Girdi durumu değişmez (bir kez klonlanır). Sonuç belirlendiyse (outcome) erken durur. */
export function runDays(state: GameState, policyOrLog: Policy | ActionLog, days: number): GameState {
  const s = structuredClone(state);
  const byDay = new Map<number, Action[]>();
  if (Array.isArray(policyOrLog)) for (const e of policyOrLog) byDay.set(e.day, [...(byDay.get(e.day) ?? []), ...e.actions]);
  for (let i = 0; i < days && !s.outcome; i++) {
    const actions = typeof policyOrLog === 'function' ? policyOrLog(s) : (byDay.get(s.day) ?? []);
    stepInPlace(s, actions);
  }
  return s;
}

/** Oyuncunun GÖNDERDİĞİ aksiyonlardan (uygulanan, kuyruğa alınan, reddedilen) ActionLog çıkarır (yeniden oynatma / karşı-olgusal koşu için). */
export function extractLog(state: GameState): ActionLog {
  const byDay = new Map<number, Action[]>();
  for (const d of state.decisions) {
    if (d.fromQueue || d.status === 'executed_from_queue') continue; // kuyruktan gelenler zaten gönderilmişti
    byDay.set(d.day, [...(byDay.get(d.day) ?? []), d.action]);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, actions]) => ({ day, actions }));
}
