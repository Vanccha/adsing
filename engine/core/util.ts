// Küçük yardımcılar (saf).
import type { GameState } from './types';

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const clamp01 = (x: number): number => clamp(x, 0, 1);
export const sum = (a: readonly number[]): number => a.reduce((s, x) => s + x, 0);
export const round2 = (x: number): number => Math.round(x * 100) / 100;

/** Standart normal CDF (Abramowitz-Stegun 7.1.26 hata fonksiyonu yaklaşımı). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Aktif modifier çarpımı (target için). */
export function modMult(s: Pick<GameState, 'modifiers' | 'day'>, target: string): number {
  let m = 1;
  for (const x of s.modifiers) if (x.target === target && x.kind === 'mult' && x.from <= s.day && s.day < x.until) m *= x.value;
  return m;
}
export function modAdd(s: Pick<GameState, 'modifiers' | 'day'>, target: string): number {
  let m = 0;
  for (const x of s.modifiers) if (x.target === target && x.kind === 'add' && x.from <= s.day && s.day < x.until) m += x.value;
  return m;
}

/** 0=Pazar ... 6=Cumartesi. */
export function dayOfWeek(startDow: number, day: number): number {
  return (((startDow + day) % 7) + 7) % 7;
}
