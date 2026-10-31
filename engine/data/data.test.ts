import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addDays, addMonths, ageMonths, dayNumber, isStale, sourceRefDate } from './freshness';
import { evalFormula } from './expr';
import { MissingParamError, resolveParams } from './resolve';
import { ParamFileSchema, ParamSchema, parseParamFile, parseScenarioFile } from './schema';
import type { DataBundle, Param } from './schema';
import { fixtureBundle } from '../test-fixtures';
import { initState } from '../core/init';

const base = (o: Partial<Param>): unknown => ({ id: 'a.b', value: 1, unit: 'ratio', market: 'global', layer: 'assumption', note: 'x', ...o });
const src = { url: 'https://x', name: 'X', published: '2026-01-01', accessed: '2026-10-31' };

describe('Param şeması', () => {
  it('assumption geçer, notsuz reddedilir', () => {
    expect(ParamSchema.safeParse(base({})).success).toBe(true);
    expect(ParamSchema.safeParse(base({ note: undefined })).success).toBe(false);
  });
  it('sourced kaynak + güven + accessed ister', () => {
    expect(ParamSchema.safeParse(base({ layer: 'sourced' })).success).toBe(false);
    expect(ParamSchema.safeParse(base({ layer: 'sourced', source: src })).success).toBe(false); // confidence yok
    expect(ParamSchema.safeParse(base({ layer: 'sourced', source: src, confidence: 'high' })).success).toBe(true);
    expect(ParamSchema.safeParse(base({ layer: 'sourced', source: { ...src, accessed: undefined as unknown as string }, confidence: 'high' })).success).toBe(false);
  });
  it('derived formül ister; value veya range zorunlu', () => {
    expect(ParamSchema.safeParse(base({ layer: 'derived' })).success).toBe(false);
    expect(ParamSchema.safeParse(base({ layer: 'derived', formula: 'a*2', inputs: ['x.y'] })).success).toBe(true);
    expect(ParamSchema.safeParse(base({ value: undefined })).success).toBe(false);
  });
  it('enum (string) değerler ve çarpan birimi kabul edilir', () => {
    expect(ParamSchema.safeParse(base({ value: 'allowed', unit: 'enum' })).success).toBe(true);
    expect(ParamSchema.safeParse(base({ value: 1.35, unit: 'multiplier' })).success).toBe(true);
  });
  it('dosya şeması', () => {
    expect(ParamFileSchema.safeParse({ schemaVersion: 1, market: 'us', params: [] }).success).toBe(true);
    expect(ParamFileSchema.safeParse({ schemaVersion: 2, market: 'us', params: [] }).success).toBe(false);
    expect(ParamFileSchema.safeParse({ schemaVersion: 1, market: 'fr', params: [] }).success).toBe(false);
  });
});

describe('İfade değerlendirici', () => {
  const ids: Record<string, number> = { 'a.b': 4, 'c.d': 2 };
  const get = (i: string) => ids[i] ?? NaN;
  it('aritmetik ve fonksiyonlar', () => {
    expect(evalFormula('a.b * 3 + c.d ^ 2', get)).toBe(16);
    expect(evalFormula('mean(1, 2, 3)', get)).toBe(2);
    expect(evalFormula('median(5, 1, 3)', get)).toBe(3);
    expect(evalFormula('round(737.1 * 0.95, 10)', get)).toBe(700);
    expect(evalFormula('min(14, round(median(7, 30)))', get)).toBe(14);
    expect(evalFormula('-(1 - 3) / 2', get)).toBe(1);
  });
  it('geçersiz formül hata verir', () => {
    expect(() => evalFormula('1 +', get)).toThrow();
    expect(() => evalFormula('foo(1)', get)).toThrow();
    expect(() => evalFormula('1 $ 2', get)).toThrow();
  });
});

describe('Tazelik', () => {
  it('takvim yardımcıları', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2025-10-31', 12)).toBe('2026-10-31');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2026-11-01') - dayNumber('2026-10-31')).toBe(1);
  });
  it('addDays dayNumber ile tutarlı (özellik)', () => {
    fc.assert(fc.property(fc.integer({ min: -3000, max: 3000 }), (n) => {
      const d = addDays('2026-10-31', n);
      expect(dayNumber(d) - dayNumber('2026-10-31')).toBe(n);
    }));
  });
  it('12 aydan eski bayat; published yoksa accessed kullanılır', () => {
    expect(isStale('2025-10-31', '2026-10-31')).toBe(false);
    expect(isStale('2025-10-30', '2026-10-31')).toBe(true);
    expect(ageMonths('2025-04-01', '2026-10-31')).toBe(18);
    expect(sourceRefDate({ published: null, accessed: '2026-05-01' })).toBe('2026-05-01');
    expect(sourceRefDate({ published: '2024-01-01', accessed: '2026-05-01' })).toBe('2024-01-01');
  });
});

