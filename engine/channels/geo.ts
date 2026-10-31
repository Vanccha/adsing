// GEO (üretken arama / yanıt motoru görünürlüğü): YALNIZCA ÇEKİRDEK (Aşama 2'de derinleşir).
// v(t+1) = v + gain * (gecikmeli yatırım) - decay * v; yatırım gamma çekirdeğiyle ileri tarihe yayılır.
// Etki aralıklı: günlük "bahsedilme" ~ Bernoulli(v). Gözlenen görünürlük skoru gürültülü (bkz. selectors).
import type { ActionDef, PartialDefs } from '../core/actiondef';
import { posNum } from '../core/actiondef';
import { pn } from '../core/params';
import type { GameState } from '../core/types';

/** Gamma(2, lag/2) çekirdeği (ortalama gecikme = lag gün), normalize edilmiş ayrık ağırlıklar. */
export function geoKernel(lag: number, len: number): number[] {
  const theta = Math.max(lag / 2, 1);
  const w: number[] = [];
  let sum = 0;
  for (let k = 0; k < len; k++) {
    const x = (k + 0.5) / theta;
    const v = x * Math.exp(-x);
    w.push(v);
    sum += v;
  }
  return w.map((x) => x / sum);
}

export function geoLen(s: GameState): number {
  return Math.min(240, Math.max(10, Math.round(3 * pn(s, 'geo.lag_days', 60))));
}

const invest: ActionDef<'geo.invest'> = {
  minHours: 1,
  hours: (p) => p.hours,
  cash: () => 0,
  check: (p) => (posNum(p.hours) ? null : 'err.bad_hours'),
  apply: (p, s) => {
    const len = geoLen(s);
    while (s.geo.pipeline.length < len) s.geo.pipeline.push(0);
    const w = geoKernel(pn(s, 'geo.lag_days', 60), len);
    for (let k = 0; k < len; k++) s.geo.pipeline[k] = (s.geo.pipeline[k] ?? 0) + p.hours * (w[k] as number);
  },
};

export const geoActions: PartialDefs = { 'geo.invest': invest };
