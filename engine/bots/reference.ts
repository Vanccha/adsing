// Referans politikalar (test / Monte Carlo / denge ayarı): kötü, orta, iyi.
// Botlar yalnızca oyuncunun görebileceği bilgiyi kullanır (gözlenen metrikler, posterior'lar, aksiyon geçmişi, vaka bildirimleri);
// gizli latent'lere (q, relQ) bakmazlar. İyi bot "gerçekten iyi bir uygulayıcı" gibi davranır:
// takip önce, exact/phrase, negatif kelime, yeterli veriyle test ve kazananı seçme, yaratıcı rotasyonu, hızlı yanıt, onboarding yatırımı,
// ücretsiz/yerel kanallar (GBP, yorum, referans, içerik, saha), marjinal CAC'ye göre bütçe, vakalara doğru tepki.
import { founderCapacity } from '../core/env';
import type { Policy } from '../core/run';
import { K } from '../core/constants';
import type { Action, AdMessage, ContentTopic, GameState } from '../core/types';
import { unitEconomics } from '../funnel/finance';
import { abResult } from '../selectors';

type Task = {
  /** Bu görev şimdi yapılabilir/yapılmalı mı? */
  due: (s: GameState) => boolean;
  act: (s: GameState) => Action[];
  /** Kurucu saati tahmini (günlük serbest saat bütçesine sığmalı). */
  hours: number;
  /** Büyük tek seferlik iş: fazla mesaiye (kapasitenin %15'i) izin ver. */
  overtime?: boolean;
};

const GOOGLE_LP = (s: GameState): string => s.assets.lps[0]!.id;
const OFFER = (s: GameState): string => s.assets.offers[0]!.id;
const camp = (s: GameState) => s.google.campaigns[0];
const kwCount = (s: GameState): number => camp(s)?.adGroups.reduce((a, g) => a + g.keywords.length, 0) ?? 0;
const sent = (s: GameState, type: Action['type'], pred?: (a: Action) => boolean): boolean => s.decisions.some((d) => d.action.type === type && d.status !== 'rejected' && (!pred || pred(d.action)));
const lastSent = (s: GameState, type: Action['type'], pred?: (a: Action) => boolean): number => {
  for (let i = s.decisions.length - 1; i >= 0; i--) {
    const d = s.decisions[i]!;
    if (d.action.type === type && d.status !== 'rejected' && (!pred || pred(d.action))) return d.day;
  }
  return -9999;
};
const every = (s: GameState, type: Action['type'], gap: number, pred?: (a: Action) => boolean): boolean => s.day - lastSent(s, type, pred) >= gap;
const customers = (s: GameState): number => s.cohorts.reduce((a, c) => a + c.alive, 0);

/** Bugün eylemlere ayrılabilecek serbest saat (sabit tahsisler düşüldükten sonra). */
function freeHours(s: GameState): number {
  const cap = founderCapacity(s);
  return Math.max(0, cap - Math.min(s.founder.reserved.sales + s.founder.reserved.onboarding, cap));
}

