import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { posterior, probAGreaterB } from './bayes';
import { drawLatent } from './assets';
import { createRng } from '../rng';
import { abResult, assetEstimates } from '../selectors';
import { days, doDay, fx, withGoogle } from '../test-fixtures/helpers';

describe('Beta-Binomial keşfi', () => {
  it('veri arttıkça aralık daralır ve gerçek orana yaklaşır', () => {
    const small = posterior({ n: 50, k: 5, kObs: 5 }, 0.05);
    const big = posterior({ n: 5000, k: 500, kObs: 500 }, 0.05);
    expect(big.hi - big.lo).toBeLessThan(small.hi - small.lo);
    expect(Math.abs(big.mean - 0.1)).toBeLessThan(0.005);
    expect(small.lo).toBeLessThan(small.mean);
    expect(small.hi).toBeGreaterThan(small.mean);
  });
  it('"yeterli veri yok" bayrağı: az örnek veya geniş aralık', () => {
    expect(posterior({ n: 8, k: 1, kObs: 1 }, 0.05).insufficient).toBe(true);
    expect(posterior({ n: 20000, k: 1000, kObs: 1000 }, 0.05).insufficient).toBe(false);
  });
  it('gözlenen (kObs) kullanılır: takip kaybı posterior’u aşağı çeker', () => {
    expect(posterior({ n: 2000, k: 200, kObs: 100 }, 0.05).mean).toBeLessThan(posterior({ n: 2000, k: 200, kObs: 200 }, 0.05).mean);
  });
  it('güvenilir aralık nominal kapsama yakın (simülasyon)', () => {
    const r = createRng('cover');
    let hit = 0;
    const T = 600;
    for (let i = 0; i < T; i++) {
      const theta = r.beta(2, 38);
      const n = 400;
      const k = r.binomial(n, theta);
      // önsel gerçek dağılımla uyumlu (Beta(2,38)) -> %90 aralık yaklaşık %90 kapsar
      const p = posterior({ n, k, kObs: k }, 2 / 40, { strength: 40 });
      if (theta >= p.lo && theta <= p.hi) hit++;
    }
    expect(hit / T).toBeGreaterThan(0.84);
    expect(hit / T).toBeLessThan(0.96);
  });
  it('P(A>B) [0,1], simetrik ve veriyle keskinleşir (özellik)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 3000 }), fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }), (n, ka, kb) => {
        const a = posterior({ n, k: Math.min(ka, n), kObs: Math.min(ka, n) }, 0.05);
        const b = posterior({ n, k: Math.min(kb, n), kObs: Math.min(kb, n) }, 0.05);
        const p = probAGreaterB(a, b);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
        expect(p + probAGreaterB(b, a)).toBeCloseTo(1, 1);
      }),
      { numRuns: 30 },
    );
    const a = posterior({ n: 5000, k: 300, kObs: 300 }, 0.05);
    const b = posterior({ n: 5000, k: 200, kObs: 200 }, 0.05);
    expect(probAGreaterB(a, b)).toBeGreaterThan(0.99);
  });
});

describe('Gizli kalite', () => {
  it('latent q ortalama ~1, makul aralıkta, tohuma bağlı', () => {
    const r = createRng('lat');
    const xs = Array.from({ length: 4000 }, () => drawLatent(r));
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(m).toBeGreaterThan(0.95);
    expect(m).toBeLessThan(1.05);
    expect(xs.every((x) => x > 0 && x < 2)).toBe(true);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.8);
  });
  it('oyuncuya dönen gözlem özetleri latent q içermez', () => {
    const s = fx('hid');
    withGoogle(s);
    days(s, 10);
    const json = JSON.stringify({ a: assetEstimates(s) });
    expect(json).not.toContain('"q"');
    expect(json).not.toContain('speed');
  });
  it('yaratıcı ve LP istatistikleri keşfi besler: çok veri => gerçek orana yakın tahmin', () => {
    const s = fx('disc');
    s.tracking.health = 1;
    s.params['measure.consent_rate'] = 1;
    withGoogle(s, { budget: 400, match: 'exact' });
    days(s, 90);
    const cr = s.assets.creatives.find((c) => c.channel === 'google')!;
    expect(cr.stats.ctr.n).toBeGreaterThan(5000);
    const est = assetEstimates(s).creatives.find((c) => c.id === cr.id)!.ctr;
    const truth = cr.stats.ctr.k / cr.stats.ctr.n;
    expect(Math.abs(est.mean - truth)).toBeLessThan(0.005);
    expect(est.insufficient).toBe(false);
  });
});

describe('A/B testi (LP)', () => {
  it('trafik böler, bitince durur, posterior üretir', () => {
    const s = fx('ab');
    s.tracking.health = 1;
    s.params['measure.consent_rate'] = 1;
    withGoogle(s, { budget: 400, match: 'exact' });
    doDay(s, [{ type: 'asset.create_lp', params: {} }]);
    days(s, 4);
    const [a, b] = s.assets.lps;
    expect(s.assets.lps.length).toBe(2);
    const r = doDay(s, [{ type: 'asset.start_ab_test', params: { a: a!.id, b: b!.id, days: 30, split: 0.5 } }]);
    expect(r.actionResults[0]!.status).not.toBe('rejected');
    days(s, 35);
    const t = s.tests.ab[0]!;
    expect(t.status).toBe('done');
    expect(t.statsA.n).toBeGreaterThan(0);
    expect(t.statsB.n).toBeGreaterThan(0);
    expect(Math.abs(t.statsA.n / (t.statsA.n + t.statsB.n) - 0.5)).toBeLessThan(0.1);
    const res = abResult(s, t.id)!;
    expect(res.pAGreaterB).toBeGreaterThanOrEqual(0);
    expect(res.pAGreaterB).toBeLessThanOrEqual(1);
    const truthBetter = a!.q > b!.q ? 'a' : 'b';
    if (Math.abs(a!.q - b!.q) > 0.3 && !res.insufficient) expect(res.pAGreaterB > 0.5).toBe(truthBetter === 'a');
  });
  it('geçersiz test kurulumu reddedilir', () => {
    const s = fx('ab2');
    const lp = s.assets.lps[0]!.id;
    expect(doDay(s, [{ type: 'asset.start_ab_test', params: { a: lp, b: lp, days: 30, split: 0.5 } }]).actionResults[0]!.status).toBe('rejected');
    expect(doDay(s, [{ type: 'asset.start_ab_test', params: { a: lp, b: 'zz', days: 30, split: 0.5 } }]).actionResults[0]!.status).toBe('rejected');
  });
});
