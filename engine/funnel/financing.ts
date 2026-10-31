// Finansman: koşullu kredi / melek yatırımı teklifleri, geri ödeme, hisse maliyeti. Hepsi motor varsayımıdır (K.fin);
// aynı kimlikli parametre (fin.*) verilirse onu ezer. Kredi faizi ve anapara nakitten düşer (ledger.interestPaid/principalPaid).
import type { ActionDef, PartialDefs } from '../core/actiondef';
import { K } from '../core/constants';
import type { DayCtx } from '../core/ctx';
import { pn } from '../core/params';
import type { FinanceOffer, GameState } from '../core/types';
import { runwayMonths } from '../selectors/finance';
import { fixedMonthly } from './finance';

const fp = (s: GameState, id: string, d: number): number => pn(s, `fin.${id}`, d);

/** Eşit taksitli (anüite) aylık ödeme. */
export function annuity(principal: number, rate: number, n: number): number {
  if (rate <= 0) return principal / n;
  return (principal * rate) / (1 - Math.pow(1 + rate, -n));
}

function monthlyBurn(s: GameState): number {
  const h = s.history.slice(-30);
  if (h.length === 0) return 0;
  const net = h.reduce((a, r) => a + r.cashIn - r.cashOut, 0) / h.length;
  return net < 0 ? -net * 30 : 0;
}

/** Aşama 10 sonrası: geri ödemeler + yeni teklifler. */
export function runFinancing(s: GameState, ctx: DayCtx): void {
  const f = s.finance;
  // Geri ödemeler
  for (const l of f.loans) {
    if (l.paymentsLeft <= 0 || s.day < l.nextPaymentDay) continue;
    const interest = l.remaining * l.rateMonthly;
    const principal = Math.min(l.remaining, l.paymentMonthly - interest);
    s.cash -= interest + principal;
    s.ledger.interestPaid += interest;
    s.ledger.principalPaid += principal;
    ctx.acc.cashOut += interest + principal;
    f.interestPaid += interest;
    l.remaining -= principal;
    l.paymentsLeft -= 1;
    l.nextPaymentDay += 30;
  }
  f.loans = f.loans.filter((l) => l.paymentsLeft > 0 && l.remaining > 1e-6);
  f.offers = f.offers.filter((o) => !o.taken && o.expires > s.day);
  if (s.outcome || s.day < fp(s, 'min_day_offer', K.fin.minDayOffer)) return;

  const recent = (kind: FinanceOffer['kind']): boolean => f.offers.some((o) => o.kind === kind) || (s.decisions.some((d) => d.action.type === (kind === 'loan' ? 'fin.take_loan' : 'fin.accept_investment') && d.status !== 'rejected' && d.day > s.day - fp(s, 'offer_gap_days', K.fin.offerGapDays)));
  const days = fp(s, 'offer_days', K.fin.offerDays);
  // Kredi: nakit ömrü kısa ama gelir var
  const runway = runwayMonths(s);
  if (!recent('loan') && f.loans.length === 0 && s.mrr > 0 && runway < fp(s, 'loan.runway_trigger', K.fin.loanRunwayTrigger) && Number.isFinite(runway)) {
    const amount = Math.round(Math.max(fp(s, 'loan.mrr_mult', K.fin.loanMrrMult) * s.mrr, 6 * monthlyBurn(s)));
    f.offers.push({ id: `fo${f.nextOfferId++}`, kind: 'loan', amount, rateMonthly: fp(s, 'loan.rate_monthly', K.fin.loanRateMonthly), termMonths: Math.round(fp(s, 'loan.term_months', K.fin.loanTermMonths)), equity: 0, expires: s.day + days, taken: false });
    ctx.events.push({ day: s.day, id: 'finance_offer', key: 'event.finance_offer', params: { kind: 'loan', amount }, tone: 'info' });
  }
  // Melek yatırımı: büyüme göstergesi (MRR hedefin bir oranı)
  if (!recent('angel') && f.equitySold < 0.3 && s.day >= 90 && s.mrr >= fp(s, 'angel.mrr_frac', K.fin.angelMrrFrac) * s.goals.mrr) {
    const amount = Math.round(fp(s, 'angel.cash_months', K.fin.angelCashMonths) * fixedMonthly(s));
    f.offers.push({ id: `fo${f.nextOfferId++}`, kind: 'angel', amount, rateMonthly: 0, termMonths: 0, equity: fp(s, 'angel.equity', K.fin.angelEquity), expires: s.day + days, taken: false });
    ctx.events.push({ day: s.day, id: 'finance_offer', key: 'event.finance_offer', params: { kind: 'angel', amount }, tone: 'info' });
  }
}

const findOffer = (s: GameState, id: string, kind: FinanceOffer['kind']): FinanceOffer | undefined => s.finance.offers.find((o) => o.id === id && o.kind === kind && !o.taken && o.expires > s.day);

const takeLoan: ActionDef<'fin.take_loan'> = {
  minHours: 2,
  hours: () => 3,
  cash: () => 0,
  check: (p, s) => (findOffer(s, p.offerId, 'loan') ? null : 'err.unknown_offer'),
  apply: (p, s) => {
    const o = findOffer(s, p.offerId, 'loan')!;
    o.taken = true;
    s.cash += o.amount;
    s.ledger.financingIn += o.amount;
    s.finance.raised += o.amount;
    s.finance.loans.push({ id: o.id, principal: o.amount, remaining: o.amount, rateMonthly: o.rateMonthly, paymentMonthly: annuity(o.amount, o.rateMonthly, o.termMonths), nextPaymentDay: s.day + 30, paymentsLeft: o.termMonths });
  },
};

const acceptInvestment: ActionDef<'fin.accept_investment'> = {
  minHours: 4,
  hours: () => 8,
  cash: () => 0,
  check: (p, s) => (findOffer(s, p.offerId, 'angel') ? null : 'err.unknown_offer'),
  apply: (p, s) => {
    const o = findOffer(s, p.offerId, 'angel')!;
    o.taken = true;
    s.cash += o.amount;
    s.ledger.financingIn += o.amount;
    s.finance.raised += o.amount;
    s.finance.equitySold += o.equity;
  },
};

export const financeActions: PartialDefs = { 'fin.take_loan': takeLoan, 'fin.accept_investment': acceptInvestment };
