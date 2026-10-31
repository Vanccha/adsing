// Nakit akışı özetleri: runway.
import type { GameState } from '../core/types';

/** Son 30 günlük ortalama net yakım üzerinden nakit ömrü (ay). Yakım yoksa sonsuz. */
export function runwayMonths(s: GameState): number {
  const h = s.history.slice(-30);
  if (h.length === 0) return Infinity;
  const net = h.reduce((a, r) => a + r.cashIn - r.cashOut, 0) / h.length;
  if (net >= 0) return Infinity;
  return Math.max(0, s.cash) / (-net * 30);
}
