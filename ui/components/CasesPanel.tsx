// Aktif vakalar (engine/cases): belirti, tepki penceresi, öğrenme modunda ipucu; motorda karşılığı olmayan tepkiler için düğmeler.
import { useTranslation } from 'react-i18next';
import { activeCaseViews } from '@engine/cases';
import { RESPOND_IDS } from '@engine/cases/actions';
import { useGame } from '../game/GameContext';
import { ActBtn } from './Actions';

export function CasesPanel() {
  const { t } = useTranslation();
  const { state, hintsOn, fmt } = useGame();
  if (!state || !state.cases.enabled) return null;
  const views = activeCaseViews(state);
  const hist = state.cases.history.slice(-5).reverse();
  return (
    <section className="card" aria-labelledby="cases-h">
      <h2 id="cases-h">{t('cases.title')}</h2>
      {views.length === 0 ? <p className="muted">{t('cases.none')}</p> : null}
      {views.map((v) => (
        <article key={`${v.id}-${v.triggerDay}`} className="card" aria-label={t(v.titleKey)}>
          <div className="row between">
            <h3>{t(v.titleKey)}</h3>
            <span className={`badge ${v.response === 'pending' ? 'warn' : v.response === 'correct' ? 'good' : v.response === 'wrong' ? 'bad' : 'info'}`}>{t(`cases.resp.${v.response}`)}</span>
          </div>
          <p>{t(v.summaryKey)}</p>
          <p className="small"><strong>{t('cases.symptoms')}:</strong> {t(v.symptomsKey)}</p>
          {v.symptoms.length ? (
            <p className="small muted">
              {v.symptoms.map((m) => `${m.metric}=${typeof m.value === 'number' ? fmt.num(m.value, 2) : String(m.value)}`).join(' · ')}
            </p>
          ) : null}
          <p className="small muted">{t('cases.window', { from: v.triggerDay, to: v.windowEnd - 1 })}</p>
          {hintsOn && v.hintKey ? <div className="hint" role="note"><strong>{t('learn.hint_label')}: </strong>{t(v.hintKey)}</div> : null}
        </article>
      ))}
      {hist.length ? (
        <p className="small muted">
          {t('cases.history')}: {hist.map((h) => `${h.id} (${t(`cases.resp.${h.response}`)})`).join(', ')}
        </p>
      ) : null}
      <details>
        <summary>{t('cases.other_responses')}</summary>
        <p className="small muted">{t('cases.other_note')}</p>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {RESPOND_IDS.map((id) => (
            <li key={id} style={{ marginBottom: 6 }}>
              <ActBtn action={{ type: 'case.respond', params: { response: id } }} label={t(`resp.${id}`)} />
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
