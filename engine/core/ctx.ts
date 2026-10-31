// Günlük bağlam: step sırasında modüller arası taşınan geçici (state'e yazılmayan) veriler.
import type { Rng } from '../rng';
import type { ActionResult, GameEvent, LeadChannel, MrrMove, PaidChannel, StageCounts } from './types';
import type { ClassKey } from './constants';

export interface ClickBatch {
  channel: PaidChannel;
  ref: string; // kampanya / reklam seti kimliği
  cls: ClassKey;
  impressions: number;
  clicks: number;
  cost: number;
  lpId: string;
  offerId: string;
  mode: 'lp' | 'message';
  cvrMult: number; // kanal/kitle/öğrenme dönüşüm çarpanı
  qualMult: number;
  nonIncr: number; // artımsal olmayan pay (0-1)
  tauMult: number;
}

export interface DayAcc {
  stages: StageCounts;
  spend: Record<string, number>;
  leads: Record<string, number>;
  incrLeads: Record<string, number>;
  newCustomers: Record<string, number>;
  leadsByRef: Record<string, number>; // kampanya/reklam seti -> gerçek lead
  displaced: number; // organik tabandan yer değiştiren
  organicBase: number;
  cashIn: number;
  cashOut: number;
  revenueNet: number;
  mrrMove: MrrMove;
  churned: number;
  crmLeads: number;
  crmCustomers: number;
  platformConv: Record<string, number>;
  analyticsConv: number;
  trackedFraction: Record<string, number>;
}

export interface DayCtx {
  root: Rng; // gün kökü: her modül root.fork(etiket) ile bağımsız akış alır
  events: GameEvent[];
  actionResults: ActionResult[];
  cashLimit: number; // bugün reklama harcanabilecek kalan nakit
  batches: ClickBatch[];
  acc: DayAcc;
}

export const emptyStages = (): StageCounts => ({ impressions: 0, clicks: 0, visits: 0, leads: 0, qualified: 0, trials: 0, activated: 0, paid: 0 });

export function newAcc(): DayAcc {
  return {
    stages: emptyStages(),
    spend: {},
    leads: {},
    incrLeads: {},
    newCustomers: {},
    leadsByRef: {},
    displaced: 0,
    organicBase: 0,
    cashIn: 0,
    cashOut: 0,
    revenueNet: 0,
    mrrMove: { new: 0, expansion: 0, contraction: 0, churn: 0 },
    churned: 0,
    crmLeads: 0,
    crmCustomers: 0,
    platformConv: {},
    analyticsConv: 0,
    trackedFraction: {},
  };
}

export function addTo(rec: Record<string, number>, key: string, v: number): void {
  rec[key] = (rec[key] ?? 0) + v;
}

export type { LeadChannel };
