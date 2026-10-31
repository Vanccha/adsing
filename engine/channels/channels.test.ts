import { describe, expect, it } from 'vitest';
import { planCampaign } from './google';
import { planAdSet, messagingMult } from './meta';
import { geoKernel } from './geo';
import { days, doDay, fx, withGoogle, withMeta } from '../test-fixtures/helpers';
import { runDays } from '../core/run';
import { carefulPolicy } from '../bots/reference';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('Google Ads', () => {
  it('eşleme türü: broad daha fazla alakasız/bilgi sızıntısı, exact daha az hacim', () => {
    const mk = (match: 'exact' | 'phrase' | 'broad') => {
      const s = fx('mt');
      withGoogle(s, { match, budget: 1e6 });
      const p = planCampaign(s, s.google.campaigns[0]!);
      const bad = sum(p.rows.filter((r) => r.cls === 'irrelevant' || r.cls === 'info').map((r) => r.impr * r.ctr));
      return { p, leak: bad / p.clicks };
    };
    const e = mk('exact');
    const ph = mk('phrase');
    const b = mk('broad');
    expect(b.leak).toBeGreaterThan(ph.leak);
    expect(ph.leak).toBeGreaterThan(e.leak);
    expect(b.p.clicks).toBeGreaterThan(e.p.clicks);
  });
  it('daha yüksek teklif => daha çok gösterim, ödenen CPC teklifi aşmaz (ikinci fiyat benzeri)', () => {
    const lo = fx('bid');
    const hi = fx('bid');
    for (const [s, m] of [[lo, 0.8], [hi, 2.0]] as const) {
      withGoogle(s, { budget: 1e6 });
      s.google.campaigns[0]!.manualBid = (s.params['gads.search.cpc'] as number) * m;
    }
    const pl = planCampaign(lo, lo.google.campaigns[0]!);
    const ph = planCampaign(hi, hi.google.campaigns[0]!);
    expect(ph.impressions).toBeGreaterThan(pl.impressions);
    for (const r of ph.rows) expect(r.cpc).toBeLessThanOrEqual((hi.params['gads.search.cpc'] as number) * 2.0 + 1e-9);
  });
  it('gösterim payı: bütçe ve rank kaybı ayrı raporlanır', () => {
    const s = fx('is');
    withGoogle(s, { budget: 5 });
    const p = planCampaign(s, s.google.campaigns[0]!);
    expect(p.isLostBudget).toBeGreaterThan(0.1);
    expect(p.isLostRank).toBeGreaterThan(0);
    expect(p.isShare + p.isLostBudget + p.isLostRank).toBeCloseTo(1, 6);
    const rich = fx('is');
    withGoogle(rich, { budget: 1e6 });
    expect(planCampaign(rich, rich.google.campaigns[0]!).isLostBudget).toBeCloseTo(0, 9);
  });
  it('QS bileşenleri: daha iyi yaratıcı/LP aynı teklifle daha ucuz tık ve daha çok gösterim', () => {
    const lo = fx('qs');
    const hi = fx('qs');
    for (const s of [lo, hi]) withGoogle(s, { budget: 1e6 });
    hi.assets.lps[0]!.q = 1.8;
    lo.assets.lps[0]!.q = 0.3;
    const pl = planCampaign(lo, lo.google.campaigns[0]!);
    const ph = planCampaign(hi, hi.google.campaigns[0]!);
    expect(ph.avgQs).toBeGreaterThan(pl.avgQs);
    expect(ph.impressions).toBeGreaterThan(pl.impressions);
  });
  it('PMax: eşleme kontrolü yok, marka yamama artımsal olmayan lead üretir', () => {
    const s = fx('pm');
    doDay(s, [{ type: 'gads.create_campaign', params: { type: 'pmax', dailyBudget: 300, strategy: 'maxConversions', lpId: s.assets.lps[0]!.id, offerId: s.assets.offers[0]!.id } }]);
    const c = s.google.campaigns[0]!;
    expect(c.type).toBe('pmax');
    const p = planCampaign(s, c);
    expect(p.rows.some((r) => r.cls === 'brand')).toBe(true);
    expect(doDay(s, [{ type: 'gads.add_adgroup', params: { campaignId: c.id, creativeId: s.assets.creatives[0]!.id } }]).actionResults[0]!.status).toBe('rejected');
    expect(doDay(s, [{ type: 'gads.set_strategy', params: { campaignId: c.id, strategy: 'manual' } }]).actionResults[0]!.status).toBe('rejected');
    days(s, 60);
    const g = s.funnel.byChannel.google!;
    expect(g.leads).toBeGreaterThan(5);
    expect(g.incrLeads).toBeLessThan(g.leads); // artımsal olmayan pay var
  });
  it('arama terimleri raporu incelenince sınıf kırılımı görünür', () => {
    const s = fx('st');
    withGoogle(s, { match: 'broad', budget: 100 });
    days(s, 10);
    doDay(s, [{ type: 'gads.review_search_terms', params: { campaignId: s.google.campaigns[0]!.id } }]);
    const st = s.google.campaigns[0]!.searchTerms!;
    expect(st.rows.map((r) => r.cls)).toContain('irrelevant');
    expect(sum(st.rows.map((r) => r.clicks))).toBeGreaterThan(0);
  });
  it('askıya alınan hesapta teslimat durur', () => {
    const s = fx('sus');
    withGoogle(s, { budget: 100 });
    s.accounts.google.suspendedUntil = 20;
    days(s, 10);
    expect(sum(s.history.map((h) => h.spend.google ?? 0))).toBe(0);
    days(s, 15);
    expect(sum(s.history.map((h) => h.spend.google ?? 0))).toBeGreaterThan(0);
  });
  it('abartılı (bold) yaratıcı CTR’yi artırır ama hesap sağlığı riski taşır', () => {
    const s = fx('bold');
    doDay(s, [{ type: 'asset.create_creative', params: { channel: 'google', bold: true } }]);
    const bold = s.assets.creatives.find((c) => c.bold)!;
    expect(bold.bold).toBe(true);
    let drops = 0;
    for (let i = 0; i < 40; i++) {
      const t = fx(`bold${i}`);
      t.assets.creatives.push({ ...bold, id: 'crB', availableDay: 0 });
      withGoogle(t, { budget: 50 });
      t.google.campaigns[0]!.adGroups[0]!.creativeId = 'crB';
      days(t, 120);
      if (t.accounts.google.strikes > 0 || t.events.some((e) => e.id === 'ad_disapproved')) drops++;
    }
    expect(drops).toBeGreaterThan(0);
  });
});

