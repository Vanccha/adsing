// Katman rozeti: her sayının yanında Kaynaklı / Türetilmiş / Varsayım. Tıklayınca kaynak, tarih, güven, not ve formül.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_REF_DATE, ageMonths, isStale, sourceRefDate } from '@engine/data/freshness';
import type { MarketId, Param } from '@engine/data/schema';
import { catalog } from '../engine/bundle';
import type { CatalogEntry } from '../engine/bundle';
import { useGame } from '../game/GameContext';
import { Modal } from './Modal';

const cache = new Map<string, Map<string, CatalogEntry>>();
export function entryFor(market: MarketId, scenario: string, id: string): CatalogEntry | undefined {
  const k = `${market}/${scenario}`;
  let m = cache.get(k);
  if (!m) {
    m = new Map(catalog(market, scenario).map((e) => [e.param.id, e]));
    cache.set(k, m);
  }
  return m.get(id);
}

export function paramStale(p: Param, today = DEFAULT_REF_DATE): { stale: boolean; age: number | null } {
  const ref = sourceRefDate(p.source);
  return { stale: !!ref && isStale(ref, today), age: ref ? ageMonths(ref, today) : null };
}

export function LayerBadge({ layer, stale, onClick }: { layer: Param['layer']; stale?: boolean; onClick?: () => void }) {
  const { t } = useTranslation();
  const icon = layer === 'sourced' ? '●' : layer === 'derived' ? 'ƒ' : '?';
  const label = t(`layer.${layer}`);
  const content = (
    <>
      <span aria-hidden="true">{icon}</span> {label}
      {stale ? <span title={t('data.stale')}> · {t('data.stale_short')}</span> : null}
    </>
  );
  if (!onClick) return <span className={`badge ${layer}`}>{content}</span>;
  return (
    <button type="button" className={`badge ${layer}`} onClick={onClick} aria-label={`${label}: ${t('data.details')}`} aria-haspopup="dialog">
      {content}
    </button>
  );
}

export function FactDetails({ param, origin, value }: { param: Param; origin?: string; value?: unknown }) {
  const { t } = useTranslation();
  const { stale, age } = paramStale(param);
  const conf = param.confidence ?? (param.layer === 'assumption' ? 'low' : 'medium');
  const src = param.source;
  const url = src?.url ?? null;
  return (
    <div className="stack">
      {param.layer === 'assumption' ? <div className="notice warn">{t('data.synthetic_note')}</div> : null}
      {stale ? <div className="notice bad">{t('data.stale_warning', { age: age ?? '?' })}</div> : null}
      <dl className="kv">
        <dt>{t('data.id')}</dt>
        <dd>
          <code>{param.id}</code>
        </dd>
        <dt>{t('data.layer')}</dt>
        <dd>{t(`layer.${param.layer}`)}</dd>
        {value !== undefined ? (
          <>
            <dt>{t('data.value')}</dt>
            <dd className="num">{String(value)} {param.unit}</dd>
          </>
        ) : param.value !== undefined ? (
          <>
            <dt>{t('data.value')}</dt>
            <dd className="num">{String(param.value)} {param.unit}</dd>
          </>
        ) : null}
        {param.range ? (
          <>
            <dt>{t('data.range')}</dt>
            <dd className="num">
              {param.range.min} – {param.range.max} {param.unit}
            </dd>
          </>
        ) : null}
        <dt>{t('data.confidence')}</dt>
        <dd>{t(`conf.${conf}`)}</dd>
        {origin ? (
          <>
            <dt>{t('data.origin')}</dt>
            <dd>{t(`origin.${origin}`)}</dd>
          </>
        ) : null}
        <dt>{t('data.source')}</dt>
        <dd>{src ? src.name : t('data.no_source')}</dd>
        {url ? (
          <>
            <dt>URL</dt>
            <dd>
              <a href={url} target="_blank" rel="noreferrer noopener">
                {url}
              </a>{' '}
              <span className="muted small">({t('data.offline_link')})</span>
            </dd>
          </>
        ) : null}
        {src ? (
          <>
            <dt>{t('data.published')}</dt>
            <dd>{src.published ?? t('data.unknown')}</dd>
            <dt>{t('data.accessed')}</dt>
            <dd>{src.accessed}</dd>
          </>
        ) : null}
        {param.formula ? (
          <>
            <dt>{t('data.formula')}</dt>
            <dd>
              <code>{param.formula}</code>
              {param.inputs && param.inputs.length ? <div className="small muted">{t('data.inputs')}: {param.inputs.join(', ')}</div> : null}
            </dd>
          </>
        ) : null}
        <dt>{t('data.note')}</dt>
        <dd>{param.note ?? '—'}</dd>
      </dl>
    </div>
  );
}

/** Parametre kimliğine bağlı rozet. */
export function FactBadge({ id, market, scenario }: { id: string; market?: MarketId; scenario?: string }) {
  const { cfg, state } = useGame();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const e = entryFor(market ?? cfg?.market ?? 'us', scenario ?? cfg?.scenario ?? 'salon-saas', id);
  if (!e) return null;
  const { stale } = paramStale(e.param);
  const drawn = state?.params[id];
  return (
    <>
      <LayerBadge layer={e.param.layer} stale={stale} onClick={() => setOpen(true)} />
      {open ? (
        <Modal title={t('data.details_title', { id })} onClose={() => setOpen(false)}>
          <FactDetails param={e.param} origin={e.origin} value={drawn} />
        </Modal>
      ) : null}
    </>
  );
}

/** Simülasyon çıktısı (nakit, MRR...) için türetilmiş rozet; formül metni i18n'den. */
export function DerivedBadge({ k, children }: { k: string; children?: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <LayerBadge layer="derived" onClick={() => setOpen(true)} />
      {open ? (
        <Modal title={t(`fact.${k}.title`)} onClose={() => setOpen(false)}>
          <div className="notice">{t('data.synthetic_sim')}</div>
          <dl className="kv">
            <dt>{t('data.layer')}</dt>
            <dd>{t('layer.derived')}</dd>
            <dt>{t('data.source')}</dt>
            <dd>{t('data.sim_source')}</dd>
            <dt>{t('data.formula')}</dt>
            <dd>{t(`fact.${k}.formula`)}</dd>
            <dt>{t('data.confidence')}</dt>
            <dd>{t('data.model_conf')}</dd>
          </dl>
          {children}
        </Modal>
      ) : null}
    </>
  );
}
