// model-draft §13: 15 yapısal ilişki (fixture ile). Her test başlığında ilişki numarası vardır.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createRng } from '../rng';
import { balancedPolicy, carefulPolicy } from '../bots/reference';
import { fatigueCtr, frequency, planAdSet } from '../channels/meta';
import { planCampaign } from '../channels/google';
import { runDays } from './run';
import { newDayCtx, stepInPlace } from './step';
import { leadRate, visitToLead } from '../funnel/rates';
import { dailyFromMonthly, monthlyHazard } from '../funnel/customers';
import { processSales } from '../funnel/leads';
import { ledgerCash } from '../funnel/finance';
import { trackedFraction } from '../measurement/tracking';
import { posterior } from '../quality/bayes';
import { hill, marginalCacHill } from '../quality/saturation';
import { responseAt } from '../selectors';
import { ACTION_TYPES } from './actions';
import { STAGES } from './types';
import type { Action, GameState } from './types';
import { days, doDay, findBadNumber, fx, withGoogle, withMeta } from '../test-fixtures/helpers';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('1. Huni daralır', () => {
  it('kümülatif aşama sayıları azalan sırada (çoklu tohum)', () => {
    for (let i = 0; i < 6; i++) {
      const s = runDays(fx(`f${i}`), i % 2 ? carefulPolicy : balancedPolicy, 150);
      const c = s.funnel.cum;
      for (let k = 1; k < STAGES.length; k++) expect(c[STAGES[k]!], `${STAGES[k]} <= ${STAGES[k - 1]}`).toBeLessThanOrEqual(c[STAGES[k - 1]!]);
      for (const r of s.history) {
        expect(r.stages.clicks).toBeLessThanOrEqual(r.stages.impressions);
        expect(r.stages.visits).toBeLessThanOrEqual(r.stages.clicks);
        expect(r.stages.leads).toBeLessThanOrEqual(r.stages.visits);
      }
    }
  });
});

describe('2. CPC ≈ CPM / (1000 × CTR)', () => {
  it('Meta: plan ve gerçekleşen büyük örneklemde tutarlı', () => {
    const s = fx('cpc');
    const id = withMeta(s, { budget: 400, audience: 'advantage' });
    const a = s.meta.adSets.find((x) => x.id === id)!;
    const plan = planAdSet(s, a);
    expect(plan.spend / plan.clicks).toBeCloseTo(plan.cpm / (1000 * plan.ctrEff), 8);
    doDay(s);
    const l = a.last!;
    const realized = l.cost / l.clicks;
    expect(Math.abs(realized / (plan.cpm / (1000 * plan.ctrEff)) - 1)).toBeLessThan(0.1);
  });
});

describe('3. Marjinal CAC bütçeyle artar', () => {
  const seq = (s: GameState, ch: 'google' | 'meta', scales: number[]) => {
    const pts = scales.map((k) => responseAt(s, ch, k));
    const out: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const dS = pts[i]!.spend - pts[i - 1]!.spend;
      const dC = pts[i]!.customers - pts[i - 1]!.customers;
      if (dS > 1e-9) out.push(dC > 1e-12 ? dS / dC : Infinity);
    }
    return out;
  };
  const nondecreasing = (xs: number[]) => xs.every((x, i) => i === 0 || x >= xs[i - 1]! * (1 - 1e-6));
  it('Meta (frekans/yorgunluk)', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0.2, max: 12, noNaN: true }), { minLength: 3, maxLength: 7 }), fc.constantFrom('interest', 'advantage', 'lookalike') , (scales, aud) => {
        const s = fx('m3');
        withMeta(s, { budget: 80, audience: aud, creatives: 2 });
        expect(nondecreasing(seq(s, 'meta', [...scales].sort((a, b) => a - b)))).toBe(true);
      }),
      { numRuns: 40 },
    );
  });
  it('Google (akıllı teklif: verimli satırlar önce dolar; manuel: sabit sonra doygunluk)', () => {
    for (const strategy of ['tcpa', 'maxConversions', 'manual'] as const) {
      fc.assert(
        fc.property(fc.array(fc.double({ min: 0.1, max: 30, noNaN: true }), { minLength: 3, maxLength: 7 }), (scales) => {
          const s = fx('g3');
          const id = withGoogle(s, { strategy, budget: 30, tcpa: 150 });
          const c = s.google.campaigns.find((x) => x.id === id)!;
          if (strategy !== 'manual') c.learning.state = 'stable';
          expect(nondecreasing(seq(s, 'google', [...scales].sort((a, b) => a - b)))).toBe(true);
        }),
        { numRuns: 25 },
      );
    }
  });
  it('Hill: marjinal maliyet harcamayla artar', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 1000, noNaN: true }), fc.double({ min: 0.01, max: 1000, noNaN: true }), fc.double({ min: 0.4, max: 1, noNaN: true }), (a, b, h) => {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        expect(marginalCacHill(hi, 100, 50, h)).toBeGreaterThanOrEqual(marginalCacHill(lo, 100, 50, h) * (1 - 1e-9));
        expect(hill(hi, 100, 50, h)).toBeGreaterThanOrEqual(hill(lo, 100, 50, h) * (1 - 1e-9));
      }),
    );
  });
});

