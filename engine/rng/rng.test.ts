import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createRng, Rng } from './rng';
import { betaCdf, betaQuantile, probBetaGreater } from './stats';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs: number[]) => {
  const m = mean(xs);
  return mean(xs.map((x) => (x - m) ** 2));
};
const draw = (n: number, f: () => number) => Array.from({ length: n }, f);

describe('RNG: determinizm, alt akışlar, durum', () => {
  it('aynı tohum aynı dizi, farklı tohum farklı dizi', () => {
    const a = createRng('x');
    const b = createRng('x');
    const c = createRng('y');
    const sa = draw(20, () => a.u32());
    expect(draw(20, () => b.u32())).toEqual(sa);
    expect(draw(20, () => c.u32())).not.toEqual(sa);
  });
  it('fork ebeveynin tüketiminden bağımsızdır (alt akış izolasyonu)', () => {
    fc.assert(
      fc.property(fc.string(), fc.string({ minLength: 1 }), fc.integer({ min: 0, max: 50 }), (seed, label, burn) => {
        const p1 = createRng(seed);
        const p2 = createRng(seed);
        for (let i = 0; i < burn; i++) p2.u32();
        expect(draw(5, () => p1.fork(label).u32())).toEqual(draw(5, () => p2.fork(label).u32()));
      }),
    );
  });
  it('farklı etiketler bağımsız akış verir', () => {
    const r = createRng('s');
    expect(r.fork('a').u32()).not.toBe(r.fork('b').u32());
  });
  it('durum serileştirilebilir ve devam ettirilebilir', () => {
    const a = createRng('state');
    draw(7, () => a.u32());
    const saved = JSON.parse(JSON.stringify(a.getState()));
    const b = new Rng(saved);
    expect(draw(10, () => b.u32())).toEqual(draw(10, () => a.u32()));
  });
  it('float [0,1), open (0,1)', () => {
    const r = createRng('f');
    for (let i = 0; i < 5000; i++) {
      const f = r.float();
      const o = r.open();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      expect(o).toBeGreaterThan(0);
      expect(o).toBeLessThan(1);
    }
  });
});

describe('RNG: dağılımlar', () => {
  const N = 20000;
  it('normal', () => {
    const r = createRng('n');
    const xs = draw(N, () => r.normal(3, 2));
    expect(mean(xs)).toBeCloseTo(3, 1);
    expect(Math.sqrt(variance(xs))).toBeGreaterThan(1.9);
    expect(Math.sqrt(variance(xs))).toBeLessThan(2.1);
  });
  it.each([0.4, 2.5, 9])('gamma(%f) ortalaması', (k) => {
    const r = createRng(`g${k}`);
    expect(mean(draw(N, () => r.gamma(k, 1.5))) / (k * 1.5)).toBeGreaterThan(0.95);
    expect(mean(draw(N, () => r.gamma(k, 1.5))) / (k * 1.5)).toBeLessThan(1.05);
  });
  it('beta ortalaması ve [0,1]', () => {
    const r = createRng('b');
    const xs = draw(N, () => r.beta(2, 6));
    expect(xs.every((x) => x >= 0 && x <= 1)).toBe(true);
    expect(mean(xs)).toBeGreaterThan(0.24);
    expect(mean(xs)).toBeLessThan(0.26);
  });
  it.each([0.5, 7, 25, 400])('poisson(%f) ortalama ve varyans', (lam) => {
    const r = createRng(`p${lam}`);
    const xs = draw(N, () => r.poisson(lam));
    expect(Math.abs(mean(xs) / lam - 1)).toBeLessThan(0.05);
    expect(Math.abs(variance(xs) / lam - 1)).toBeLessThan(0.12);
  });
  it.each([
    [10, 0.3],
    [60, 0.05],
    [500, 0.4],
    [2000, 0.97],
  ])('binomial(%i,%f)', (n, p) => {
    const r = createRng(`bin${n}`);
    const xs = draw(N, () => r.binomial(n, p));
    expect(xs.every((x) => x >= 0 && x <= n && Number.isInteger(x))).toBe(true);
    expect(Math.abs(mean(xs) / (n * p) - 1)).toBeLessThan(0.04);
    expect(Math.abs(variance(xs) / (n * p * (1 - p)) - 1)).toBeLessThan(0.15);
  });
  it('negBin: ortalama doğru, varyans Poisson’dan büyük', () => {
    const r = createRng('nb');
    const xs = draw(N, () => r.negBin(50, 5));
    expect(Math.abs(mean(xs) / 50 - 1)).toBeLessThan(0.05);
    expect(variance(xs)).toBeGreaterThan(50 * 2);
  });
  it('kenar durumlar', () => {
    const r = createRng('e');
    expect(r.binomial(0, 0.5)).toBe(0);
    expect(r.binomial(10, 0)).toBe(0);
    expect(r.binomial(10, 1)).toBe(10);
    expect(r.poisson(0)).toBe(0);
    expect(r.negBin(0, 3)).toBe(0);
  });
  it('binomial her zaman [0,n] (özellik)', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 0, max: 100000 }), fc.double({ min: 0, max: 1, noNaN: true }), (seed, n, p) => {
        const x = createRng(seed).binomial(n, p);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(n);
      }),
    );
  });
});

describe('Beta fonksiyonları', () => {
  it('cdf bilinen değerler', () => {
    expect(betaCdf(0.5, 1, 1)).toBeCloseTo(0.5, 8);
    expect(betaCdf(0.5, 2, 2)).toBeCloseTo(0.5, 8);
    expect(betaCdf(0.3, 2, 1)).toBeCloseTo(0.09, 8);
  });
  it('kuantil cdf’in tersi', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.5, max: 30, noNaN: true }), fc.double({ min: 0.5, max: 30, noNaN: true }), fc.double({ min: 0.02, max: 0.98, noNaN: true }), (a, b, p) => {
        expect(betaCdf(betaQuantile(p, a, b), a, b)).toBeCloseTo(p, 6);
      }),
    );
  });
  it('P(A>B) simetri ve bilinen değer', () => {
    expect(probBetaGreater(5, 5, 5, 5)).toBeCloseTo(0.5, 3);
    expect(probBetaGreater(10, 2, 2, 10) + probBetaGreater(2, 10, 10, 2)).toBeCloseTo(1, 2);
    expect(probBetaGreater(30, 10, 10, 30)).toBeGreaterThan(0.99);
  });
});
