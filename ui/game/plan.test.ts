// Başlangıç kuyruğu: kurucu saati ilk gün yetmese bile seçilen kurulum eksiksiz tamamlanmalı (bağımlı aksiyonlar reddedilmemeli).
import { describe, expect, it } from 'vitest';
import { initState, stepInPlace } from '@engine/core';
import type { ActionResult } from '@engine/core';
import type { MarketId } from '@engine/data/schema';
import { realBundle } from '@engine/test-fixtures/helpers';
import { setupActions } from './plan';

const ALL = { tracking: true, lp: true, google: true, meta: true, local: true, geo: true };
const DEFAULT = { tracking: true, lp: false, google: true, meta: false, local: true, geo: false };

function play(m: MarketId, choices: typeof ALL, seed: string, days = 14) {
  const s = initState(realBundle(m), seed, { difficulty: 'normal', mode: 'full', startDate: '2026-11-02' });
  const results: ActionResult[] = [];
  results.push(...stepInPlace(s, setupActions(s, choices)).actionResults);
  for (let i = 1; i < days; i++) results.push(...stepInPlace(s, []).actionResults);
  return { s, rejected: results.filter((r) => r.status === 'rejected') };
}

describe.each<MarketId>(['us', 'de', 'tr'])('başlangıç kurulumu: %s', (m) => {
  it('varsayılan seçimlerle kampanya anahtar kelimeyle kurulur ve harcama yapar', () => {
    for (const seed of ['a', 'b', 'c']) {
      const { s, rejected } = play(m, DEFAULT, seed);
      expect(rejected).toEqual([]);
      expect(s.google.campaigns[0]!.adGroups[0]!.keywords.length).toBe(3);
      expect(s.ledger.adSpend).toBeGreaterThan(0);
      expect(s.founder.queue).toEqual([]);
    }
  });
  it('tüm kanallar seçilince de hiçbir aksiyon reddedilmez', () => {
    const { s, rejected } = play(m, ALL, 'all', 21);
    expect(rejected).toEqual([]);
    expect(s.google.campaigns[0]!.adGroups[0]!.keywords.length).toBe(3);
    expect(s.meta.adSets.length).toBe(1);
  });
});
