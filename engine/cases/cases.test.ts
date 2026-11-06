// Vaka kabul testleri: her vaka gerçek veri + gerçek aksiyonlarla tetiklenebilir; doğru tepki yanlış tepkiden iyi sonuç verir;
// tanım dosyaları motorla tutarlıdır (bilinmeyen metrik/hedef/aksiyon/çeviri yok: motor bunları sessizce yok sayar).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initState, stepInPlace } from '../core';
import type { Action, GameState } from '../core';
import type { MarketId } from '../data/schema';
import { REPO, realBundle } from '../test-fixtures/helpers';
import { RESPONSES } from './actions';
import { ABSTAIN_ACTIONS, RESPOND_ONLY, caseTags } from './actionmap';
import { caseDefs, eventDefs } from './defs';
import { METRIC_IDS } from './metrics';
import { allCaseRecords, evalTrigger } from './runtime';
import type { Condition, Effect, Trigger } from './schema';

const MARKETS: MarketId[] = ['us', 'de', 'tr'];
const game = (m: MarketId, seed: string): GameState => initState(realBundle(m), seed, { difficulty: 'normal', mode: 'full', startDate: '2026-11-02' });
const P = (s: GameState): number => s.product.price;
const lp = (s: GameState): string => s.assets.lps[0]!.id;
const offer = (s: GameState): string => s.assets.offers[0]!.id;
const gCr = (s: GameState): string => s.assets.creatives.find((c) => c.channel === 'google')!.id;
const mCr = (s: GameState): string => s.assets.creatives.find((c) => c.channel === 'meta')!.id;
const gc = (s: GameState) => s.google.campaigns[0];
const fired = (s: GameState, id: string): boolean => allCaseRecords(s).some((a) => a.id === id);

/** Google arama kampanyası: yoksa kurar, reklam grubu ve anahtar kelimeleri ekler. */
function googleSetup(s: GameState, o: { budget: number; strategy: 'manual' | 'maxConversions'; match: 'broad' | 'phrase' | 'exact'; bidMult?: number }): Action[] {
  const c = gc(s);
  if (!c) return [{ type: 'gads.create_campaign', params: { type: 'search', dailyBudget: o.budget, strategy: o.strategy, ...(o.strategy === 'manual' ? { manualBid: (s.params['gads.search.cpc'] as number) * (o.bidMult ?? 1.5) } : {}), lpId: lp(s), offerId: offer(s) } }];
  if (c.adGroups.length === 0) return [{ type: 'gads.add_adgroup', params: { campaignId: c.id, creativeId: gCr(s) } }];
  if (c.adGroups[0]!.keywords.length === 0) return [{ type: 'gads.add_keywords', params: { campaignId: c.id, adGroupId: c.adGroups[0]!.id, keywords: [{ theme: 'core', match: o.match }, { theme: 'adjacent', match: o.match }] } }];
  return [];
}
const sales = (s: GameState, h: number): Action[] => (s.day === 0 ? [{ type: 'ops.set_alloc', params: { sales: h, onboarding: 1 } }] : []);

