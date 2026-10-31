import { useId } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState } from '@engine/core';

export function NumInput({ label, value, onChange, step = 1, min = 0, hint }: { label: ReactNode; value: number; onChange: (v: number) => void; step?: number; min?: number; hint?: ReactNode }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      {label}
      <input id={id} type="number" inputMode="decimal" value={Number.isFinite(value) ? value : ''} step={step} min={min} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
      {hint ? <span className="small muted">{hint}</span> : null}
    </label>
  );
}

export function Select<T extends string>({ label, value, onChange, options }: { label: ReactNode; value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; disabled?: boolean }> }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      {label}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextInput({ label, value, onChange }: { label: ReactNode; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      {label}
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Varlık seçenekleri: hazır olma günü gösterilir. */
export function useAssetOptions(s: GameState) {
  const { t } = useTranslation();
  const mark = (name: string, avail: number) => (avail > s.day ? `${name} (${t('asset.ready_day', { n: avail })})` : name);
  return {
    lps: s.assets.lps.map((l) => ({ value: l.id, label: mark(`${l.id} · ${l.style}`, l.availableDay) })),
    offers: s.assets.offers.map((o) => ({ value: o.id, label: mark(`${o.id} · ${t(`offer.${o.kind}`)}${o.name && o.name !== o.kind ? ` · ${o.name}` : ''}`, o.availableDay) })),
    creatives: (ch: 'google' | 'meta') => s.assets.creatives.filter((c) => c.channel === ch).map((c) => ({ value: c.id, label: mark(`${c.id} · ${c.angle}${c.bold ? ` · ${t('asset.bold')}` : ''}`, c.availableDay) })),
  };
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: Array<{ id: T; label: string }>; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tb) => (
        <button
          key={tb.id}
          type="button"
          role="tab"
          id={`tab-${tb.id}`}
          aria-selected={value === tb.id}
          aria-controls={`panel-${tb.id}`}
          tabIndex={value === tb.id ? 0 : -1}
          onClick={() => onChange(tb.id)}
          onKeyDown={(e) => {
            const i = tabs.findIndex((x) => x.id === value);
            const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!d) return;
            const next = tabs[(i + d + tabs.length) % tabs.length]!.id;
            onChange(next);
            setTimeout(() => document.getElementById(`tab-${next}`)?.focus(), 0);
          }}
        >
          {tb.label}
        </button>
      ))}
    </div>
  );
}
