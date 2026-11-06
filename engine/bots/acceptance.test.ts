// Bot kabul testleri (Monte Carlo): beceri sonucu belirler ama şans payı görünür kalır (docs/plan/model-draft.md §14).
// CI boyutu küçük tutulur; ayrıntılı rapor: npm run mc.
import { describe, expect, it } from 'vitest';
import { extractLog, initState, runDays } from '../core';
import type { Difficulty, GameState, Mode, Policy } from '../core';
import type { MarketId } from '../data/schema';
import { realBundle } from '../test-fixtures/helpers';
import { balancedPolicy, carefulPolicy, carefulPolicyFewData, makeCarefulPolicy, naivePolicy } from './reference';

const MARKETS: MarketId[] = ['us', 'de', 'tr'];
const SEEDS = 24;
const play = (m: MarketId, pol: Policy, i: number, difficulty: Difficulty = 'normal', mode: Mode = 'full'): GameState =>
  runDays(initState(realBundle(m), `acc-${i}`, { difficulty, mode }), pol, mode === 'quick' ? 90 : 365);
const batch = (m: MarketId, pol: Policy, difficulty: Difficulty = 'normal', mode: Mode = 'full'): GameState[] => Array.from({ length: SEEDS }, (_, i) => play(m, pol, i, difficulty, mode));
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const share = (xs: GameState[], f: (s: GameState) => boolean): number => xs.filter(f).length / xs.length;
const status = (s: GameState): string => s.outcome?.status ?? 'open';

describe.each(MARKETS)('denge: %s', (m) => {
  const bad = batch(m, naivePolicy);
  const mid = batch(m, balancedPolicy);
  const good = batch(m, carefulPolicy);

  it('medyan MRR: iyi > orta > kötü', () => {
    expect(median(good.map((s) => s.mrr))).toBeGreaterThan(median(mid.map((s) => s.mrr)));
    expect(median(mid.map((s) => s.mrr))).toBeGreaterThan(median(bad.map((s) => s.mrr)));
  });

  it('hayatta kalma: iyi ≥ orta, kötü bot sık batar', () => {
    const lost = (xs: GameState[]) => share(xs, (s) => status(s) === 'lost');
    expect(lost(good)).toBeLessThanOrEqual(lost(bad));
    expect(lost(good)).toBeLessThan(0.2);
    expect(lost(bad)).toBeGreaterThan(0.3);
  });

  it('beceri garanti değil: iyi bot her tohumda kazanmaz; hedef ulaşılabilir ama kolay değil', () => {
    const won = share(good, (s) => status(s) === 'won');
    expect(won).toBeLessThan(0.5);
    expect(share(good, (s) => status(s) === 'won' || status(s) === 'healthy')).toBeGreaterThan(0.1);
  });

  it('dağılımlar açıkça yayılır (şansın rolü görünür)', () => {
    const xs = good.map((s) => s.mrr).sort((a, b) => a - b);
    expect(xs[Math.floor(0.9 * xs.length)]!).toBeGreaterThan(1.3 * xs[Math.floor(0.1 * xs.length)]!);
  });
});

describe('zorluk ve kipler', () => {
  it('zorluk kötü botun ömrünü kısaltır (kolay > zor)', () => {
    for (const m of MARKETS) {
      const lifespan = (d: Difficulty) => batch(m, naivePolicy, d).reduce((a, s) => a + s.day, 0);
      expect(lifespan('easy')).toBeGreaterThan(lifespan('hard'));
    }
  });

  it('hızlı kip (90 gün): kazanmak mümkün, ölüm yok denecek kadar az, iyi ≥ orta', () => {
    let won = 0;
    for (const m of MARKETS) {
      const good = batch(m, carefulPolicy, 'normal', 'quick');
      const mid = batch(m, balancedPolicy, 'normal', 'quick');
      won += good.filter((s) => status(s) === 'won').length;
      expect(share(good, (s) => status(s) === 'lost')).toBeLessThan(0.1);
      expect(median(good.map((s) => s.mrr))).toBeGreaterThanOrEqual(median(mid.map((s) => s.mrr)));
    }
    expect(won).toBeGreaterThan(0);
  });
});

