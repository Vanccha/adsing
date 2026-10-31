import { describe, expect, it } from 'vitest';
import { initState } from './init';
import { extractLog, runDays } from './run';
import { step, stepInPlace } from './step';
import { validateAction } from './actions';
import type { Action, GameState } from './types';
import { fixtureBundle } from '../test-fixtures';
import { days, doDay, findBadNumber, fx, withGoogle, withMeta } from '../test-fixtures/helpers';
import { balancedPolicy, carefulPolicy, naivePolicy } from '../bots/reference';
import { ledgerCash } from '../funnel/finance';

describe('initState', () => {
  it('düz JSON ve deterministik', () => {
    const a = fx('s1');
    const b = fx('s1');
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(fx('s2').assets.lps[0]!.q).not.toBe(a.assets.lps[0]!.q); // gizli latent tohuma bağlı
  });
  it('mod ve zorluk seçenekleri', () => {
    const q = fx('s', { mode: 'quick', startingCash: 777, learningMode: true });
    expect(q.horizon).toBe(90);
    expect(q.cash).toBe(777);
    expect(q.learningMode).toBe(true);
    expect(fx('s').horizon).toBe(365);
    expect(q.goals.mrr).toBe(1250); // 90 günlük hedef (fixture)
    expect(fx('s').goals.mrr).toBe(7500);
  });
  it('pazar farkı fixture TR için farklı para ve parametre', () => {
    const t = fx('s', {}, 'tr');
    expect(t.currency).toBe('TRY');
    expect(t.params['price.monthly']).toBe(700);
  });
  it('senaryo > pazar > global çözümlemesi durumda görünür', () => {
    const s = fx('s');
    expect(s.paramInfo['scn.gross_margin']?.origin).toBe('scenario');
    expect(s.paramInfo['gads.search.cpc']?.origin).toBe('market');
    expect(s.paramInfo['gads.smart.min_conversions']?.origin).toBe('global');
  });
});

describe('step: saflık, determinizm, yeniden oynatma', () => {
  it('step girdi durumunu değiştirmez', () => {
    const s = fx('p');
    withGoogle(s);
    const before = JSON.stringify(s);
    const r = step(s, [{ type: 'ops.set_alloc', params: { sales: 2, onboarding: 1 } }]);
    expect(JSON.stringify(s)).toBe(before);
    expect(r.state.day).toBe(1);
    expect(r.report.day).toBe(0);
  });
  it('aynı tohum + aynı aksiyonlar => derin eşit durum', () => {
    const a = runDays(fx('det'), balancedPolicy, 120);
    const b = runDays(fx('det'), balancedPolicy, 120);
    expect(a).toEqual(b);
    const c = runDays(fx('det2'), balancedPolicy, 120);
    expect(c).not.toEqual(a);
  });
  it('ActionLog ile yeniden oynatma politika koşusuyla aynı durumu üretir', () => {
    const a = runDays(fx('replay'), carefulPolicy, 100);
    const log = extractLog(a);
    expect(log.length).toBeGreaterThan(3);
    const b = runDays(fx('replay'), log, 100);
    expect(b).toEqual(a);
  });
  it('adım adım ve runDays aynı sonucu verir', () => {
    const a = runDays(fx('x'), naivePolicy, 40);
    let s = fx('x');
    for (let i = 0; i < 40; i++) s = step(s, naivePolicy(s)).state;
    expect(s).toEqual(a);
  });
});

describe('kurucu saati, kuyruk, nakit', () => {
  it('yetmeyen saat => kuyruğa, sonraki günlerde uygulanır', () => {
    const s = fx('h', { startDate: '2026-10-31' });
    const r0 = doDay(s, [{ type: 'asset.create_lp', params: {} }]); // 4 saat; cumartesi kapasitesi ~4.2 - tahsis 3
    expect(r0.actionResults[0]!.status).toBe('queued');
    expect(s.assets.lps.length).toBe(1);
    days(s, 3);
    expect(s.assets.lps.length).toBe(2);
    expect(s.decisions.some((d) => d.status === 'executed_from_queue')).toBe(true);
  });
  it('kapasiteyi aşan tek aksiyon reddedilir', () => {
    const s = fx('h');
    const a: Action = { type: 'asset.create_offer', params: { kind: 'trial' }, hours: 500 };
    expect(validateAction(s, a).hours).toBe(500);
    expect(doDay(s, [a]).actionResults[0]!.status).toBe('rejected');
  });
  it('yetersiz nakit reddedilir ve nakit düşmez', () => {
    const s = fx('c', { startingCash: 10 });
    const r = doDay(s, [{ type: 'asset.create_lp', params: {} }]);
    expect(r.actionResults[0]).toMatchObject({ status: 'rejected', reason: { key: 'err.insufficient_cash' } });
  });
  it('geçersiz kimlik reddedilir', () => {
    const s = fx('c');
    const r = doDay(s, [{ type: 'gads.set_budget', params: { campaignId: 'nope', dailyBudget: 10 } }]);
    expect(r.actionResults[0]!.status).toBe('rejected');
  });
  it('günlük kullanılan saat kapasiteyi (+%25 fazla mesai) aşmaz', () => {
    const s = fx('h2');
    for (let d = 0; d < 20; d++) {
      doDay(s, [{ type: 'ops.build_docs', params: { hours: 1 } }, { type: 'ops.build_docs', params: { hours: 3 } }, { type: 'local.content', params: { kind: 'social', hours: 2 } }]);
      expect(s.founder.usedToday).toBeLessThanOrEqual(s.founder.capacityToday * 1.25 + 1e-9);
    }
  });
});

