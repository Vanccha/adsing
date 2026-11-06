import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AudienceKind } from '@engine/core';
import { ActBtn, QueuePanel, StatusSwitch } from '../components/Actions';
import { Bar } from '../components/Charts';
import { Performance, sumOf } from '../components/Performance';
import type { PerfMetric } from '../components/Performance';
import { FactBadge } from '../components/FactBadge';
import { NumInput, Select, Tabs, TextInput, useAssetOptions } from '../components/Fields';
import { Hint } from '../components/Hint';
import { useGame } from '../game/GameContext';

const AUD: AudienceKind[] = ['interest', 'lookalike', 'advantage', 'broad'];
type Tab = 'overview' | 'campaigns' | 'adsets' | 'ads' | 'pixel' | 'edit' | 'new';

export function MetaScreen() {
  const { t } = useTranslation();
  const g = useGame();
  const s = g.state!;
  const { fmt } = g;
  const opts = useAssetOptions(s);
  const price = Math.round(s.product.price);
  const threshold = typeof s.params['meta.learn.events'] === 'number' ? (s.params['meta.learn.events'] as number) : 50;

  const [tab, setTab] = useState<Tab>('overview');
  const [step, setStep] = useState(0);
  const [objective, setObjective] = useState<'leads' | 'messages'>('leads');
  const [audience, setAudience] = useState<AudienceKind>('interest');
  const [budget, setBudget] = useState<number>(Math.round(price * 0.5));
  const [lpId, setLpId] = useState(s.assets.lps[0]!.id);
  const [offerId, setOfferId] = useState(s.assets.offers[0]!.id);
  const [crIds, setCrIds] = useState<string[]>([s.assets.creatives.find((c) => c.channel === 'meta')!.id]);
  const [name, setName] = useState('');
  const crOpts = opts.creatives('meta');

  const [selId, setSelId] = useState(s.meta.adSets[0]?.id ?? '');
  const a = s.meta.adSets.find((x) => x.id === selId) ?? s.meta.adSets[0];
  const [eBudget, setEBudget] = useState<number>(a?.dailyBudget ?? budget);
  const [eAud, setEAud] = useState<AudienceKind>(a?.audience ?? 'interest');
  const [addCr, setAddCr] = useState(crOpts[0]?.value ?? '');

  const hist = (f: (r: (typeof s.history)[number]) => number) => s.history.map((r) => ({ x: r.day, y: f(r) }));
  const count = (v: number) => fmt.num(v, 0);
  const money = (v: number) => fmt.money(v, 0);
  const perf: PerfMetric[] = [
    { key: 'cost', label: t('meta.spent'), points: hist((r) => r.spend.meta ?? 0), total: (p) => money(sumOf(p)), fmt: money },
    { key: 'impr', label: t('col.impr'), points: hist((r) => r.mImpr ?? 0), total: (p) => count(sumOf(p)), fmt: count },
    { key: 'clicks', label: t('col.clicks'), points: hist((r) => r.mClicks ?? 0), total: (p) => count(sumOf(p)), fmt: count },
    { key: 'conv', label: t('meta.results'), points: hist((r) => r.platformConv.meta ?? 0), total: (p) => fmt.num(sumOf(p), 1), fmt: (v) => fmt.num(v, 1) },
  ];
  const adsetRow = (x: (typeof s.meta.adSets)[number]) => {
    const life = x.stats.impressions > 0 ? x.stats.clicks / x.stats.impressions : 0;
    const fatigued = !!x.last && (x.last.frequency > 3 || (life > 0 && x.last.ctrEff < 0.7 * life));
    return { fatigued, events: x.learning.events.reduce((p, c) => p + c, 0) };
  };
  const objectives = (['leads', 'messages'] as const).map((o) => {
    const sets = s.meta.adSets.filter((x) => x.objective === o);
    return { o, sets, budget: sets.filter((x) => x.status === 'active').reduce((p, x) => p + x.dailyBudget, 0), impr: sets.reduce((p, x) => p + x.stats.impressions, 0), clicks: sets.reduce((p, x) => p + x.stats.clicks, 0), cost: sets.reduce((p, x) => p + x.stats.cost, 0), conv: sets.reduce((p, x) => p + x.stats.conv, 0) };
  }).filter((x) => x.sets.length > 0);
  const steps = ['objective', 'audience', 'creative', 'review'];
  const on = (v: boolean) => <span className={`badge ${v ? 'good' : 'warn'}`}>{v ? t('common.on') : t('common.off')}</span>;
  const tracked = s.decisions.some((d) => d.action.type === 'track.fix' && d.status !== 'rejected');

  return (
    <div className="stack">
      <div className="toolbar">
        <h1 style={{ margin: 0 }}>{t('nav.meta')}</h1>
        <button type="button" className="primary" onClick={() => { setStep(0); setTab('new'); }}>+ {t('meta.create_short')}</button>
      </div>
      <p className="muted">{t('meta.intro')}</p>
      <Hint k="hint.meta" />
      <Tabs
        label={t('nav.meta')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: t('google.tab.overview') },
          { id: 'campaigns', label: t('meta.tab.campaigns') },
          { id: 'adsets', label: t('meta.tab.adsets') },
          { id: 'ads', label: t('meta.tab.ads') },
          { id: 'pixel', label: t('meta.tab.pixel') },
          { id: 'edit', label: t('google.tab.edit') },
        ]}
      />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="stack">
        {tab === 'overview' ? <Performance title={t('perf.meta')} xLabel={t('unit.day')} metrics={perf} /> : null}

        {tab === 'campaigns' ? (
          <section className="card">
            {objectives.length === 0 ? <p className="muted">{t('meta.none')}</p> : null}
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('meta.campaign')}</th><th className="n">{t('meta.tab.adsets')}</th><th className="n">{t('col.budget')}</th><th className="n">{t('col.impr')}</th><th className="n">{t('col.clicks')}</th><th className="n">{t('meta.spent')}</th><th className="n">{t('meta.results')}</th><th className="n">{t('meta.cost_per_result')}</th></tr></thead>
                <tbody>
                  {objectives.map((x) => (
                    <tr key={x.o}>
                      <th scope="row">{t(`objective.${x.o}`)}</th><td className="n">{x.sets.length}</td><td className="n">{fmt.money(x.budget)}</td><td className="n">{fmt.num(x.impr, 0)}</td><td className="n">{fmt.num(x.clicks, 0)}</td><td className="n">{fmt.money(x.cost)}</td><td className="n">{fmt.num(x.conv, 1)}</td><td className="n">{x.conv > 0 ? fmt.money(x.cost / x.conv) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === 'adsets' ? (
          <section className="card">
            {s.meta.adSets.length === 0 ? <p className="muted">{t('meta.none')}</p> : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th aria-label={t('col.status')} /><th>{t('col.name')}</th><th>{t('meta.audience')}</th><th>{t('col.learning')}</th>
                    <th className="n">{t('col.budget')}</th><th className="n">{t('col.impr')}</th><th className="n">{t('col.clicks')}</th><th className="n">{t('meta.spent')}</th><th className="n">{t('meta.results')}</th><th className="n">{t('meta.cost_per_result')}</th>
                    <th className="n">{t('meta.frequency')}</th><th className="n">CPM</th><th>{t('meta.fatigue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.meta.adSets.map((x) => {
                    const r = adsetRow(x);
                    return (
                      <tr key={x.id}>
                        <td><StatusSwitch on={x.status === 'active'} label={`${x.name}: ${x.status === 'active' ? t('google.pause') : t('google.resume')}`} action={{ type: 'meta.set_status', params: { adSetId: x.id, status: x.status === 'active' ? 'paused' : 'active' } }} /></td>
                        <th scope="row"><button type="button" className="link" onClick={() => { setSelId(x.id); setEBudget(x.dailyBudget); setEAud(x.audience); setTab('edit'); }}>{x.name}</button> <span className="badge info">{t(`objective.${x.objective}`)}</span></th>
                        <td>{t(`audience.${x.audience}`)}</td>
                        <td style={{ minWidth: 130 }}>
                          <span className={`badge ${x.learning.state === 'limited' ? 'bad' : x.learning.state === 'learning' ? 'warn' : 'good'}`}>{t(`mlearning.${x.learning.state}`)}</span>
                          <Bar value={r.events} max={threshold} label={`${fmt.num(r.events, 0)} / ${fmt.num(threshold, 0)} ${t('meta.events')}`} />
                          <div className="small muted">{fmt.num(r.events, 0)} / {fmt.num(threshold, 0)} {t('meta.events')}</div>
                        </td>
                        <td className="n">{fmt.money(x.dailyBudget)}</td><td className="n">{fmt.num(x.stats.impressions, 0)}</td><td className="n">{fmt.num(x.stats.clicks, 0)}</td><td className="n">{fmt.money(x.stats.cost)}</td><td className="n">{fmt.num(x.stats.conv, 1)}</td>
                        <td className="n">{x.stats.conv > 0 ? fmt.money(x.stats.cost / x.stats.conv) : '—'}</td>
                        <td className="n">{x.last ? fmt.num(x.last.frequency, 2) : '—'}</td><td className="n">{x.last ? fmt.money(x.last.cpm) : '—'}</td>
                        <td>{x.last ? <span className={`badge ${r.fatigued ? 'bad' : 'good'}`}>{r.fatigued ? t('meta.fatigue_high') : t('meta.fatigue_ok')}</span> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="small muted">{t('meta.learning_note')} <FactBadge id="meta.learn.events" /></p>
          </section>
        ) : null}

        {tab === 'ads' ? (
          <section className="card">
            {s.meta.adSets.length === 0 ? <p className="muted">{t('meta.none')}</p> : null}
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('meta.ad')}</th><th>{t('meta.adset')}</th><th>{t('studio.angle')}</th><th>{t('studio.message')}</th></tr></thead>
                <tbody>
                  {s.meta.adSets.flatMap((x) => x.ads.map((ad) => {
                    const cr = s.assets.creatives.find((c) => c.id === ad.creativeId);
                    return <tr key={`${x.id}-${ad.creativeId}`}><th scope="row">{ad.creativeId}</th><td>{x.name}</td><td>{cr?.angle}</td><td>{cr?.message ? t(`msg.${cr.message}`) : t('msg.none')}</td></tr>;
                  }))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === 'pixel' ? (
          <>
            <section className="card">
              <h2>{t('meta.pixel.title')}</h2>
              <p className="small muted">{t('meta.pixel.intro')}</p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('meta.pixel.source')}</th><th>{t('col.status')}</th><th>{t('meta.pixel.what')}</th><th aria-label={t('meta.pixel.action')} /></tr></thead>
                  <tbody>
                    <tr><th scope="row">{t('meta.pixel.base')}</th><td>{on(tracked)}</td><td className="small muted">{t('meta.pixel.base_desc')}</td><td><ActBtn action={{ type: 'track.fix', params: { level: 'basic' } }} label={t('track.basic')} /></td></tr>
                    <tr><th scope="row">{t('meta.pixel.consent')}</th><td>{on(s.tracking.consentMode)}</td><td className="small muted">{t('meta.pixel.consent_desc')}</td><td><ActBtn action={{ type: 'track.fix', params: { level: 'consent_mode' } }} label={t('track.consent_mode')} /></td></tr>
                    <tr><th scope="row">{t('meta.pixel.capi')}</th><td>{on(s.tracking.serverSide)}</td><td className="small muted">{t('meta.pixel.capi_desc')}</td><td><ActBtn action={{ type: 'track.fix', params: { level: 'server_side' } }} label={t('track.server_side')} /></td></tr>
                    <tr><th scope="row">{t('meta.pixel.offline')}</th><td>{on(s.tracking.crmFeedback)}</td><td className="small muted">{t('meta.pixel.offline_desc')}</td><td><ActBtn action={{ type: 'track.fix', params: { level: 'crm_feedback' } }} label={t('track.crm_feedback')} /></td></tr>
                  </tbody>
                </table>
              </div>
              <Hint k="hint.tracking" />
            </section>
            <Performance
              title={t('meta.pixel.events')}
              xLabel={t('unit.day')}
              metrics={[
                { key: 'pixel', label: t('meta.pixel.reported'), points: hist((r) => r.platformConv.meta ?? 0), total: (p) => fmt.num(sumOf(p), 1), fmt: (v) => fmt.num(v, 1) },
                { key: 'crm', label: t('funnel.crm_leads'), points: hist((r) => r.crmLeads), total: (p) => count(sumOf(p)), fmt: count, note: t('meta.pixel.crm_note') },
              ]}
            />
          </>
        ) : null}

        {tab === 'new' ? (
          <section className="card">
            <h2>{t('meta.new')}</h2>
            <ol className="stepper">
              {steps.map((x, i) => (
                <li key={x} aria-current={i === step ? 'step' : undefined} className={i < step ? 'done' : undefined}><span className="n">{i < step ? '✓' : i + 1}</span>{t(`meta.step.${x}`)}</li>
              ))}
            </ol>
            {step === 0 ? (
              <div className="choice">
                {(['leads', 'messages'] as const).map((x) => (
                  <button type="button" key={x} aria-pressed={objective === x} onClick={() => setObjective(x)}>
                    <strong>{t(`objective.${x}`)}</strong>
                    <span className="small muted">{t(`meta.objective_desc.${x}`)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {step === 1 ? (
              <>
                <p className="small muted">CPM {fmt.money(s.params['meta.cpm'] as number)} <FactBadge id="meta.cpm" /> · CTR {fmt.pct(s.params['meta.ctr'] as number, 2)} <FactBadge id="meta.ctr" /></p>
                <div className="form-grid">
                  <Select label={t('meta.audience')} value={audience} onChange={setAudience} options={AUD.map((x) => ({ value: x, label: t(`audience.${x}`) }))} />
                  <NumInput label={t('col.budget')} value={budget} onChange={setBudget} />
                  <TextInput label={t('col.name')} value={name} onChange={setName} />
                </div>
                <Hint k="hint.meta_audience" />
              </>
            ) : null}
            {step === 2 ? (
              <>
                <div className="form-grid">
                  <Select label={t('studio.lp')} value={lpId} onChange={setLpId} options={opts.lps} />
                  <Select label={t('studio.offer')} value={offerId} onChange={setOfferId} options={opts.offers} />
                </div>
                <fieldset>
                  <legend>{t('meta.creatives')}</legend>
                  {crOpts.map((o) => (
                    <label key={o.value} className="check">
                      <input type="checkbox" checked={crIds.includes(o.value)} onChange={(e) => setCrIds(e.target.checked ? [...crIds, o.value] : crIds.filter((x) => x !== o.value))} />
                      {o.label}
                    </label>
                  ))}
                </fieldset>
                {objective === 'messages' ? <p className="small muted">{t('meta.messages_note')}</p> : null}
              </>
            ) : null}
            {step === 3 ? (
              <dl className="summary-list">
                <dt>{t('meta.objective')}</dt><dd>{t(`objective.${objective}`)}</dd>
                <dt>{t('meta.audience')}</dt><dd>{t(`audience.${audience}`)}</dd>
                <dt>{t('col.budget')}</dt><dd>{fmt.money(budget)}</dd>
                <dt>{t('meta.creatives')}</dt><dd>{crIds.join(', ')}</dd>
              </dl>
            ) : null}
            <div className="row" style={{ marginTop: 14 }}>
              {step > 0 ? <button type="button" onClick={() => setStep(step - 1)}>{t('common.back')}</button> : null}
              {step < steps.length - 1 ? <button type="button" className="primary" onClick={() => setStep(step + 1)}>{t('common.next')}</button> : <ActBtn primary label={t('meta.create')} action={{ type: 'meta.create_adset', params: { ...(name ? { name } : {}), objective, audience, dailyBudget: budget, creativeIds: crIds, lpId, offerId } }} />}
            </div>
          </section>
        ) : null}

        {tab === 'edit' ? (
        <section className="card">
          <h2>{t('meta.edit')}</h2>
          {!a ? <p className="muted">{t('meta.none')}</p> : (
            <div className="stack">
              <Select label={t('meta.adset')} value={a.id} onChange={(v) => { setSelId(v); const x = s.meta.adSets.find((y) => y.id === v); if (x) { setEBudget(x.dailyBudget); setEAud(x.audience); } }} options={s.meta.adSets.map((x) => ({ value: x.id, label: `${x.id} · ${x.name}` }))} />
              <div className="form-grid">
                <NumInput label={t('col.budget')} value={eBudget} onChange={setEBudget} />
                <ActBtn action={{ type: 'meta.set_budget', params: { adSetId: a.id, dailyBudget: eBudget } }} label={t('google.set_budget')} />
              </div>
              <div className="form-grid">
                <Select label={t('meta.audience')} value={eAud} onChange={setEAud} options={AUD.map((x) => ({ value: x, label: t(`audience.${x}`) }))} />
                <ActBtn action={{ type: 'meta.set_audience', params: { adSetId: a.id, audience: eAud } }} label={t('meta.set_audience')} />
              </div>
              <Hint k="hint.reset_learning" />
              <div className="form-grid">
                <Select label={t('meta.creatives')} value={addCr} onChange={setAddCr} options={crOpts} />
                <ActBtn action={{ type: 'meta.add_creative', params: { adSetId: a.id, creativeId: addCr } }} label={t('meta.add_creative')} />
              </div>
              {a.ads.length > 1 ? (
                <div className="row">
                  {a.ads.map((ad) => (
                    <ActBtn key={ad.creativeId} action={{ type: 'meta.remove_creative', params: { adSetId: a.id, creativeId: ad.creativeId } }} label={`${t('meta.remove_creative')} ${ad.creativeId}`} />
                  ))}
                </div>
              ) : null}
              <ActBtn action={{ type: 'meta.set_status', params: { adSetId: a.id, status: a.status === 'active' ? 'paused' : 'active' } }} label={a.status === 'active' ? t('google.pause') : t('google.resume')} />
            </div>
          )}
        </section>
        ) : null}
      </div>
      <QueuePanel />
    </div>
  );
}
