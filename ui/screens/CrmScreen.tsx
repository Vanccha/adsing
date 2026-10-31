import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { K } from '@engine/core';
import { selectors } from '@engine/index';
import { unitEconomics } from '@engine/funnel/finance';
import { ActBtn, QueuePanel } from '../components/Actions';
import { CIBar, LineChart } from '../components/Charts';
import { DerivedBadge, FactBadge } from '../components/FactBadge';
import { Select, NumInput, Tabs } from '../components/Fields';
import { Hint } from '../components/Hint';
import { Metric } from '../components/Metric';
import { useGame } from '../game/GameContext';

type Tab = 'report' | 'leads' | 'cohorts' | 'mrr' | 'unit' | 'measure';

export function CrmScreen() {
  const { t } = useTranslation();
  const g = useGame();
  const s = g.state!;
  const { fmt } = g;
  const [tab, setTab] = useState<Tab>('report');
  const om = useMemo(() => selectors.observedMetrics(s, 30), [s]);
  const mrr = useMemo(() => selectors.mrr(s), [s]);
  const ue = useMemo(() => unitEconomics(s, 90), [s]);
  const cac = useMemo(() => selectors.cac(s, { marginal: true }), [s]);
  const [hoCh, setHoCh] = useState<'google' | 'meta'>('google');
  const [hoShare, setHoShare] = useState(0.2);
  const [hoDays, setHoDays] = useState(21);

  const platformTotal = (om.platform.conv.google ?? 0) + (om.platform.conv.meta ?? 0);
  const ratio = om.crm.leads > 0 ? platformTotal / om.crm.leads : null;
  const tau = s.params['funnel.lead_decay_tau_hours'] as number;
  const h0 = s.autoReply ? K.autoReplyResponseHours : K.baseResponseHours;
  const contact = K.contactP0 * Math.exp(-h0 / tau);

  const weeks: Array<{ w: number; mv: { new: number; expansion: number; contraction: number; churn: number } }> = [];
  for (let w = Math.max(0, Math.floor(s.history.length / 7) - 8); w * 7 < s.history.length; w++) {
    const mv = { new: 0, expansion: 0, contraction: 0, churn: 0 };
    for (const r of s.history.slice(w * 7, w * 7 + 7)) {
      mv.new += r.mrrMove.new;
      mv.expansion += r.mrrMove.expansion;
      mv.contraction += r.mrrMove.contraction;
      mv.churn += r.mrrMove.churn;
    }
    weeks.push({ w, mv });
  }
  const lq = s.funnel.queue;

  return (
    <div className="stack">
      <h1>{t('nav.crm')}</h1>
      <Tabs
        label={t('nav.crm')}
        value={tab}
        onChange={setTab}
        tabs={(['report', 'leads', 'cohorts', 'mrr', 'unit', 'measure'] as const).map((x) => ({ id: x, label: t(`crm.tab.${x}`) }))}
      />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="stack">
        {tab === 'report' ? (
          <section className="card">
            <h2>{t('crm.report')}</h2>
            <p className="small muted">{t('crm.report_note', { n: om.window })}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>{t('crm.source')}</th><th className="n">{t('col.cost')}</th><th className="n">{t('crm.conversions')}</th><th className="n">CPA</th></tr>
                </thead>
                <tbody>
                  {(['google', 'meta'] as const).map((c) => (
                    <tr key={c}>
                      <th scope="row">{t('crm.platform')}: {t(`channel.${c}.short`)}</th>
                      <td className="n">{fmt.money(om.spend[c] ?? 0)}</td>
                      <td className="n">{fmt.num(om.platform.conv[c] ?? 0, 1)}</td>
                      <td className="n">{fmt.money(om.platform.cpa[c] ?? null)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">{t('crm.analytics')}</th>
                    <td className="n">{fmt.money((om.spend.google ?? 0) + (om.spend.meta ?? 0))}</td>
                    <td className="n">{fmt.num(om.analytics.conv, 0)}</td>
                    <td className="n">{fmt.money(om.analytics.cpl)}</td>
                  </tr>
                  <tr>
                    <th scope="row">{t('crm.crm_real')} <span className="badge good">{t('crm.truth')}</span></th>
                    <td className="n">—</td>
                    <td className="n">{fmt.num(om.crm.leads, 0)} {t('crm.leads')} / {fmt.num(om.crm.customers, 0)} {t('crm.customers')}</td>
                    <td className="n">{t('crm.cpl')}: {fmt.money(om.crm.cpl)} · CAC: {fmt.money(om.crm.cac)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {ratio !== null && platformTotal >= 5 ? (
              <p className={`notice ${ratio > 1.3 ? 'warn' : ''}`}>{t('crm.over_ratio', { r: fmt.num(ratio, 2) })} <FactBadge id="measure.platform_overreport" /></p>
            ) : null}
            <Hint k="hint.platform_vs_crm" />
          </section>
        ) : null}

        {tab === 'leads' ? (
          <section className="card">
            <h2>{t('crm.lead_list')}</h2>
            <p className="small muted">{t('crm.lead_note')}</p>
            <div className="grid cols-3">
              <Metric label={t('crm.resp_time')} value={`${fmt.num(h0, 1)} ${t('unit.h')}`} sub={s.autoReply ? t('crm.auto_on') : t('crm.auto_off')} />
              <Metric label={t('crm.contact_rate')} value={fmt.pct(contact, 0)} badge={<FactBadge id="funnel.lead_decay_tau_hours" />} sub={`τ = ${fmt.num(tau, 0)} ${t('unit.h')}`} />
              <Metric label={t('crm.waiting')} value={fmt.num(lq.reduce((a, b) => a + b.n, 0), 0)} sub={t('crm.waiting_sub')} />
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('crm.lead_day')}</th><th>{t('local.channel')}</th><th className="n">{t('crm.count')}</th><th className="n">{t('crm.age')}</th><th>{t('crm.type')}</th></tr></thead>
                <tbody>
                  {lq.length === 0 ? <tr><td colSpan={5} className="muted">{t('crm.no_leads')}</td></tr> : null}
                  {lq.slice(-30).reverse().map((b, i) => (
                    <tr key={i}>
                      <td>{t('feed.day', { n: b.day })}</td>
                      <td>{t(`leadch.${b.channel}`)}</td>
                      <td className="n">{fmt.num(b.n, 1)}</td>
                      <td className="n">{s.day - b.day} {t('unit.day_short')}</td>
                      <td>{b.msg ? t('crm.msg') : t('crm.form')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>{t('crm.trials_running')}</h3>
            <p>{fmt.num(s.funnel.trials.reduce((a, b) => a + b.n, 0), 0)} {t('crm.trials_n')}</p>
            <Hint k="hint.response_time" />
          </section>
        ) : null}

        {tab === 'cohorts' ? (
          <section className="card">
            <h2>{t('crm.cohorts')}</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('crm.cohort')}</th><th>{t('crm.start')}</th><th className="n">{t('crm.n0')}</th><th className="n">{t('crm.alive')}</th><th>{t('crm.retention')}</th><th className="n">ARPA</th><th className="n">{t('crm.churned')}</th></tr></thead>
                <tbody>
                  {s.cohorts.length === 0 ? <tr><td colSpan={7} className="muted">{t('crm.no_cohorts')}</td></tr> : null}
                  {s.cohorts.map((c) => (
                    <tr key={c.id}>
                      <th scope="row">#{c.id}</th>
                      <td>{t('feed.day', { n: c.startDay })}</td>
                      <td className="n">{fmt.num(c.n0, 1)}</td>
                      <td className="n">{fmt.num(c.alive, 1)}</td>
                      <td style={{ minWidth: 140 }}><CIBar mean={c.n0 > 0 ? c.alive / c.n0 : 0} lo={c.n0 > 0 ? c.alive / c.n0 : 0} hi={c.n0 > 0 ? c.alive / c.n0 : 0} max={1} label={fmt.pct(c.n0 > 0 ? c.alive / c.n0 : 0, 0)} /> <span className="small num">{fmt.pct(c.n0 > 0 ? c.alive / c.n0 : 0, 0)}</span></td>
                      <td className="n">{fmt.money(c.arpa)}</td>
                      <td className="n">{fmt.num(c.churned, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">{t('crm.churn_monthly')}: <strong>{fmt.pct(ue.monthlyChurn, 1)}</strong> <FactBadge id="churn.monthly_base" /></p>
          </section>
        ) : null}

        {tab === 'mrr' ? (
          <section className="card">
            <h2>{t('crm.mrr_moves')}</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('crm.period')}</th><th className="n">{t('mrrmove.new')}</th><th className="n">{t('mrrmove.expansion')}</th><th className="n">{t('mrrmove.contraction')}</th><th className="n">{t('mrrmove.churn')}</th><th className="n">{t('mrrmove.net')}</th></tr></thead>
                <tbody>
                  <tr>
                    <th scope="row">{t('crm.last30')}</th>
                    <td className="n">{fmt.money(mrr.last30.new)}</td><td className="n">{fmt.money(mrr.last30.expansion)}</td><td className="n">{fmt.money(-mrr.last30.contraction)}</td><td className="n">{fmt.money(-mrr.last30.churn)}</td>
                    <td className="n"><strong>{fmt.money(mrr.last30.new + mrr.last30.expansion - mrr.last30.contraction - mrr.last30.churn)}</strong></td>
                  </tr>
                  {weeks.map(({ w, mv }) => (
                    <tr key={w}>
                      <th scope="row">{t('crm.week', { n: w + 1 })}</th>
                      <td className="n">{fmt.money(mv.new)}</td><td className="n">{fmt.money(mv.expansion)}</td><td className="n">{fmt.money(-mv.contraction)}</td><td className="n">{fmt.money(-mv.churn)}</td>
                      <td className="n">{fmt.money(mv.new + mv.expansion - mv.contraction - mv.churn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <LineChart title="MRR" fmtY={(v) => fmt.money(v, 0)} series={[{ name: 'MRR', color: 'var(--c3)', points: g.obs.map((o) => ({ x: o.day, y: o.mrr })) }]} xLabel={t('unit.day')} />
          </section>
        ) : null}

        {tab === 'unit' ? (
          <section className="card">
            <h2>{t('crm.unit')}</h2>
            <p className="small muted">{t('crm.unit_note')}</p>
            <div className="grid cols-4">
              <Metric label={t('crm.cac_full')} value={fmt.money(cac.cacFull)} badge={<DerivedBadge k="cac" />} />
              <Metric label={t('crm.cac_ads')} value={fmt.money(cac.cacAds)} badge={<DerivedBadge k="cac" />} />
              <Metric label="LTV" value={fmt.money(cac.ltv)} badge={<DerivedBadge k="ltv" />} sub={`ARPA ${fmt.money(ue.arpa)} · ${t('crm.gm')} ${fmt.pct(ue.grossMargin, 0)}`} />
              <Metric label={t('metric.ltvcac')} value={cac.ltvCac === null ? '—' : fmt.num(cac.ltvCac, 2)} tone={cac.ltvCac !== null && cac.ltvCac < s.goals.ltvCac ? 'bad' : 'good'} sub={`${t('metric.goal')}: ${fmt.num(s.goals.ltvCac, 1)}`} badge={<DerivedBadge k="ltvcac" />} />
              <Metric label={t('goals.payback')} value={cac.paybackMonths === null ? '—' : `${fmt.num(cac.paybackMonths, 1)} ${t('unit.months')}`} sub={`${t('metric.goal')}: ≤ ${fmt.num(s.goals.paybackMonths, 0)}`} badge={<DerivedBadge k="payback" />} />
              <Metric label={t('crm.marginal_google')} value={fmt.money(cac.marginal?.google ?? null)} badge={<DerivedBadge k="marginal" />} sub={t('crm.marginal_sub')} />
              <Metric label={t('crm.marginal_meta')} value={fmt.money(cac.marginal?.meta ?? null)} badge={<DerivedBadge k="marginal" />} sub={t('crm.marginal_sub')} />
            </div>
            <Hint k="hint.marginal_cac" />
          </section>
        ) : null}

        {tab === 'measure' ? (
          <section className="card">
            <h2>{t('crm.measure')}</h2>
            <ul>
              <li>{t('crm.track_basic')}: <span className={`badge ${s.tracking.health >= 0.9 || s.decisions.some((d) => d.action.type === 'track.fix' && d.status !== 'rejected') ? 'good' : 'warn'}`}>{s.decisions.some((d) => d.action.type === 'track.fix' && d.status !== 'rejected') ? t('common.on') : t('common.off')}</span></li>
              <li>Consent Mode: <span className={`badge ${s.tracking.consentMode ? 'good' : 'warn'}`}>{s.tracking.consentMode ? t('common.on') : t('common.off')}</span></li>
              <li>{t('crm.server_side')}: <span className={`badge ${s.tracking.serverSide ? 'good' : 'warn'}`}>{s.tracking.serverSide ? t('common.on') : t('common.off')}</span></li>
              <li>{t('crm.crm_feedback')}: <span className={`badge ${s.tracking.crmFeedback ? 'good' : 'warn'}`}>{s.tracking.crmFeedback ? t('common.on') : t('common.off')}</span></li>
            </ul>
            {s.scheduled.length ? <p className="small muted">{t('crm.scheduled', { list: s.scheduled.map((x) => `${t(`track.${x.level}`)} (${t('feed.day', { n: x.day })})`).join(', ') })}</p> : null}
            <div className="row">
              {(['basic', 'consent_mode', 'server_side', 'crm_feedback'] as const).map((l) => (
                <ActBtn key={l} action={{ type: 'track.fix', params: { level: l } }} label={t(`track.${l}`)} />
              ))}
            </div>
            <Hint k="hint.tracking" />
            <h3 style={{ marginTop: 14 }}>{t('crm.holdout')}</h3>
            <p className="small muted">{t('crm.holdout_note')}</p>
            <div className="form-grid">
              <Select label={t('studio.channel')} value={hoCh} onChange={setHoCh} options={[{ value: 'google', label: 'Google Ads' }, { value: 'meta', label: 'Meta' }]} />
              <NumInput label={t('crm.ho_share')} value={hoShare} onChange={setHoShare} step={0.05} min={0.05} />
              <NumInput label={t('studio.days')} value={hoDays} onChange={setHoDays} min={7} />
              <ActBtn action={{ type: 'measure.start_holdout', params: { channel: hoCh, share: hoShare, days: hoDays } }} label={t('crm.start_holdout')} />
            </div>
            {s.tests.holdouts.map((h) => (
              <div key={h.id} className="card">
                <div className="row between"><strong>{h.id} · {h.channel}</strong><span className="badge info">{t(`abstatus.${h.status}`)}</span></div>
                <p className="small muted">{t('studio.test_range', { from: h.startDay, to: h.endDay })} · {t('crm.ho_share')}: {fmt.pct(h.share, 0)}</p>
                {h.result ? (
                  <>
                    <p>{t('crm.ho_incr')}: <strong className="num">{fmt.num(h.result.incrPerDay, 2)}</strong> {t('crm.per_day')} ({fmt.num(h.result.ciLow, 2)} – {fmt.num(h.result.ciHigh, 2)}) · {t('crm.ho_reported')}: {fmt.num(h.result.reportedPerDay, 2)} · {t('crm.ho_share_incr')}: {fmt.pct(h.result.incrShare, 0)}</p>
                    <span className={`badge ${h.result.conclusive ? 'good' : 'warn'}`}>{h.result.conclusive ? t('crm.conclusive') : t('crm.inconclusive')}</span>
                  </>
                ) : (
                  <p className="muted">{t('crm.ho_running')}</p>
                )}
                {h.status === 'running' ? <ActBtn action={{ type: 'measure.stop_holdout', params: { holdoutId: h.id } }} label={t('studio.stop')} /> : null}
              </div>
            ))}
          </section>
        ) : null}
      </div>
      <QueuePanel />
    </div>
  );
}
