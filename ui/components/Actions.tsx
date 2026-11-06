import { useTranslation } from 'react-i18next';
import { selectors } from '@engine/index';
import { validateAction } from '@engine/core';
import type { Action } from '@engine/core';
import { useGame } from '../game/GameContext';

/** Oyuncuya gösterilmeyen teknik alanlar (kimlikler ve serbest ad). */
const HIDDEN_PARAMS = new Set(['message', 'topic', 'campaignId', 'adGroupId', 'adSetId', 'keywordId', 'lpId', 'offerId', 'creativeId', 'testId', 'holdoutId', 'a', 'b', 'name', 'on']);

/** Aksiyonun okunur özeti: etiket + (varsa) ayrıntılar; değerler çevrilir, kimlikler gizlenir. */
export function describeAction(a: Action, t: (k: string, o?: Record<string, unknown>) => string): string {
  const label = t(`act.${a.type}`);
  if (a.type === 'case.respond') return `${label}: ${t(`resp.${a.params.response}`)}`;
  const p = a.params as Record<string, unknown>;
  const val = (v: unknown): string => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : t(`val.${String(v)}`, { defaultValue: String(v) }));
  const parts = Object.entries(p)
    .filter(([k, v]) => v !== undefined && v !== false && typeof v !== 'object' && !HIDDEN_PARAMS.has(k))
    .map(([k, v]) => `${t(`param.${k}`, { defaultValue: k })}: ${val(v)}`);
  if (typeof p.message === 'string') parts.push(`${t('studio.message')}: ${t(`msg.${p.message}`)}`);
  if (typeof p.topic === 'string') parts.push(`${t('local.content_topic')}: ${t(`topic.${p.topic}`)}`);
  if (typeof p.on === 'boolean') parts.push(t(p.on ? 'common.on' : 'common.off'));
  if (Array.isArray(p.keywords)) parts.push(`${t('param.keywords')}: ${p.keywords.length}`);
  if (Array.isArray(p.classes)) parts.push((p.classes as string[]).map(val).join(', '));
  return parts.length ? `${label} (${parts.join(', ')})` : label;
}

/** Aksiyonu kuyruğa ekleyen düğme; saat/nakit önizlemesi ve motor doğrulama nedeni gösterilir. */
export function ActBtn({ action, label, primary, disabled }: { action: Action | Action[]; label: string; primary?: boolean; disabled?: boolean }) {
  const { state, enqueue, fmt } = useGame();
  const { t } = useTranslation();
  const list = Array.isArray(action) ? action : [action];
  let hours = 0;
  let cash = 0;
  let reason: string | undefined;
  if (state) {
    // Önizleme: ilk aksiyon mevcut durumda doğrulanır; zincirin devamı sıra bağımlı olduğu için yalnızca saat/nakit toplanır.
    list.forEach((a, i) => {
      const v = validateAction(state, a);
      hours += v.hours;
      cash += v.cash;
      if (!v.ok && i === 0 && v.reason) reason = t(v.reason.key, v.reason.params);
    });
  }
  const dis = !state || !!state.outcome || !!reason || disabled;
  return (
    <span className="row">
      <button type="button" className={primary ? 'primary' : ''} disabled={dis} onClick={() => enqueue(list)} >
        {label}
      </button>
      <span className="small muted">
        {t('queue.cost', { hours: Math.round(hours * 100) / 100, cash: fmt.money(cash) })}
        {reason ? ` · ${reason}` : ''}
      </span>
    </span>
  );
}

/** Satır içi aç/kapat: işlem kuyruğa girer, gün ilerleyince uygulanır (reklam panelindeki duraklatma düğmesi). */
export function StatusSwitch({ on, label, action }: { on: boolean; label: string; action: Action }) {
  const { enqueue, queue, state } = useGame();
  const pending = queue.some((a) => JSON.stringify(a) === JSON.stringify(action));
  return <button type="button" className="switch" role="switch" aria-checked={pending ? !on : on} aria-label={label} disabled={pending || !!state?.outcome} onClick={() => enqueue(action)} />;
}

export function QueuePanel() {
  const { queue, dequeue, clearQueue, state, fmt } = useGame();
  const { t } = useTranslation();
  if (!state) return null;
  let hours = 0;
  let cash = 0;
  for (const a of queue) {
    const v = validateAction(state, a);
    hours += v.hours;
    cash += v.cash;
  }
  const cap = selectors.founderHours(state).capacityToday;
  return (
    <section className="card queue" aria-labelledby="queue-h">
      <div className="row between">
        <h2 id="queue-h">{t('queue.title', { n: queue.length })}</h2>
        {queue.length ? (
          <button type="button" onClick={clearQueue}>
            {t('queue.clear')}
          </button>
        ) : null}
      </div>
      {queue.length === 0 ? <p className="muted">{t('queue.empty')}</p> : null}
      <ol>
        {queue.map((a, i) => (
          <li key={i}>
            {describeAction(a, t)}{' '}
            <button type="button" className="link" onClick={() => dequeue(i)} aria-label={`${t('queue.remove')}: ${t(`act.${a.type}`)}`}>
              {t('queue.remove')}
            </button>
          </li>
        ))}
      </ol>
      {queue.length ? (
        <p className="small">
          {t('queue.total', { hours: Math.round(hours * 100) / 100, cash: fmt.money(cash), cap: Math.round(cap * 10) / 10 })}
        </p>
      ) : null}
    </section>
  );
}