describe('Meta Ads', () => {
  it('Advantage+: veri ve takip bol ise verimli, az ise zayıf', () => {
    const rich = fx('adv');
    withMeta(rich, { audience: 'advantage', budget: 100 });
    rich.meta.adSets[0]!.learning.events = [30, 30, 30, 30, 30, 30, 30];
    rich.tracking.health = 1;
    const poor = fx('adv');
    withMeta(poor, { audience: 'advantage', budget: 100 });
    poor.meta.adSets[0]!.learning.events = [0, 0, 0, 0, 0, 0, 0];
    poor.tracking.health = 0.3;
    const pr = planAdSet(rich, rich.meta.adSets[0]!);
    const pp = planAdSet(poor, poor.meta.adSets[0]!);
    expect(pr.leads / pr.spend).toBeGreaterThan(pp.leads / pp.spend);
  });
  it('öğrenme/limited: learning_limited daha pahalı teslimat', () => {
    const a = fx('lim');
    const b = fx('lim');
    withMeta(a);
    withMeta(b);
    b.meta.adSets[0]!.learning.state = 'limited';
    expect(planAdSet(b, b.meta.adSets[0]!).cpm).toBeGreaterThan(planAdSet(a, a.meta.adSets[0]!).cpm);
  });
  it('çok reklam seti + küçük bütçe => hepsi learning_limited (bölünmüş veri)', () => {
    const s = fx('split');
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(`s${i}`);
    for (let i = 0; i < 6; i++) {
      withMeta(s, { budget: 8 });
      s.meta.adSets[i]!.learning = { state: 'learning', sinceReset: 0, resets: 0, events: [] };
    }
    days(s, 14);
    expect(s.meta.adSets.every((a) => a.learning.state === 'limited')).toBe(true);
  });
  it('mesajlaşma reklamı: WhatsApp pazarında (TR) çarpan yüksek; lead çürümesi daha hızlı', () => {
    const us = fx('msg', {}, 'us');
    const tr = fx('msg', {}, 'tr');
    expect(messagingMult(tr)).toBeGreaterThan(messagingMult(us));
    withMeta(tr);
    tr.meta.adSets[0]!.objective = 'messages';
    const p = planAdSet(tr, tr.meta.adSets[0]!);
    expect(p.mode).toBe('message');
    expect(p.tauMult).toBeLessThan(1);
  });
  it('askıya alınan hesapta Meta teslimatı durur', () => {
    const s = fx('msus');
    withMeta(s);
    s.accounts.meta.permanent = true;
    days(s, 10);
    expect(sum(s.history.map((h) => h.spend.meta ?? 0))).toBe(0);
  });
});