describe('4. Takip bozulunca akıllı teklif bozulur', () => {
  it('tCPA: hacim ve gözlenen dönüşüm düşer', () => {
    const mk = (health: number) => {
      const s = fx('t4');
      s.tracking.health = health;
      const id = withGoogle(s, { strategy: 'tcpa', budget: 500, tcpa: 90 });
      s.google.campaigns[0]!.learning.state = 'stable';
      return { s, id };
    };
    const good = mk(1);
    const bad = mk(0.25);
    const pg = planCampaign(good.s, good.s.google.campaigns[0]!);
    const pb = planCampaign(bad.s, bad.s.google.campaigns[0]!);
    expect(pb.clicks).toBeLessThan(pg.clicks);
    expect(pb.leads * trackedFraction(bad.s, 'google')).toBeLessThan(pg.leads * trackedFraction(good.s, 'google'));
  });
  it('maxConversions: algoritma sinyali bozulunca gerçek dönüşüm verimi düşer', () => {
    const mk = (health: number) => {
      const s = fx('t4b');
      s.tracking.health = health;
      withGoogle(s, { strategy: 'maxConversions', budget: 15, match: 'broad' });
      s.google.campaigns[0]!.learning.state = 'stable';
      return planCampaign(s, s.google.campaigns[0]!);
    };
    const g = mk(1);
    const b = mk(0.2);
    expect(b.leads / b.cost).toBeLessThan(g.leads / g.cost);
  });
  it('uçtan uca: aynı tohumda bozuk takip daha az gözlenen dönüşüm', () => {
    const run = (health: number) => {
      const s = fx('t4c');
      s.tracking.health = health;
      withGoogle(s, { strategy: 'manual', budget: 80 });
      days(s, 60);
      return { obs: sum(s.history.map((h) => h.platformConv.google ?? 0)), truth: sum(s.history.map((h) => h.leads.google ?? 0)) };
    };
    const g = run(1);
    const b = run(0.3);
    expect(b.obs).toBeLessThan(g.obs);
  });
});

describe('5. Rekabet artarsa CPC/CPM artar', () => {
  it('Google ve Meta', () => {
    const lo = fx('c5');
    const hi = fx('c5');
    withGoogle(lo);
    withGoogle(hi);
    withMeta(lo);
    withMeta(hi);
    hi.competitorIndex = 1.4;
    const pl = planCampaign(lo, lo.google.campaigns[0]!);
    const ph = planCampaign(hi, hi.google.campaigns[0]!);
    expect(ph.cost / ph.clicks).toBeGreaterThan(pl.cost / pl.clicks);
    const ml = planAdSet(lo, lo.meta.adSets[0]!);
    const mh = planAdSet(hi, hi.meta.adSets[0]!);
    expect(mh.cpm).toBeGreaterThan(ml.cpm);
    // aynı sıradaki olay modifier'ı da aynı yönde etki eder
    const mod = fx('c5');
    withGoogle(mod);
    mod.modifiers.push({ id: 'm', target: 'cpc', kind: 'mult', value: 1.3, from: 0, until: 99, source: 't' });
    const pm = planCampaign(mod, mod.google.campaigns[0]!);
    expect(pm.cost / pm.clicks).toBeGreaterThan(pl.cost / pl.clicks);
  });
});

