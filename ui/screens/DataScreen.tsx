import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_REF_DATE } from '@engine/data/freshness';
import type { MarketId, Param } from '@engine/data/schema';
import { MARKETS, SCENARIOS, catalog, marketInfo } from '../engine/bundle';
import { FactDetails, LayerBadge, paramStale } from '../components/FactBadge';
import { Modal } from '../components/Modal';
import { Select } from '../components/Fields';
import { useGame } from '../game/GameContext';

export function DataScreen() {
  const { t } = useTranslation();
  const g = useGame();
  const [market, setMarket] = useState<MarketId>(g.cfg?.market ?? 'tr');
  const [scenario, setScenario] = useState<string>(g.cfg?.scenario ?? 'salon-saas');
  const [layer, setLayer] = useState<'all' | Param['layer']>('all');
  const [conf, setConf] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [stale, setStale] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const entries = useMemo(() => catalog(market, scenario), [market, scenario]);
  const info = marketInfo(market);
  const rows = entries.filter(({ param: p }) => {
    if (layer !== 'all' && p.layer !== layer) return false;
    const c = p.confidence ?? (p.layer === 'assumption' ? 'low' : 'medium');
    if (conf !== 'all' && c !== conf) return false;
    if (stale && !paramStale(p).stale) return false;
    if (q && !`${p.id} ${p.note ?? ''} ${p.source?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const sel = entries.find((e) => e.param.id === open);
  const staleCount = entries.filter((e) => paramStale(e.param).stale).length;
  const counts = { sourced: 0, derived: 0, assumption: 0 };
  for (const e of entries) counts[e.param.layer]++;
  const fmtVal = (p: Param) => {
    const drawn = g.state && g.cfg?.market === market ? g.state.params[p.id] : undefined;
    const base = p.value !== undefined ? String(p.value) : '';
    const rng = p.range ? `${p.range.min}–${p.range.max}` : '';
    return [drawn !== undefined ? `${typeof drawn === 'number' ? Math.round(drawn * 10000) / 10000 : String(drawn)} ★` : '', base, rng ? `[${rng}]` : ''].filter(Boolean).join(' ');
  };
  return (
    <div className="stack">
      <h1>{t('nav.data')}</h1>
      <p className="muted">{t('data.intro')}</p>
      <div className="notice">{t('data.synthetic_sim')}</div>
      <div className="notice">{t('data.today', { d: DEFAULT_REF_DATE })}</div>
      <section className="card">
        <h2>{t('data.filters')}</h2>
        <div className="form-grid">
          <Select label={t('start.market')} value={market} onChange={setMarket} options={MARKETS.map((m) => ({ value: m, label: t(`market.${m}`) }))} />
          <Select label={t('start.scenario')} value={scenario} onChange={setScenario} options={SCENARIOS.map((x) => ({ value: x, label: x }))} />
          <Select label={t('data.layer')} value={layer} onChange={setLayer} options={[{ value: 'all', label: t('common.all') }, { value: 'sourced', label: t('layer.sourced') }, { value: 'derived', label: t('layer.derived') }, { value: 'assumption', label: t('layer.assumption') }]} />
          <Select label={t('data.confidence')} value={conf} onChange={setConf} options={[{ value: 'all', label: t('common.all') }, { value: 'low', label: t('conf.low') }, { value: 'medium', label: t('conf.medium') }, { value: 'high', label: t('conf.high') }]} />
          <label className="field">{t('common.search')}<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={stale} onChange={(e) => setStale(e.target.checked)} />{t('data.only_stale')}</label>
        </div>
        <p className="small" role="status">
          {t('data.count', { n: rows.length, total: entries.length })} · {t('layer.sourced')}: {counts.sourced} · {t('layer.derived')}: {counts.derived} · {t('layer.assumption')}: {counts.assumption} · {t('data.stale_count', { n: staleCount })}
        </p>
        {g.state && g.cfg?.market === market ? <p className="small muted">{t('data.drawn_note')}</p> : null}
      </section>
      <section className="card">
        <div className="table-wrap">
          <table>
            <caption className="sr-only">{t('nav.data')}</caption>
            <thead><tr><th>{t('data.id')}</th><th>{t('data.value')}</th><th>{t('data.layer')}</th><th>{t('data.confidence')}</th><th>{t('data.source')}</th><th>{t('data.date')}</th></tr></thead>
            <tbody>
              {rows.map(({ param: p }) => {
                const st = paramStale(p);
                return (
                  <tr key={p.id}>
                    <th scope="row"><code>{p.id}</code></th>
                    <td className="num">{fmtVal(p)} <span className="muted">{p.unit}</span></td>
                    <td><LayerBadge layer={p.layer} stale={st.stale} onClick={() => setOpen(p.id)} /></td>
                    <td>{t(`conf.${p.confidence ?? (p.layer === 'assumption' ? 'low' : 'medium')}`)}</td>
                    <td className="small">{p.source?.name ?? '—'}</td>
                    <td className="small">{p.source ? (p.source.published ?? p.source.accessed) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h2>{t('data.competitors')} — {t(`market.${market}`)}</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('col.name')}</th><th>{t('data.verified')}</th><th>{t('data.plans')}</th><th>{t('data.source')}</th></tr></thead>
            <tbody>
              {info.competitors.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.name}</th>
                  <td><span className={`badge ${c.verified ? 'good' : 'warn'}`}>{c.verified ? t('data.verified_yes') : t('data.verified_no')}</span></td>
                  <td className="small">{(c.pricing ?? []).map((p) => `${p.plan}: ${p.price} ${p.unit}/${p.period}`).join(' · ') || '—'}</td>
                  <td className="small">{c.source?.url ? <a href={c.source.url} target="_blank" rel="noreferrer noopener">{c.source.name ?? c.source.url}</a> : (c.source?.name ?? '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {sel ? (
        <Modal title={t('data.details_title', { id: sel.param.id })} onClose={() => setOpen(null)}>
          <FactDetails param={sel.param} origin={sel.origin} value={g.state && g.cfg?.market === market ? g.state.params[sel.param.id] : undefined} />
        </Modal>
      ) : null}
    </div>
  );
}
