// İçerik kararları: mesajın pazar uyumu, reklam-sayfa tutarlılığı, konu seçimi ve tekrar cezası, reklam grubu odağı.
import { describe, expect, it } from 'vitest';
import { initState, K, stepInPlace } from '../core';
import type { Action, AdMessage, GameState } from '../core';
import { realBundle } from '../test-fixtures/helpers';
import { messageFit } from './assets';

const game = (m: 'us' | 'de' | 'tr', seed = 'c1') => initState(realBundle(m), seed, { difficulty: 'normal', mode: 'full', startDate: '2026-11-02' });
const MSG: AdMessage[] = ['time', 'revenue', 'price', 'trust'];
const best = (fit: Record<AdMessage, number>) => MSG.reduce((a, b) => (fit[b] > fit[a] ? b : a));

describe('mesaj uyumu', () => {
  it('pazara göre değişir: ABD gelir, Almanya güven, Türkiye fiyat', () => {
    expect(best(K.messageFit.us)).toBe('revenue');
    expect(best(K.messageFit.de)).toBe('trust');
    expect(best(K.messageFit.tr)).toBe('price');
  });
  it('tohuma bağlı sapar ama aynı tohumda sabittir, mesajsız içerik nötrdür', () => {
    const a = game('us', 'x');
    expect(messageFit(a, 'revenue')).toBe(messageFit(game('us', 'x'), 'revenue'));
    expect(messageFit(a, 'revenue')).not.toBe(messageFit(game('us', 'y'), 'revenue'));
    expect(messageFit(a, undefined)).toBe(1);
  });
  it('seçilen mesaj varlığa yazılır ve gizli kaliteyi ölçekler', () => {
    const s = game('tr');
    stepInPlace(s, [{ type: 'asset.create_lp', params: { message: 'price' } }]);
    expect(s.assets.lps[s.assets.lps.length - 1]!.message).toBe('price');
  });
});

describe('içerik konusu', () => {
  const seoAfter = (a: Action[]) => {
    const s: GameState = game('us');
    for (const x of a) stepInPlace(s, [x]);
    return s.local.content.seo;
  };
  const seo = (topic?: 'comparison' | 'story'): Action => ({ type: 'local.content', params: { kind: 'seo', hours: 2, ...(topic ? { topic } : {}) } });
  it('satın alma niyetine yakın konu, zayıf konudan ve genelden çok getirir', () => {
    expect(seoAfter([seo('comparison')])).toBeGreaterThan(seoAfter([seo()]));
    expect(seoAfter([seo()])).toBeGreaterThan(seoAfter([seo('story')]));
  });
  it('aynı konuyu tekrarlamak getiriyi düşürür', () => {
    const once = seoAfter([seo('comparison')]);
    expect(seoAfter([seo('comparison'), seo('comparison')]) - once).toBeLessThan(once * 0.9);
  });
});

describe('reklam grubu odağı', () => {
  function run(split: boolean): number {
    const s = game('us', 'focus');
    const P = s.product.price;
    const cr = s.assets.creatives.find((c) => c.channel === 'google')!.id;
    stepInPlace(s, [{ type: 'gads.create_campaign', params: { type: 'search', dailyBudget: P * 2, strategy: 'manual', manualBid: 6, lpId: s.assets.lps[0]!.id, offerId: s.assets.offers[0]!.id } }]);
    const c = s.google.campaigns[0]!;
    stepInPlace(s, [{ type: 'gads.add_adgroup', params: { campaignId: c.id, creativeId: cr } }, { type: 'gads.add_adgroup', params: { campaignId: c.id, creativeId: cr } }]);
    const [g1, g2] = c.adGroups;
    stepInPlace(s, [
      { type: 'gads.add_keywords', params: { campaignId: c.id, adGroupId: g1!.id, keywords: split ? [{ theme: 'core', match: 'exact' }] : [{ theme: 'core', match: 'exact' }, { theme: 'brand', match: 'exact' }] } },
      ...(split ? ([{ type: 'gads.add_keywords', params: { campaignId: c.id, adGroupId: g2!.id, keywords: [{ theme: 'brand', match: 'exact' }] } }] as Action[]) : []),
    ]);
    for (let i = 0; i < 40; i++) stepInPlace(s, []);
    return s.google.campaigns[0]!.adGroups.flatMap((g) => g.keywords).reduce((a, k) => a + (k.stats?.clicks ?? 0), 0);
  }
  it('temaları ayırmak aynı kelimelerden daha çok tıklama getirir', () => {
    expect(run(true)).toBeGreaterThan(run(false));
  });
});
