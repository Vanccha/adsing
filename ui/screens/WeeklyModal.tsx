import { useTranslation } from 'react-i18next';
import { useGame } from '../game/GameContext';
import type { WeeklySummary } from '../game/weekly';

export function WeeklyModal({ w, onOutcome }: { w: WeeklySummary; onOutcome: () => void }) {
  const { t } = useTranslation();
  const { fmt, state, closeWeekly, hintsOn } = useGame();
  const dm = w.mrrEnd - w.mrrStart;
  const dc = w.cashEnd - w.cashStart;
  return (
    <div className="stack">
      <p className="muted small">{t('weekly.range', { from: w.fromDay, to: w.toDay - 1 })}</p>
      <div className="table-wrap">
        <table>
          <tbody>
            <tr><th scope="row">{t('weekly.spend')}</th><td className="n">{fmt.money(w.spend)}</td></tr>
            <tr><th scope="row">{t('weekly.revenue')}</th><td className="n">{fmt.money(w.revenue)}</td></tr>
            <tr><th scope="row">{t('weekly.crm_leads')}</th><td className="n">{fmt.num(w.crmLeads, 0)}</td></tr>
            <tr><th scope="row">{t('weekly.crm_customers')}</th><td className="n">{fmt.num(w.crmCustomers, 0)}</td></tr>
            <tr><th scope="row">MRR</th><td className="n">{fmt.money(w.mrrStart)} → {fmt.money(w.mrrEnd)} ({dm >= 0 ? '+' : ''}{fmt.money(dm)})</td></tr>
            <tr><th scope="row">{t('metric.cash')}</th><td className="n">{fmt.money(w.cashStart)} → {fmt.money(w.cashEnd)} ({dc >= 0 ? '+' : ''}{fmt.money(dc)})</td></tr>
            <tr><th scope="row">{t('weekly.hours')}</th><td className="n">{fmt.num(w.hoursUsed)} / {fmt.num(w.hoursCapacity)}</td></tr>
          </tbody>
        </table>
      </div>
      {w.events.length ? (
        <div>
          <h3>{t('weekly.events')}</h3>
          <ul>
            {w.events.map((e, i) => (
              <li key={i}>{t(e.key, e.params as Record<string, string | number>)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {hintsOn ? (
        <div>
          <h3>{t('weekly.feedback')}</h3>
          {w.tips.length === 0 ? <p className="muted">{t('weekly.no_tips')}</p> : null}
          {w.tips.map((tp, i) => (
            <div key={i} className="hint">{t(tp.key, tp.params)}</div>
          ))}
        </div>
      ) : null}
      <div className="row">
        {state?.outcome ? (
          <button type="button" className="primary" onClick={onOutcome}>{t('weekly.see_outcome')}</button>
        ) : null}
        <button type="button" className={state?.outcome ? '' : 'primary'} onClick={closeWeekly}>{t('weekly.continue')}</button>
      </div>
    </div>
  );
}
