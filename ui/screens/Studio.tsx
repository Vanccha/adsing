import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { selectors } from '@engine/index';
import type { AdMessage, Offer } from '@engine/core';
import { ActBtn, QueuePanel } from '../components/Actions';
import { CIBar } from '../components/Charts';
import { FactBadge } from '../components/FactBadge';
import { Select, TextInput } from '../components/Fields';
import { Hint } from '../components/Hint';
import { NumInput } from '../components/Fields';
import { useGame } from '../game/GameContext';
import type { Posterior } from '@engine/quality';

const ANGLES = ['default', 'price', 'trust', 'speed', 'social_proof', 'local'];
const STYLES = ['default', 'short', 'long', 'video', 'testimonial'];
const KINDS: Offer['kind'][] = ['trial', 'demo', 'free_setup', 'discount'];

function Est({ p, label }: { p: Posterior; label: string }) {
  const { t } = useTranslation();
  const { fmt } = useGame();
  const max = Math.max(p.hi * 1.3, 0.001);
  return (
    <div>
      <CIBar mean={p.mean} lo={p.lo} hi={p.hi} max={max} label={`${label}: ${fmt.pct(p.mean, 2)} (${fmt.pct(p.lo, 2)} – ${fmt.pct(p.hi, 2)})`} />
      <span className="small num">{fmt.pct(p.mean, 2)} ({fmt.pct(p.lo, 2)} – {fmt.pct(p.hi, 2)}), n={fmt.num(p.n, 0)}</span>{' '}
      {p.insufficient ? <span className="badge warn">{t('funnel.insufficient')}</span> : null}
    </div>
  );
}

