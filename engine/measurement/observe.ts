// Gerçek vs gözlenen: günlük platform / analitik / CRM raporları üretir.
// - Platform: izlenen dönüşüm (onay kaybı, ATT, etiket sağlığı, çevrimdışı pay) x aşırı raporlama (atıf şişmesi, view-through);
//   küçük hesapta ek görünürlük kaybı. Platform yalnız kendi kanalını (google/meta) görür.
// - Analitik: tüm kanalların izlenebilir kısmı (şişirme yok).
// - CRM: gerçeğe yakın ama kayıpl / gecikmeli (gecikme seçicilerde uygulanır).
import type { Rng } from '../rng';
import { K } from '../core/constants';
import type { DayCtx } from '../core/ctx';
import type { GameState, PaidChannel } from '../core/types';
import { platformOverreport, smallAccountVisibility, trackedFraction } from './tracking';

export function observeDay(s: GameState, ctx: DayCtx, rng: Rng): void {
  const acc = ctx.acc;
  const tfG = trackedFraction(s, 'google');
  const tfM = trackedFraction(s, 'meta');
  const tfA = trackedFraction(s, 'analytics');
  acc.trackedFraction = { google: tfG, meta: tfM, analytics: tfA };
  const over = platformOverreport(s);
  const clicksBy: Record<PaidChannel, number> = { google: 0, meta: 0 };
  for (const b of ctx.batches) clicksBy[b.channel] += b.clicks;
  for (const ch of ['google', 'meta'] as const) {
    const t = acc.leads[ch] ?? 0;
    const seen = rng.fork(`platform.${ch}`).binomial(t, ch === 'google' ? tfG : tfM);
    acc.platformConv[ch] = seen * over * smallAccountVisibility(s, clicksBy[ch]);
  }
  let total = 0;
  for (const v of Object.values(acc.leads)) total += v;
  acc.analyticsConv = rng.fork('analytics').binomial(total, tfA);
  acc.crmLeads = rng.fork('crm.leads').binomial(total, 1 - K.platformCrmMissRate);
  let paid = 0;
  for (const v of Object.values(acc.newCustomers)) paid += v;
  acc.crmCustomers = rng.fork('crm.cust').binomial(paid, 1 - K.platformCrmMissRate / 2);
}
