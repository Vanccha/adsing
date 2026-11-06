import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { selectors } from '@engine/index';
import { describeAction } from '../components/Actions';
import { Bar } from '../components/Charts';
import { Metric } from '../components/Metric';
import { runJob } from '../engine/client';
import type { AnalysisView } from '../engine/analysis';
import { useGame } from '../game/GameContext';
import { go } from '../router';

export function OutcomeScreen() {
  const { t } = useTranslation();
  const g = useGame();
  const s = g.state!;
  const { fmt, cfg } = g;
  const [a, setA] = useState<AnalysisView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const o = s.outcome;

  useEffect(() => {
    let live = true;
    if (!o || !cfg) return;
    setA(null);
    runJob({ job: 'analyze', cfg, state: s }, { heavy: true })
      .then((r) => {
        if (live && r.job === 'analyze') setA(r.result);
      })
      .catch((e: unknown) => live && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [o, cfg, s]);

  if (!o) {
    return (
      <div className="stack">
        <h1>{t('nav.outcome')}</h1>
        <p>{t('outcome.not_over')}</p>
        <button type="button" onClick={() => go('dashboard')}>{t('nav.dashboard')}</button>
      </div>
    );
  }
  const win = o.status === 'won' || o.status === 'healthy';
  const ue = selectors.cac(s);
  const tm = selectors.trueMetrics(s);

  return (
    <div className="stack">
      <h1>{t('outcome.title')}: <span className={`badge ${win ? 'good' : o.status === 'lost' ? 'bad' : 'warn'}`}>{t(`outcome.status.${o.status}`)}</span></h1>
      <div className={`notice ${win ? 'good' : o.status === 'lost' ? 'bad' : 'warn'}`} role="status">{t(o.reason, o.detail)}</div>
      <div className="grid cols-4">
        <Metric label="MRR" value={fmt.money(s.mrr)} sub={`${t('metric.goal')}: ${fmt.money(s.goals.mrr)}`} />
        <Metric label={t('metric.cash')} value={fmt.money(s.cash)} />
        <Metric label={t('metric.ltvcac')} value={ue.ltvCac === null ? '—' : fmt.num(ue.ltvCac, 2)} sub={`${t('metric.goal')}: ${fmt.num(s.goals.ltvCac, 1)}`} />
        <Metric label={t('goals.payback')} value={ue.paybackMonths === null ? '—' : fmt.num(ue.paybackMonths, 1)} sub={`${t('metric.goal')}: ≤ ${fmt.num(s.goals.paybackMonths, 0)}`} />
      </div>
      <Bar value={s.mrr} max={s.goals.mrr} label="MRR / goal" />

      <section className="card" aria-labelledby="an-h" aria-busy={!a && !err}>
        <h2 id="an-h">{t('analysis.title')}</h2>
        {!a && !err ? <p role="status">{t('analysis.computing')}</p> : null}
        {err ? <div className="notice bad" role="alert">{err}</div> : null}
        {a ? (
          <div className="stack">
            <div>
              <h3>{t('analysis.top3')}</h3>
              {a.topDecisions.length === 0 ? <p className="muted">{t('analysis.none')}</p> : null}
              <ol>
                {a.topDecisions.map((d, i) => (
                  <li key={i}>
                    {t('feed.day', { n: d.day })}: {describeAction(d.action, t)} → <strong className={d.delta >= 0 ? '' : ''}>{d.delta >= 0 ? '+' : ''}{fmt.money(d.delta, 0)}</strong>{' '}
                    <span className={`badge ${d.delta >= 0 ? 'good' : 'bad'}`}>{d.delta >= 0 ? t('analysis.helped') : t('analysis.hurt')}</span>
                  </li>
                ))}
              </ol>
              <p className="small muted">{t('analysis.top3_note')}</p>
            </div>
            <div>
              <h3>{t('analysis.missed')}</h3>
              {a.missed.length === 0 ? <p className="muted">{t('analysis.no_missed')}</p> : null}
              <ul>
                {a.missed.map((m) => (
                  <li key={m.id}>{t(`missed.${m.id}`)} (<span className="small">{t('feed.day', { n: m.day })}</span>): <strong>+{fmt.money(m.delta, 0)}</strong></li>
                ))}
              </ul>
            </div>
            <div>
              <h3>{t('analysis.bottleneck')}</h3>
              {a.bottleneck ? <p>{t(`bottleneck.${a.bottleneck.stage}`)} — {t('analysis.vs_bench', { r: fmt.pct(a.bottleneck.ratio, 0) })}</p> : <p className="muted">{t('analysis.no_bottleneck')}</p>}
            </div>
            <div>
              <h3>{t('analysis.skill_luck')}</h3>
              {a.luck ? (
                <>
                  <p>{t('analysis.luck_text', { pct: fmt.pct(a.luck.percentile, 0), runs: a.luck.runs })}</p>
                  <p className="small num">{t('analysis.luck_dist', { p10: fmt.money(a.luck.p10, 0), p50: fmt.money(a.luck.p50, 0), p90: fmt.money(a.luck.p90, 0), you: fmt.money(a.score, 0) })}</p>
                </>
              ) : null}
              <p className="small">{t('analysis.bench', { score: fmt.money(a.benchmark.score, 0), mrr: fmt.money(a.benchmark.mrr, 0), status: a.benchmark.status ? t(`outcome.status.${a.benchmark.status}`) : '—', you: fmt.money(a.score, 0) })}</p>
              <p className="small muted">{t('analysis.score_def')}</p>
            </div>
            <div>
              <h3>{t('analysis.real_vs_obs')}</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('local.channel')}</th><th className="n">{t('analysis.platform_conv')}</th><th className="n">{t('analysis.true_leads')}</th><th className="n">{t('analysis.incr_share')}</th><th className="n">{t('col.cost')}</th></tr></thead>
                  <tbody>
                    {a.truth.byChannel.map((r) => (
                      <tr key={r.channel}>
                        <th scope="row">{t(`leadch.${r.channel}`)}</th>
                        <td className="n">{r.platformConv === null ? '—' : fmt.num(r.platformConv, 0)}</td>
                        <td className="n">{fmt.num(r.trueLeads, 0)}</td>
                        <td className="n">{r.incrShare === null ? '—' : fmt.pct(r.incrShare, 0)}</td>
                        <td className="n">{fmt.money(r.spend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small">{t('analysis.tracked', { g: fmt.pct(a.truth.trackedFraction.google ?? 0, 0), m: fmt.pct(a.truth.trackedFraction.meta ?? 0, 0) })}</p>
              <p className="small">{t('analysis.cac_cmp', { crm: fmt.money(a.truth.cacCrm), real: fmt.money(a.truth.cacTrue) })}</p>
              <p className="small muted">{t('analysis.reputation', { v: fmt.pct(tm.reputation, 0) })}</p>
            </div>
          </div>
        ) : null}
      </section>
      <p className="notice">{t('honesty.long')}</p>
      <div className="row">
        <button type="button" className="primary" onClick={() => { g.reset(); go('start'); }}>{t('outcome.new_game')}</button>
        <button type="button" onClick={() => go('history')}>{t('nav.history')}</button>
      </div>
    </div>
  );
}