export function Studio() {
  const { t } = useTranslation();
  const g = useGame();
  const s = g.state!;
  const { fmt } = g;
  const est = useMemo(() => selectors.assetEstimates(s), [s]);
  const [angle, setAngle] = useState('default');
  const [ch, setCh] = useState<'google' | 'meta'>('google');
  const [bold, setBold] = useState(false);
  const [msg, setMsg] = useState<'' | AdMessage>('');
  const [lpMsg, setLpMsg] = useState<'' | AdMessage>('');
  const [style, setStyle] = useState('default');
  const [kind, setKind] = useState<Offer['kind']>('trial');
  const [oname, setOname] = useState('');
  const [a, setA] = useState(s.assets.lps[0]!.id);
  const [b, setB] = useState(s.assets.lps[1]?.id ?? s.assets.lps[0]!.id);
  const [days, setDays] = useState(21);
  const [split, setSplit] = useState(0.5);
  const lpOpts = s.assets.lps.map((l) => ({ value: l.id, label: `${l.id} · ${l.style}${l.availableDay > s.day ? ` (${t('asset.ready_day', { n: l.availableDay })})` : ''}` }));
  const messageOptions: Array<{ value: '' | AdMessage; label: string }> = [{ value: '', label: t('msg.none') }, ...(['time', 'revenue', 'price', 'trust'] as const).map((x) => ({ value: x, label: t(`msg.${x}`) }))];
  const ready = (d: number) => (d > s.day ? <span className="badge warn">{t('asset.ready_day', { n: d })}</span> : null);

  return (
    <div className="stack">
      <h1>{t('nav.studio')}</h1>
      <p className="muted">{t('studio.intro')}</p>
      <div className="notice">{t('studio.stat_note')}</div>
      <Hint k="hint.studio" />
      <Hint k={`hint.message.${s.marketId}`} />

      <div className="grid cols-3">
        <section className="card">
          <h2>{t('studio.new_creative')}</h2>
          <div className="stack">
            <Select label={t('studio.channel')} value={ch} onChange={setCh} options={[{ value: 'google', label: 'Google Ads' }, { value: 'meta', label: 'Meta' }]} />
            <Select label={t('studio.angle')} value={angle} onChange={setAngle} options={ANGLES.map((x) => ({ value: x, label: t(`angle.${x}`) }))} />
            <Select label={t('studio.message')} value={msg} onChange={setMsg} options={messageOptions} />
            <label className="check"><input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} />{t('studio.bold')}</label>
            {bold ? <div className="notice warn small">{t('studio.bold_warn')}</div> : null}
            <ActBtn primary action={{ type: 'asset.create_creative', params: { channel: ch, angle, bold, ...(msg ? { message: msg } : {}) } }} label={t('studio.create')} />
          </div>
        </section>
        <section className="card">
          <h2>{t('studio.new_lp')}</h2>
          <div className="stack">
            <Select label={t('studio.style')} value={style} onChange={setStyle} options={STYLES.map((x) => ({ value: x, label: t(`style.${x}`) }))} />
            <Select label={t('studio.message')} value={lpMsg} onChange={setLpMsg} options={messageOptions} />
            <ActBtn primary action={{ type: 'asset.create_lp', params: { style, ...(lpMsg ? { message: lpMsg } : {}) } }} label={t('studio.create')} />
          </div>
        </section>
        <section className="card">
          <h2>{t('studio.new_offer')}</h2>
          <div className="stack">
            <Select label={t('studio.kind')} value={kind} onChange={setKind} options={KINDS.map((x) => ({ value: x, label: t(`offer.${x}`) }))} />
            <TextInput label={t('col.name')} value={oname} onChange={setOname} />
            <ActBtn primary action={{ type: 'asset.create_offer', params: { kind, ...(oname ? { name: oname } : {}) } }} label={t('studio.create')} />
          </div>
        </section>
      </div>

      <section className="card">
        <h2>{t('studio.estimates')}</h2>
        <p className="small muted">{t('studio.estimates_note')} <FactBadge id="prior.strength" /></p>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">{t('studio.estimates')}</caption>
            <thead><tr><th>{t('studio.asset')}</th><th>{t('studio.metric')}</th><th>{t('studio.estimate')}</th></tr></thead>
            <tbody>
              {est.creatives.map((c) => (
                <tr key={c.id}><th scope="row">{t('studio.creative')} {c.id} <span className="small muted">({c.channel}, {t(`angle.${c.angle}`)})</span> {ready(s.assets.creatives.find((x) => x.id === c.id)?.availableDay ?? 0)}</th><td>CTR</td><td><Est p={c.ctr} label={`CTR ${c.id}`} /></td></tr>
              ))}
              {est.lps.map((l) => (
                <tr key={l.id}><th scope="row">{t('studio.lp')} {l.id} <span className="small muted">({t(`style.${l.style}`)})</span> {ready(s.assets.lps.find((x) => x.id === l.id)?.availableDay ?? 0)}</th><td>{t('studio.lp_cvr')}</td><td><Est p={l.cvr} label={`CVR ${l.id}`} /></td></tr>
              ))}
              {est.offers.map((o) => (
                <tr key={o.id}><th scope="row">{t('studio.offer')} {o.id} <span className="small muted">({t(`offer.${o.kind}`)})</span></th><td>{t('studio.trial_rate')}</td><td><Est p={o.trialRate} label={`${o.id}`} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>{t('studio.ab')}</h2>
        <div className="form-grid">
          <Select label={t('studio.variant_a')} value={a} onChange={setA} options={lpOpts} />
          <Select label={t('studio.variant_b')} value={b} onChange={setB} options={lpOpts} />
          <NumInput label={t('studio.days')} value={days} onChange={setDays} min={7} />
          <NumInput label={t('studio.split')} value={split} onChange={setSplit} step={0.05} min={0.05} />
          <ActBtn primary action={{ type: 'asset.start_ab_test', params: { a, b, days, split } }} label={t('studio.start_ab')} />
        </div>
        {s.assets.lps.length < 2 ? <p className="small muted">{t('studio.need_two_lps')}</p> : null}
        <h3 style={{ marginTop: 12 }}>{t('studio.tests')}</h3>
        {s.tests.ab.length === 0 ? <p className="muted">{t('studio.no_tests')}</p> : null}
        {s.tests.ab.map((tst) => {
          const r = selectors.abResult(s, tst.id)!;
          return (
            <div key={tst.id} className="card">
              <div className="row between">
                <strong>{tst.id}: {tst.a} vs {tst.b}</strong>
                <span className={`badge ${tst.status === 'running' ? 'info' : 'good'}`}>{t(`abstatus.${tst.status}`)}</span>
              </div>
              <p className="small muted">{t('studio.test_range', { from: tst.startDay, to: tst.endDay })}</p>
              <div className="grid cols-2">
                <div><strong>A ({tst.a})</strong><Est p={r.a} label={`A ${tst.a}`} /></div>
                <div><strong>B ({tst.b})</strong><Est p={r.b} label={`B ${tst.b}`} /></div>
              </div>
              <p>
                P(A&gt;B) = <strong className="num">{fmt.pct(r.pAGreaterB, 1)}</strong>{' '}
                {r.insufficient ? <span className="badge warn">{t('studio.low_data')}</span> : r.pAGreaterB > 0.95 || r.pAGreaterB < 0.05 ? <span className="badge good">{t('studio.clear')}</span> : <span className="badge info">{t('studio.unclear')}</span>}
              </p>
              {r.insufficient ? <div className="notice warn small">{t('studio.low_data_warn')}</div> : null}
              {tst.status === 'running' ? <ActBtn action={{ type: 'asset.stop_ab_test', params: { testId: tst.id } }} label={t('studio.stop')} /> : null}
            </div>
          );
        })}
      </section>
      <QueuePanel />
    </div>
  );
}
