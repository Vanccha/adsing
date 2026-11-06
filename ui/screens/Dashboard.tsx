import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { selectors } from '@engine/index';
import type { GameState } from '@engine/core';
import { Bar, CIBar, HBars, LineChart } from '../components/Charts';
import { QueuePanel } from '../components/Actions';
import { DerivedBadge, FactBadge } from '../components/FactBadge';
import { CasesPanel } from '../components/CasesPanel';
import { Hint } from '../components/Hint';
import { Metric } from '../components/Metric';
import { lastOf, Performance, sumOf } from '../components/Performance';
import type { PerfMetric } from '../components/Performance';
import { Tutorial } from '../components/Tutorial';
import { cacSeries, observedFunnel } from '../game/funnel';
import { useGame } from '../game/GameContext';
import { go } from '../router';
import { weekdayIndex } from '../format';

const accountBand = (h: number): 'good' | 'warn' | 'bad' => (h >= 0.8 ? 'good' : h >= 0.5 ? 'warn' : 'bad');

export function weekHours(s: GameState): { used: number; remaining: number; capacity: number } {
  const hpw = typeof s.params['founder.hours_per_week'] === 'number' ? (s.params['founder.hours_per_week'] as number) : 0;
  const start = s.day - (weekdayIndex(s.startDate, s.day) % 7); // bu haftanın Pazartesi'si
  const used = s.history.filter((r) => r.day >= start).reduce((a, r) => a + r.hoursUsed, 0);
  return { used, capacity: hpw, remaining: Math.max(0, hpw - used) };
}

