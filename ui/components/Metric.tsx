import type { ReactNode } from 'react';

export function Metric({ label, value, sub, badge, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; badge?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className={`metric ${tone ?? ''}`} role="group" aria-label={typeof label === 'string' ? label : undefined}>
      <div className="label">
        <span>{label}</span>
        {badge}
      </div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}
