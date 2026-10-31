// Gerçek veri (data/, markets/, scenarios/) ile entegrasyon: şema, çözümleme, 3 pazarda başlatma ve çökmeden koşu.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ParamFileSchema, ScenarioFileSchema } from './data/schema';
import type { MarketId } from './data/schema';
import { initState } from './core/init';
import { runDays } from './core/run';
import { REQUIRED_PARAM_IDS } from './core/params';
import { balancedPolicy, carefulPolicy, naivePolicy } from './bots/reference';
import { findBadNumber, REPO, realBundle, realDataExists } from './test-fixtures/helpers';
import { freshnessWarnings } from './selectors';
import { ledgerCash } from './funnel/finance';

const exists = realDataExists();
const rd = (f: string) => JSON.parse(readFileSync(join(REPO, f), 'utf8')) as unknown;

describe.skipIf(!exists)('gerçek veri dosyaları şemadan geçer', () => {
  it('data/global.json ve markets/*.json', () => {
    expect(ParamFileSchema.safeParse(rd('data/global.json')).success).toBe(true);
    for (const m of ['us', 'de', 'tr']) {
      const r = ParamFileSchema.safeParse(rd(`markets/${m}.json`));
      expect(r.success, JSON.stringify(r.success ? '' : r.error.issues.slice(0, 3))).toBe(true);
    }
  });
  it('scenarios/*.json', () => {
    for (const f of readdirSync(join(REPO, 'scenarios')).filter((x) => x.endsWith('.json'))) {
      const r = ScenarioFileSchema.safeParse(rd(`scenarios/${f}`));
      expect(r.success, f + JSON.stringify(r.success ? '' : r.error.issues.slice(0, 3))).toBe(true);
    }
  });
  it('sözleşmedeki zorunlu parametre kimlikleri her pazarda çözülür', () => {
    for (const m of ['us', 'de', 'tr'] as MarketId[]) {
      const s = initState(realBundle(m), 'x');
      for (const id of REQUIRED_PARAM_IDS) expect(id in s.params, `${m}:${id}`).toBe(true);
    }
  });
});

describe.skipIf(!exists)('3 pazarda başlat + çökmeden koş', () => {
  for (const m of ['us', 'de', 'tr'] as MarketId[]) {
    for (const [name, pol] of [['kötü', naivePolicy], ['orta', balancedPolicy], ['iyi', carefulPolicy]] as const) {
      it(`${m} / ${name} / 90 gün (hızlı mod)`, () => {
        const s = initState(realBundle(m), `rd-${m}`, { mode: 'quick' });
        const e = runDays(s, pol, 90);
        expect(e.day).toBeGreaterThan(0);
        expect(findBadNumber(e)).toBeNull();
        expect(ledgerCash(e)).toBeCloseTo(e.cash, 3);
        expect(e.outcome).not.toBeNull();
      });
    }
    it(`${m} / 365 gün tam oyun`, () => {
      const e = runDays(initState(realBundle(m), 'full-1', { difficulty: 'normal' }), balancedPolicy, 365);
      expect(findBadNumber(e)).toBeNull();
      expect(e.day).toBeGreaterThanOrEqual(90);
    });
  }
  it('pazar farkları davranışı değiştirir (yasal rejim, ölçüm, birim ekonomi)', () => {
    const us = initState(realBundle('us'), 's');
    const de = initState(realBundle('de'), 's');
    const tr = initState(realBundle('tr'), 's');
    expect(de.params['legal.cold_email']).toBe('banned');
    expect(us.params['legal.cold_email']).toBe('allowed');
    expect(tr.currency).toBe('TRY');
    expect(de.currency).toBe('EUR');
    expect(de.params['measure.consent_rate'] as number).toBeLessThan(us.params['measure.consent_rate'] as number);
    expect(tr.params['measure.offline_share']).toBeGreaterThan(0);
    expect(tr.channelRel.whatsapp!.relative).toBeGreaterThan(us.channelRel.whatsapp!.relative);
    expect(us.holidays.length).toBeGreaterThan(5);
  });
  it('freshnessWarnings gerçek veride bayat/kaynaksız işaretler (bugün=2026-10-31)', () => {
    const w = freshnessWarnings(initState(realBundle('de'), 's'));
    expect(w.some((x) => x.status === 'unsourced')).toBe(true);
    expect(w.some((x) => x.status === 'stale' && x.id === 'measure.ios_att_optin')).toBe(true);
  });
  it('senaryo hedefleri ve başlangıç nakdi senaryodan gelir', () => {
    const normal = initState(realBundle('us'), 's', { difficulty: 'normal' });
    const hard = initState(realBundle('us'), 's', { difficulty: 'hard' });
    // scn.start_cash.* aralıklıdır (range): tohumdan çekilir; zorluk sırası korunur
    expect(normal.startCash).toBeGreaterThanOrEqual(14000);
    expect(normal.startCash).toBeLessThanOrEqual(28000);
    expect(hard.startCash).toBeLessThan(normal.startCash);
    expect(initState(realBundle('us'), 's', { difficulty: 'normal', drawRanges: false }).startCash).toBe(20000);
    expect(initState(realBundle('us'), 's', { drawRanges: false }).goals.mrr).toBe(7500);
    expect(initState(realBundle('us'), 's', { mode: 'quick', drawRanges: false }).goals.mrr).toBe(1250);
  });
});
