import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart } from '../components/Charts';
import { ActBtn, QueuePanel } from '../components/Actions';
import { NumInput } from '../components/Fields';
import { Hint } from '../components/Hint';
import { useGame } from '../game/GameContext';

export function GeoScreen() {
  const { t } = useTranslation();
  const g = useGame();
  const s = g.state!;
  const { fmt } = g;
  const [h, setH] = useState(3);
  const score = s.geo.observedScore;
  // Gözlem gürültülüdür: aralık olarak göster (±0.1).
  const lo = Math.max(0, score - 0.1);
  const hi = score + 0.1;
  const invested = s.decisions.filter((d) => d.action.type === 'geo.invest' && d.status !== 'rejected').reduce((a, d) => a + ((d.action.params as { hours: number }).hours ?? 0), 0);
  return (
    <div className="stack">
      <h1>{t('nav.geo')} <span className="badge warn">{t('geo.low_conf')}</span></h1>
      <p className="muted">{t('geo.intro')}</p>
      <div className="notice warn">{t('geo.uncertain')}</div>
      <Hint k="hint.geo" />
      <section className="card">
        <h2>{t('geo.visibility')}</h2>
        <p>
          <strong className="num">{fmt.num(score, 2)}</strong> <span className="muted">({t('geo.range')}: {fmt.num(lo, 2)} – {fmt.num(hi, 2)})</span> <span className="badge warn">{t('geo.low_conf')}</span>
        </p>
        <p className="small muted">{t('geo.invested', { h: fmt.num(invested, 1) })}</p>
        <LineChart title={t('geo.visibility')} fmtY={(v) => fmt.num(v, 2)} series={[{ name: t('geo.score'), color: 'var(--c4)', points: g.obs.map((o) => ({ x: o.day, y: o.geoScore })) }]} xLabel={t('unit.day')} />
        <p className="small muted">{t('geo.interval_note')}</p>
      </section>
      <section className="card">
        <h2>{t('geo.invest')}</h2>
        <div className="form-grid">
          <NumInput label={t('unit.hours')} value={h} onChange={setH} step={0.5} />
          <ActBtn action={{ type: 'geo.invest', params: { hours: h } }} label={t('geo.invest')} />
        </div>
        <p className="small muted">{t('geo.delay_note')}</p>
      </section>
      <QueuePanel />
    </div>
  );
}