/** Her vaka için: doğal yoldan tetikleyen oyun planı (hiçbir iç durum değiştirilmez) + varsa ön hazırlık (yalnız takvim/kaynak için). */
const PLAYBOOK: Record<string, { policy: (s: GameState) => Action[]; prepare?: (s: GameState) => void; days?: number; seeds?: number }> = {
  C01: { policy: (s) => [...sales(s, 2), ...googleSetup(s, { budget: P(s) * 3, strategy: 'manual', match: 'broad' })] },
  C02: {
    policy: (s) => {
      const n = s.meta.adSets.length;
      if (n < 4) return [{ type: 'meta.create_adset', params: { objective: 'leads', audience: 'interest', dailyBudget: P(s) * 0.1, creativeIds: [mCr(s)], lpId: lp(s), offerId: offer(s) } }];
      const a = s.meta.adSets[s.day % 4]!;
      return [{ type: 'meta.set_budget', params: { adSetId: a.id, dailyBudget: a.dailyBudget * 1.05 } }];
    },
    days: 40,
  },
  C03: {
    policy: (s) => (s.meta.adSets.length === 0 ? [{ type: 'meta.create_adset', params: { objective: 'leads', audience: 'lookalike', dailyBudget: P(s) * 8, creativeIds: [mCr(s)], lpId: lp(s), offerId: offer(s) } }] : []),
    days: 120,
  },
  C04: {
    policy: (s) => [
      ...(s.day === 0 ? ([{ type: 'ops.set_alloc', params: { sales: 4, onboarding: 2 } }, { type: 'track.fix', params: { level: 'basic' } }] as Action[]) : []),
      ...(s.day === 1 ? ([{ type: 'track.fix', params: { level: 'consent_mode' } }] as Action[]) : []),
      ...(s.day >= 2 && s.meta.adSets.length === 0 ? ([{ type: 'meta.create_adset', params: { objective: 'leads', audience: 'advantage', dailyBudget: P(s) * 4, creativeIds: [mCr(s)], lpId: lp(s), offerId: offer(s) } }] as Action[]) : []),
    ],
    days: 200,
  },
  C05: { policy: (s) => googleSetup(s, { budget: P(s), strategy: 'manual', match: 'phrase' }), days: 365 },
  C06: {
    policy: (s) => {
      const bold = s.assets.creatives.find((c) => c.bold && c.availableDay <= s.day);
      if (!bold) return s.assets.creatives.some((c) => c.bold) ? [] : [{ type: 'asset.create_creative', params: { channel: 'google', bold: true } }];
      const c = gc(s);
      if (!c) return [{ type: 'gads.create_campaign', params: { type: 'search', dailyBudget: P(s), strategy: 'manual', manualBid: (s.params['gads.search.cpc'] as number) * 1.5, lpId: lp(s), offerId: offer(s) } }];
      if (c.adGroups.length === 0) return [{ type: 'gads.add_adgroup', params: { campaignId: c.id, creativeId: bold.id } }];
      if (c.adGroups[0]!.keywords.length === 0) return [{ type: 'gads.add_keywords', params: { campaignId: c.id, adGroupId: c.adGroups[0]!.id, keywords: [{ theme: 'core', match: 'phrase' }] } }];
      return [];
    },
    days: 365,
  },
  C07: { policy: (s) => googleSetup(s, { budget: P(s), strategy: 'maxConversions', match: 'phrase' }), days: 365 },
  C08: { policy: () => [], days: 365 },
  C09: { policy: () => [], days: 365 },
  C10: {
    policy: (s) => [
      ...(s.day === 0 ? ([{ type: 'ops.set_alloc', params: { sales: 4, onboarding: 0 } }] as Action[]) : []),
      ...googleSetup(s, { budget: P(s) * 2, strategy: 'manual', match: 'phrase' }),
    ],
    days: 200,
  },
  C11: {
    policy: (s) => {
      const a = googleSetup(s, { budget: P(s) * 0.5, strategy: 'manual', match: 'broad', bidMult: 5 }); // yüksek teklif: kısıt sıralama değil bütçe olsun
      if (a.length) return a;
      const c = gc(s)!;
      return s.day === 60 ? [{ type: 'gads.set_budget', params: { campaignId: c.id, dailyBudget: P(s) * 20 } }] : []; // marjinal CAC eşiği aşılana dek sert sıçrama
    },
    days: 200,
  },
  C12: { policy: () => [], days: 365 },
  C13: {
    policy: (s) => [...sales(s, 3), ...googleSetup(s, { budget: P(s), strategy: 'manual', match: 'phrase' })],
    // KDV borcu kasaya göre ağır olsun: az nakitle başlayan kurucu
    prepare: (s) => {
      s.cash = s.cash * 0.12;
      s.startCash = s.cash;
    },
    days: 200,
  },
  C14: { policy: (s) => (s.day % 3 === 0 ? [{ type: 'local.cold_outreach', params: { kind: 'email', volume: 50 } }] : []), days: 120 },
  C15: {
    policy: (s) => (gc(s) ? [] : [{ type: 'gads.create_campaign', params: { type: 'pmax', dailyBudget: P(s) * 3, strategy: 'maxConversions', lpId: lp(s), offerId: offer(s) } }]),
    days: 300,
  },
  C16: { policy: (s) => [...(s.day === 0 ? ([{ type: 'ops.set_alloc', params: { sales: 0.5, onboarding: 0 } }] as Action[]) : []), ...googleSetup(s, { budget: P(s) * 2, strategy: 'manual', match: 'phrase' })], days: 120 },
};

/** Vaka tetiklenene kadar oynar; tetiklenmeyen pazar+tohum için null. */
function playUntil(m: MarketId, id: string, seed: string): GameState | null {
  const p = PLAYBOOK[id]!;
  const s = game(m, seed);
  p.prepare?.(s);
  const horizon = p.days ?? 90;
  while (s.day < horizon && !s.outcome) {
    stepInPlace(s, p.policy(s));
    if (fired(s, id)) return s;
  }
  return null;
}

