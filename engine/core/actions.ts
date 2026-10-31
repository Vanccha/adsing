// Aksiyon kaydı + doğrulama. Her modül kendi tanımlarını verir; burada birleştirilir.
import { caseActions } from '../cases/actions';
import { geoActions } from '../channels/geo';
import { googleActions } from '../channels/google.actions';
import { localActions } from '../channels/local';
import { metaActions } from '../channels/meta.actions';
import { opsActions } from '../funnel/actions';
import { financeActions } from '../funnel/financing';
import { measurementActions } from '../measurement/actions';
import { qualityActions } from '../quality/actions';
import type { ActionDef, ActionDefs } from './actiondef';
import type { Action, ActionType, GameState } from './types';

export const ACTION_DEFS: ActionDefs = {
  ...googleActions,
  ...metaActions,
  ...qualityActions,
  ...measurementActions,
  ...opsActions,
  ...localActions,
  ...geoActions,
  ...financeActions,
  ...caseActions,
} as ActionDefs;

export const ACTION_TYPES = Object.keys(ACTION_DEFS) as ActionType[];

export function defOf<T extends ActionType>(type: T): ActionDef<T> {
  return ACTION_DEFS[type] as ActionDef<T>;
}

export interface Validation {
  ok: boolean;
  reason?: { key: string; params?: Record<string, number | string> };
  hours: number;
  cash: number;
}

/** Aksiyonun geçerliliği (kaynak/kimlik/aralık). Saat ve nakit yeterliliği step içinde ayrıca denetlenir. */
export function validateAction(s: GameState, a: Action): Validation {
  const def = ACTION_DEFS[a.type] as ActionDef<typeof a.type> | undefined;
  if (!def) return { ok: false, reason: { key: 'err.unknown_action' }, hours: 0, cash: 0 };
  if (s.outcome) return { ok: false, reason: { key: 'err.game_over' }, hours: 0, cash: 0 };
  const params = a.params as never;
  let hours = 0;
  let cash = 0;
  try {
    const err = (def.check as (p: unknown, s: GameState) => string | null)(params, s);
    hours = (def.hours as (p: unknown, s: GameState) => number)(params, s);
    cash = (def.cash as (p: unknown, s: GameState) => number)(params, s);
    if (err) return { ok: false, reason: { key: err }, hours, cash };
  } catch {
    return { ok: false, reason: { key: 'err.bad_params' }, hours, cash };
  }
  if (a.hours !== undefined) {
    if (!(a.hours >= 0)) return { ok: false, reason: { key: 'err.bad_hours' }, hours, cash };
    hours = Math.max(hours, a.hours); // saat geçersiz kılma yalnızca artırabilir
  }
  return { ok: true, hours, cash };
}
