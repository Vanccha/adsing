// Monte Carlo: referans politikalar x tohum x pazar.
// Kullanım: npm run mc -- [--runs=20] [--markets=us,de,tr] [--days=365] [--difficulty=normal] [--scenario=salon-saas]
import { initState, runDays } from '../engine/core';
import type { Policy } from '../engine/core';
import { balancedPolicy, carefulPolicy, naivePolicy } from '../engine/bots/reference';
import type { MarketId } from '../engine/data/schema';
import { activeCustomers } from '../engine/funnel/customers';
import { unitEconomics } from '../engine/funnel/finance';
import { loadBundle, ROOT } from './lib/bundle';

const arg = (k: string, d: string): string => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const runs = Number(arg('runs', '20'));
const days = Number(arg('days', '365'));
const markets = arg('markets', 'us,de,tr').split(',') as MarketId[];
const difficulty = arg('difficulty', 'normal') as 'easy' | 'normal' | 'hard';
const scenario = arg('scenario', 'salon-saas');

const policies: Array<[string, Policy]> = [
  ['boş', () => []], // hiçbir şey yapmayan oyuncu: pazarlamasız taban
  ['kötü', naivePolicy],
  ['orta', balancedPolicy],
  ['iyi', carefulPolicy],
];

const pct = (xs: number[], q: number): number => {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))] ?? 0;
};

/** P(alt politikanın aynı tohumdaki sonucu üsttekini geçer): beceri-şans örtüşmesi. */
const upset = (lo: number[], hi: number[]): number => lo.filter((x, i) => x > (hi[i] ?? 0)).length / Math.max(lo.length, 1);

console.log(`Monte Carlo: ${runs} tohum, ${days} gün, zorluk=${difficulty}, senaryo=${scenario}`);
for (const m of markets) {
  const bundle = loadBundle(ROOT, m, scenario);
  const mrrs: Record<string, number[]> = {};
  for (const [name, pol] of policies) {
    const res = { paidShare: [] as number[], acquired: [] as number[], adCac: [] as number[], mrr: [] as number[], cust: [] as number[], ltvcac: [] as number[], status: {} as Record<string, number>, lostDay: [] as number[] };
    for (let i = 0; i < runs; i++) {
      const s0 = initState(bundle, `mc-${i}`, { difficulty, mode: days <= 90 ? 'quick' : 'full' });
      const s = runDays(s0, pol, days);
      res.mrr.push(s.mrr);
      const by = s.funnel.byChannel;
      const total = Object.values(by).reduce((a, b) => a + (b?.paid ?? 0), 0);
      const ads = (by.google?.paid ?? 0) + (by.meta?.paid ?? 0);
      res.acquired.push(total);
      if (total > 0) res.paidShare.push(ads / total);
      if (ads > 0) res.adCac.push(s.ledger.adSpend / ads);
      res.cust.push(activeCustomers(s));
      res.ltvcac.push(unitEconomics(s, 90).ltvCac ?? 0);
      const st = s.outcome?.status ?? 'open';
      res.status[st] = (res.status[st] ?? 0) + 1;
      if (st === 'lost') res.lostDay.push(s.day);
    }
    mrrs[name] = res.mrr;
    const f = (x: number) => x.toFixed(0);
    const dist = ['won', 'healthy', 'survived', 'stagnant', 'lost'].map((k) => `${k} ${res.status[k] ?? 0}`).join(' ');
    const lost = res.lostDay.length ? ` | batış günü medyan ${pct(res.lostDay, 0.5)}` : '';
    console.log(`${m} ${name.padEnd(4)} | MRR medyan ${f(pct(res.mrr, 0.5))} [p10 ${f(pct(res.mrr, 0.1))}, p90 ${f(pct(res.mrr, 0.9))}] | müşteri ${f(pct(res.cust, 0.5))} | kazanılan ${f(pct(res.acquired, 0.5))} | reklam payı %${f(100 * pct(res.paidShare, 0.5))} | reklam CAC ${f(pct(res.adCac, 0.5))} | LTV:CAC ${pct(res.ltvcac, 0.5).toFixed(2)} | ${dist}${lost}`);
  }
  console.log(`${m} örtüşme | P(kötü > orta) ${upset(mrrs['kötü']!, mrrs['orta']!).toFixed(2)} | P(orta > iyi) ${upset(mrrs['orta']!, mrrs['iyi']!).toFixed(2)}`);
}
