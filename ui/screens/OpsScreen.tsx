import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActBtn, QueuePanel } from '../components/Actions';
import { FactBadge } from '../components/FactBadge';
import { NumInput, Select } from '../components/Fields';
import type { Segment } from '@engine/core';
import { Hint } from '../components/Hint';
import { weekHours } from './Dashboard';
import { useGame } from '../game/GameContext';

export function OpsScreen() {
  const { t } = useTranslation();
  const g = useGame();
  const s = g.state!;
  const { fmt } = g;
  const [price, setPrice] = useState(Math.round(s.product.price));
  const [sales, setSales] = useState(s.founder.reserved.sales);
  const [onb, setOnb] = useState(s.founder.reserved.onboarding);
  const [docs, setDocs] = useState(4);
  const [seg, setSeg] = useState<Segment>(s.product.segment);
  const wh = weekHours(s);
  return (
    <div className="stack">
      <h1>{t('nav.ops')}</h1>
      <section className="card">
        <h2>{t('ops.founder')}</h2>
        <p>{t('ops.week_hours', { used: fmt.num(wh.used, 1), cap: fmt.num(wh.capacity, 0), left: fmt.num(wh.remaining, 1) })} <FactBadge id="founder.hours_per_week" /></p>
        <p className="small muted">{t('ops.burnout', { v: fmt.pct(s.founder.burnout, 0) })} · {t('ops.queued', { n: s.founder.queue.length })}</p>
        <Hint k="hint.hours" />
        {s.founder.queue.length ? (
          <div className="notice warn small">{t('ops.queue_note')}</div>
        ) : null}
      </section>
      <div className="grid cols-2">
        <section className="card">
          <h2>{t('ops.alloc')}</h2>
          <p className="small muted">{t('ops.alloc_desc')}</p>
          <div className="form-grid">
            <NumInput label={t('ops.sales_h')} value={sales} onChange={setSales} step={0.5} />
            <NumInput label={t('ops.onb_h')} value={onb} onChange={setOnb} step={0.5} />
            <ActBtn action={{ type: 'ops.set_alloc', params: { sales, onboarding: onb } }} label={t('ops.set_alloc')} />
          </div>
        </section>
        <section className="card">
          <h2>{t('ops.price')}</h2>
          <p>{t('ops.price_now')}: <strong>{fmt.money(s.product.price)}</strong> <FactBadge id="price.monthly" /></p>
          <div className="form-grid">
            <NumInput label={t('ops.new_price')} value={price} onChange={setPrice} />
            <ActBtn action={{ type: 'ops.set_price', params: { price } }} label={t('ops.set_price')} />
          </div>
          <Hint k="hint.price" />
        </section>
        <section className="card">
          <h2>{t('ops.team')}</h2>
          <p>{t('ops.reps', { n: s.reps })}</p>
          <div className="row">
            <ActBtn action={{ type: 'ops.hire_rep', params: {} }} label={t('ops.hire')} />
            <ActBtn action={{ type: 'ops.fire_rep', params: {} }} label={t('ops.fire')} />
          </div>
        </section>
        <section className="card">
          <h2>{t('ops.speed')}</h2>
          <p>{t('ops.auto_reply')}: <span className={`badge ${s.autoReply ? 'good' : 'warn'}`}>{s.autoReply ? t('common.on') : t('common.off')}</span></p>
          <ActBtn action={{ type: 'ops.set_auto_reply', params: { on: !s.autoReply } }} label={s.autoReply ? t('ops.auto_off') : t('ops.auto_on')} />
          <div className="form-grid" style={{ marginTop: 10 }}>
            <NumInput label={t('ops.docs_h')} value={docs} onChange={setDocs} step={0.5} />
            <ActBtn action={{ type: 'ops.build_docs', params: { hours: docs } }} label={t('ops.build_docs')} />
          </div>
          <p className="small muted">{t('ops.docs_stock', { v: fmt.num(s.founder.docsStock, 1) })}</p>
        </section>
      </div>
      <div className="grid cols-2">
        <section className="card" aria-labelledby="pivot-h">
          <h2 id="pivot-h">{t('ops.pivot')}</h2>
          <p>{t('ops.segment_now')}: <strong>{t(`segment.${s.product.segment}`)}</strong>{s.product.pivotDay !== null ? ` (${t('ops.pivot_day', { n: s.product.pivotDay })})` : ''}</p>
          <p className="small muted">{t('ops.pivot_desc')}</p>
          <div className="form-grid">
            <Select label={t('ops.segment')} value={seg} onChange={setSeg} options={(['solo', 'team', 'budget'] as const).map((x) => ({ value: x, label: t(`segment.${x}`) }))} />
            <ActBtn action={{ type: 'ops.pivot', params: { segment: seg } }} label={t('ops.do_pivot')} />
          </div>
          <Hint k="hint.pivot" />
        </section>
        <section className="card" aria-labelledby="fin-h">
          <h2 id="fin-h">{t('fin.title')}</h2>
          <p className="small muted">{t('fin.desc')}</p>
          {s.finance.offers.filter((o) => !o.taken && o.expires > s.day).length === 0 ? <p className="muted">{t('fin.no_offers')}</p> : null}
          {s.finance.offers.filter((o) => !o.taken && o.expires > s.day).map((o) => (
            <div key={o.id} className="card">
              <strong>{o.kind === 'loan' ? t('fin.loan') : t('fin.angel')}: {fmt.money(o.amount)}</strong>
              <div className="small">
                {o.kind === 'loan'
                  ? t('fin.loan_terms', { rate: fmt.pct(o.rateMonthly, 2), term: o.termMonths })
                  : t('fin.angel_terms', { equity: fmt.pct(o.equity, 1) })}
                {' · '}{t('fin.expires', { n: o.expires })}
              </div>
              <ActBtn action={o.kind === 'loan' ? { type: 'fin.take_loan', params: { offerId: o.id } } : { type: 'fin.accept_investment', params: { offerId: o.id } }} label={o.kind === 'loan' ? t('fin.take_loan') : t('fin.accept')} />
            </div>
          ))}
          <p className="small">
            {t('fin.raised', { v: fmt.money(s.finance.raised) })} · {t('fin.equity_sold', { v: fmt.pct(s.finance.equitySold, 1) })} · {t('fin.interest', { v: fmt.money(s.finance.interestPaid) })}
          </p>
          {s.finance.loans.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('fin.loan')}</th><th className="n">{t('fin.remaining')}</th><th className="n">{t('fin.payment')}</th><th className="n">{t('fin.payments_left')}</th></tr></thead>
                <tbody>
                  {s.finance.loans.map((l) => (
                    <tr key={l.id}><th scope="row">{l.id}</th><td className="n">{fmt.money(l.remaining)}</td><td className="n">{fmt.money(l.paymentMonthly)}</td><td className="n">{l.paymentsLeft}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
      <QueuePanel />
    </div>
  );
}