describe('6. Platform raporu ≠ CRM (atıf şişmesi)', () => {
  it('tam izlemede platform ≥ gerçek, CRM gerçeğe yakın', () => {
    const s = fx('p6');
    s.params['measure.consent_rate'] = 1;
    s.params['measure.ios_att_optin'] = 1;
    s.tracking.health = 1;
    withGoogle(s, { budget: 120 });
    withMeta(s, { budget: 80 });
    days(s, 80);
    const trueG = sum(s.history.map((h) => h.leads.google ?? 0));
    const platG = sum(s.history.map((h) => h.platformConv.google ?? 0));
    const trueTotal = sum(s.history.map((h) => sum(Object.values(h.leads))));
    const crm = sum(s.history.map((h) => h.crmLeads));
    expect(trueG).toBeGreaterThan(20);
    expect(platG).toBeGreaterThanOrEqual(trueG);
    expect(platG).toBeGreaterThan(trueG * 1.15);
    expect(platG).not.toBe(crm);
    expect(Math.abs(crm / trueTotal - 1)).toBeLessThan(0.1);
  });
  it('onay kaybı ve etiket bozukluğu gözlemi gerçeğin altına çeker; consent mode kısmen telafi eder', () => {
    const s = fx('p6b');
    s.tracking.health = 1;
    const base = trackedFraction(s, 'google');
    s.tracking.consentMode = true;
    const withCm = trackedFraction(s, 'google');
    expect(withCm).toBeGreaterThan(base);
    expect(withCm).toBeLessThanOrEqual(1);
    s.tracking.serverSide = true;
    expect(trackedFraction(s, 'meta')).toBeGreaterThan(0.5);
  });
});

describe('7. Az veriyle karar ortalamada daha kötü (regret)', () => {
  it('küçük n => büyük regret', () => {
    const regret = (n: number) => {
      const r = createRng(`regret${n}`);
      let tot = 0;
      const T = 2000;
      for (let t = 0; t < T; t++) {
        const a = 0.04 + 0.04 * r.float();
        const b = 0.04 + 0.04 * r.float();
        const ka = r.binomial(n, a);
        const kb = r.binomial(n, b);
        const pa = posterior({ n, k: ka, kObs: ka }, 0.05).mean;
        const pb = posterior({ n, k: kb, kObs: kb }, 0.05).mean;
        const chosen = pa >= pb ? a : b;
        tot += Math.max(a, b) - chosen;
      }
      return tot / T;
    };
    const r10 = regret(10);
    const r100 = regret(100);
    const r2000 = regret(2000);
    expect(r10).toBeGreaterThan(r100);
    expect(r100).toBeGreaterThan(r2000);
  });
});

describe('8. Deterministik: aynı tohum + aynı aksiyonlar => aynı durum', () => {
  it('özellik: rastgele tohum', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 8 }), (seed) => {
        expect(runDays(fx(seed), balancedPolicy, 30)).toEqual(runDays(fx(seed), balancedPolicy, 30));
      }),
      { numRuns: 8 },
    );
  });
});

describe('9. Nakit muhasebesi ve MRR hareket tablosu tutarlı', () => {
  it('Δcash = Σ akışlar; MRR kimliği her gün', () => {
    for (const pol of [balancedPolicy, carefulPolicy]) {
      const s = runDays(fx('a9'), pol, 200);
      expect(ledgerCash(s)).toBeCloseTo(s.cash, 4);
      expect(s.startCash + sum(s.history.map((h) => h.cashIn - h.cashOut))).toBeCloseTo(s.cash, 4);
      let prev = 0;
      for (const h of s.history) {
        const m = h.mrrMove;
        expect(h.mrr).toBeCloseTo(prev + m.new + m.expansion - m.contraction - m.churn, 6);
        prev = h.mrr;
      }
      expect(s.mrr).toBeCloseTo(sum(s.cohorts.map((c) => c.alive * c.arpa)), 6);
    }
  });
  it('fiyat değişikliği de MRR kimliğini bozmaz', () => {
    const s = runDays(fx('a9p'), balancedPolicy, 120);
    doDay(s, [{ type: 'ops.set_price', params: { price: s.product.price * 1.3 } }]);
    days(s, 5);
    let prev = 0;
    for (const h of s.history) {
      const m = h.mrrMove;
      expect(h.mrr).toBeCloseTo(prev + m.new + m.expansion - m.contraction - m.churn, 6);
      prev = h.mrr;
    }
  });
});

