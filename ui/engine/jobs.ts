// Motor işleri: hem Web Worker içinde hem (Worker yoksa / testlerde) ana iş parçacığında çalışır. Saf fonksiyonlar.
import { extractLog, initState, runDays, stepInPlace } from '@engine/core';
import type { Action, ActionLog, ActionResult, Difficulty, GameEvent, GameState, Mode } from '@engine/core';
import type { MarketId } from '@engine/data/schema';
import { getBundle } from './bundle';
import { captureObs } from './obs';
import type { ObsDay } from './obs';

export interface GameConfig {
  market: MarketId;
  scenario: string;
  difficulty: Difficulty;
  mode: Mode;
  learningMode: boolean;
  seed: string;
  startDate: string;
}

export const DEFAULT_START_DATE = '2026-11-02'; // Pazartesi: tam kurucu kapasitesi

export function makeInitial(cfg: GameConfig): GameState {
  return initState(getBundle(cfg.market, cfg.scenario), cfg.seed, { difficulty: cfg.difficulty, mode: cfg.mode, learningMode: cfg.learningMode, startDate: cfg.startDate });
}

export interface DayLog {
  day: number;
  events: GameEvent[];
  results: ActionResult[];
}

export interface AdvanceResult {
  state: GameState;
  obs: ObsDay[];
  days: DayLog[];
}

/** Girdi durumunu yerinde değiştirir. Aksiyonlar yalnızca ilk gün gönderilir; sonuç belirlenirse durur. */
export function advanceInPlace(state: GameState, actions: Action[], days: number, prevObs?: ObsDay): AdvanceResult {
  const obs: ObsDay[] = [];
  const log: DayLog[] = [];
  let prev = prevObs;
  for (let i = 0; i < days && !state.outcome; i++) {
    const r = stepInPlace(state, i === 0 ? actions : []);
    const o = captureObs(state, r.report, prev);
    obs.push(o);
    prev = o;
    log.push({ day: r.report.day, events: r.events, results: r.actionResults });
  }
  return { state, obs, days: log };
}

export interface ReplayResult {
  state: GameState;
  obs: ObsDay[];
}

/** Kayıt yükleme: başlangıç + ActionLog'dan günü yeniden oynatır (deterministik). */
export function replay(cfg: GameConfig, log: ActionLog, upToDay: number): ReplayResult {
  const state = makeInitial(cfg);
  const byDay = new Map<number, Action[]>();
  for (const e of log) byDay.set(e.day, [...(byDay.get(e.day) ?? []), ...e.actions]);
  const obs: ObsDay[] = [];
  let prev: ObsDay | undefined;
  while (state.day < upToDay && !state.outcome) {
    const r = stepInPlace(state, byDay.get(state.day) ?? []);
    const o = captureObs(state, r.report, prev);
    obs.push(o);
    prev = o;
  }
  return { state, obs };
}

export { extractLog, runDays };