/** Görev listesinden bugünün aksiyonlarını seçer: sıralı, serbest saate sığdığı sürece (kuyruk doluyken yeni iş yok). */
function planDay(tasks: Task[], s: GameState, maxTasks = 3): Action[] {
  if (s.founder.queue.length > 0) return [];
  let room = freeHours(s);
  const out: Action[] = [];
  for (const t of tasks) {
    if (out.length >= maxTasks) break;
    if (!t.due(s)) continue;
    if (t.hours > room + (t.overtime ? 0.15 * founderCapacity(s) : 0) + 1e-9) continue;
    out.push(...t.act(s));
    room -= t.hours;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------
// KÖTÜ: geniş eşleme + akıllı teklif, takip yok, sık bütçe değişikliği (öğrenmeyi sıfırlar), satışa az saat, onboarding yok.
// ---------------------------------------------------------------------------------------------------------------------------
export function naivePolicy(s: GameState): Action[] {
  const tasks: Task[] = [
    { hours: 0, due: (st) => !sent(st, 'ops.set_alloc'), act: () => [{ type: 'ops.set_alloc', params: { sales: 1, onboarding: 0 } }] },
    {
      hours: 2,
      due: (st) => !camp(st),
      act: (st) => [{ type: 'gads.create_campaign', params: { type: 'search', dailyBudget: st.product.price * 2, strategy: 'maxConversions', lpId: GOOGLE_LP(st), offerId: OFFER(st) } }],
    },
    {
      hours: 0.5,
      due: (st) => !!camp(st) && (camp(st)?.adGroups.length ?? 0) === 0,
      act: (st) => [{ type: 'gads.add_adgroup', params: { campaignId: camp(st)!.id, creativeId: st.assets.creatives.find((c) => c.channel === 'google')!.id } }],
    },
    {
      hours: 0.5,
      due: (st) => !!camp(st) && (camp(st)?.adGroups.length ?? 0) > 0 && kwCount(st) === 0,
      act: (st) => [{ type: 'gads.add_keywords', params: { campaignId: camp(st)!.id, adGroupId: camp(st)!.adGroups[0]!.id, keywords: [{ theme: 'adjacent', match: 'broad' }, { theme: 'core', match: 'broad' }] } }],
    },
  ];
  const a = planDay(tasks, s);
  if (a.length) return a;
  const c = camp(s);
  if (c && s.day > 5 && s.day % 9 === 0) return [{ type: 'gads.set_budget', params: { campaignId: c.id, dailyBudget: s.product.price * (s.day % 18 === 0 ? 3 : 1.5) } }];
  return [];
}

// ---------------------------------------------------------------------------------------------------------------------------
// İYİ: yapılandırılabilir uygulayıcı. cfg ile veri eşiği (az veri / yeterli veri) ve ücretsiz kanal yoğunluğu değiştirilebilir.
// ---------------------------------------------------------------------------------------------------------------------------
export interface CarefulConfig {
  /** A/B ve yaratıcı kararı için gereken asgari ziyaret/gösterim (kolda). Az-veri varyantı 10 tıklama kullanır. */
  minVisitsPerArm: number;
  /** Karar için gereken P(kazanan daha iyi). */
  confidence: number;
  /** A/B testi planlanan süresi (gün): küçük hesapta yeterli ziyaret ancak uzun testte birikir. */
  abDays: number;
  /** Kanal CAC'ı için kabul edilen azami geri ödeme süresi (ay). */
  channelPaybackMonths: number;
  /** Başlangıç günlük Google bütçesi (fiyat katı). */
  startBudgetMult: number;
  /** Aylık hedef Google bütçesi tavanı (fiyat katı olarak, günlük). */
  maxBudgetMult: number;
  /** Günlük sosyal içerik saati (hafta içi). */
  socialHours: number;
  /** Haftalık SEO saati. */
  seoHoursWeekly: number;
  /** Haftalık saha satışı saati. */
  fieldHoursWeekly: number;
  /** Beceri anahtarları (orta bot bunların çoğunu kapatır). */
  prioritizeLeads: boolean; // taze lead önce aranır
  hireReps: boolean; // ulaşılamayan lead payı yüksekse satış elemanı
  abTests: boolean; // açılış sayfası A/B testi
  reactToCases: boolean; // vaka bildirimlerine doğru tepki
  consentMode: boolean; // onay modu / sunucu tarafı takip
  dynamicAlloc: boolean; // satış/onboarding tahsisi lead akışına göre
  reviews: boolean; // düzenli yorum isteme
  contentDecisions: boolean; // mesaj, konu ve reklam grubu yapısı kararları
  marginalBudget: boolean; // bütçeyi gözlenen kanal CAC'ına göre ayarla
}

export const CAREFUL_DEFAULT: CarefulConfig = {
  minVisitsPerArm: 80,
  confidence: 0.85,
  abDays: 60,
  channelPaybackMonths: 15,
  startBudgetMult: 1.2,
  maxBudgetMult: 3,
  socialHours: 1,
  seoHoursWeekly: 2,
  fieldHoursWeekly: 2,
  prioritizeLeads: true,
  hireReps: true,
  abTests: true,
  reactToCases: true,
  consentMode: true,
  dynamicAlloc: true,
  reviews: true,
  contentDecisions: true,
  marginalBudget: true,
};

/** Orta: standart kontrol listesi; test, vaka tepkisi, öncelikli arama, satış elemanı ve dinamik tahsis yok. */
export const BALANCED_CONFIG: Partial<CarefulConfig> = {
  socialHours: 0.5,
  seoHoursWeekly: 0,
  fieldHoursWeekly: 0,
  prioritizeLeads: false,
  hireReps: false,
  abTests: false,
  reactToCases: false,
  consentMode: false,
  dynamicAlloc: false,
  contentDecisions: false,
  marginalBudget: false,
  startBudgetMult: 0.8,
  maxBudgetMult: 1,
};

export function makeCarefulPolicy(cfg: Partial<CarefulConfig> = {}): Policy {
  const c: CarefulConfig = { ...CAREFUL_DEFAULT, ...cfg };
  return (s: GameState): Action[] => {
    // Vakalara doğru tepki: aktif vakaya göre ilk uygun aksiyon (hafif, saat harcar)
    const react = c.reactToCases ? reactToCases(s) : [];
    const dynamic = c.dynamicAlloc ? dynamicAlloc(s) : s.day === 0 ? [{ type: 'ops.set_alloc', params: { sales: 3, onboarding: 1.5 } } as Action] : [];
    const tasks = carefulTasks(c);
    const planned = planDay(tasks, s);
    return [...dynamic, ...react, ...planned];
  };
}

/** Son 14 günde ortalama lead/gün ve ulaşılamayan payı. */
function leadStats(s: GameState): { perDay: number; unreachableShare: number } {
  const h = s.history.slice(-14);
  if (h.length === 0) return { perDay: 2, unreachableShare: 0 };
  const leads = h.reduce((a, r) => a + r.stages.leads, 0);
  const un = h.reduce((a, r) => a + (r.unreachable ?? 0), 0);
  return { perDay: leads / h.length, unreachableShare: leads > 0 ? un / leads : 0 };
}

const wantsRep = (s: GameState): boolean => {
  const st = leadStats(s);
  const repCost = (s.params['cost.rep_monthly'] as number | undefined) ?? 30 * s.product.price;
  return s.day >= 45 && s.reps < 3 && st.perDay > 7 && st.unreachableShare > 0.22 && s.cash > 8 * repCost && every(s, 'ops.hire_rep', 25);
};

/** Satış/onboarding tahsisini lead akışına göre ayarlar (maliyetsiz). */
function dynamicAlloc(s: GameState): Action[] {
  if (s.day % 3 !== 0) return [];
  const { perDay } = leadStats(s);
  const repLeads = s.reps * 12;
  const sales = Math.min(4, Math.max(1, Math.ceil(Math.max(0, perDay - repLeads) * 0.4 * 1.4 * 2) / 2));
  const onboarding = customers(s) >= 5 ? 2 : 1;
  if (!sent(s, 'ops.set_alloc') || s.founder.reserved.sales !== sales || s.founder.reserved.onboarding !== onboarding) return [{ type: 'ops.set_alloc', params: { sales, onboarding } }];
  return [];
}

/** Aktif vakaya, vakanın "doğru" listesinden ilk uygulanabilir tepkiyi ver (günde en fazla bir). */
function reactToCases(s: GameState): Action[] {
  const a = s.cases.active.find((x) => x.response === 'pending' && s.day - x.triggerDay <= 6);
  if (!a || s.founder.queue.length > 0) return [];
  const cp = camp(s);
  switch (a.id) {
    case 'C01':
    case 'C15':
      return cp && every(s, 'gads.review_search_terms', 10) ? [{ type: 'gads.review_search_terms', params: { campaignId: cp.id } }] : cp ? [{ type: 'gads.add_negatives', params: { campaignId: cp.id, classes: ['irrelevant', 'info'], breadth: 'narrow' } }] : [];
    case 'C04':
      return every(s, 'track.fix', 20, (x) => x.type === 'track.fix' && x.params.level === 'crm_feedback') && !s.tracking.crmFeedback ? [{ type: 'track.fix', params: { level: 'crm_feedback' } }] : [];
    case 'C05':
    case 'C07':
      if (s.tracking.health < 0.99 && !s.scheduled.some((x) => x.level === 'basic')) return [{ type: 'track.fix', params: { level: 'basic' } }];
      if (!s.tracking.serverSide && !s.scheduled.some((x) => x.level === 'server_side') && s.cash > s.product.price * 20) return [{ type: 'track.fix', params: { level: 'server_side' } }];
      return [];
    case 'C06':
      return [{ type: 'case.respond', params: { response: 'account.fixAndAppeal' } }];
    case 'C08':
      return [{ type: 'case.respond', params: { response: 'product.differentiatePositioning' } }];
    case 'C10':
      return [{ type: 'case.respond', params: { response: 'onboarding.firstWeekCall' } }];
    case 'C12':
      return [{ type: 'case.respond', params: { response: 'reputation.respondToReview' } }];
    case 'C13':
      return [{ type: 'case.respond', params: { response: 'finance.reserveTax' } }];
    case 'C14':
      return [{ type: 'case.respond', params: { response: 'legal.buildPermissionList' } }];
    case 'C16':
      return !s.autoReply ? [{ type: 'ops.set_auto_reply', params: { on: true } }] : [{ type: 'case.respond', params: { response: 'funnel.scheduleResponseSlots' } }];
    case 'C09':
      return [{ type: 'case.respond', params: { response: 'planning.adjustForSeasonality' } }];
    case 'C11':
      return cp ? [{ type: 'gads.set_budget', params: { campaignId: cp.id, dailyBudget: cp.dailyBudget * 0.7 } }] : [];
    default:
      return [];
  }
}

/** Karar verilebilir ilk A/B testi: mevcut LP testin A kolu, iki kolda da yeterli veri var, sonuç güven eşiğini geçiyor. */
function decidableTest(s: GameState, c: CarefulConfig): { test: GameState['tests']['ab'][number]; bWins: boolean } | null {
  const cur = camp(s)?.lpId;
  for (const t of s.tests.ab) {
    if (t.a !== cur || (t.status !== 'running' && t.status !== 'done')) continue;
    if (t.statsA.n < c.minVisitsPerArm || t.statsB.n < c.minVisitsPerArm) continue;
    const r = abResult(s, t.id);
    if (!r) continue;
    const bWins = r.pAGreaterB <= 1 - c.confidence;
    const aWins = r.pAGreaterB >= c.confidence;
    if (bWins) return { test: t, bWins };
    if (aWins && t.status === 'running') return { test: t, bWins };
  }
  return null;
}

/** Pazar araştırmasının gösterdiği en uyumlu mesaj (oyuncunun Stüdyo'daki pazar notuyla aynı bilgi). */
const marketMessage = (s: GameState): AdMessage => {
  const fit = K.messageFit[s.marketId];
  return (Object.keys(fit) as AdMessage[]).reduce((a, b) => (fit[b] > fit[a] ? b : a));
};
/** SEO'da satın alma niyetine yakın, sosyalde hikâye ağırlıklı konular dönüşümlü kullanılır. */
const topicFor = (s: GameState, kind: 'seo' | 'social'): ContentTopic => {
  const list: ContentTopic[] = kind === 'seo' ? ['comparison', 'local'] : ['story', 'howto', 'local'];
  return list[Math.floor(s.day / 7) % list.length]!;
};
const googleCreative = (s: GameState, c: CarefulConfig): string => {
  const list = s.assets.creatives.filter((x) => x.channel === 'google' && x.availableDay <= s.day);
  return (c.contentDecisions ? list.find((x) => x.message === marketMessage(s)) : undefined)?.id ?? list[0]!.id;
};

function carefulTasks(c: CarefulConfig): Task[] {
  const wk = (s: GameState): boolean => founderCapacity(s) > 5; // hafta içi
  return [
    // --- Temel (ilk günler): takip önce
    { hours: 3, due: (s) => s.tracking.health < 0.99 && !s.scheduled.some((x) => x.level === 'basic'), act: () => [{ type: 'track.fix', params: { level: 'basic' } }] },
    { hours: 1, due: (s) => c.prioritizeLeads && (s.cases.flags.lead_priority?.until ?? 0) <= s.day, act: () => [{ type: 'case.respond', params: { response: 'funnel.prioritizeLeads' } }] },
    { hours: 1, due: (s) => !s.autoReply, act: () => [{ type: 'ops.set_auto_reply', params: { on: true } }] },
    { hours: 1, due: (s) => !s.local.referral.active, act: (s) => [{ type: 'local.set_referral', params: { on: true, reward: s.product.price } }] },
    { hours: 2, due: (s) => !s.local.gbp.claimed, act: () => [{ type: 'local.optimize_gbp', params: { hours: 2 } }] },
    { hours: 4, due: (s) => c.consentMode && !s.tracking.consentMode && !s.scheduled.some((x) => x.level === 'consent_mode'), act: () => [{ type: 'track.fix', params: { level: 'consent_mode' } }] },
    // --- Google: exact/phrase çekirdek + ayrı marka grubu, pazara uygun mesaj
    { hours: 2, due: (s) => c.contentDecisions && s.day >= 1 && !s.assets.creatives.some((x) => x.message), act: (s) => [{ type: 'asset.create_creative', params: { channel: 'google', message: marketMessage(s) } }] },
    {
      hours: 2,
      due: (s) => !camp(s) && s.day >= 2 && (!c.contentDecisions || s.assets.creatives.some((x) => x.message && x.availableDay <= s.day)),
      act: (s) => [{ type: 'gads.create_campaign', params: { type: 'search', dailyBudget: s.product.price * c.startBudgetMult, strategy: 'manual', manualBid: (s.params['gads.search.cpc'] as number) * 1.3, lpId: s.assets.lps[0]!.id, offerId: OFFER(s) } }],
    },
    {
      hours: 0.5,
      due: (s) => !!camp(s) && (camp(s)?.adGroups.length ?? 0) === 0,
      act: (s) => [{ type: 'gads.add_adgroup', params: { campaignId: camp(s)!.id, creativeId: googleCreative(s, c) } }],
    },
    {
      hours: 0.5,
      due: (s) => !!camp(s) && (camp(s)?.adGroups.length ?? 0) > 0 && kwCount(s) === 0,
      act: (s) => [{ type: 'gads.add_keywords', params: { campaignId: camp(s)!.id, adGroupId: camp(s)!.adGroups[0]!.id, keywords: [{ theme: 'core', match: 'exact' }, { theme: 'core', match: 'phrase' }, ...(c.contentDecisions ? [] : [{ theme: 'brand', match: 'exact' } as const])] } }],
    },
    { hours: 0.5, due: (s) => c.contentDecisions && !!camp(s) && camp(s)!.adGroups.length === 1 && kwCount(s) > 0, act: (s) => [{ type: 'gads.add_adgroup', params: { campaignId: camp(s)!.id, creativeId: googleCreative(s, c) } }] },
    {
      hours: 0.5,
      due: (s) => c.contentDecisions && !!camp(s) && camp(s)!.adGroups.length === 2 && camp(s)!.adGroups[1]!.keywords.length === 0,
      act: (s) => [{ type: 'gads.add_keywords', params: { campaignId: camp(s)!.id, adGroupId: camp(s)!.adGroups[1]!.id, keywords: [{ theme: 'brand', match: 'exact' }] } }],
    },
    { hours: 1, due: (s) => !!camp(s) && kwCount(s) > 0 && s.day >= 14 && every(s, 'gads.review_search_terms', 30), act: (s) => [{ type: 'gads.review_search_terms', params: { campaignId: camp(s)!.id } }] },
    {
      hours: 0.5,
      due: (s) => !!camp(s) && camp(s)!.searchTerms !== null && camp(s)!.negatives.length === 0,
      act: (s) => [{ type: 'gads.add_negatives', params: { campaignId: camp(s)!.id, classes: ['irrelevant', 'info'], breadth: 'narrow' } }],
    },
    // --- Onboarding / dokümantasyon
    { hours: 3, due: (s) => s.founder.docsStock < 0.04 && s.day >= 3, act: () => [{ type: 'ops.build_docs', params: { hours: 3 } }] },
    // --- Ücretsiz kanallar: içerik (sosyal günlük, SEO haftalık), saha, yorum
    { hours: c.socialHours, due: (s) => c.socialHours > 0 && wk(s) && s.day >= 3, act: (s) => [{ type: 'local.content', params: { kind: 'social', hours: c.socialHours, ...(c.contentDecisions ? { topic: topicFor(s, 'social') } : {}) } }] },
    { hours: c.seoHoursWeekly, due: (s) => c.seoHoursWeekly > 0 && s.day >= 5 && every(s, 'local.content', 7, (a) => a.type === 'local.content' && a.params.kind === 'seo'), act: (s) => [{ type: 'local.content', params: { kind: 'seo', hours: c.seoHoursWeekly, ...(c.contentDecisions ? { topic: topicFor(s, 'seo') } : {}) } }] },
    { hours: c.fieldHoursWeekly, due: (s) => c.fieldHoursWeekly > 0 && s.day >= 21 && every(s, 'local.field_sales', 7), act: () => [{ type: 'local.field_sales', params: { hours: c.fieldHoursWeekly } }] },
    { hours: 1, due: (s) => c.reviews && customers(s) >= 5 && every(s, 'local.request_reviews', 30), act: (s) => [{ type: 'local.request_reviews', params: { count: Math.min(5, customers(s)) } }] },
    { hours: 1, due: (s) => s.local.gbp.claimed && s.day % 45 === 0, act: () => [{ type: 'local.optimize_gbp', params: { hours: 1 } }] },
    // --- Satış elemanı: ulaşılamayan lead payı yüksekse (tahsisi kısıp bir sonraki hafta içi günü işe al)
    { hours: 0, due: (s) => c.hireReps && wantsRep(s) && s.founder.reserved.sales > 1.5 && founderCapacity(s) > 5, act: () => [{ type: 'ops.set_alloc', params: { sales: 1, onboarding: 1 } }] },
    { hours: 6, overtime: true, due: (s) => c.hireReps && wantsRep(s) && s.founder.reserved.sales <= 1.5 && founderCapacity(s) > 5, act: () => [{ type: 'ops.hire_rep', params: {} }] },
    // --- Test: LP B + A/B; kazananı seç
    { hours: 4, due: (s) => c.abTests && s.assets.lps.length < 2 && s.day >= 10 && s.cash > s.product.price * 12, act: (s) => [{ type: 'asset.create_lp', params: c.contentDecisions ? { message: marketMessage(s) } : {} }] },
    {
      hours: 2,
      due: (s) => c.abTests && s.assets.lps.length >= 2 && !s.tests.ab.some((t) => t.status === 'running') && s.tests.ab.length < s.assets.lps.length - 1 && !!camp(s) && s.day >= 12,
      act: (s) => {
        const cur = camp(s)!.lpId;
        const other = s.assets.lps.find((l) => l.id !== cur && !s.tests.ab.some((t) => t.a === l.id || t.b === l.id))!;
        return [{ type: 'asset.start_ab_test', params: { a: cur, b: other.id, days: c.abDays, split: 0.5 } }];
      },
    },
    // Karar: yeterli veri olunca (erken bakış dahil) kazananı seç, sonuçlanan testi durdur. Süre bittiğinde belirsizse mevcut LP kalır.
    {
      hours: 0.25,
      due: (s) => c.abTests && !!camp(s) && decidableTest(s, c) !== null,
      act: (s) => {
        const d = decidableTest(s, c)!;
        const out: Action[] = [];
        if (d.bWins) out.push({ type: 'gads.set_lp', params: { campaignId: camp(s)!.id, lpId: d.test.b } });
        if (d.test.status === 'running') out.push({ type: 'asset.stop_ab_test', params: { testId: d.test.id } });
        return out;
      },
    },
    { hours: 4, due: (s) => c.abTests && s.assets.lps.length === 2 && s.tests.ab.length >= 1 && !s.tests.ab.some((t) => t.status === 'running') && s.day >= 60 && s.cash > s.product.price * 12, act: () => [{ type: 'asset.create_lp', params: {} }] },
    // --- Bütçe: CRM'de gözlenen kanal CAC'ına göre. Bütçe bağlayıcı değilse (sıralama kaybı) artırmak işe yaramaz, kesmek de gereksizdir.
    {
      hours: 0.2,
      due: (s) => c.marginalBudget && !!camp(s) && s.day >= 75 && s.day % 14 === 0, // önce ilk denemeler sonuçlansın
      act: (s) => {
        const cp = camp(s)!;
        const h = s.history.slice(-120); // deneme süresi + gürültü: kısa pencere küçük sayılarda yanıltır
        const spend = h.reduce((a, r) => a + (r.spend.google ?? 0), 0);
        const won = h.reduce((a, r) => a + (r.newCustomers.google ?? 0), 0);
        const recent = s.history.slice(-14).reduce((a, r) => a + (r.spend.google ?? 0), 0);
        const budgetBinds = recent >= 0.7 * cp.dailyBudget * 14;
        const max = Math.min(s.product.price * c.maxBudgetMult, s.cash / 90); // nakit koruması: en az 3 aylık reklam parası kalsın
        // Geri ödeme kuralı: erken dönem churn'ü LTV'yi olduğundan düşük gösterir, kanal kararı için geri ödeme daha sağlam ölçüttür
        const econ = unitEconomics(s, 90);
        const limit = econ.arpa * econ.grossMargin * c.channelPaybackMonths;
        if (won === 0) return spend > 2 * limit ? [{ type: 'gads.set_budget', params: { campaignId: cp.id, dailyBudget: Math.max(s.product.price * 0.2, cp.dailyBudget * 0.8) } }] : [];
        const obs = spend / won;
        if (obs < limit && budgetBinds && cp.dailyBudget < max) return [{ type: 'gads.set_budget', params: { campaignId: cp.id, dailyBudget: Math.min(max, cp.dailyBudget * 1.2) } }];
        if (obs > 1.4 * limit || cp.dailyBudget > max) return [{ type: 'gads.set_budget', params: { campaignId: cp.id, dailyBudget: Math.max(s.product.price * 0.2, cp.dailyBudget * 0.8) } }];
        return [];
      },
    },
  ];
}

export const carefulPolicy: Policy = makeCarefulPolicy();
/** Az veri varyantı: 10 ziyarette en öndeki kolu kazanan ilan eder (ilişki 7 kabul testi için). */
export const carefulPolicyFewData: Policy = makeCarefulPolicy({ minVisitsPerArm: 10, confidence: 0.5 });

/** Orta bot: iyi botun beceri anahtarları kısılmış hali (aynı kod yolu; merdiven tutarlı kalır). */
export const balancedPolicy: Policy = makeCarefulPolicy(BALANCED_CONFIG);