describe('10. Önemli değişiklik öğrenmeyi sıfırlar', () => {
  it('Google akıllı teklif', () => {
    const s = fx('l10');
    const id = withGoogle(s, { strategy: 'tcpa', budget: 100, tcpa: 100 });
    const c = s.google.campaigns.find((x) => x.id === id)!;
    c.learning = { state: 'stable', sinceReset: -50, resets: 0, convWindow: new Array<number>(30).fill(2) };
    doDay(s, [{ type: 'gads.set_budget', params: { campaignId: id, dailyBudget: 105 } }]); // küçük
    expect(c.learning.resets).toBe(0);
    doDay(s, [{ type: 'gads.set_budget', params: { campaignId: id, dailyBudget: 200 } }]); // büyük
    expect(c.learning.resets).toBe(1);
    expect(c.learning.state).toBe('learning');
    expect(c.learning.convWindow.reduce((a, b) => a + b, 0)).toBeLessThan(60);
    const w = c.learning.sinceReset;
    doDay(s, [{ type: 'gads.set_strategy', params: { campaignId: id, strategy: 'maxConversions' } }]);
    expect(c.learning.resets).toBe(2);
    expect(c.learning.sinceReset).toBeGreaterThanOrEqual(w);
  });
  it('Google manuel kampanya öğrenmeye girmez', () => {
    const s = fx('l10b');
    const id = withGoogle(s, { strategy: 'manual' });
    doDay(s, [{ type: 'gads.set_budget', params: { campaignId: id, dailyBudget: 900 } }]);
    expect(s.google.campaigns[0]!.learning.state).toBe('manual');
  });
  it('öğrenme dönemi koşulu: yeterli dönüşüm toplanınca kararlı, toplanmazsa sınırlı', () => {
    const rich = fx('l10c');
    withGoogle(rich, { strategy: 'maxConversions', budget: 3000, match: 'phrase' });
    rich.params['gads.smart.min_conversions'] = 5;
    days(rich, 40);
    expect(rich.google.campaigns[0]!.learning.state).toBe('stable');
    const poor = fx('l10d');
    withGoogle(poor, { strategy: 'maxConversions', budget: 3, match: 'exact' });
    days(poor, 40);
    expect(poor.google.campaigns[0]!.learning.state).toBe('limited');
  });
  it('Meta: reklam ekleme, kitle değişikliği ve büyük bütçe değişikliği sıfırlar; küçük değişiklik sıfırlamaz', () => {
    const s = fx('l10m');
    const id = withMeta(s, { budget: 60 });
    s.meta.adSets[0]!.learning.events = [10, 10, 10, 10, 10];
    doDay(s, [{ type: 'meta.set_budget', params: { adSetId: id, dailyBudget: 63 } }]);
    expect(s.meta.adSets[0]!.learning.resets).toBe(0);
    doDay(s, [{ type: 'meta.set_budget', params: { adSetId: id, dailyBudget: 150 } }]);
    expect(s.meta.adSets[0]!.learning.resets).toBe(1);
    expect(s.meta.adSets[0]!.learning.state).toBe('learning');
    const cr = s.assets.creatives.find((c) => c.channel === 'meta')!;
    s.assets.creatives.push({ ...cr, id: 'crX', availableDay: 0 });
    doDay(s, [{ type: 'meta.add_creative', params: { adSetId: id, creativeId: 'crX' } }]);
    expect(s.meta.adSets[0]!.learning.resets).toBe(2);
    doDay(s, [{ type: 'meta.set_audience', params: { adSetId: id, audience: 'broad' } }]);
    expect(s.meta.adSets[0]!.learning.resets).toBe(3);
  });
  it('Meta: eşik altı olay => learning_limited; bol olay => active', () => {
    const rich = fx('l10r');
    withMeta(rich, { budget: 2000, audience: 'broad' });
    rich.meta.adSets[0]!.learning = { state: 'learning', sinceReset: 0, resets: 0, events: [] };
    rich.params['measure.consent_rate'] = 1;
    rich.tracking.health = 1;
    days(rich, 20);
    expect(rich.meta.adSets[0]!.learning.state).toBe('active');
    const poor = fx('l10p');
    withMeta(poor, { budget: 3 });
    poor.meta.adSets[0]!.learning = { state: 'learning', sinceReset: 0, resets: 0, events: [] };
    days(poor, 15);
    expect(poor.meta.adSets[0]!.learning.state).toBe('limited');
  });
});

