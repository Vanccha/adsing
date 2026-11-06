// Sonuç analizi: karşı-olgusal koşular oyuncunun gerçek sonucunu değiştirmez ve anlamlı karşılaştırma üretir.
import { describe, expect, it } from 'vitest';
import { balancedPolicy, naivePolicy } from '../bots/reference';
import { initState, runDays } from '../core';
import { realBundle } from '../test-fixtures/helpers';
import { analyzeRun } from './index';

const init = (seed = 'an1') => initState(realBundle('us'), seed, { difficulty: 'normal', mode: 'quick' });

describe('sonuç analizi', () => {
  const final = runDays(init(), balancedPolicy, 90);
  const a = analyzeRun(init, final, { seeds: 6, maxAblations: 6 });

  it('girdi durumunu bozmaz, skor nakit + 12 × MRR', () => {
    expect(a.score).toBeCloseTo(final.cash + 12 * final.mrr, 6);
    expect(runDays(init(), balancedPolicy, 90)).toEqual(final);
  });

  it('beceri vs şans: dağılım sıralı, yüzdelik [0,1]', () => {
    expect(a.luck).not.toBeNull();
    expect(a.luck!.runs).toBe(6);
    expect(a.luck!.p10).toBeLessThanOrEqual(a.luck!.p50);
    expect(a.luck!.p50).toBeLessThanOrEqual(a.luck!.p90);
    expect(a.luck!.percentile).toBeGreaterThanOrEqual(0);
    expect(a.luck!.percentile).toBeLessThanOrEqual(1);
  });

  it('en etkili kararlar büyükten küçüğe, en çok 3 tane', () => {
    expect(a.topDecisions.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < a.topDecisions.length; i++) expect(Math.abs(a.topDecisions[i - 1]!.delta)).toBeGreaterThanOrEqual(Math.abs(a.topDecisions[i]!.delta));
  });

  it('kötü oyunda iyi bot kıyası oyuncuyu geçer ve kaçırılan fırsat çıkar', () => {
    const fin = runDays(init(), naivePolicy, 90);
    const v = analyzeRun(init, fin, { seeds: 3, maxAblations: 3 });
    expect(v.benchmark.score).toBeGreaterThan(v.score);
    expect(v.missed.length).toBeGreaterThan(0);
  });

  it('platform/gerçek tablosu yalnız ücretli kanallarda platform değeri taşır', () => {
    for (const r of a.truth.byChannel) {
      if (r.channel !== 'google' && r.channel !== 'meta') expect(r.platformConv).toBeNull();
    }
  });
});
