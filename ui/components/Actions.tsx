import { useTranslation } from 'react-i18next';
import { validateAction } from '@engine/core';
import type { Action } from '@engine/core';
import { useGame } from '../game/GameContext';

export function describeAction(a: Action, t: (k: string, o?: Record<string, unknown>) => string): string {
  const p = a.params as Record<string, unknown>;
  const parts = Object.entries(p)
    .filter(([, v]) => v !== undefined && typeof v !== 'object')
    .map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 100) / 100 : String(v)}`);
  const kw = Array.isArray(p.keywords) ? ` keywords=${p.keywords.length}` : '';
  const cls = Array.isArray(p.classes) ? ` classes=${(p.classes as string[]).join('/')}` : '';
  const ids = Array.isArray(p.creativeIds) ? ` creatives=${(p.creativeIds as string[]).join('/')}` : '';
  return `${t(`act.${a.type}`)} (${parts.join(', ')}${kw}${cls}${ids})`;
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
  const cap = state.founder.capacityToday || 0;
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