describe('11. Yanıt süresi arttıkça lead dönüşümü düşer', () => {
  const qualifiedFrom = (ageDays: number, autoReply: boolean) => {
    const s = fx('r11');
    s.autoReply = autoReply;
    s.founder.reserved.sales = 8;
    s.founder.capacityToday = 8;
    s.day = 10;
    s.funnel.queue.push({ day: 10 - ageDays, channel: 'google', n: 4000, qual: 1, msg: false, offerId: s.assets.offers[0]!.id, nonIncr: 0, assisted: false, preQualified: false, trialP: null, tauMult: 1 });
    s.reps = 5;
    const ctx = newDayCtx(s);
    processSales(s, ctx);
    return ctx.acc.stages.qualified;
  };
  it('lead yaşı arttıkça azalır (monoton)', () => {
    const q = [0, 1, 2, 4, 7].map((a) => qualifiedFrom(a, false));
    for (let i = 1; i < q.length; i++) expect(q[i]!).toBeLessThan(q[i - 1]!);
  });
  it('otomatik yanıt ilk yanıtı hızlandırır', () => {
    expect(qualifiedFrom(0, true)).toBeGreaterThan(qualifiedFrom(0, false));
  });
  it('kapasite yetmeyince bekleyen lead bozulur; süresi dolan atılır', () => {
    const s = fx('r11b');
    s.day = 20;
    s.founder.reserved.sales = 0;
    s.founder.capacityToday = 8;
    s.funnel.queue.push({ day: 5, channel: 'google', n: 100, qual: 1, msg: false, offerId: s.assets.offers[0]!.id, nonIncr: 0, assisted: false, preQualified: false, trialP: null, tauMult: 1 });
    processSales(s, newDayCtx(s));
    expect(s.funnel.queue.length).toBe(0);
  });
});

describe('12. Negatif kelime alakasız harcamayı azaltır', () => {
  const junk = (s: GameState, id: string) => {
    const p = planCampaign(s, s.google.campaigns.find((c) => c.id === id)!);
    const tot = (cls: string[]) => sum(p.rows.filter((r) => cls.includes(r.cls)).map((r) => r.impr * r.f * r.ctr * r.cpc));
    return { junk: tot(['irrelevant', 'info']), target: sum(p.rows.filter((r) => r.cls === 'target').map((r) => r.impr * r.f * r.ctr)) };
  };
  it('alakasız/bilgi harcaması düşer; geniş negatif hedef hacmi de keser', () => {
    const base = fx('n12');
    const id = withGoogle(base, { match: 'broad', budget: 1e6 });
    const b0 = junk(base, id);
    const narrow = fx('n12');
    withGoogle(narrow, { match: 'broad', budget: 1e6 });
    narrow.google.campaigns[0]!.negatives.push({ cls: 'irrelevant', breadth: 'narrow' }, { cls: 'info', breadth: 'narrow' });
    narrow.google.campaigns[0]!.searchTerms = { day: 0, rows: [] };
    const n1 = junk(narrow, id);
    expect(n1.junk).toBeLessThan(b0.junk * 0.6);
    expect(n1.target).toBeCloseTo(b0.target, 6);
    const wide = fx('n12');
    withGoogle(wide, { match: 'broad', budget: 1e6 });
    wide.google.campaigns[0]!.negatives.push({ cls: 'irrelevant', breadth: 'broad' }, { cls: 'info', breadth: 'broad' });
    wide.google.campaigns[0]!.searchTerms = { day: 0, rows: [] };
    const n2 = junk(wide, id);
    expect(n2.junk).toBeLessThan(n1.junk);
    expect(n2.target).toBeLessThan(b0.target);
  });
  it('arama terimleri raporu incelenmeden negatifler daha az etkilidir', () => {
    const blind = fx('n12b');
    const id = withGoogle(blind, { match: 'broad', budget: 1e6 });
    blind.google.campaigns[0]!.negatives.push({ cls: 'irrelevant', breadth: 'narrow' });
    const seen = fx('n12b');
    withGoogle(seen, { match: 'broad', budget: 1e6 });
    seen.google.campaigns[0]!.negatives.push({ cls: 'irrelevant', breadth: 'narrow' });
    seen.google.campaigns[0]!.searchTerms = { day: 0, rows: [] };
    expect(junk(seen, id).junk).toBeLessThan(junk(blind, id).junk);
  });
});

