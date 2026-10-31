// Referans politikalar (test/Monte Carlo yardımcısı; nihai kötü/orta/iyi botlar sonraki aşamada).
// Durum güdümlü kontrol listesi: ilk tamamlanmamış adımın aksiyonları gönderilir (kuyruk doluyken yeni iş yok).
import type { Action, GameState } from '../core/types';

interface Step {
  done: (s: GameState) => boolean;
  act: (s: GameState) => Action[];
}

const googleLp = (s: GameState): string => s.assets.lps[0]!.id;
const offer = (s: GameState): string => s.assets.offers[0]!.id;
const gCreative = (s: GameState): string => s.assets.creatives.find((c) => c.channel === 'google')!.id;
const mCreative = (s: GameState): string => s.assets.creatives.find((c) => c.channel === 'meta')!.id;
const camp = (s: GameState) => s.google.campaigns[0];
const kwCount = (s: GameState): number => camp(s)?.adGroups.reduce((a, g) => a + g.keywords.length, 0) ?? 0;
const sent = (s: GameState, type: Action['type']): boolean => s.decisions.some((d) => d.action.type === type && d.status !== 'rejected');

function run(steps: Step[], s: GameState): Action[] {
  if (s.founder.queue.length > 0) return [];
  for (const st of steps) if (!st.done(s)) return st.act(s);
  return [];
}

const createCampaign = (budgetMult: number, strategy: 'manual' | 'maxConversions', match: 'broad' | 'phrase' | 'exact'): Step[] => [
  {
    done: (s) => !!camp(s),
    act: (s) => [{ type: 'gads.create_campaign', params: { type: 'search', dailyBudget: s.product.price * budgetMult, strategy, lpId: googleLp(s), offerId: offer(s) } }],
  },
  { done: (s) => (camp(s)?.adGroups.length ?? 0) > 0, act: (s) => [{ type: 'gads.add_adgroup', params: { campaignId: camp(s)!.id, creativeId: gCreative(s) } }] },
  {
    done: (s) => kwCount(s) > 0,
    act: (s) => [
      {
        type: 'gads.add_keywords',
        params: {
          campaignId: camp(s)!.id,
          adGroupId: camp(s)!.adGroups[0]!.id,
          keywords: match === 'broad' ? [{ theme: 'adjacent', match }, { theme: 'core', match }] : [{ theme: 'core', match: 'phrase' }, { theme: 'core', match: 'exact' }, { theme: 'brand', match: 'exact' }],
        },
      },
    ],
  },
];

/** Kötü: geniş eşleme + akıllı teklif, takip yok, sık bütçe değişikliği (öğrenmeyi sıfırlar), satışa az saat, onboarding yok. */
export function naivePolicy(s: GameState): Action[] {
  const steps: Step[] = [
    { done: (st) => sent(st, 'ops.set_alloc'), act: () => [{ type: 'ops.set_alloc', params: { sales: 1, onboarding: 0 } }] },
    ...createCampaign(2, 'maxConversions', 'broad'),
  ];
  const a = run(steps, s);
  if (a.length) return a;
  const c = camp(s);
  if (c && s.day > 5 && s.day % 9 === 0) return [{ type: 'gads.set_budget', params: { campaignId: c.id, dailyBudget: s.product.price * (s.day % 18 === 0 ? 3 : 1.5) } }];
  return [];
}

/** Orta: temel takip, phrase/exact, aylık negatif, hızlı yanıt, GBP. */
export function balancedPolicy(s: GameState): Action[] {
  const steps: Step[] = [
    { done: (st) => sent(st, 'ops.set_alloc'), act: () => [{ type: 'ops.set_alloc', params: { sales: 3, onboarding: 1.5 } }, { type: 'ops.set_auto_reply', params: { on: true } }] },
    { done: (st) => st.tracking.health >= 0.99 || st.scheduled.length > 0, act: () => [{ type: 'track.fix', params: { level: 'basic' } }] },
    ...createCampaign(1, 'manual', 'phrase'),
    { done: (st) => st.local.gbp.claimed, act: () => [{ type: 'local.optimize_gbp', params: { hours: 2 } }] },
  ];
  const a = run(steps, s);
  if (a.length) return a;
  const c = camp(s);
  if (c && s.day % 30 === 20) return [{ type: 'gads.review_search_terms', params: { campaignId: c.id } }];
  if (c && s.day % 30 === 21) return [{ type: 'gads.add_negatives', params: { campaignId: c.id, classes: ['irrelevant', 'info'], breadth: 'narrow' } }];
  return [];
}

/** İyi: takibi önce kurar, küçük bütçe exact/phrase, ücretsiz kanallar (GBP, referans, içerik, saha), onboarding yatırımı, A/B, hızlı yanıt. */
export function carefulPolicy(s: GameState): Action[] {
  const steps: Step[] = [
    { done: (st) => sent(st, 'ops.set_alloc'), act: () => [{ type: 'ops.set_alloc', params: { sales: 3, onboarding: 2 } }, { type: 'ops.set_auto_reply', params: { on: true } }] },
    { done: (st) => st.tracking.health >= 0.99 || st.scheduled.some((x) => x.level === 'basic'), act: () => [{ type: 'track.fix', params: { level: 'basic' } }] },
    { done: (st) => st.local.referral.active, act: () => [{ type: 'local.set_referral', params: { on: true } }] },
    { done: (st) => st.local.gbp.claimed, act: () => [{ type: 'local.optimize_gbp', params: { hours: 2 } }] },
    { done: (st) => st.tracking.consentMode || st.scheduled.some((x) => x.level === 'consent_mode'), act: () => [{ type: 'track.fix', params: { level: 'consent_mode' } }] },
    ...createCampaign(0.5, 'manual', 'phrase'),
    { done: (st) => st.founder.docsStock > 0, act: () => [{ type: 'ops.build_docs', params: { hours: 4 } }] },
    { done: (st) => st.local.content.seo > 0, act: () => [{ type: 'local.content', params: { kind: 'seo', hours: 3 } }] },
    { done: (st) => st.assets.lps.length > 1, act: () => [{ type: 'asset.create_lp', params: {} }] },
    { done: (st) => st.tests.ab.length > 0, act: (st) => [{ type: 'asset.start_ab_test', params: { a: st.assets.lps[0]!.id, b: st.assets.lps[1]!.id, days: 30, split: 0.5 } }] },
  ];
  const a = run(steps, s);
  if (a.length) return a;
  const c = camp(s);
  void mCreative;
  if (c && s.day % 30 === 15) return [{ type: 'gads.review_search_terms', params: { campaignId: c.id } }];
  if (c && s.day % 30 === 16) return [{ type: 'gads.add_negatives', params: { campaignId: c.id, classes: ['irrelevant', 'info'], breadth: 'narrow' } }];
  if (s.day % 30 === 25 && s.cohorts.length > 0) return [{ type: 'local.request_reviews', params: { count: 3 } }];
  if (s.day > 20 && s.day % 14 === 5) return [{ type: 'local.field_sales', params: { hours: 2 } }];
  return [];
}
