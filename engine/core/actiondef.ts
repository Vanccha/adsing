// Aksiyon tanımı arayüzü: her modül kendi aksiyonlarının saat/nakit/doğrulama/uygulama mantığını burada kaydeder.
import type { ActionParamsMap, ActionType, GameState } from './types';
import type { DayCtx } from './ctx';

export interface ActionDef<T extends ActionType> {
  /** Gereken kurucu saati. */
  hours: (p: ActionParamsMap[T], s: GameState) => number;
  /** Peşin nakit maliyeti. */
  cash: (p: ActionParamsMap[T], s: GameState) => number;
  /** Geçersizse i18n hata anahtarı, geçerliyse null. */
  check: (p: ActionParamsMap[T], s: GameState) => string | null;
  /** Durumu değiştirir (rng gerekiyorsa ctx.root.fork kullanın). */
  apply: (p: ActionParamsMap[T], s: GameState, ctx: DayCtx) => void;
  /** Kullanılabilirlik listesi için asgari saat/nakit tahmini. */
  minHours: number;
}
export type ActionDefs = { [T in ActionType]: ActionDef<T> };
export type PartialDefs = { [T in ActionType]?: ActionDef<T> };

export const posNum = (x: unknown): boolean => typeof x === 'number' && Number.isFinite(x) && x > 0;
