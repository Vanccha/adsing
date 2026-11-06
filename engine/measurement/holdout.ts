// Basit holdout / geo testi: bölgelerin bir kısmında kanal kapatılır; artımsal lead tahmini + güven aralığı.
// Gerçek model: kontrol bölgesi (1-σ) beklenen = (1-σ)·O + I_c, holdout bölgesi σ·O·(1+ε)  (O: organik taban, I_c: artımsal reklam leadi).
// Tahmin gürültülüdür (Poisson + bölge benzerliği ε); yetersiz güçte "belirsiz" döner.
import type { Rng } from '../rng';
import type { DayCtx } from '../core/ctx';
import type { GameState, Holdout, HoldoutResult, PaidChannel } from '../core/types';

export function holdoutScale(s: Pick<GameState, 'tests' | 'day'>, ch: PaidChannel): number {
  for (const h of s.tests.holdouts) if (h.status === 'running' && h.channel === ch && h.startDay <= s.day) return 1 - h.share;
  return 1;
}

export function startHoldout(s: GameState, ch: PaidChannel, share: number, days: number, rng: Rng): Holdout {
  const h: Holdout = {
    id: `ho${s.tests.holdouts.length + 1}`,
    channel: ch,
    share,
    startDay: s.day,
    endDay: s.day + days,
    status: 'running',
    regionNoise: rng.normal(0, 0.1),
    controlLeads: 0,
    holdoutLeads: 0,
    days: 0,
    reportedLeads: 0,
    result: null,
  };
  s.tests.holdouts.push(h);
  return h;
}

export function finalizeHoldout(h: Holdout): HoldoutResult {
  const T = Math.max(h.days, 1);
  const sg = h.share;
  const rc = h.controlLeads / ((1 - sg) * T);
  const rh = h.holdoutLeads / (sg * T);
  const incr = rc - rh;
  const se = Math.sqrt(h.controlLeads / Math.pow((1 - sg) * T, 2) + h.holdoutLeads / Math.pow(sg * T, 2));
  const reported = h.reportedLeads / ((1 - sg) * T);
  const res: HoldoutResult = {
    incrPerDay: incr,
    ciLow: incr - 1.645 * se,
    ciHigh: incr + 1.645 * se,
    reportedPerDay: reported,
    incrShare: reported > 0 ? incr / reported : 0,
    conclusive: 1.645 * 2 * se <= 1.2 * Math.max(Math.abs(incr), 1e-9),
  };
  h.result = res;
  return res;
}

/** Gün sonu: çalışan testlere günlük (Poisson) sayımları ekler, süresi dolanı kapatır. */
export function accumulateHoldouts(s: GameState, ctx: DayCtx, rng: Rng): void {
  for (const h of s.tests.holdouts) {
    if (h.status !== 'running') continue;
    const r = rng.fork(`holdout.${h.id}`);
    const O = ctx.acc.organicBase;
    const I = ctx.acc.incrLeads[h.channel] ?? 0;
    h.controlLeads += r.poisson((1 - h.share) * O + I);
    h.holdoutLeads += r.poisson(Math.max(0, h.share * O * (1 + h.regionNoise)));
    h.reportedLeads += ctx.acc.platformConv[h.channel] ?? 0;
    h.days += 1;
    if (s.day + 1 >= h.endDay) {
      h.status = 'done';
      finalizeHoldout(h);
    }
  }
}
