// Kazanma / kaybetme: nakit < 0, hesap kalıcı askı, itibar çöküşü, kurucu tükenmesi; süre sonunda hedef değerlendirmesi.
// Ara durumlar: hayatta ama büyümüyor (stagnant), sağlıklı (healthy), ölçeklendi (won). Eşikler senaryodan (scn.goal.*).
import type { GameState, Goals, Outcome } from './types';
import { activeCustomers } from '../funnel/customers';
import { unitEconomics } from '../funnel/finance';
import { runwayMonths } from '../selectors/finance';

export function checkLoss(s: GameState): Outcome | null {
  if (s.cash < 0) return { status: 'lost', reason: 'outcome.lost.cash', day: s.day, detail: { cash: Math.round(s.cash) } };
  if (s.accounts.google.permanent && s.accounts.meta.permanent) return { status: 'lost', reason: 'outcome.lost.accounts', day: s.day, detail: {} };
  if (s.reputation < s.goals.reputationFloor) return { status: 'lost', reason: 'outcome.lost.reputation', day: s.day, detail: { reputation: s.reputation } };
  if (s.founder.burnout >= 1) return { status: 'lost', reason: 'outcome.lost.burnout', day: s.day, detail: {} };
  return null;
}

export function evaluateEnd(s: GameState): Outcome {
  const g: Goals = s.goals;
  const ue = unitEconomics(s, Math.min(90, s.horizon));
  const mrr = s.mrr;
  const cust = activeCustomers(s);
  const ltvCac = ue.ltvCac ?? 0;
  const payback = ue.paybackMonths ?? Infinity;
  const runway = runwayMonths(s);
  const detail = { mrr: Math.round(mrr), customers: cust, equitySold: Math.round(s.finance.equitySold * 100) / 100, ltvCac: Math.round(ltvCac * 100) / 100, paybackMonths: Number.isFinite(payback) ? Math.round(payback * 10) / 10 : 'inf', runwayMonths: Number.isFinite(runway) ? Math.round(runway * 10) / 10 : 'inf' };
  const customersOk = g.customers === undefined || cust >= g.customers;
  const runwayOk = g.minRunwayMonths === undefined || runway >= g.minRunwayMonths;
  const cashOk = g.minCashRatio === undefined || s.cash >= g.minCashRatio * s.startCash;
  const hit = mrr >= g.mrr && customersOk && runwayOk && cashOk && ltvCac >= g.ltvCac && payback <= g.paybackMonths;
  if (hit) return { status: 'won', reason: 'outcome.won.scaled', day: s.day, detail };
  const m90 = s.history.length > 90 ? s.history[s.history.length - 91]?.mrr ?? 0 : 0;
  const growing = mrr > m90 * 1.05;
  if (mrr >= 0.5 * g.mrr && (ltvCac >= g.ltvCac || payback <= g.paybackMonths || runway >= 6)) return { status: 'healthy', reason: 'outcome.healthy', day: s.day, detail };
  if (!growing) return { status: 'stagnant', reason: 'outcome.stagnant', day: s.day, detail };
  return { status: 'survived', reason: 'outcome.survived', day: s.day, detail };
}