describe('Holdout / artımsallık', () => {
  it('holdout sonucu üretir; nominal artımsal pay hesaplanır ve kanal harcaması azalır', () => {
    const s = fx('ho');
    s.tracking.health = 1;
    withGoogle(s, { budget: 150, match: 'phrase' });
    days(s, 7);
    const r = doDay(s, [{ type: 'measure.start_holdout', params: { channel: 'google', share: 0.4, days: 40 } }]);
    expect(r.actionResults[0]!.status).toBe('applied');
    const spendBefore = sum(s.history.slice(0, 7).map((h) => h.spend.google ?? 0)) / 7;
    days(s, 45);
    const h = s.tests.holdouts[0]!;
    expect(h.status).toBe('done');
    expect(h.result).not.toBeNull();
    const spendDuring = sum(s.history.slice(9, 44).map((x) => x.spend.google ?? 0)) / 35;
    expect(spendDuring).toBeLessThan(spendBefore * 0.8);
    expect(h.result!.ciHigh).toBeGreaterThan(h.result!.ciLow);
  });
  it('aynı kanalda eş zamanlı iki test reddedilir; geçersiz parametreler reddedilir', () => {
    const s = fx('ho2');
    expect(doDay(s, [{ type: 'measure.start_holdout', params: { channel: 'meta', share: 0.2, days: 20 } }]).actionResults[0]!.status).toBe('applied');
    expect(doDay(s, [{ type: 'measure.start_holdout', params: { channel: 'meta', share: 0.2, days: 20 } }]).actionResults[0]!.status).toBe('rejected');
    expect(doDay(s, [{ type: 'measure.start_holdout', params: { channel: 'google', share: 0.9, days: 20 } }]).actionResults[0]!.status).toBe('rejected');
  });
});

describe('Takip aksiyonları', () => {
  it('düzeltme gecikmeli uygulanır ve takip sağlığını geri getirir', () => {
    const s = fx('tk');
    s.tracking.health = 0.4;
    doDay(s, [{ type: 'track.fix', params: { level: 'basic' } }]);
    expect(s.tracking.health).toBe(0.4);
    days(s, 2);
    expect(s.tracking.health).toBe(1);
    expect(doDay(s, [{ type: 'track.fix', params: { level: 'basic' } }]).actionResults[0]!.status).toBe('rejected');
  });
  it('sunucu tarafı takip nakit maliyetlidir ve gecikmelidir', () => {
    const s = fx('tk2');
    const c0 = s.cash;
    doDay(s, [{ type: 'track.fix', params: { level: 'server_side' } }]);
    expect(s.ledger.actionCosts).toBeGreaterThan(0);
    expect(c0 - s.cash).toBeGreaterThan(0);
    days(s, 6);
    expect(s.tracking.serverSide).toBe(true);
  });
});