describe('vaka tanımları motorla tutarlı', () => {
  const triggers = (): Trigger[] => caseDefs().flatMap((c) => [c.trigger, ...Object.values(c.marketOverrides).flatMap((o) => (o.trigger ? [o.trigger] : []))]);
  const effects = (): Effect[] => [...caseDefs().flatMap((c) => [...c.effects, ...Object.values(c.marketOverrides).flatMap((o) => o.effects ?? [])]), ...eventDefs().flatMap((e) => e.effects)];

  it('16 vaka üç pazarda da tanımlı', () => {
    expect(caseDefs().map((c) => c.id)).toEqual(Array.from({ length: 16 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`));
    for (const c of caseDefs()) expect([...c.markets].sort()).toEqual(['de', 'tr', 'us']);
  });

  it('tüm tetikleyici ve belirti metrikleri motorda eşlenmiş', () => {
    const conds: Condition[] = [...triggers().flatMap((t) => [...(t.all ?? []), ...(t.any ?? [])]), ...eventDefs().flatMap((e) => e.conditions)];
    const known = new Set(METRIC_IDS);
    const unknown = [...new Set([...conds.map((c) => c.metric), ...caseDefs().flatMap((c) => c.symptoms)])].filter((m) => !known.has(m));
    expect(unknown).toEqual([]);
  });

  it('tüm etki hedefleri motorda işleniyor', () => {
    const src = readFileSync(join(REPO, 'engine/cases/runtime.ts'), 'utf8');
    expect([...new Set(effects().map((e) => e.target))].filter((t) => !src.includes(`'${t}'`))).toEqual([]);
  });

  it('tüm tepki aksiyonları bir yoldan seçilebilir (case.respond, motor aksiyonu etiketi, hareketsizlik)', () => {
    const map = readFileSync(join(REPO, 'engine/cases/actionmap.ts'), 'utf8');
    const special = new Set(['meta.reduceEdits', ...ABSTAIN_ACTIONS]); // pencere sonunda değerlendirilir
    const acts = [...new Set(caseDefs().flatMap((c) => [...c.correctResponses, ...c.wrongResponses].map((r) => r.action)))];
    expect(acts.filter((a) => !(a in RESPONSES) && !RESPOND_ONLY.includes(a) && !special.has(a) && !map.includes(`'${a}'`))).toEqual([]);
  });

  it('her RESPOND_ONLY aksiyonu case.respond ile uygulanabilir', () => {
    expect(RESPOND_ONLY.filter((a) => !(a in RESPONSES))).toEqual([]);
    const s = game('us', 'tag');
    expect(caseTags(s, { type: 'case.respond', params: { response: 'finance.reserveTax' } })).toEqual(['finance.reserveTax']);
  });
});

describe('her vaka gerçek aksiyonlarla tetiklenir', () => {
  for (const id of Object.keys(PLAYBOOK)) {
    it(`${id}: 3 pazarın her birinde en az bir tohumda`, () => {
      const missing = MARKETS.filter((m) => !Array.from({ length: PLAYBOOK[id]!.seeds ?? 12 }, (_, i) => `${id}-${i}`).some((seed) => playUntil(m, id, seed) !== null));
      expect(missing).toEqual([]);
    });
  }
});

/** Vaka başına: doğru tepki ve yanlış tepki (gerçek aksiyonlar). Etkisi motorda modellenir; metinle değil sonuçla ölçülür. */
type Branch = (s: GameState) => Action[];
const respond = (response: string): Branch => () => [{ type: 'case.respond', params: { response } }];
const raiseBudget: Branch = (s) => {
  const c = gc(s);
  if (c) return [{ type: 'gads.set_budget', params: { campaignId: c.id, dailyBudget: c.dailyBudget * 2 } }];
  const a = s.meta.adSets[0];
  return a ? [{ type: 'meta.set_budget', params: { adSetId: a.id, dailyBudget: a.dailyBudget * 2 } }] : [];
};
interface ResponseCheck {
  good: Branch;
  bad: Branch;
  /** Varsayılan değer vekili bu vakanın koruduğu büyüklüğü ölçmüyorsa kendi ölçütü (büyük olan iyi). */
  score?: (s: GameState, id: string) => number;
  days?: number;
}
const RESPONSES_TABLE: Record<string, ResponseCheck> = {
  C01: { good: (s) => [{ type: 'gads.review_search_terms', params: { campaignId: gc(s)!.id } }, { type: 'gads.add_negatives', params: { campaignId: gc(s)!.id, classes: ['irrelevant', 'info'], breadth: 'narrow' } }], bad: raiseBudget },
  // Korunan büyüklük öğrenme sinyali: küçük setlerin hepsi 'sınırlı' kalır, birleştirmek sinyali toplar.
  C02: {
    good: respond('meta.mergeAdsets'),
    bad: (s) => [{ type: 'meta.create_adset', params: { objective: 'leads', audience: 'interest', dailyBudget: P(s) * 0.1, creativeIds: [mCr(s)], lpId: lp(s), offerId: offer(s) } }],
    score: (s) => s.meta.adSets.filter((a) => a.status === 'active').reduce((m, a) => Math.max(m, a.dailyBudget), 0), // set başına bütçe = öğrenme sinyali
    days: 30,
  },
  C03: { good: () => [{ type: 'asset.create_creative', params: { channel: 'meta' } }], bad: raiseBudget },
  C04: { good: () => [{ type: 'track.fix', params: { level: 'crm_feedback' } }], bad: raiseBudget },
  C05: { good: () => [{ type: 'track.fix', params: { level: 'server_side' } }], bad: respond('measure.removeConsentBanner') },
  // Doğru tepki reklamı geri açar (kısa vadede daha çok harcama): korunan büyüklük hesap sağlığıdır.
  C06: { good: respond('account.fixAndAppeal'), bad: respond('gads.resubmitSameAd'), score: (s) => s.accounts.google.health, days: 10 },
  // Kampanyayı durdurmak (yanlış tepki) kısa vadede nakit biriktirir; kıyas hareketsizlikle yapılır.
  C07: { good: () => [{ type: 'track.fix', params: { level: 'basic' } }], bad: () => [], score: (s) => s.history.slice(-30).reduce((a, r) => a + (r.trackedFraction?.google ?? 0), 0), days: 30 },
  C08: { good: respond('product.differentiatePositioning'), bad: (s) => [{ type: 'ops.set_price', params: { price: s.product.price * 0.75 } }] },
  C09: { good: respond('planning.adjustForSeasonality'), bad: respond('core.overhire') },
  C10: { good: respond('onboarding.firstWeekCall'), bad: raiseBudget },
  C11: { good: (s) => [{ type: 'gads.set_budget', params: { campaignId: gc(s)!.id, dailyBudget: gc(s)!.dailyBudget * 0.5 } }], bad: raiseBudget },
  C12: { good: respond('reputation.respondToReview'), bad: respond('reputation.fakeReviews') },
  C14: { good: respond('legal.buildPermissionList'), bad: respond('legal.buyList') },
  C15: { good: respond('gads.excludeBrand'), bad: raiseBudget },
  C16: { good: () => [{ type: 'ops.set_auto_reply', params: { on: true } }], bad: raiseBudget },
};

/** Vakadan sonra oynar: tepki ilk gün verilir, sonrasında başka aksiyon yok; fark yalnız tepkiden gelir. */
function after(s0: GameState, id: string, c: ResponseCheck, first: Action[]): number {
  const s = structuredClone(s0);
  for (let i = 0; i < (c.days ?? 90) && !s.outcome; i++) stepInPlace(s, i === 0 ? first : []);
  if (c.score) return c.score(s, id);
  return (s.cash + 12 * s.mrr + (s.outcome?.status === 'lost' ? -s.startCash : 0)) / s0.product.price; // değer vekili (başlangıç fiyatı katı)
}

describe('doğru tepki yanlış tepkiden iyi sonuç verir (eşli tohum)', () => {
  for (const id of Object.keys(RESPONSES_TABLE)) {
    it(id, () => {
      const c = RESPONSES_TABLE[id]!;
      const gaps: number[] = [];
      for (const m of MARKETS) {
        for (let i = 0; i < 12; i++) {
          const s = playUntil(m, id, `${id}-${i}`);
          if (s) gaps.push(after(s, id, c, c.good(s)) - after(s, id, c, c.bad(s)));
        }
      }
      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps.reduce((a, b) => a + b, 0) / gaps.length).toBeGreaterThan(0);
    });
  }
});

describe('C13: vergi karşılığı sonraki sürprizi önler', () => {
  it('karşılık, vakanın bekleme süresi bittikten sonra da tetiklemeyi keser', () => {
    const def = caseDefs().find((c) => c.id === 'C13')!;
    const s = game('de', 'c13');
    s.day = 25; // KDV gününe (day % 30 === 29) 4 gün
    s.cash = 1000;
    s.ledger.vatCollected = 500;
    expect(evalTrigger(s, def.trigger)).toBe(true);
    stepInPlace(s, [{ type: 'case.respond', params: { response: 'finance.reserveTax' } }]);
    s.day += def.trigger.cooldownDays + 1;
    s.ledger.vatCollected = s.ledger.vatRemitted + 500;
    s.cash = 1000;
    expect(evalTrigger(s, def.trigger)).toBe(false);
  });
});
