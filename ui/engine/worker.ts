// Web Worker: ağır işler (çok günlük ilerletme, yeniden oynatma, sonuç analizi) arayüzü dondurmaz.
import { advanceInPlace, replay } from './jobs';
import { analyze } from './analysis';
import type { JobRequest, JobResponse } from './client';

self.onmessage = (ev: MessageEvent<{ id: number; req: JobRequest }>) => {
  const { id, req } = ev.data;
  try {
    let res: JobResponse;
    if (req.job === 'advance') res = { job: 'advance', result: advanceInPlace(req.state, req.actions, req.days, req.prevObs) };
    else if (req.job === 'replay') res = { job: 'replay', result: replay(req.cfg, req.log, req.upToDay) };
    else res = { job: 'analyze', result: analyze(req.cfg, req.state) };
    (self as unknown as Worker).postMessage({ id, res });
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
};