describe('sonuç: kazanma / kaybetme', () => {
  it('nakit < 0 => kayıp, sonra adım yapılmaz', () => {
    const s = fx('l', { startingCash: 50 });
    days(s, 60);
    expect(s.outcome?.status).toBe('lost');
    const d = s.day;
    doDay(s);
    expect(s.day).toBe(d);
  });
  it('süre sonunda hedef değerlendirmesi (hızlı mod 90 gün): hiçbir şey yapmayan oyuncu kazanmaz/kaybetmez', () => {
    const s = fx('q', { mode: 'quick' });
    days(s, 200);
    expect(s.day).toBe(90);
    expect(s.outcome).not.toBeNull();
    expect(['survived', 'stagnant']).toContain(s.outcome!.status);
  });
  it('hedefler tutarsa "won"', () => {
    const s = fx('w', { mode: 'quick' });
    s.goals = { ...s.goals, mrr: 10, ltvCac: 0, paybackMonths: 1e9 };
    s.cohorts.push({ id: 99, startDay: 0, n0: 50, alive: 50, arpa: 50, onb: 0.5, byChannel: {}, churned: 0 });
    s.mrr = 2500;
    days(s, 90);
    expect(s.outcome?.status === 'won' || s.outcome?.status === 'healthy').toBe(true);
  });
  it('itibar çöküşü ve hesap kaybı kayıp sayılır', () => {
    const s = fx('r');
    s.reputation = 0.01;
    doDay(s);
    expect(s.outcome).toMatchObject({ status: 'lost', reason: 'outcome.lost.reputation' });
    const t = fx('r2');
    t.accounts.google.permanent = true;
    t.accounts.meta.permanent = true;
    doDay(t);
    expect(t.outcome).toMatchObject({ status: 'lost', reason: 'outcome.lost.accounts' });
  });
});

describe('uçtan uca koşular (fixture)', () => {
  for (const [name, pol] of [['kötü', naivePolicy], ['orta', balancedPolicy], ['iyi', carefulPolicy]] as const) {
    it(`${name} politika 365 gün: sayılar sonlu, nakit kimliği tutar`, () => {
      const s = runDays(fx('e2e-' + name), pol, 365);
      expect(findBadNumber(s)).toBeNull();
      expect(ledgerCash(s)).toBeCloseTo(s.cash, 4);
      expect(s.day).toBeLessThanOrEqual(365);
    });
  }
  it('iyi politika kötüden ortalamada daha iyi MRR üretir (duman testi)', () => {
    const avg = (pol: typeof naivePolicy) => {
      let t = 0;
      for (let i = 0; i < 6; i++) t += runDays(fx(`mc${i}`), pol, 240).mrr;
      return t / 6;
    };
    expect(avg(carefulPolicy)).toBeGreaterThan(avg(naivePolicy));
  });
  it('tohum aynı, kanallar eklenince olay akışı kaymaz (alt akış izolasyonu)', () => {
    const evs = (s: GameState) => s.events.filter((e) => e.id !== 'game_over').map((e) => `${e.day}:${e.id}`);
    const a = fx('iso');
    days(a, 80);
    const b = fx('iso');
    days(b, 80, (s) => (s.day % 7 === 0 ? [{ type: 'local.optimize_gbp', params: { hours: 1 } }] : s.day === 3 ? [{ type: 'ops.build_docs', params: { hours: 1 } }] : []));
    const c = fx('iso');
    withGoogle(c);
    withMeta(c);
    days(c, 80);
    expect(evs(b)).toEqual(evs(a));
    expect(evs(c)).toEqual(evs(a));
    expect(b.competitorIndex).toBeCloseTo(a.competitorIndex, 12);
    expect(c.competitorIndex).toBeCloseTo(a.competitorIndex, 12);
  });
  it('step sonucu olay ve rapor içerir', () => {
    const s = fx('r');
    withGoogle(s, { budget: 50 });
    const r = stepInPlace(s, []);
    expect(r.report.day).toBe(0);
    expect(Object.keys(r.report.trackedFraction)).toContain('google');
  });
  it('ilk kurulum: tohumlu başlangıç aynı kurulumda aynı nesneler', () => {
    expect(initState(fixtureBundle('us'), 'a').assets).toEqual(initState(fixtureBundle('us'), 'a').assets);
  });
});