describe('13. Yaratıcı yorgunluğu', () => {
  it('frekans arttıkça etkin CTR azalır (özellik)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 20, noNaN: true }), fc.double({ min: 0, max: 10, noNaN: true }), (f, d) => {
        expect(fatigueCtr(0.02, f + d, 3, 0.15)).toBeLessThanOrEqual(fatigueCtr(0.02, f, 3, 0.15) + 1e-15);
      }),
    );
    expect(fatigueCtr(0.02, 2.5, 3, 0.15)).toBeCloseTo(0.02, 12); // f0 altında yorgunluk yok
  });
  it('küçük kitle + yüksek bütçe => yüksek frekans ve düşük CTR', () => {
    const lo = fx('f13');
    withMeta(lo, { budget: 20, audience: 'lookalike' });
    const hi = fx('f13');
    withMeta(hi, { budget: 4000, audience: 'lookalike' });
    const pl = planAdSet(lo, lo.meta.adSets[0]!, { steady: true });
    const ph = planAdSet(hi, hi.meta.adSets[0]!, { steady: true });
    expect(ph.frequency).toBeGreaterThan(pl.frequency);
    expect(ph.ctrEff).toBeLessThan(pl.ctrEff);
  });
  it('frekans ≥ 1 ve gösterimle artar', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 1e7, noNaN: true }), fc.double({ min: 1, max: 1e6, noNaN: true }), (imp, pool) => {
      expect(frequency(imp, pool)).toBeGreaterThanOrEqual(1);
      expect(frequency(imp * 2, pool)).toBeGreaterThanOrEqual(frequency(imp, pool) - 1e-12);
    }));
  });
});

describe('14. Rastgele çekilişler aksiyon sırasından/eklemesinden bağımsız (alt akış izolasyonu)', () => {
  it('aksiyon sırası farklı => olay akışı ve rakip yürüyüşü aynı', () => {
    const A: Action[] = [{ type: 'ops.build_docs', params: { hours: 1 } }, { type: 'local.content', params: { kind: 'social', hours: 1 } }];
    const a = fx('o14');
    const b = fx('o14');
    for (let d = 0; d < 60; d++) {
      stepInPlace(a, d % 5 === 0 ? A : []);
      stepInPlace(b, d % 5 === 0 ? [...A].reverse() : []);
    }
    expect(a.events.map((e) => `${e.day}${e.id}`)).toEqual(b.events.map((e) => `${e.day}${e.id}`));
    expect(a.competitorIndex).toBe(b.competitorIndex);
    expect(a.history.map((h) => h.organicBase)).toEqual(b.history.map((h) => h.organicBase));
  });
});

