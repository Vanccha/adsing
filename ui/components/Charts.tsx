// Hafif, bağımlılıksız SVG grafikler. Her grafik: erişilebilir ad + özet, üzerine gelince ve klavyeyle okuma (artı işaretli imleç + ipucu),
// uçta doğrudan değer etiketi, açılır veri tablosu. Tek eksen: iki farklı ölçek aynı grafikte gösterilmez.
import { useId, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
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

export function LineChart({ title, series, fmtY, xLabel, height = 220, hideTitle = false }: { title: string; series: Series[]; fmtY: (v: number) => string; xLabel?: string; height?: number; hideTitle?: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 760;
  const pad = { l: 64, r: 92, t: 12, b: 26 };
  const all = series.flatMap((s) => s.points.filter((p) => p.y !== null) as Array<{ x: number; y: number }>);
  const heading = hideTitle ? null : <figcaption><strong>{title}</strong></figcaption>;
  if (all.length < 2) {
    return (
      <figure style={{ margin: 0 }}>
        {heading}
        <p className="muted small">{t('chart.no_data')}</p>
      </figure>
    );
  }
  const xVals = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
  const ys = all.map((p) => p.y);
  const x0 = xVals[0]!;
  const x1 = xVals[xVals.length - 1]!;
  const top = nice(Math.max(...ys, 0)) || 1;
  const rawMin = Math.min(0, ...ys);
  const bottom = rawMin < 0 ? -nice(-rawMin) : 0;
  const X = (x: number) => pad.l + ((x - x0) / Math.max(1, x1 - x0)) * (W - pad.l - pad.r);
  const Y = (y: number) => pad.t + (1 - (y - bottom) / Math.max(1e-9, top - bottom)) * (height - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => bottom + f * (top - bottom));
  const lastOf = (s: Series) => [...s.points].reverse().find((q) => q.y !== null) as { x: number; y: number } | undefined;
  const summary = series.map((s) => {
    const p = lastOf(s);
    return p ? `${s.name}: ${fmtY(p.y)}` : s.name;
  });
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / Math.max(1, r.width)) * W;
    const tx = x0 + ((vx - pad.l) / (W - pad.l - pad.r)) * (x1 - x0);
    setHover(xVals.reduce((a, b) => (Math.abs(b - tx) < Math.abs(a - tx) ? b : a)));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'Escape') return setHover(null);
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = hover === null ? xVals.length - 1 : xVals.indexOf(hover);
    setHover(xVals[Math.max(0, Math.min(xVals.length - 1, i + d))]!);
  };
  const tipRows = hover === null ? [] : series.map((s) => ({ s, y: s.points.find((p) => p.x === hover)?.y ?? null }));
  const tipLeft = hover === null ? 0 : Math.max(14, Math.min(86, (X(hover) / W) * 100));
  return (
    <figure style={{ margin: 0 }}>
      {heading}
      <div className="chart-wrap">
        <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" tabIndex={0} aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} onPointerMove={pick} onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)} onKeyDown={onKey}>
          <title id={`${id}-t`}>{title}</title>
          <desc id={`${id}-d`}>{summary.join('; ')}</desc>
          {ticks.map((v) => (
            <g key={v}>
              <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} />
              <text x={pad.l - 8} y={Y(v) + 4} textAnchor="end">{fmtY(v)}</text>
            </g>
          ))}
          <text x={pad.l} y={height - 6}>{x0}</text>
          <text x={W - pad.r} y={height - 6} textAnchor="end">{x1} {xLabel ?? ''}</text>
          {series.map((s, i) => {
            let d = '';
            let pen = false;
            let first: number | null = null;
            let lastX = 0;
            for (const p of s.points) {
              if (p.y === null) {
                pen = false;
                continue;
              }
              d += `${pen ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`;
              pen = true;
              first ??= p.x;
              lastX = p.x;
            }
            const end = lastOf(s);
            const area = series.length === 1 && first !== null ? `${d}L${X(lastX).toFixed(1)},${Y(Math.max(bottom, 0)).toFixed(1)}L${X(first).toFixed(1)},${Y(Math.max(bottom, 0)).toFixed(1)}Z` : null;
            return (
              <g key={s.name}>
                {area ? <path d={area} fill={s.color} opacity={0.1} /> : null}
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={i % 2 ? '6 4' : undefined} />
                {end ? <circle cx={X(end.x)} cy={Y(end.y)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} /> : null}
                {end && series.length <= 2 ? <text className="end" x={X(end.x) + 8} y={Y(end.y) + 4 + (series.length === 2 ? (i === 0 ? -7 : 7) : 0)}>{fmtY(end.y)}</text> : null}
              </g>
            );
          })}
          {hover !== null ? (
            <g>
              <line className="cross" x1={X(hover)} x2={X(hover)} y1={pad.t} y2={height - pad.b} />
              {tipRows.map(({ s, y }) => (y === null ? null : <circle key={s.name} cx={X(hover)} cy={Y(y)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />))}
            </g>
          ) : null}
        </svg>
        {hover !== null ? (
          <div className="chart-tip" style={{ left: `${tipLeft}%` }} role="status">
            <div className="muted">{xLabel ? `${hover} ${xLabel}` : hover}</div>
            {tipRows.map(({ s, y }) => (
              <div className="row-t" key={s.name}>
                <i style={{ background: s.color }} aria-hidden="true" />
                <b>{y === null ? '—' : fmtY(y)}</b>
                <span className="muted">{s.name}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {series.length > 1 ? (
        <div className="legend">
          {series.map((s, i) => (
            <span key={s.name}>
              <i style={{ background: s.color }} aria-hidden="true" />
              {s.name}
              {i % 2 ? ` (${t('chart.dashed')})` : ''}
            </span>
          ))}
        </div>
      ) : null}
      <details className="data-table">
        <summary>{t('chart.table')}</summary>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{xLabel ?? ''}</th>{series.map((s) => <th className="n" key={s.name}>{s.name}</th>)}</tr></thead>
            <tbody>
              {xVals.slice(-60).map((x) => (
                <tr key={x}>
                  <td>{x}</td>
                  {series.map((s) => {
                    const y = s.points.find((p) => p.x === x)?.y ?? null;
                    return <td className="n" key={s.name}>{y === null ? '—' : fmtY(y)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Yatay çubuklar: tek seri, tek renk; değer uçta, en büyük üstte. */
export function HBars({ items, fmt, label }: { items: Array<{ key: string; label: string; value: number }>; fmt: (v: number) => string; label: string }) {
  const rows = [...items].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars" role="list" aria-label={label}>
      {rows.map((r) => (
        <div className="hbar" role="listitem" key={r.key} title={`${r.label}: ${fmt(r.value)}`}>
          <span>{r.label}</span>
          <span className="track"><span className="fill" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="val">{fmt(r.value)}</span>
        </div>
      ))}
    </div>
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