describe('Çözümleme: senaryo > pazar > global, range, derived', () => {
  const mk = (market: 'global' | 'us', params: unknown[]) => parseParamFile({ schemaVersion: 1, market, params });
  const bundle = (g: unknown[], m: unknown[], sc: unknown[]): DataBundle => ({
    global: mk('global', g),
    market: mk('us', m),
    scenario: parseScenarioFile({ schemaVersion: 1, id: 't', params: sc }),
  });
  const p = (id: string, value: number | string, market: 'global' | 'us' | 'de', extra: object = {}) => base({ id, value, market, ...extra });

  it('öncelik sırası', () => {
    const b = bundle([p('x.y', 1, 'global'), p('x.z', 1, 'global')], [p('x.y', 2, 'us')], [p('x.y', 3, 'us')]);
    const r = resolveParams(b, 'us', 's');
    expect(r.values['x.y']).toBe(3);
    expect(r.info['x.y']?.origin).toBe('scenario');
    expect(r.values['x.z']).toBe(1);
    expect(r.info['x.z']?.origin).toBe('global');
  });
  it('pazara özel değer, aynı dosyadaki global’e baskındır; başka pazar yok sayılır', () => {
    const b = bundle([], [p('x.y', 5, 'global'), p('x.y', 6, 'us'), p('x.q', 7, 'de')], []);
    const r = resolveParams(b, 'us', 's');
    expect(r.values['x.y']).toBe(6);
    expect('x.q' in r.values).toBe(false);
  });
  it('range tohumdan çekilir: aynı tohum aynı değer, aralık içinde', () => {
    const b = bundle([p('x.r', 5, 'global', { range: { min: 2, max: 9 } })], [], []);
    const a1 = resolveParams(b, 'us', 'seed1').values['x.r'] as number;
    const a2 = resolveParams(b, 'us', 'seed1').values['x.r'] as number;
    expect(a1).toBe(a2);
    expect(a1).toBeGreaterThanOrEqual(2);
    expect(a1).toBeLessThanOrEqual(9);
    const many = new Set(Array.from({ length: 20 }, (_, i) => resolveParams(b, 'us', `s${i}`).values['x.r']));
    expect(many.size).toBeGreaterThan(10);
    expect(resolveParams(b, 'us', 's', { drawRanges: false }).values['x.r']).toBe(5);
  });
  it('derived formül girdilerden hesaplanır; güven ve tarih girdilerin en düşüğü/en eskisi', () => {
    const b = bundle(
      [
        p('a.one', 10, 'global', { layer: 'sourced', source: { ...src, published: '2024-01-01' }, confidence: 'high' }),
        p('a.two', 4, 'global', { layer: 'assumption', confidence: 'low' }),
        p('a.sum', 0, 'global', { layer: 'derived', formula: 'a.one / a.two', inputs: ['a.one', 'a.two'] }),
        p('a.pos', 0, 'global', { layer: 'derived', formula: 'a * b', inputs: ['a.one', 'a.two'] }),
      ],
      [],
      [],
    );
    const r = resolveParams(b, 'us', 's');
    expect(r.values['a.sum']).toBe(2.5);
    expect(r.values['a.pos']).toBe(40);
    expect(r.info['a.sum']?.confidence).toBe('low');
    expect(r.info['a.sum']?.refDate).toBe('2024-01-01');
  });
  it('derived döngü hata verir', () => {
    const b = bundle([p('c.a', 0, 'global', { layer: 'derived', formula: 'c.b', inputs: ['c.b'], value: undefined, range: { min: 0, max: 1 } }), p('c.b', 0, 'global', { layer: 'derived', formula: 'c.a', inputs: ['c.a'], value: undefined, range: { min: 0, max: 1 } })], [], []);
    expect(() => resolveParams(b, 'us', 's')).toThrow(/döngü/);
  });
  it('yüzde birimi orana çevrilir', () => {
    const b = bundle([p('x.pc', 25, 'global', { unit: 'percent' })], [], []);
    expect(resolveParams(b, 'us', 's').values['x.pc']).toBe(0.25);
  });
  it('initState eksik zorunlu kimliklerde açık hata verir', () => {
    const b = fixtureBundle('us');
    b.market = { ...b.market, params: b.market.params.filter((x) => x.id !== 'gads.search.cpc') };
    expect(() => initState(b, 's')).toThrow(MissingParamError);
    try {
      initState(b, 's');
    } catch (e) {
      expect((e as MissingParamError).ids).toContain('gads.search.cpc');
    }
  });
});