describe('ilişki 7 (oyun içi): az veriyle kazanan seçmek daha sık yanılır', () => {
  it('10 ziyarette karar, 80+ ziyaret ve güven eşiğinden daha az isabetli', () => {
    const accuracy = (pol: Policy): { hit: number; n: number } => {
      let hit = 0;
      let n = 0;
      for (const m of MARKETS) {
        for (let i = 0; i < 40; i++) {
          const s = play(m, pol, i);
          for (const d of s.decisions) {
            if (d.action.type !== 'gads.set_lp' || d.status === 'rejected') continue;
            const t = s.tests.ab.find((x) => x.b === (d.action.params as { lpId: string }).lpId);
            const a = s.assets.lps.find((l) => l.id === t?.a);
            const b = s.assets.lps.find((l) => l.id === t?.b);
            if (!a || !b) continue;
            n += 1;
            if (b.q > a.q) hit += 1;
          }
        }
      }
      return { hit, n };
    };
    const careful = accuracy(carefulPolicy);
    const few = accuracy(carefulPolicyFewData);
    expect(careful.n).toBeGreaterThan(5);
    expect(few.n).toBeGreaterThan(careful.n); // az veri daha çok (gereksiz) değişiklik yapar
    expect(careful.hit / careful.n).toBeGreaterThan(few.hit / few.n);
  });
});

describe('yeniden oynatma', () => {
  it('ActionLog + tohum tüm botlarda 365 günü birebir üretir (kayıt/yükleme garantisi)', () => {
    for (const m of MARKETS) {
      for (const pol of [naivePolicy, balancedPolicy, carefulPolicy]) {
        const s0 = initState(realBundle(m), 'replay', { difficulty: 'normal', mode: 'full' });
        const s = runDays(s0, pol, 365);
        const r = runDays(s0, extractLog(s), 365);
        expect(r.cash).toBe(s.cash);
        expect(r.mrr).toBe(s.mrr);
        expect(r.outcome).toEqual(s.outcome);
      }
    }
  });
});

const acquired = (s: GameState) => Object.values(s.funnel.byChannel).reduce((a, b) => a + (b?.paid ?? 0), 0);
const adShare = (s: GameState) => {
  const total = acquired(s);
  return total > 0 ? ((s.funnel.byChannel.google?.paid ?? 0) + (s.funnel.byChannel.meta?.paid ?? 0)) / total : 0;
};

describe.each(MARKETS)('kanal ekonomisi (dengeli karışım): %s', (m) => {
  it('hiçbir şey yapmayan oyuncu büyüyemez', () => {
    const idle = batch(m, () => []);
    expect(median(idle.map(acquired))).toBeLessThan(10);
    expect(share(idle, (s) => status(s) === 'won' || status(s) === 'healthy')).toBe(0);
  });

  it('iyi oyuncunun müşterilerinin yaklaşık yarısı reklamdan, kalanı içerik ve yerel kanallardan gelir', () => {
    const v = median(batch(m, carefulPolicy).map(adShare));
    expect(v).toBeGreaterThan(0.3);
    expect(v).toBeLessThan(0.6);
  });

  it('içerik kararları reklam verimini artırır (aynı bot, mesaj/konu/yapı kapalı)', () => {
    const cac = (xs: GameState[]) => {
      const spend = xs.reduce((a, s) => a + s.ledger.adSpend, 0);
      const won = xs.reduce((a, s) => a + (s.funnel.byChannel.google?.paid ?? 0), 0);
      return spend / Math.max(won, 1);
    };
    expect(cac(batch(m, carefulPolicy))).toBeLessThan(cac(batch(m, makeCarefulPolicy({ contentDecisions: false }))));
  });
});
