// Monte Carlo: referans politikalar x tohum x pazar. Kullanım: npm run mc -- [--runs=20] [--markets=us,de,tr] [--days=365] [--difficulty=normal]
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

const policies: Array<[string, Policy]> = [
  ['kötü', naivePolicy],
  ['orta', balancedPolicy],
  ['iyi', carefulPolicy],
];

const pct = (xs: number[], q: number): number => {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))] ?? 0;
};

console.log(`Monte Carlo: ${runs} tohum, ${days} gün, zorluk=${difficulty}`);
for (const m of markets) {
  const bundle = loadBundle(ROOT, m);
  for (const [name, pol] of policies) {
    const res = { mrr: [] as number[], cust: [] as number[], cash: [] as number[], ltvcac: [] as number[], lost: 0, won: 0, healthy: 0 };
    for (let i = 0; i < runs; i++) {
      const s0 = initState(bundle, `mc-${i}`, { difficulty, mode: days <= 90 ? 'quick' : 'full' });
      const s = runDays(s0, pol, days);
      res.mrr.push(s.mrr);
      res.cust.push(activeCustomers(s));
      res.cash.push(s.cash);
      const ue = unitEconomics(s, 90);
      res.ltvcac.push(ue.ltvCac ?? 0);
      if (s.outcome?.status === 'lost') res.lost++;
      if (s.outcome?.status === 'won') res.won++;
      if (s.outcome?.status === 'healthy') res.healthy++;
    }
    const f = (x: number) => x.toFixed(1);
    console.log(`${m} ${name.padEnd(4)} | MRR medyan ${f(pct(res.mrr, 0.5))} [p10 ${f(pct(res.mrr, 0.1))}, p90 ${f(pct(res.mrr, 0.9))}] | müşteri ${f(pct(res.cust, 0.5))} | LTV:CAC ${pct(res.ltvcac, 0.5).toFixed(2)} | kayıp ${res.lost}/${runs} | sağlıklı ${res.healthy} | kazanan ${res.won}`);
  }
}