export function Dashboard() {
  const { t } = useTranslation();
  const g = useGame();
  const s = g.state!;
  const { fmt } = g;
  const sel = useMemo(() => {
    const run = selectors.runway(s);
    return { runway: run, mrr: selectors.mrr(s), fh: selectors.founderHours(s), om: selectors.observedMetrics(s, 7), funnel: selectors.funnel(s), cac: selectors.cac(s) };
  }, [s]);
  const of = useMemo(() => observedFunnel(s, g.obs), [s, g.obs]);
  const wh = weekHours(s);
  const cacS = useMemo(() => cacSeries(g.obs), [g.obs]);
  const done = !!s.outcome;
  const queueHours = g.queue.length;

  const runwayTxt = Number.isFinite(sel.runway) ? t('metric.months', { n: fmt.num(sel.runway, 1) }) : '∞';
  const accHealth = (a: GameState['accounts']['google']) => (a.permanent ? 'bad' : a.suspendedUntil !== null && a.suspendedUntil > s.day ? 'bad' : accountBand(a.health));
  const stageName = (k: string) => t(`stage.${k}`);
  const money = (v: number) => fmt.money(v, 0);
  const count = (v: number) => fmt.num(v, 0);
  const series = (f: (o: (typeof g.obs)[number]) => number) => g.obs.map((o) => ({ x: o.day, y: f(o) }));
  const overview: PerfMetric[] = [
    { key: 'mrr', label: 'MRR', points: series((o) => o.mrr), total: (p) => money(lastOf(p)), fmt: money },
    { key: 'cash', label: t('metric.cash'), points: series((o) => o.cash), total: (p) => money(lastOf(p)), fmt: money },
    { key: 'leads', label: t('funnel.crm_leads'), points: series((o) => o.crmLeads), total: (p) => count(sumOf(p)), fmt: count },
    { key: 'spend', label: t('perf.ad_spend'), points: series((o) => o.spend), total: (p) => money(sumOf(p)), fmt: money },
  ];
  const channelBars = Object.entries(s.funnel.byChannel).filter(([, b]) => (b?.leads ?? 0) > 0).map(([k, b]) => ({ key: k, label: t(`leadch.${k}`), value: b!.leads }));

  return (
    <div className="stack">
      <div className="row between">
        <h1>{t('nav.dashboard')}</h1>
        {done ? <button type="button" className="primary" onClick={() => go('outcome')}>{t('time.see_outcome')}</button> : null}
      </div>
      {done ? <div className="notice good" role="status">{t(s.outcome!.reason, s.outcome!.detail)} <button type="button" className="link" onClick={() => go('outcome')}>{t('time.see_outcome')}</button></div> : null}
      {queueHours === 0 && s.day === 0 ? <Hint k="hint.first_day" /> : null}

      <Performance title={t('perf.business')} xLabel={t('unit.day')} metrics={overview} />

      <div className="grid cols-4">
        <Metric label={t('metric.cash')} value={fmt.money(s.cash)} tone={s.cash < 0 ? 'bad' : undefined} badge={<DerivedBadge k="cash" />} sub={t('metric.start_cash', { v: fmt.money(s.startCash) })} />
        <Metric label={t('metric.runway')} value={runwayTxt} badge={<DerivedBadge k="runway" />} />
        <Metric label="MRR" value={fmt.money(s.mrr)} badge={<DerivedBadge k="mrr" />} sub={<>{t('metric.goal')}: {fmt.money(s.goals.mrr)} <FactBadge id={`scn.goal.${s.mode === 'quick' ? '90d' : '12m'}.target_mrr`} /></>} />
        <Metric label={t('metric.customers')} value={fmt.num(sel.mrr.customers, 0)} sub={`ARR ${fmt.money(sel.mrr.arr)}`} />
        <Metric label={t('metric.hours_week')} value={`${fmt.num(wh.remaining, 1)} / ${fmt.num(wh.capacity, 1)} ${t('unit.h')}`} badge={<FactBadge id="founder.hours_per_week" />} sub={t('metric.hours_today', { free: fmt.num(sel.fh.free, 1), burnout: fmt.pct(sel.fh.burnout, 0) })} />
        <Metric label={t('metric.reputation')} value={fmt.pct(s.reputation, 0)} tone={s.reputation < 0.3 ? 'bad' : undefined} badge={<DerivedBadge k="reputation" />} />
        <Metric
          label={t('metric.accounts')}
          value={
            <span className="row">
              {(['google', 'meta'] as const).map((c) => (
                <span key={c} className={`badge ${accHealth(s.accounts[c])}`}>{t(`channel.${c}.short`)}: {t(`health.${accHealth(s.accounts[c])}`)}</span>
              ))}
            </span>
          }
          sub={t('metric.accounts_sub')}
        />
        <Metric label={t('metric.ltvcac')} value={sel.cac.ltvCac === null ? '—' : fmt.num(sel.cac.ltvCac, 2)} sub={`${t('metric.goal')}: ${fmt.num(s.goals.ltvCac, 1)}`} badge={<DerivedBadge k="ltvcac" />} />
      </div>

      <Tutorial />

      <QueuePanel />

      <CasesPanel />

      {channelBars.length ? (
        <section className="card" aria-labelledby="ch-h">
          <h2 id="ch-h">{t('perf.by_channel')}</h2>
          <p className="small muted">{t('perf.by_channel_note')}</p>
          <HBars label={t('perf.by_channel')} items={channelBars} fmt={(v) => fmt.num(v, 0)} />
        </section>
      ) : null}

      <section className="card" aria-labelledby="funnel-h">
        <h2 id="funnel-h">{t('funnel.title')}</h2>
        <p className="small muted">{t('funnel.window', { n: of.window })}</p>
        {of.window === 0 ? <p className="muted">{t('funnel.none')}</p> : null}
        <div role="table" aria-label={t('funnel.title')}>
          {of.rates.map((r) => {
            const max = Math.max(0.0001, r.hi ?? 0.0001, r.bench ?? 0);
            return (
              <div className="funnel-row" role="row" key={r.key}>
                <div role="cell">
                  <strong>{stageName(r.from)} → {stageName(r.to)}</strong>
                  <div className="small muted">{fmt.num(r.num, 0)} / {fmt.num(r.den, 0)}</div>
                </div>
                <div role="cell">
                  {r.rate !== null && r.lo !== null && r.hi !== null ? (
                    <CIBar mean={r.rate} lo={r.lo} hi={r.hi} max={Math.min(1, max * 1.2)} label={t('funnel.ci_label', { rate: fmt.pct(r.rate, 2), lo: fmt.pct(r.lo, 2), hi: fmt.pct(r.hi, 2) })} />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </div>
                <div role="cell" className="num">
                  {r.rate !== null ? <strong>{fmt.pct(r.rate, 2)}</strong> : '—'}
                  {r.insufficient ? <div><span className="badge warn">{t('funnel.insufficient')}</span></div> : null}
                  {r.bench !== null && r.benchId ? (
                    <div className="small muted">
                      {t('funnel.bench')}: {fmt.pct(r.bench, 2)} <FactBadge id={r.benchId} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>
          {stageName('impressions')}: {fmt.num(of.counts.impressions, 0)} · {stageName('clicks')}: {fmt.num(of.counts.clicks, 0)} · {t('funnel.analytics')}: {fmt.num(of.counts.analytics, 0)} · {t('funnel.crm_leads')}: {fmt.num(of.counts.crmLeads, 0)} · {t('funnel.crm_customers')}: {fmt.num(of.counts.crmCustomers, 0)}
        </div>
        <p className="small muted">{t('funnel.crm_delay_note')}</p>
        {g.hintsOn && sel.funnel.hintKeys.map((k) => (
          <div className="hint" role="note" key={k}>
            <strong>{t('learn.hint_label')}: </strong>{t(k)}
          </div>
        ))}
      </section>

      <div className="grid cols-2">
        <section className="card" aria-labelledby="feed-h">
          <h2 id="feed-h">{t('feed.title')}</h2>
          {g.feed.length === 0 ? <p className="muted">{t('feed.none')}</p> : null}
          <ul className="feed">
            {[...g.feed].reverse().map((f, i) => (
              <li key={i} className={`tone-${f.event.tone}`}>
                <span className="small muted num">{t('feed.day', { n: f.day })}</span>
                <span>
                  <span className="badge info">{f.event.tone === 'good' ? '+' : f.event.tone === 'bad' ? '!' : 'i'}</span>{' '}
                  {t(f.event.key, f.event.params as Record<string, string | number>)}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card" aria-labelledby="goals-h">
          <h2 id="goals-h">{t('goals.title')}</h2>
          <div className="stack">
            <div>
              <div className="small">MRR: {fmt.money(s.mrr)} / {fmt.money(s.goals.mrr)}</div>
              <Bar value={s.mrr} max={s.goals.mrr} label={`MRR ${fmt.pct(s.goals.mrr ? s.mrr / s.goals.mrr : 0, 0)}`} />
            </div>
            <div>
              <div className="small">{t('goals.time')}: {s.day} / {s.horizon}</div>
              <Bar value={s.day} max={s.horizon} label={t('goals.time')} />
            </div>
            {s.goals.customers !== undefined ? <div className="small">{t('goals.customers')}: {fmt.num(sel.mrr.customers, 0)} / {fmt.num(s.goals.customers, 0)}</div> : null}
            {s.goals.minRunwayMonths !== undefined ? <div className="small">{t('goals.min_runway')}: ≥ {fmt.num(s.goals.minRunwayMonths, 0)} {t('unit.months')}</div> : null}
            {s.goals.minCashRatio !== undefined ? <div className="small">{t('goals.min_cash')}: ≥ {fmt.pct(s.goals.minCashRatio, 0)}</div> : null}
            <div className="small">
              {t('goals.ltvcac')}: {fmt.num(s.goals.ltvCac, 1)} · {t('goals.payback')}: ≤ {fmt.num(s.goals.paybackMonths, 0)} {t('unit.months')}
            </div>
          </div>
        </section>
      </div>

      <section className="card" aria-labelledby="charts-h">
        <h2 id="charts-h">{t('charts.title')}</h2>
        <div className="grid cols-2">
          <LineChart title={t('charts.cac')} fmtY={(v) => fmt.money(v, 0)} series={[{ name: t('charts.cac_obs'), color: 'var(--c1)', points: cacS }]} xLabel={t('unit.day')} />
          <LineChart title={t('charts.leads')} fmtY={(v) => fmt.num(v, 0)} series={[{ name: t('funnel.analytics'), color: 'var(--c1)', points: g.obs.map((o) => ({ x: o.day, y: o.analyticsConv })) }, { name: t('funnel.crm_leads'), color: 'var(--c2)', points: g.obs.map((o) => ({ x: o.day, y: o.crmLeads })) }]} xLabel={t('unit.day')} />
        </div>
      </section>
    </div>
  );
}
