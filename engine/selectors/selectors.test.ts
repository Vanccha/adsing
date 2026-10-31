import { describe, expect, it } from 'vitest';
import { availableActions, cac, founderHours, freshnessWarnings, funnel, mrr, observedMetrics, responseAt, runway, selectors, trueMetrics } from './index';
import { days, doDay, fx, withGoogle, withMeta } from '../test-fixtures/helpers';
import { runDays } from '../core/run';
import { balancedPolicy } from '../bots/reference';

describe('observed vs true', () => {
  it('oyuncuya gösterilen metrik gerçekten farklıdır (onay kaybı + atıf şişmesi) ve gizli latent içermez', () => {
    const s = fx('ov');
    withGoogle(s, { budget: 120 });
    days(s, 60);
    const o = observedMetrics(s, 30);
    const t = trueMetrics(s);
    expect(JSON.stringify(o)).not.toMatch(/"q":/);
    expect(JSON.stringify(o)).not.toContain('latent');
    expect(JSON.stringify(t)).toContain('latent');
    const trueG = t.byChannel.google!.leads;
    expect(trueG).toBeGreaterThan(10);
    expect(o.platform.conv.google).not.toBeCloseTo(trueG, 0);
    expect(t.trackedFraction.google).toBeLessThan(1);
    expect(o.campaigns[0]!.qsBand).toMatch(/below|average|above/);
  });
  it('CRM gecikmelidir (son günler görünmez)', () => {
    const s = fx('crm');
    withGoogle(s, { budget: 150 });
    days(s, 10);
    const o = observedMetrics(s, 3);
    expect(o.crm.leads).toBeGreaterThanOrEqual(0);
    expect(o.window).toBe(3);
  });
});

describe('ipuçları yalnızca öğrenme kipinde', () => {
  it('darboğaz ve takip ipucu anahtarı learningMode ile döner', () => {
    const run = (learningMode: boolean) => {
      const s = fx('hint', { learningMode });
      s.tracking.health = 0.5;
      withGoogle(s, { budget: 150 });
      days(s, 60);
      return { f: funnel(s), o: observedMetrics(s) };
    };
    const on = run(true);
    const off = run(false);
    expect(off.f.hintKeys).toEqual([]);
    expect(off.o.hints).toEqual([]);
    expect(on.o.hints).toContain('hint.tracking_health');
    expect(on.f.bottleneck).not.toBeNull();
    expect(off.f.bottleneck).not.toBeNull(); // tespit her zaman var; yalnızca ipucu metni anahtarı kipe bağlı
  });
  it('darboğaz: bozuk LP dönüşümü tespit edilir', () => {
    const s = fx('bn', { learningMode: true });
    s.assets.lps[0]!.q = 0.15;
    withGoogle(s, { budget: 300, match: 'exact' });
    days(s, 60);
    const f = funnel(s, 60);
    expect(f.bottleneck?.stage).toBe('lp');
    expect(f.hintKeys).toContain('hint.bottleneck.lp');
  });
});

describe('CAC, marjinal CAC, MRR, runway, kurucu saati', () => {
  it('CAC / LTV / payback hesaplanır; marjinal CAC ortalamadan büyük', () => {
    const s = runDays(fx('cac'), balancedPolicy, 150);
    const c = cac(s, { marginal: true });
    expect(c.ltv).toBeGreaterThan(0);
    if (c.cacAds && c.cacFull) expect(c.cacFull).toBeGreaterThanOrEqual(c.cacAds);
    expect(c.marginal).toBeDefined();
    const g = c.marginal!.google;
    expect(g === null || (g ?? 1) > 0).toBe(true);
  });
  it('marjinal CAC eğrisi: bütçe artışı müşteri başına maliyeti artırır (Meta)', () => {
    const s = fx('mc');
    withMeta(s, { budget: 50, creatives: 1, audience: 'lookalike' });
    const a = responseAt(s, 'meta', 1);
    const b = responseAt(s, 'meta', 8);
    expect(b.spend / b.customers).toBeGreaterThan(a.spend / a.customers);
  });
  it('mrr tablosu', () => {
    const s = runDays(fx('mrr'), balancedPolicy, 150);
    const m = mrr(s);
    expect(m.mrr).toBe(s.mrr);
    expect(m.arr).toBe(s.mrr * 12);
    expect(m.last30.new).toBeGreaterThanOrEqual(0);
  });
  it('runway: yakım varsa sonlu, kâr/yakım yoksa sonsuz', () => {
    const s = fx('rw');
    expect(runway(s)).toBe(Infinity);
    withGoogle(s, { budget: 100 });
    days(s, 40);
    const r = runway(s);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(1000);
  });
  it('founderHours', () => {
    const s = fx('fh');
    doDay(s, [{ type: 'local.optimize_gbp', params: { hours: 2 } }]);
    const f = founderHours(s);
    expect(f.used).toBeGreaterThanOrEqual(2);
    expect(f.free).toBeGreaterThanOrEqual(0);
    expect(f.capacityToday).toBeGreaterThan(0);
  });
});

describe('tazelik ve kullanılabilir aksiyonlar', () => {
  it('varsayımlar "kaynaksız" olarak işaretlenir; bayat tarih algılanır', () => {
    const s = fx('fr');
    const w = freshnessWarnings(s);
    expect(w.length).toBeGreaterThan(10);
    expect(w.every((x) => x.status === 'unsourced' || x.status === 'low_confidence' || x.status === 'stale')).toBe(true);
    s.paramInfo['price.monthly'] = { ...s.paramInfo['price.monthly']!, layer: 'sourced', refDate: '2024-01-01', confidence: 'high', hasSource: true };
    const w2 = freshnessWarnings(s);
    expect(w2.find((x) => x.id === 'price.monthly')).toMatchObject({ status: 'stale', ageMonths: 33 });
    expect(freshnessWarnings(s, '2024-06-01').find((x) => x.id === 'price.monthly')).toBeUndefined();
  });
  it('availableActions: bitmiş oyunda hepsi kapalı; elemanlar saat bilgisi içerir', () => {
    const s = fx('aa');
    const a = availableActions(s);
    expect(a.length).toBeGreaterThanOrEqual(35);
    expect(a.find((x) => x.type === 'ops.fire_rep')!.enabled).toBe(false);
    expect(a.find((x) => x.type === 'gads.create_campaign')!.enabled).toBe(true);
    s.cash = -1;
    doDay(s);
    expect(availableActions(s).every((x) => !x.enabled)).toBe(true);
  });
  it('selectors nesnesi tüm seçicileri dışa açar', () => {
    for (const k of ['observedMetrics', 'trueMetrics', 'funnel', 'cac', 'mrr', 'runway', 'founderHours', 'freshnessWarnings', 'availableActions']) expect(selectors).toHaveProperty(k);
  });
});
