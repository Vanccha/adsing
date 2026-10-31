// Beta-Binomial keşfi: gözlenen (n, kObs) ile posterior, güvenilir aralık, P(A>B), "yeterli veri yok" bayrağı.
// Önsel ortalamayı oyuncu "sektör ortalaması" olarak bilir (pazar parametresi); gerçek latent bilinmez.
import { betaQuantile, probBetaGreater } from '../rng/stats';
import { K } from '../core/constants';
import type { StatCounter } from '../core/types';

export interface Posterior {
  n: number;
  k: number;
  alpha: number;
  beta: number;
  mean: number;
  lo: number;
  hi: number;
  level: number;
  insufficient: boolean; // "yeterli veri yok"
}

export interface BayesOpts {
  strength?: number;
  level?: number;
  minN?: number;
  minRelWidth?: number;
}

export function posterior(c: StatCounter, priorMean: number, o: BayesOpts = {}): Posterior {
  const strength = o.strength ?? K.priorStrength;
  const level = o.level ?? K.ciLevel;
  const minN = o.minN ?? K.minN;
  const minRel = o.minRelWidth ?? K.minCiRelWidth;
  const pm = Math.min(0.999, Math.max(0.0005, priorMean));
  const a0 = pm * strength;
  const b0 = (1 - pm) * strength;
  const k = Math.min(c.kObs, c.n);
  const alpha = a0 + k;
  const beta = b0 + (c.n - k);
  const mean = alpha / (alpha + beta);
  const tail = (1 - level) / 2;
  const lo = betaQuantile(tail, alpha, beta);
  const hi = betaQuantile(1 - tail, alpha, beta);
  const insufficient = c.n < minN || (hi - lo) / Math.max(mean, 1e-9) > minRel;
  return { n: c.n, k, alpha, beta, mean, lo, hi, level, insufficient };
}

/** P(A>B) — iki posterior arasında. */
export function probAGreaterB(a: Posterior, b: Posterior): number {
  return probBetaGreater(a.alpha, a.beta, b.alpha, b.beta);
}