describe('Yerel / ücretsiz kanallar, yasal rejim, GEO', () => {
  it('GBP optimizasyonu organik/yerel lead’i artırır', () => {
    const run = (hours: number) => {
      const s = fx('gbp');
      if (hours) doDay(s, [{ type: 'local.optimize_gbp', params: { hours } }]);
      days(s, 150);
      return s.funnel.byChannel.gbp?.leads ?? 0;
    };
    expect(run(4)).toBeGreaterThan(run(0));
  });
  it('referans programı referans lead’lerini artırır (müşteri varken)', () => {
    const run = (on: boolean) => {
      const s = fx('ref');
      s.cohorts.push({ id: 1, startDay: -30, n0: 200, alive: 200, arpa: 50, onb: 0.5, byChannel: {}, churned: 0 });
      if (on) doDay(s, [{ type: 'local.set_referral', params: { on: true } }]);
      days(s, 120);
      return s.funnel.byChannel.referral?.leads ?? 0;
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });
  it('saha satışı yüksek kapanış (field_sales_close) ve hızlı deneme üretir', () => {
    const s = fx('field');
    s.founder.reserved.sales = 3;
    for (let i = 0; i < 20; i++) doDay(s, [{ type: 'local.field_sales', params: { hours: 3 } }]);
    days(s, 30);
    const f = s.funnel.byChannel.field!;
    expect(f.leads).toBeGreaterThan(10);
    expect(f.trials / f.leads).toBeGreaterThan(0.03);
  });
  it('yasak soğuk temas itibarı düşürür; serbest rejimde düşük etki (US e-posta serbest, SMS yasak)', () => {
    const us = fx('cold', {}, 'us');
    const rep0 = us.reputation;
    doDay(us, [{ type: 'local.cold_outreach', params: { kind: 'email', volume: 200 } }]);
    const dEmail = rep0 - us.reputation;
    const us2 = fx('cold', {}, 'us');
    doDay(us2, [{ type: 'local.cold_outreach', params: { kind: 'sms', volume: 200 } }]);
    const dSms = rep0 - us2.reputation;
    expect(dEmail).toBeLessThan(dSms);
    expect(dSms).toBeGreaterThan(0.05);
  });
  it('GEO: gecikmeli ve yavaş görünürlük; yatırım sonrası artar', () => {
    const s = fx('geo');
    const v0 = s.geo.visibility;
    doDay(s, [{ type: 'geo.invest', params: { hours: 3 } }]);
    days(s, 5);
    const early = s.geo.visibility;
    days(s, 90);
    expect(s.geo.visibility).toBeGreaterThan(Math.min(v0, early));
    const k = geoKernel(60, 180);
    expect(k.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
  it('iyi politika organik/yerel kanallardan müşteri üretir', () => {
    const s = runDays(fx('free'), carefulPolicy, 200);
    const free = ['organic', 'gbp', 'referral', 'field', 'content'].reduce((a, k) => a + (s.funnel.byChannel[k]?.paid ?? 0), 0);
    expect(free).toBeGreaterThan(0);
  });
});

describe('Olaylar', () => {
  it('uzun koşuda çeşitli olaylar tetiklenir; modifier süresi dolar', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const s = fx(`ev${i}`);
      days(s, 365);
      for (const e of s.events) ids.add(e.id);
      expect(s.modifiers.every((m) => m.until > s.day - 1)).toBe(true);
    }
    expect(ids.size).toBeGreaterThanOrEqual(3);
  });
  it('olay anahtarları i18n anahtarıdır (motor metin üretmez)', () => {
    const s = fx('ev-key');
    days(s, 365);
    for (const e of s.events) expect(e.key).toMatch(/^(event|outcome)\./);
  });
  it('takip bozulma olayı sağlığı düşürür ve gözlenen metrikleri bozar', () => {
    let found = false;
    for (let i = 0; i < 20 && !found; i++) {
      const s = fx(`tb${i}`);
      s.tracking.health = 1;
      days(s, 200);
      const e = s.events.find((x) => x.id === 'tracking_break');
      if (e) {
        found = true;
        expect(s.tracking.health).toBeLessThan(1);
      }
    }
    expect(found).toBe(true);
  });
});
