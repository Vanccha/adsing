// Motor istemcisi: Worker varsa orada, yoksa (jsdom/testler) aynı işleri ana iş parçacığında çalıştırır.
import type { Action, ActionLog, GameState } from '@engine/core';
import { analyze } from './analysis';
import type { AnalysisView } from './analysis';
import { advanceInPlace, replay } from './jobs';
import type { AdvanceResult, GameConfig, ReplayResult } from './jobs';
import type { ObsDay } from './obs';

export type JobRequest =
  | { job: 'advance'; state: GameState; actions: Action[]; days: number; prevObs?: ObsDay }
  | { job: 'replay'; cfg: GameConfig; log: ActionLog; upToDay: number }
  | { job: 'analyze'; cfg: GameConfig; state: GameState };
export type JobResponse = { job: 'advance'; result: AdvanceResult } | { job: 'replay'; result: ReplayResult } | { job: 'analyze'; result: AnalysisView };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { ok: (r: JobResponse) => void; err: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<{ id: number; res?: JobResponse; error?: string }>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      if (ev.data.error !== undefined) p.err(new Error(ev.data.error));
      else p.ok(ev.data.res as JobResponse);
    };
    w.onerror = () => {
      // Worker yüklenemezse bekleyenleri düşür; sonraki işler ana iş parçacığında çalışır.
      worker = null;
      for (const [, p] of pending) p.err(new Error('worker'));
      pending.clear();
    };
    worker = w;
    return w;
  } catch {
    return null;
  }
}

function inline(req: JobRequest): JobResponse {
  if (req.job === 'advance') return { job: 'advance', result: advanceInPlace(structuredClone(req.state), req.actions, req.days, req.prevObs) };
  if (req.job === 'replay') return { job: 'replay', result: replay(req.cfg, req.log, req.upToDay) };
  return { job: 'analyze', result: analyze(req.cfg, req.state) };
}

/** Küçük işler (1 gün) ana iş parçacığında: gecikmesiz. Ağır işler Worker'da. */
export async function runJob(req: JobRequest, opts: { heavy?: boolean } = {}): Promise<JobResponse> {
  const heavy = opts.heavy ?? (req.job !== 'advance' || req.days > 1);
  const w = heavy ? getWorker() : null;
  if (!w) return inline(req);
  return new Promise<JobResponse>((ok, err) => {
    const id = ++seq;
    pending.set(id, { ok, err });
    w.postMessage({ id, req });
  }).catch(() => inline(req));
}
