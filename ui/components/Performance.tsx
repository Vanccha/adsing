// Performans paneli: renkli özet kartları + büyük grafik + tarih aralığı. Kart seçmek grafiği değiştirir (tek eksen).
// Aralık kartları ve grafiği birlikte kapsar, böylece sayılar her zaman tutarlıdır.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart } from './Charts';

export interface PerfMetric {
  key: string;
  label: string;
  points: Array<{ x: number; y: number }>;
  /** Kart değeri: seçilen aralıktan hesaplanır. */
  total: (pts: Array<{ x: number; y: number }>) => string;
  fmt: (v: number) => string;
  note?: string;
}

const RANGES = [7, 30, 90, 0] as const;
const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];

export const sumOf = (p: Array<{ y: number }>): number => p.reduce((a, b) => a + b.y, 0);
export const lastOf = (p: Array<{ y: number }>): number => p[p.length - 1]?.y ?? 0;

export function Performance({ title, metrics, xLabel }: { title: string; metrics: PerfMetric[]; xLabel: string }) {
  const { t } = useTranslation();
  const [sel, setSel] = useState(metrics[0]?.key ?? '');
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const lastDay = Math.max(0, ...metrics.flatMap((m) => m.points.map((p) => p.x)));
  const inRange = (p: Array<{ x: number; y: number }>) => (range === 0 ? p : p.filter((q) => q.x > lastDay - range));
  const i = Math.max(0, metrics.findIndex((m) => m.key === sel));
  const m = metrics[i]!;
  return (
    <section className="perf" aria-label={title}>
      <div className="perf-head">
        <h2>{title}</h2>
        <div className="range" role="group" aria-label={t('perf.range')}>
          {RANGES.map((r) => (
            <button type="button" key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r === 0 ? t('perf.all') : t('perf.days', { n: r })}</button>
          ))}
        </div>
      </div>
      <div className="kpis">
        {metrics.map((x, k) => (
          <button type="button" className="kpi" key={x.key} aria-pressed={x.key === m.key} style={{ '--kpi': COLORS[k % COLORS.length] } as React.CSSProperties} onClick={() => setSel(x.key)}>
            <span className="k">{x.label}</span>
            <span className="v">{x.total(inRange(x.points))}</span>
          </button>
        ))}
      </div>
      <div className="perf-chart">
        <LineChart hideTitle title={`${title}: ${m.label}`} height={250} xLabel={xLabel} fmtY={m.fmt} series={[{ name: m.label, color: COLORS[i % COLORS.length]!, points: inRange(m.points) }]} />
        {m.note ? <p className="small muted" style={{ marginTop: 4 }}>{m.note}</p> : null}
      </div>
    </section>
  );
}
