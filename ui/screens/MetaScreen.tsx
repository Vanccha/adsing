import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AudienceKind } from '@engine/core';
import { ActBtn, QueuePanel } from '../components/Actions';
import { FactBadge } from '../components/FactBadge';
import { NumInput, Select, TextInput, useAssetOptions } from '../components/Fields';
import { Hint } from '../components/Hint';
import { useGame } from '../game/GameContext';

const AUD: AudienceKind[] = ['interest', 'lookalike', 'advantage', 'broad'];

export function MetaScreen() {
  const { t } = useTranslation();
  const g = useGame();
  const s = g.state!;
  const { fmt } = g;
  const opts = useAssetOptions(s);
  const price = Math.round(s.product.price);
  const threshold = typeof s.params['meta.learn.events'] === 'number' ? (s.params['meta.learn.events'] as number) : 50;

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

  return (
    <div className="stack">
      <h1>{t('nav.meta')}</h1>
      <p className="muted">{t('meta.intro')}</p>
      <Hint k="hint.meta" />
      <section className="card">
        <h2>{t('meta.tree')}</h2>
        {s.meta.adSets.length === 0 ? <p className="muted">{t('meta.none')}</p> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('col.name')}</th><th>{t('col.status')}</th><th>{t('meta.audience')}</th><th>{t('col.learning')}</th>
                <th className="n">{t('col.budget')}</th><th className="n">{t('col.impr')}</th><th className="n">{t('col.clicks')}</th>
                <th className="n">{t('col.cost')}</th><th className="n">{t('col.conv')}</th><th className="n">CPA</th>
                <th className="n">{t('meta.frequency')}</th><th className="n">CPM</th><th>{t('meta.fatigue')}</th>
              </tr>
            </thead>
            <tbody>
              {s.meta.adSets.map((x) => {
                const life = x.stats.impressions > 0 ? x.stats.clicks / x.stats.impressions : 0;
                const fatigued = !!x.last && ((x.last.frequency > 3) || (life > 0 && x.last.ctrEff < 0.7 * life));
                const ev = x.learning.events.reduce((p, c) => p + c, 0);
                return (
                  <Fragment key={x.id}>
                    <tr>
                      <th scope="row">{x.name} <span className="badge info">{t(`objective.${x.objective}`)}</span></th>
                      <td>{t(`status.${x.status}`)}</td>
                      <td>{t(`audience.${x.audience}`)}</td>
                      <td>
                        <span className={`badge ${x.learning.state === 'limited' ? 'bad' : x.learning.state === 'learning' ? 'warn' : 'good'}`}>{t(`mlearning.${x.learning.state}`)}</span>
                        <div className="small muted">{fmt.num(ev, 0)} / {fmt.num(threshold, 0)} {t('meta.events')}</div>
                      </td>
                      <td className="n">{fmt.money(x.dailyBudget)}</td>
                      <td className="n">{fmt.num(x.stats.impressions, 0)}</td>
                      <td className="n">{fmt.num(x.stats.clicks, 0)}</td>
                      <td className="n">{fmt.money(x.stats.cost)}</td>
                      <td className="n">{fmt.num(x.stats.conv, 1)}</td>
                      <td className="n">{x.stats.conv > 0 ? fmt.money(x.stats.cost / x.stats.conv) : '—'}</td>
                      <td className="n">{x.last ? fmt.num(x.last.frequency, 2) : '—'}</td>
                      <td className="n">{x.last ? fmt.money(x.last.cpm) : '—'}</td>
                      <td>{x.last ? <span className={`badge ${fatigued ? 'bad' : 'good'}`}>{fatigued ? t('meta.fatigue_high') : t('meta.fatigue_ok')}</span> : '—'}</td>
                    </tr>
                    {x.ads.map((ad) => (
                      <tr key={`${x.id}-${ad.creativeId}`} className="child">
                        <th scope="row">{t('meta.ad')} {ad.creativeId}</th>
                        <td colSpan={12} className="small muted">{s.assets.creatives.find((c) => c.id === ad.creativeId)?.angle}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted">{t('meta.learning_note')} <FactBadge id="meta.learn.events" /></p>
      </section>

      <div className="grid cols-2">
        <section className="card">
          <h2>{t('meta.new')}</h2>
          <p className="small muted">CPM {fmt.money(s.params['meta.cpm'] as number)} <FactBadge id="meta.cpm" /> · CTR {fmt.pct(s.params['meta.ctr'] as number, 2)} <FactBadge id="meta.ctr" /></p>
          <div className="form-grid">
            <Select label={t('meta.objective')} value={objective} onChange={setObjective} options={[{ value: 'leads', label: t('objective.leads') }, { value: 'messages', label: t('objective.messages') }]} />
            <Select label={t('meta.audience')} value={audience} onChange={setAudience} options={AUD.map((x) => ({ value: x, label: t(`audience.${x}`) }))} />
            <NumInput label={t('col.budget')} value={budget} onChange={setBudget} />
            <Select label={t('studio.lp')} value={lpId} onChange={setLpId} options={opts.lps} />
            <Select label={t('studio.offer')} value={offerId} onChange={setOfferId} options={opts.offers} />
            <TextInput label={t('col.name')} value={name} onChange={setName} />
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
          <ActBtn primary label={t('meta.create')} action={{ type: 'meta.create_adset', params: { ...(name ? { name } : {}), objective, audience, dailyBudget: budget, creativeIds: crIds, lpId, offerId } }} />
          <Hint k="hint.meta_audience" />
        </section>

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
      </div>
      <QueuePanel />
    </div>
  );
}