describe('15. Olasılıklar [0,1], stoklar negatif değil, harcama bütçeyi aşmaz', () => {
  it('saf oran fonksiyonları [0,1] içinde (özellik)', () => {
    const s = fx('i15');
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 2, noNaN: true }), fc.double({ min: 0, max: 3, noNaN: true }), fc.constantFrom('target', 'neighbor', 'irrelevant', 'info', 'brand', 'social'), (base, q, mult, cls) => {
        const lp = { ...s.assets.lps[0]!, q, speed: base };
        const lr = leadRate(s, base, cls, lp, { ...s.assets.offers[0]!, q }, mult);
        expect(lr).toBeGreaterThanOrEqual(0);
        expect(lr).toBeLessThanOrEqual(0.95);
        const v = visitToLead(lr);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(0.98);
      }),
    );
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 60, noNaN: true }), (onb, age) => {
        const h = monthlyHazard(s, onb, age);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(0.95);
        const d = dailyFromMonthly(h);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(1);
      }),
    );
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.boolean(), fc.boolean(), fc.boolean(), (health, cm, ss, crm) => {
        const t = fx('i15b');
        t.tracking = { health, consentMode: cm, serverSide: ss, crmFeedback: crm };
        for (const ch of ['google', 'meta', 'analytics'] as const) {
          const f = trackedFraction(t, ch);
          expect(f).toBeGreaterThanOrEqual(0);
          expect(f).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  const actionArb: fc.Arbitrary<Action> = fc.oneof(
    fc.record({ type: fc.constant('gads.create_campaign' as const), params: fc.record({ type: fc.constantFrom('search' as const, 'pmax' as const), dailyBudget: fc.double({ min: -5, max: 400, noNaN: true }), strategy: fc.constantFrom('manual' as const, 'maxClicks' as const, 'maxConversions' as const, 'tcpa' as const), tcpaTarget: fc.double({ min: 10, max: 400, noNaN: true }), lpId: fc.constantFrom('lp2', 'zzz'), offerId: fc.constantFrom('of1', 'zzz') }) }),
    fc.record({ type: fc.constant('gads.add_adgroup' as const), params: fc.record({ campaignId: fc.constantFrom('gc1', 'gc2', 'x'), creativeId: fc.constantFrom('cr3', 'cr4') }) }),
    fc.record({ type: fc.constant('gads.add_keywords' as const), params: fc.record({ campaignId: fc.constantFrom('gc1', 'gc2'), adGroupId: fc.constantFrom('ag2', 'ag3', 'ag4'), keywords: fc.array(fc.record({ theme: fc.constantFrom('core' as const, 'adjacent' as const, 'brand' as const), match: fc.constantFrom('exact' as const, 'phrase' as const, 'broad' as const) }), { maxLength: 4 }) }) }),
    fc.record({ type: fc.constant('gads.set_budget' as const), params: fc.record({ campaignId: fc.constantFrom('gc1', 'gc2'), dailyBudget: fc.double({ min: 0, max: 1000, noNaN: true }) }) }),
    fc.record({ type: fc.constant('gads.add_negatives' as const), params: fc.record({ campaignId: fc.constantFrom('gc1', 'gc2'), classes: fc.array(fc.constantFrom('target' as const, 'irrelevant' as const, 'info' as const, 'neighbor' as const), { maxLength: 3 }), breadth: fc.constantFrom('narrow' as const, 'broad' as const) }) }),
    fc.record({ type: fc.constant('meta.create_adset' as const), params: fc.record({ objective: fc.constantFrom('leads' as const, 'messages' as const), audience: fc.constantFrom('interest' as const, 'lookalike' as const, 'advantage' as const, 'broad' as const), dailyBudget: fc.double({ min: 1, max: 500, noNaN: true }), creativeIds: fc.array(fc.constantFrom('cr3', 'cr4', 'zzz'), { maxLength: 2 }), lpId: fc.constant('lp2'), offerId: fc.constant('of1') }) }),
    fc.record({ type: fc.constant('meta.set_budget' as const), params: fc.record({ adSetId: fc.constantFrom('ma1', 'ma2'), dailyBudget: fc.double({ min: 0, max: 800, noNaN: true }) }) }),
    fc.record({ type: fc.constant('track.fix' as const), params: fc.record({ level: fc.constantFrom('basic' as const, 'consent_mode' as const, 'server_side' as const, 'crm_feedback' as const) }) }),
    fc.record({ type: fc.constant('measure.start_holdout' as const), params: fc.record({ channel: fc.constantFrom('google' as const, 'meta' as const), share: fc.double({ min: 0, max: 0.6, noNaN: true }), days: fc.integer({ min: 1, max: 40 }) }) }),
    fc.record({ type: fc.constant('ops.set_alloc' as const), params: fc.record({ sales: fc.double({ min: 0, max: 6, noNaN: true }), onboarding: fc.double({ min: 0, max: 4, noNaN: true }) }) }),
    fc.record({ type: fc.constant('ops.hire_rep' as const), params: fc.constant({}) }),
    fc.record({ type: fc.constant('ops.set_price' as const), params: fc.record({ price: fc.double({ min: 10, max: 150, noNaN: true }) }) }),
    fc.record({ type: fc.constant('local.cold_outreach' as const), params: fc.record({ kind: fc.constantFrom('email' as const, 'call' as const, 'sms' as const), volume: fc.integer({ min: 1, max: 400 }) }) }),
    fc.record({ type: fc.constant('local.field_sales' as const), params: fc.record({ hours: fc.double({ min: 0.5, max: 6, noNaN: true }) }) }),
    fc.record({ type: fc.constant('local.request_reviews' as const), params: fc.record({ count: fc.integer({ min: 1, max: 5 }) }) }),
    fc.record({ type: fc.constant('geo.invest' as const), params: fc.record({ hours: fc.double({ min: 0.5, max: 4, noNaN: true }) }) }),
    fc.record({ type: fc.constant('asset.create_lp' as const), params: fc.constant({}) }),
    fc.record({ type: fc.constant('asset.create_creative' as const), params: fc.record({ channel: fc.constantFrom('google' as const, 'meta' as const), bold: fc.boolean() }) }),
  ) as fc.Arbitrary<Action>;

  it('rastgele aksiyon dizileri: sonlu sayılar, sınırlar, bütçe ve nakit izinleri', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 6 }), fc.array(fc.array(actionArb, { maxLength: 3 }), { minLength: 20, maxLength: 60 }), (seed, plan) => {
        const s = fx(seed);
        let prevCash = s.cash;
        for (let d = 0; d < plan.length && !s.outcome; d++) {
          const budgetCap = sum(s.google.campaigns.map((c) => c.dailyBudget)) + 1e-6;
          const metaCap = sum(s.meta.adSets.map((a) => a.dailyBudget)) + 1e-6;
          const r = stepInPlace(s, plan[d]!);
          // bütçe: günlük kampanya harcaması ≤ (aksiyonlar sonrası) bütçe toplamı
          const budgetNow = sum(s.google.campaigns.map((c) => c.dailyBudget)) + 1e-6;
          expect(r.report.spend.google ?? 0).toBeLessThanOrEqual(Math.max(budgetCap, budgetNow));
          expect(r.report.spend.meta ?? 0).toBeLessThanOrEqual(Math.max(metaCap, sum(s.meta.adSets.map((a) => a.dailyBudget)) + 1e-6));
          // nakit izni: reklam harcaması (+vergi) önceki gün nakdini aşmaz
          expect((r.report.spend.google ?? 0) + (r.report.spend.meta ?? 0) + (r.report.spend.adTax ?? 0)).toBeLessThanOrEqual(Math.max(0, prevCash) + 1e-6);
          prevCash = s.cash;
        }
        expect(findBadNumber(s)).toBeNull();
        expect(ledgerCash(s)).toBeCloseTo(s.cash, 3);
        for (const c of s.cohorts) {
          expect(c.alive).toBeGreaterThanOrEqual(0);
          expect(c.alive).toBeLessThanOrEqual(c.n0);
        }
        for (const x of [s.reputation, s.founder.burnout, s.tracking.health, s.geo.visibility, s.accounts.google.health, s.accounts.meta.health, s.product.onboarding]) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1);
        }
        for (const b of s.funnel.queue) expect(b.n).toBeGreaterThan(0);
        for (const t of s.funnel.trials) expect(t.n).toBeGreaterThan(0);
        for (const h of s.history) {
          expect(h.customers).toBeGreaterThanOrEqual(0);
          expect(h.mrr).toBeGreaterThanOrEqual(-1e-9);
          for (const v of Object.values(h.stages)) expect(v).toBeGreaterThanOrEqual(0);
        }
        expect(s.reps).toBeGreaterThanOrEqual(0);
        expect(s.founder.usedToday).toBeLessThanOrEqual(s.founder.capacityToday * 1.25 + 1e-6);
      }),
      { numRuns: 40 },
    );
  });
  it('tüm aksiyon tipleri kayıtlı ve denetlenebilir', () => {
    expect(new Set(ACTION_TYPES).size).toBe(ACTION_TYPES.length);
    expect(ACTION_TYPES.length).toBeGreaterThanOrEqual(35);
  });
});
