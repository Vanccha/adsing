// Hafif, bağımlılıksız SVG grafikler. Her grafik erişilebilir ad + özet metin + (açılır) veri tablosu içerir.
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

export interface Series {
  name: string;
  color: string;
  points: Array<{ x: number; y: number | null }>;
}

const nice = (max: number): number => {
  if (max <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

export function LineChart({ title, series, fmtY, xLabel, height = 200 }: { title: string; series: Series[]; fmtY: (v: number) => string; xLabel?: string; height?: number }) {
  const { t } = useTranslation();
  const id = useId();
  const W = 640;
  const pad = { l: 56, r: 12, t: 10, b: 24 };
  const all = series.flatMap((s) => s.points.filter((p) => p.y !== null) as Array<{ x: number; y: number }>);
  if (all.length < 2) {
    return (
      <figure style={{ margin: 0 }}>
        <figcaption>{title}</figcaption>
        <p className="muted small">{t('chart.no_data')}</p>
      </figure>
    );
  }
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const rawMin = Math.min(0, ...ys);
  const rawMax = Math.max(...ys, 0);
  const top = nice(rawMax) || 1;
  const bottom = rawMin < 0 ? -nice(-rawMin) : 0;
  const X = (x: number) => pad.l + ((x - x0) / Math.max(1, x1 - x0)) * (W - pad.l - pad.r);
  const Y = (y: number) => pad.t + (1 - (y - bottom) / Math.max(1e-9, top - bottom)) * (height - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => bottom + f * (top - bottom));
  const last = series.map((s) => {
    const p = [...s.points].reverse().find((q) => q.y !== null);
    return p ? `${s.name}: ${fmtY(p.y as number)}` : s.name;
  });
  return (
    <figure style={{ margin: 0 }}>
      <figcaption>
        <strong>{title}</strong>
      </figcaption>
      <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}>
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{last.join('; ')}</desc>
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} />
            <text x={pad.l - 6} y={Y(v) + 4} textAnchor="end">
              {fmtY(v)}
            </text>
          </g>
        ))}
        <text x={pad.l} y={height - 6}>{x0}</text>
        <text x={W - pad.r} y={height - 6} textAnchor="end">
          {x1} {xLabel ?? ''}
        </text>
        {series.map((s, i) => {
          let d = '';
          let pen = false;
          for (const p of s.points) {
            if (p.y === null) {
              pen = false;
              continue;
            }
            d += `${pen ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`;
            pen = true;
          }
          return <path key={s.name} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={i % 2 ? '6 3' : undefined} />;
        })}
      </svg>
      <div className="legend">
        {series.map((s, i) => (
          <span key={s.name}>
            <i style={{ background: s.color }} aria-hidden="true" />
            {s.name}
            {i % 2 ? ` (${t('chart.dashed')})` : ''}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Güven aralığı çubuğu: [lo, hi] aralığı ve ortalama; ölçek 0..max. */
export function CIBar({ mean, lo, hi, max, label }: { mean: number; lo: number; hi: number; max: number; label: string }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className="ci" role="img" aria-label={label}>
      <div className="range" style={{ left: pct(lo), width: `${Math.max(1, ((hi - lo) / max) * 100)}%` }} />
      <div className="mean" style={{ left: pct(mean) }} />
    </div>
  );
}

export function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div className="bar" role="img" aria-label={label}>
      <span style={{ width: `${max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0}%` }} />
    </div>
  );
}
